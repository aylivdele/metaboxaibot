/**
 * UserVoice — выбор провайдера и ключа для конкретного клонированного голоса.
 *
 * Контекст:
 *  - voice_id живёт в аккаунте конкретного API-ключа (Cartesia voice).
 *    Если мы заберём из пула «любой» активный ключ, на нём этого voice_id
 *    может не быть → 404 → TTS падает. Поэтому потребляем voice ТЕМ ключом,
 *    которым он был создан (`UserVoice.providerKeyId`).
 *
 *  - Если ключ удалён из пула, деактивирован, либо voice выселен из slot'ов
 *    (LRU eviction между процессами / прямое удаление в провайдер-UI) — мы
 *    пересоздаём голос из сохранённой записи `audioS3Key` на любом активном
 *    Cartesia-ключе и обновляем
 *    `UserVoice.{provider, externalId, providerKeyId, lastUsedAt}`.
 *
 *  - Старые записи (созданные до фичи пула) имеют `providerKeyId = null` →
 *    считаются env-fallback'ом.
 *
 * Migration ElevenLabs → Cartesia:
 *  - Новые клоны идут в Cartesia (provider="cartesia").
 *  - Existing EL-клоны (provider="elevenlabs") мигрируются ПРИНУДИТЕЛЬНО на
 *    первом же `resolveVoiceForTTS`: даже если голос ещё жив на EL-аккаунте,
 *    мы перекладываем его на Cartesia из `audioS3Key`, обновляем
 *    provider/externalId/providerKeyId, а старый EL-голос best-effort
 *    удаляем (освобождает slot). Это гарантирует что после первого использования
 *    диалога с EL-голосом он перестаёт зависеть от ElevenLabs аккаунта.
 *  - Если у legacy EL-голоса нет `audioS3Key` (pre-feature) — миграция
 *    невозможна, бросаем ошибку, юзер должен перезаписать голос вручную.
 */

import { db } from "../db.js";
import { acquireKey, acquireById, type AcquiredKey } from "./key-pool.service.js";
import { ElevenLabsAdapter } from "../ai/audio/elevenlabs.adapter.js";
import { CartesiaAdapter } from "../ai/audio/cartesia.adapter.js";
import { getFileUrl } from "./s3.service.js";
import { logger } from "../logger.js";

export type VoiceProvider = "elevenlabs" | "cartesia";

export interface ResolvedVoice {
  /** Текущий valid voice_id (после возможного re-clone). */
  voiceId: string;
  /** Ключ, на котором сейчас живёт voice_id — используем для TTS. */
  acquired: AcquiredKey;
  /** Был ли произведён re-clone в рамках этого вызова. */
  recloned: boolean;
  /** Провайдер voice_id'а — нужен caller'у чтобы выбрать TTS-adapter. */
  provider: VoiceProvider;
}

/**
 * Получить рабочий voice_id + ключ для генерации TTS.
 * При необходимости — пересоздаёт голос на новом Cartesia-ключе.
 *
 * Politicy:
 *  - provider="cartesia" + externalId жив на ключе → fast-path, returns as-is.
 *  - provider="cartesia" + externalId протух (eviction / ключ удалён) →
 *    re-clone на Cartesia из audioS3Key.
 *  - provider="elevenlabs" → ВСЕГДА мигрируется на Cartesia (даже если EL-голос
 *    ещё жив). Старый EL-голос best-effort удаляется чтобы освободить slot.
 *    После этой операции UserVoice больше не зависит от EL-аккаунта.
 *
 * @throws если голос не существует и нет audioS3Key для пересоздания.
 */
