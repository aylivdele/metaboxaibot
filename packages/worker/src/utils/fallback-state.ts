/**
 * Pure helpers вокруг fallback-state'а в `inputData` для image/video processor'ов.
 *
 * Извлечены из image.processor.ts чтобы можно было тестировать без подъёма
 * BullMQ/Prisma/Redis. Никаких сторонних зависимостей — чистые функции.
 */

/** Минимальная shape sub-job'а, нужная для derive-логики. */
export interface SubJobLike {
  status: "pending" | "succeeded" | "failed";
  providerJobId?: string | null;
  effectiveProvider?: string;
}

/** Минимальная shape `inputData.fallback` для single-shot detect. */
export interface FallbackStateLike {
  effectiveProvider?: string;
}

/** Минимальная shape virtual-batch state'а. */
export interface BatchStateLike {
  subJobs: SubJobLike[];
}

/**
 * Sticky-lock derive: возвращает `effectiveProvider` первого sub-job'а перед
 * `beforeIndex`, у которого:
 *   - выставлен `effectiveProvider`, И
 *   - либо `status === "succeeded"`,
 *   - либо `status === "pending"` И есть `providerJobId` (т.е. submit прошёл,
 *     poll ещё не закончился).
 *
 * Зачем: после первого УСПЕШНОГО submit'а в virtual batch все остальные sub-jobs
 * должны идти на тот же provider (строгий sticky). Не храним отдельно
 * `lockedProvider`, чтобы избежать race'а между двумя записями inputData.
 *
 * @returns provider строку или `undefined` если ни один предыдущий sub-job не
 * залочил provider'а.
 */
export function deriveLockedProvider(
  subJobs: SubJobLike[],
  beforeIndex: number,
): string | undefined {
  return subJobs
    .slice(0, beforeIndex)
    .find(
      (s) =>
        s.effectiveProvider &&
        (s.status === "succeeded" || (s.status === "pending" && !!s.providerJobId)),
    )?.effectiveProvider;
}

/**
 * Detect: использовался ли fallback (effectiveProvider !== primaryProvider).
 *
 * Source-of-truth разный для двух режимов:
 *   - Single-shot: `fallbackState.effectiveProvider` (записывается в submit
 *     wrapper'ом).
 *   - Virtual batch: derive из `subJobs` — берём первый sub-job с
 *     `effectiveProvider`. Не дублируем в FallbackState чтобы не плодить race
 *     между writeBatchState и writeFallbackState.
 *
 * @returns `usedFallback === true` ⇒ billing должен игнорировать
 * `providerUsdCost` от адаптера и считать по primary `AIModel`.
 */
export function detectUsedFallback(opts: {
  fallbackState: FallbackStateLike;
  batchState?: BatchStateLike;
  isVirtualBatch: boolean;
  primaryProvider: string;
}): { effectiveProviderForBilling: string | undefined; usedFallback: boolean } {
  let effectiveProviderForBilling = opts.fallbackState.effectiveProvider;
  if (!effectiveProviderForBilling && opts.isVirtualBatch && opts.batchState) {
    effectiveProviderForBilling = opts.batchState.subJobs.find(
      (s) => s.effectiveProvider,
    )?.effectiveProvider;
  }
  const usedFallback =
    !!effectiveProviderForBilling && effectiveProviderForBilling !== opts.primaryProvider;
  return { effectiveProviderForBilling, usedFallback };
}
