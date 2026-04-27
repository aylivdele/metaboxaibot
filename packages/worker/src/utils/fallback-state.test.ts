import { describe, it, expect } from "vitest";
import { deriveLockedProvider, detectUsedFallback, type SubJobLike } from "./fallback-state.js";

describe("deriveLockedProvider", () => {
  it("returns undefined для пустого массива sub-jobs", () => {
    expect(deriveLockedProvider([], 0)).toBeUndefined();
  });

  it("returns undefined когда beforeIndex === 0 (первый sub-job — нечего lock'ать)", () => {
    const subJobs: SubJobLike[] = [
      { status: "succeeded", effectiveProvider: "fal" },
      { status: "pending" },
    ];
    expect(deriveLockedProvider(subJobs, 0)).toBeUndefined();
  });

  it("locks на provider'е первого УСПЕШНОГО sub-job'а", () => {
    const subJobs: SubJobLike[] = [
      { status: "succeeded", effectiveProvider: "fal" },
      { status: "pending" },
      { status: "pending" },
    ];
    expect(deriveLockedProvider(subJobs, 2)).toBe("fal");
  });

  it("locks на pending sub-job с providerJobId (submit прошёл, poll ещё не закончился)", () => {
    const subJobs: SubJobLike[] = [
      { status: "pending", effectiveProvider: "kie", providerJobId: "kie-abc" },
      { status: "pending" },
    ];
    expect(deriveLockedProvider(subJobs, 1)).toBe("kie");
  });

  it("НЕ locks на pending sub-job без providerJobId (submit ещё не прошёл)", () => {
    const subJobs: SubJobLike[] = [
      { status: "pending", effectiveProvider: "kie" },
      { status: "pending" },
    ];
    expect(deriveLockedProvider(subJobs, 1)).toBeUndefined();
  });

  it("НЕ locks на failed sub-job (submit упал — ничего не зафиксировано)", () => {
    const subJobs: SubJobLike[] = [
      { status: "failed", effectiveProvider: "fal", error: "boom" } as SubJobLike,
      { status: "pending" },
    ];
    expect(deriveLockedProvider(subJobs, 1)).toBeUndefined();
  });

  it("игнорирует sub-jobs ПОСЛЕ beforeIndex (мы локимся только по предыдущим)", () => {
    const subJobs: SubJobLike[] = [
      { status: "pending" },
      { status: "succeeded", effectiveProvider: "kie" },
    ];
    // ищем lock для index=0 — после нас kie, но lock derive только из subJobs[0..0)
    expect(deriveLockedProvider(subJobs, 0)).toBeUndefined();
    // для index=1 — также пусто, slice(0,1) = [pending without provider]
    expect(deriveLockedProvider(subJobs, 1)).toBeUndefined();
  });

  it("берёт ПЕРВЫЙ найденный lock (порядок), даже если позже есть другие", () => {
    const subJobs: SubJobLike[] = [
      { status: "succeeded", effectiveProvider: "fal" },
      { status: "succeeded", effectiveProvider: "kie" }, // не должен победить — первый найден раньше
      { status: "pending" },
    ];
    expect(deriveLockedProvider(subJobs, 2)).toBe("fal");
  });

  it("пропускает sub-jobs без effectiveProvider — берёт следующий с lock'ом", () => {
    const subJobs: SubJobLike[] = [
      { status: "failed", error: "early-fail" } as SubJobLike,
      { status: "succeeded", effectiveProvider: "kie" },
      { status: "pending" },
    ];
    expect(deriveLockedProvider(subJobs, 2)).toBe("kie");
  });
});

describe("detectUsedFallback", () => {
  it("single-shot: usedFallback=false когда effectiveProvider не выставлен (primary в работе)", () => {
    const r = detectUsedFallback({
      fallbackState: {},
      isVirtualBatch: false,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBeUndefined();
    expect(r.usedFallback).toBe(false);
  });

  it("single-shot: usedFallback=false когда effectiveProvider === primary", () => {
    const r = detectUsedFallback({
      fallbackState: { effectiveProvider: "fal" },
      isVirtualBatch: false,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBe("fal");
    expect(r.usedFallback).toBe(false);
  });

  it("single-shot: usedFallback=true когда effectiveProvider !== primary", () => {
    const r = detectUsedFallback({
      fallbackState: { effectiveProvider: "kie" },
      isVirtualBatch: false,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBe("kie");
    expect(r.usedFallback).toBe(true);
  });

  it("virtual-batch: derive из subJobs когда fallbackState.effectiveProvider пуст", () => {
    const r = detectUsedFallback({
      fallbackState: {},
      batchState: {
        subJobs: [{ status: "pending" }, { status: "succeeded", effectiveProvider: "kie" }],
      },
      isVirtualBatch: true,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBe("kie");
    expect(r.usedFallback).toBe(true);
  });

  it("virtual-batch: возвращает undefined когда ни один sub-job не имеет effectiveProvider", () => {
    const r = detectUsedFallback({
      fallbackState: {},
      batchState: {
        subJobs: [{ status: "pending" }, { status: "failed" } as SubJobLike],
      },
      isVirtualBatch: true,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBeUndefined();
    expect(r.usedFallback).toBe(false);
  });

  it("virtual-batch: fallbackState.effectiveProvider имеет приоритет над subJobs derive", () => {
    // Edge case: гипотетически записан и в fallbackState и в subJobs (shouldn't
    // happen, но проверяем что fallbackState wins).
    const r = detectUsedFallback({
      fallbackState: { effectiveProvider: "fal" },
      batchState: {
        subJobs: [{ status: "succeeded", effectiveProvider: "kie" }],
      },
      isVirtualBatch: true,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBe("fal");
    expect(r.usedFallback).toBe(false);
  });

  it("single-shot: batchState игнорируется даже если передан (isVirtualBatch=false)", () => {
    const r = detectUsedFallback({
      fallbackState: {},
      batchState: {
        subJobs: [{ status: "succeeded", effectiveProvider: "kie" }],
      },
      isVirtualBatch: false,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBeUndefined();
    expect(r.usedFallback).toBe(false);
  });

  it("virtual-batch: batchState undefined → не бросаем, возвращаем не-fallback", () => {
    const r = detectUsedFallback({
      fallbackState: {},
      isVirtualBatch: true,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBeUndefined();
    expect(r.usedFallback).toBe(false);
  });

  it("virtual-batch: derive берёт ПЕРВЫЙ sub-job с effectiveProvider (включая failed)", () => {
    // detectUsedFallback не фильтрует по status — первый sub-job с effectiveProvider wins.
    // Это OK потому что fallbackState.effectiveProvider обычно выставлен ДО того, как
    // status станет известен; для batch же мы ищем "что было выбрано" а не "что
    // успешно отработало".
    const r = detectUsedFallback({
      fallbackState: {},
      batchState: {
        subJobs: [
          { status: "failed", effectiveProvider: "kie", error: "x" } as SubJobLike,
          { status: "succeeded", effectiveProvider: "fal" },
        ],
      },
      isVirtualBatch: true,
      primaryProvider: "fal",
    });
    expect(r.effectiveProviderForBilling).toBe("kie");
    expect(r.usedFallback).toBe(true);
  });
});