export async function resolveVoiceForTTS(userVoiceId: string): Promise<ResolvedVoice> {
  const voice = await db.userVoice.findUniqueOrThrow({
    where: { id: userVoiceId },
    select: {
      id: true,
      name: true,
      provider: true,
      externalId: true,
      providerKeyId: true,
      audioS3Key: true,
      status: true,
    },
  });

  const currentProvider = (voice.provider as VoiceProvider) || "elevenlabs";

  // 1. Cartesia fast-path: если voice уже на Cartesia и externalId жив → returns as-is.
  //    Для EL-голосов fast-path ОТКЛЮЧЁН — мы хотим принудительно мигрировать
  //    их на Cartesia на первом же использовании, чтобы избавиться от EL-зависимости.
  if (currentProvider === "cartesia" && voice.externalId) {
    const acquired = await acquireById(voice.providerKeyId, "cartesia");
    const exists = await voiceExistsOn("cartesia", voice.externalId, acquired.apiKey);
    if (exists) {
      void db.userVoice
        .update({ where: { id: voice.id }, data: { lastUsedAt: new Date() } })
        .catch(() => void 0);
      return {
        voiceId: voice.externalId,
        acquired,
        recloned: false,
        provider: "cartesia",
      };
    }
  }

  // 2. Re-clone path: voice не на Cartesia ИЛИ externalId протух → пересоздаём
  //    из audioS3Key на свежем Cartesia-ключе.
  if (!voice.audioS3Key) {
    throw new Error(`Voice ${userVoiceId} cannot be migrated/re-cloned: no audioS3Key`);
  }

  const isMigrationFromEL = currentProvider === "elevenlabs";
  logger.warn(
    {
      userVoiceId: voice.id,
      oldProvider: currentProvider,
      oldExternalId: voice.externalId,
      oldKeyId: voice.providerKeyId,
      reason: isMigrationFromEL ? "forced_el_migration" : "cartesia_voice_lost",
    },
    "user-voice: re-cloning on Cartesia",
  );

  const fresh = await acquireKey("cartesia");
  const audioBuffer = await fetchAudio(voice.audioS3Key);
  const filename = voice.audioS3Key.split("/").pop() ?? "voice.ogg";

  let newExternalId: string;
  try {
    newExternalId = await CartesiaAdapter.cloneVoice(
      audioBuffer,
      filename,
      voice.name,
      "ru",
      fresh.apiKey,
    );
  } catch (err) {
    if (isCartesiaSlotLimitError(err)) {
      const freed = await evictOneCartesiaVoice(fresh.apiKey, fresh.keyId);
      if (!freed) throw err;
      newExternalId = await CartesiaAdapter.cloneVoice(
        audioBuffer,
        filename,
        voice.name,
        "ru",
        fresh.apiKey,
      );
    } else {
      throw err;
    }
  }

  await db.userVoice.update({
    where: { id: voice.id },
    data: {
      provider: "cartesia",
      externalId: newExternalId,
      providerKeyId: fresh.keyId,
      lastUsedAt: new Date(),
      status: "ready",
    },
  });

  // 3. Best-effort cleanup старого EL-голоса (если был) — освобождает slot
  //    в EL-аккаунте. Делается ПОСЛЕ обновления DB, чтобы при сбое delete'а
  //    наша запись уже указывала на новый Cartesia voice. На EL acquireById
  //    может упасть (ключ удалён, env-fallback и т.п.) — глотаем.
  if (isMigrationFromEL && voice.externalId) {
    const oldExternalId = voice.externalId;
    const oldKeyId = voice.providerKeyId;
    void (async () => {
      try {
        const elAcquired = await acquireById(oldKeyId, "elevenlabs");
        await ElevenLabsAdapter.deleteVoice(oldExternalId, elAcquired.apiKey);
        logger.info(
          { userVoiceId: voice.id, oldExternalId, oldKeyId },
          "user-voice: deleted legacy EL voice after migration",
        );
      } catch (err) {
        logger.warn(
          { err, userVoiceId: voice.id, oldExternalId, oldKeyId },
          "user-voice: best-effort EL voice delete failed (ignored)",
        );
      }
    })();
  }

  return { voiceId: newExternalId, acquired: fresh, recloned: true, provider: "cartesia" };
}

