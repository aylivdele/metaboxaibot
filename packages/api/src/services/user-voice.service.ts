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
  if (!voice.externalId) {
    throw new Error(`UserVoice ${userVoiceId} has no externalId`);
  }

  // 1. Берём ключ, на котором голос был создан. null → env-fallback.
  const acquired = await acquireById(voice.providerKeyId, PROVIDER);

  // 2. Проверяем, что voice_id ещё существует в этом аккаунте.
  const exists = await voiceExistsOn(voice.externalId, acquired.apiKey);
  if (exists) {
    void db.userVoice
      .update({ where: { id: voice.id }, data: { lastUsedAt: new Date() } })
      .catch(() => void 0);
    return { voiceId: voice.externalId, acquired, recloned: false };
  }

  // 3. Голос пропал — пересоздаём на свежем ключе из пула.
  if (!voice.audioS3Key) {
    throw new Error(
      `ElevenLabs voice ${voice.externalId} is gone and no audioS3Key to recreate it`,
    );
  }
  logger.warn(
    { userVoiceId: voice.id, oldExternalId: voice.externalId, oldKeyId: voice.providerKeyId },
    "user-voice: voice missing on owning key, re-cloning",
  );

  const fresh = await acquireKey(PROVIDER);
  const audioBuffer = await fetchAudio(voice.audioS3Key);
  const filename = voice.audioS3Key.split("/").pop() ?? "voice.ogg";

  const newExternalId = await ElevenLabsAdapter.cloneVoice(
    audioBuffer,
    filename,
    voice.name,
    false,
    fresh.apiKey,
  );

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
