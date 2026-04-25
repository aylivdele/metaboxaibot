/**
 * UserVoice — выбор ключа ElevenLabs для конкретного клонированного голоса.
 *
 * Контекст: ElevenLabs voice_id живёт в аккаунте конкретного API-ключа. Если
 * мы заберём из пула «любой» активный EL-ключ, на нём этого voice_id может
 * не быть → 404 → TTS падает. Поэтому потреблять voice нужно тем ключом,
 * которым он был создан (`UserVoice.providerKeyId`).
 *
 * Если этот ключ удалён из пула, деактивирован, либо voice выселен из EL-слотов
 * (LRU eviction между разными процессами / прямое удаление в EL UI) — мы
 * пересоздаём голос из сохранённой записи `audioS3Key` на любом активном ключе
 * и обновляем `UserVoice.{externalId, providerKeyId, lastUsedAt}`.
 *
 * Старые записи (созданные до фичи пула) имеют `providerKeyId = null` →
 * считаются env-fallback'ом.
 */

import { db } from "../db.js";
import { acquireKey, acquireById, type AcquiredKey } from "./key-pool.service.js";
import { ElevenLabsAdapter } from "../ai/audio/elevenlabs.adapter.js";
import { getFileUrl } from "./s3.service.js";
import { logger } from "../logger.js";

const PROVIDER = "elevenlabs";

export interface ResolvedVoice {
  /** Текущий valid voice_id (после возможного re-clone). */
  voiceId: string;
  /** Ключ, на котором сейчас живёт voice_id — используем для TTS. */
  acquired: AcquiredKey;
  /** Был ли произведён re-clone в рамках этого вызова. */
  recloned: boolean;
}

/**
 * Получить рабочий voice_id + ElevenLabs-ключ для генерации TTS.
 * При необходимости — пересоздаёт голос на новом ключе.
 *
 * @throws если голос не существует и нет audioS3Key для пересоздания.
 */
export async function resolveVoiceForTTS(userVoiceId: string): Promise<ResolvedVoice> {
  const voice = await db.userVoice.findUniqueOrThrow({
    where: { id: userVoiceId },
    select: {
      id: true,
      name: true,
      externalId: true,
      providerKeyId: true,
      audioS3Key: true,
      status: true,
    },
  });

  // 1. Если externalId ещё существует — проверяем, что voice живёт на его
  //    ключе. При совпадении — fast-path, возвращаем как есть.
  //
  //    Если externalId пусто (голос выселен `evictOneElevenLabsVoice` когда
  //    другой пользователь занял слот), пропускаем проверку и сразу уходим
  //    в re-clone ветку ниже — resolve выдаст свежий externalId + ключ.
  if (voice.externalId) {
    const acquired = await acquireById(voice.providerKeyId, PROVIDER);
    const exists = await voiceExistsOn(voice.externalId, acquired.apiKey);
    if (exists) {
      void db.userVoice
        .update({ where: { id: voice.id }, data: { lastUsedAt: new Date() } })
        .catch(() => void 0);
      return { voiceId: voice.externalId, acquired, recloned: false };
    }
  }

  // 2. Голос пропал (либо externalId никогда не был, либо owning key потерял
  //    slot) — пересоздаём на свежем ключе из пула.
  if (!voice.audioS3Key) {
    throw new Error(`ElevenLabs voice ${userVoiceId} is gone and no audioS3Key to recreate it`);
  }
  logger.warn(
    { userVoiceId: voice.id, oldExternalId: voice.externalId, oldKeyId: voice.providerKeyId },
    "user-voice: voice missing on owning key, re-cloning",
  );

  const fresh = await acquireKey(PROVIDER);
  const audioBuffer = await fetchAudio(voice.audioS3Key);
  const filename = voice.audioS3Key.split("/").pop() ?? "voice.ogg";

  let newExternalId: string;
  try {
    newExternalId = await ElevenLabsAdapter.cloneVoice(
      audioBuffer,
      filename,
      voice.name,
      false,
      fresh.apiKey,
    );
  } catch (err) {
    // Slot-лимит на свежем ключе — освобождаем один слот и пробуем ещё раз.
    if (err instanceof Error && err.message.includes("voice_limit_reached")) {
      const freed = await evictOneElevenLabsVoice(fresh.apiKey, fresh.keyId);
      if (!freed) throw err;
      newExternalId = await ElevenLabsAdapter.cloneVoice(
        audioBuffer,
        filename,
        voice.name,
        false,
        fresh.apiKey,
      );
    } else {
      throw err;
    }
  }

  await db.userVoice.update({
    where: { id: voice.id },
    data: {
      externalId: newExternalId,
      providerKeyId: fresh.keyId,
      lastUsedAt: new Date(),
      status: "ready",
    },
  });

  return { voiceId: newExternalId, acquired: fresh, recloned: true };
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

  // ── Step 2: reconcile DB → EL drift, scoped to THIS account ────────────
  const allDbTracked = await db.userVoice.findMany({
    where: {
      provider: PROVIDER,
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

  // ── Step 3: pick a target ──────────────────────────────────────────────
  const trackedRecords = await db.userVoice.findMany({
    where: { provider: PROVIDER, externalId: { in: [...deletableIds] } },
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

  // ── Step 4: delete on EL + sync DB ─────────────────────────────────────
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

async function voiceExistsOn(externalId: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${externalId}`, {
      headers: { "xi-api-key": apiKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchAudio(s3Key: string): Promise<Buffer> {
  const url = await getFileUrl(s3Key);
  if (!url) throw new Error(`Cannot resolve S3 URL for voice audio: ${s3Key}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch voice audio from S3: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