/**
 * Освобождает один custom-voice слот на ElevenLabs-аккаунте указанного ключа.
 * Reconcile DB↔EL drift по пути:
 *
 *   1. List real custom voices (premade не считаются).
 *   2. Reconcile DB → EL для записей с providerKeyId === keyId: stale externalId
 *      обнуляется (audioS3Key сохраняется → re-clone возможен при следующем TTS).
 *   3. Pick deletion target — сначала untracked orphans (мусор от удалённых
 *      пользователей / прямых правок в EL UI), затем LRU среди tracked.
 *   4. Delete на EL + sync DB. На 404 считаем что слот уже свободен.
 *
 * Возвращает true когда освобождён хотя бы один слот (включая drift cleanup).
 */
export async function evictOneElevenLabsVoice(
  apiKey: string,
  keyId: string | null,
): Promise<boolean> {
  let elVoices: Awaited<ReturnType<typeof ElevenLabsAdapter.listVoices>>;
  try {
    elVoices = await ElevenLabsAdapter.listVoices(apiKey);
  } catch (e) {
    logger.error({ err: e }, "Voice eviction: failed to list ElevenLabs voices");
    return false;
  }

  const deletable = elVoices.filter((v) => v.category === "cloned" || v.category === "generated");
  const deletableIds = new Set(deletable.map((v) => v.voice_id));

  const allDbTracked = await db.userVoice.findMany({
    where: {
      provider: "elevenlabs",
      externalId: { not: null },
      providerKeyId: keyId,
    },
    select: { id: true, externalId: true },
  });
  const staleDbIds = allDbTracked
    .filter((r) => r.externalId && !deletableIds.has(r.externalId))
    .map((r) => r.id);
  if (staleDbIds.length > 0) {
    await db.userVoice
      .updateMany({
        where: { id: { in: staleDbIds } },
        data: { externalId: null },
      })
      .catch((e) =>
        logger.error(
          { err: e, count: staleDbIds.length },
          "Voice eviction: stale-DB cleanup failed",
        ),
      );
    logger.info(
      { count: staleDbIds.length, keyId },
      "Voice eviction: cleared stale DB externalIds",
    );
  }

  if (deletable.length === 0) {
    logger.warn("Voice eviction: ElevenLabs returned no deletable voices");
    return staleDbIds.length > 0;
  }

  const trackedRecords = await db.userVoice.findMany({
    where: { provider: "elevenlabs", externalId: { in: [...deletableIds] } },
    orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { id: true, externalId: true },
  });
  const trackedExternalIds = new Set(
    trackedRecords.map((r) => r.externalId).filter((id): id is string => !!id),
  );
  const untracked = deletable.filter((v) => !trackedExternalIds.has(v.voice_id));

  let targetExternalId: string | null = null;
  let targetDbId: string | null = null;

  if (untracked.length > 0) {
    const oldest = [...untracked].sort(
      (a, b) => (a.created_at_unix ?? 0) - (b.created_at_unix ?? 0),
    )[0];
    targetExternalId = oldest.voice_id;
    logger.info(
      { voiceId: targetExternalId, name: oldest.name },
      "Voice eviction: deleting untracked orphan (drift cleanup)",
    );
  } else if (trackedRecords.length > 0) {
    targetExternalId = trackedRecords[0].externalId;
    targetDbId = trackedRecords[0].id;
  }

  if (!targetExternalId) return staleDbIds.length > 0;

  const deleted = await ElevenLabsAdapter.deleteVoice(targetExternalId, apiKey);
  if (!deleted) return staleDbIds.length > 0;

  if (targetDbId) {
    await db.userVoice
      .update({ where: { id: targetDbId }, data: { externalId: null } })
      .catch((e) =>
        logger.error({ err: e, id: targetDbId }, "Voice eviction: failed to clear DB externalId"),
      );
  }

  logger.info({ voiceId: targetExternalId }, "Voice eviction: freed one ElevenLabs slot");
  return true;
}

/**
 * Освобождает один custom-voice слот на Cartesia-аккаунте указанного ключа.
 * Зеркальная реализация `evictOneElevenLabsVoice` для Cartesia API.
 *
 * Cartesia listVoices с is_owner=true возвращает только клонированные голоса
 * текущей organization — premade в выборку не попадают, поэтому фильтр по
 * category не нужен.
 */
