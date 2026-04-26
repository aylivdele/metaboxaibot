import type { AIModel } from "../../types/ai.js";
import { FALLBACK_DESIGN_MODELS } from "./design.models.js";
import { FALLBACK_VIDEO_MODELS } from "./video.models.js";

export type FallbackSection = "design" | "video";

/**
 * Возвращает упорядоченный список fallback-кандидатов для primary modelId
 * в указанной секции. Каждый элемент — полноценный AIModel с собственным
 * `provider` (другой адаптер, другой ключ-пул).
 *
 * Пустой массив = у этой модели нет зарегистрированного fallback.
 * Перебор кандидатов выполняется в порядке добавления в FALLBACK_*_MODELS;
 * processor берёт первый совместимый и доступный.
 */
export function getFallbackCandidates(primaryModelId: string, section: FallbackSection): AIModel[] {
  const pool = section === "design" ? FALLBACK_DESIGN_MODELS : FALLBACK_VIDEO_MODELS;
  return pool.filter((m) => m.id === primaryModelId);
}

/**
 * Проверяет что fallback-модель поддерживает все media-input слоты задачи И
 * вмещает количество медиа в каждом слоте (`maxImages`).
 *
 * Семантика:
 * - Задача без media (`jobMediaInputs` пуст / undefined) → совместимо.
 * - Для каждого slotKey с непустым массивом urls'ов: у fallback должен быть
 *   слот с тем же `slotKey`, и его `maxImages` (default 1) должен быть
 *   >= количества загруженных медиа.
 *
 * `modelSettings` адаптеры фильтруют сами (unknown ключи игнорируются), поэтому
 * проверяем только media-слоты.
 */
export function isFallbackCompatible(
  fallback: AIModel,
  jobMediaInputs: Record<string, string[]> | undefined,
): boolean {
  if (!jobMediaInputs) return true;
  const usedSlots = Object.entries(jobMediaInputs).filter(
    ([, urls]) => Array.isArray(urls) && urls.length > 0,
  );
  if (usedSlots.length === 0) return true;
  const fallbackSlots = new Map((fallback.mediaInputs ?? []).map((s) => [s.slotKey, s] as const));
  return usedSlots.every(([slotKey, urls]) => {
    const slot = fallbackSlots.get(slotKey);
    if (!slot) return false;
    const slotMax = slot.maxImages ?? 1;
    return urls.length <= slotMax;
  });
}