export async function evictOneCartesiaVoice(
  apiKey: string,
  keyId: string | null,
): Promise<boolean> {
  let voices: Awaited<ReturnType<typeof CartesiaAdapter.listVoices>>;
  try {
    voices = await CartesiaAdapter.listVoices(apiKey);
  } catch (e) {
    logger.error({ err: e }, "Voice eviction: failed to list Cartesia voices");
    return false;
  }

  const deletableIds = new Set(voices.map((v) => v.voice_id));

  const allDbTracked = await db.userVoice.findMany({
    where: {
      provider: "cartesia",
      externalId: { not: null },
      providerKeyId: keyId,
    },
    select: { id: true, externalId: true },
  });
  const staleDbIds = allDbTracked
    .filter((r) => r.externalId && !deletableIds.has(r.externalId))
    .map((r) => r.id);
  if (staleDbIds.length > 0) {
    await db.userVoice
      .updateMany({ where: { id: { in: staleDbIds } }, data: { externalId: null } })
      .catch((e) =>
        logger.error(
          { err: e, count: staleDbIds.length },
          "Cartesia voice eviction: stale-DB cleanup failed",
        ),
      );
    logger.info(
      { count: staleDbIds.length, keyId },
      "Cartesia voice eviction: cleared stale DB externalIds",
    );
  }

  if (voices.length === 0) {
    logger.warn("Cartesia voice eviction: no deletable voices");
    return staleDbIds.length > 0;
  }

  const trackedRecords = await db.userVoice.findMany({
    where: { provider: "cartesia", externalId: { in: [...deletableIds] } },
    orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { id: true, externalId: true },
  });
  const trackedExternalIds = new Set(
    trackedRecords.map((r) => r.externalId).filter((id): id is string => !!id),
  );
  const untracked = voices.filter((v) => !trackedExternalIds.has(v.voice_id));

  let targetExternalId: string | null = null;
  let targetDbId: string | null = null;

  if (untracked.length > 0) {
    const oldest = [...untracked].sort(
      (a, b) => (a.created_at_unix ?? 0) - (b.created_at_unix ?? 0),
    )[0];
    targetExternalId = oldest.voice_id;
    logger.info(
      { voiceId: targetExternalId, name: oldest.name },
      "Cartesia voice eviction: deleting untracked orphan",
    );
  } else if (trackedRecords.length > 0) {
    targetExternalId = trackedRecords[0].externalId;
    targetDbId = trackedRecords[0].id;
  }

  if (!targetExternalId) return staleDbIds.length > 0;

  const deleted = await CartesiaAdapter.deleteVoice(targetExternalId, apiKey);
  if (!deleted) return staleDbIds.length > 0;

  if (targetDbId) {
    await db.userVoice
      .update({ where: { id: targetDbId }, data: { externalId: null } })
      .catch((e) =>
        logger.error(
          { err: e, id: targetDbId },
          "Cartesia voice eviction: failed to clear DB externalId",
        ),
      );
  }

  logger.info({ voiceId: targetExternalId }, "Cartesia voice eviction: freed one slot");
  return true;
}

async function voiceExistsOn(
  provider: VoiceProvider,
  externalId: string,
  apiKey: string,
): Promise<boolean> {
  if (provider === "cartesia") {
    return (await CartesiaAdapter.getVoice(externalId, apiKey)) !== null;
  }
  // elevenlabs
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${externalId}`, {
      headers: { "xi-api-key": apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Heuristic: воспринимает ошибку как "slot limit exceeded" по тексту message.
 * Cartesia не документирует конкретные коды для этой ситуации в публичной схеме,
 * но любой 4xx с упоминанием "limit"/"quota"/"exceeded" в body триггерит eviction.
 * False positive (мы делаем eviction когда это не slot limit) приводит к
 * единичному лишнему delete'у — приемлемо.
 */
function isCartesiaSlotLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return /limit|quota|exceeded|too many voices|maximum/i.test(msg);
}

async function fetchAudio(s3Key: string): Promise<Buffer> {
  const url = await getFileUrl(s3Key);
  if (!url) throw new Error(`Cannot resolve S3 URL for voice audio: ${s3Key}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch voice audio from S3: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
