# Provider-level fallback — manual smoke checklist

Эти 5 сценариев нужны после любого изменения, которое касается:

- `submit-with-fallback.ts`
- `image.processor.ts` / `video.processor.ts` (submit/poll/finalize стадии)
- `key-pool.service.ts` (long-cooldown маркер, acquireKey)
- `notify-error.ts` / `notifyFallback`
- `FALLBACK_DESIGN_MODELS` / `FALLBACK_VIDEO_MODELS`

Юнит-тесты покрывают чистые helpers и orchestration, но не доказывают что
сценарий end-to-end отрабатывает с реальными провайдерами/Redis/DB. Эти 5
кейсов — минимальный набор для ручной проверки в test-окружении перед merge'ом
в `develop` / promote'ом в prod.

## Подготовка

1. Test VPS должен быть свежим (актуальный develop), Redis достижим.
2. Открыт технический tg-канал, куда пишет `notifyTechError` /
   `notifyFallback` — чтобы видеть alert'ы.
3. Открыт `docker compose logs -f worker` чтобы видеть structured logs c
   `event: provider_fallback` / `event: provider_fallback_failed`.
4. Иметь под рукой: `redis-cli` на test VPS, тестового пользователя с балансом.

---

## Smoke 1 — happy path: primary OK, fallback dormant

**Цель:** убедиться что fallback-логика не активируется когда primary работает.

**Шаги:**

1. Через бота сгенерировать 1 image на модели, у которой есть fallback (например
   `flux-2` если в `FALLBACK_DESIGN_MODELS` есть запись с тем же id).
2. Дождаться завершения.

**Ожидание:**

- Картинка сгенерирована.
- В worker-логе отсутствует `event: provider_fallback`.
- В БД `GenerationJob.inputData.fallback`:
  - `effectiveProvider` равен provider'у primary `AIModel`.
  - `attemptedProviders` содержит ровно 1 элемент (primary).
- В техническом tg-канале — тишина (никаких алертов).
- `tokensSpent` совпадает с обычным `calculateCost(primaryModel, ...)`.

---

## Smoke 2 — primary PoolExhausted → fallback подхватывает (single-shot)

**Цель:** проверить что при отсутствии свободных ключей primary processor
прозрачно переключается на fallback.

**Шаги:**

1. На test VPS вручную «положить» все ключи primary провайдера в cooldown через
   Redis. Например для FAL: `redis-cli` →
   `KEYS keypool:fal:throttle:*` → каждому `EXPIRE` по 600 сек, либо
   `SET keypool:fal:throttle:<keyId> "1" EX 600`.
2. Через бота сгенерировать 1 image той же моделью.

**Ожидание:**

- Картинка сгенерирована (fallback провайдер).
- Worker лог: `event: provider_fallback, reason: pool_exhausted, primaryProvider: fal, succeededProvider: <fallback>, jobId: ...`.
- В БД `inputData.fallback.effectiveProvider === <fallback провайдер>`.
- `attemptedProviders` содержит оба провайдера.
- В тех-канале — alert `[FALLBACK] section=design, model=...: fal → <fallback>. Reason: pool_exhausted. Job: <id>`.
- `tokensSpent` рассчитан по primary `AIModel` (не по фактическому fallback'у).
- Очистить cooldown: `redis-cli DEL keypool:fal:throttle:*`.

---

## Smoke 3 — virtual batch sticky-lock

**Цель:** убедиться что после первого успешного submit'а в virtual batch все
оставшиеся sub-jobs идут на тот же provider (строгий sticky), и при падении
locked-провайдера sub-jobs honestly помечаются failed.

**Шаги:**

1. Запросить N=4 images на модели с `nativeBatchMax === 1` и `maxVirtualBatch >= 4`
   (например `nano-banana`).
2. Не вмешиваться — пусть sub-job[0] пройдёт на primary.
3. Сразу после успеха sub-job[0] (видно в логах) — выставить cooldown на все
   primary keys в Redis (как в Smoke 2).

**Ожидание:**

- sub-job[0]: succeeded на primary, `effectiveProvider: <primary>`.
- sub-job[1..3]: при подсадке cooldown'а попытаются acquire ключ primary →
  PoolExhausted → mark sub-job failed (НЕ пробуют fallback, т.к. provider
  залочен на primary).
- Финальный результат K=1 из N=4, billing 1 × per-image cost.
- В БД `subJobs[1..3].status === "failed"`, `subJobs[1..3].error` содержит
  `pool exhausted` или похожий маркер.
- В логе НЕТ `event: provider_fallback` для sub-job[1..3] (sticky закрыл fallback path).

---

## Smoke 4 — restart-recovery после fallback submit

**Цель:** убедиться что worker-restart сразу после успешного submit'а на
fallback не приводит к повторному submit'у на primary.

**Шаги:**

1. Подготовить условие как в Smoke 2 (primary cooldown).
2. Запустить генерацию 1 image.
3. Как только в логах появится `event: provider_fallback, succeededProvider: <fallback>`
   и до того как poll-стадия завершилась (типичное окно — 5-30 сек) —
   `docker compose restart worker`.
4. Дождаться завершения генерации после restart'а.

**Ожидание:**

- Картинка сгенерирована корректно.
- В логе после restart'а poll идёт на `<fallback>`, НЕ на primary.
- Никаких дублирующих submit'ов в логах primary провайдера.
- `inputData.fallback.effectiveProvider` остался прежним (`<fallback>`).
- Очистить cooldown.

---

## Smoke 5 — provider long-cooldown marker

**Цель:** проверить fast-path skip primary'я когда выставлен provider-wide
cooldown маркер.

**Шаги:**

1. Вручную в Redis: `SET provider:long-cooldown:fal "1" PX 600000` (10 мин).
2. Запустить генерацию 1 image на модели с primary=FAL и существующим fallback.
3. Дождаться завершения.

**Ожидание:**

- Картинка сгенерирована на fallback провайдере.
- В логе: `event: provider_fallback, reason: provider_long_cooldown_marker, primaryProvider: fal, succeededProvider: <fallback>`.
- Никаких вызовов `acquireKey('fal')` в логе для этой задачи (быстрый skip
  ДО acquire).
- В тех-канале — `[FALLBACK] ... Reason: provider_long_cooldown_marker`.
- Удалить маркер: `redis-cli DEL provider:long-cooldown:fal`.

---

## Quick sanity check после смерти прохода

После каждого scenario:

```bash
# 1. Worker не падал и нет необработанных exception'ов
docker compose logs --tail 200 worker | grep -iE "error|fatal|unhandled" | grep -v "expected"

# 2. БД в консистентном состоянии
psql ... -c "select id, status, "modelId", "tokensSpent",
                    inputData->'fallback'->>'effectiveProvider' as eff_provider,
                    inputData->'fallback'->'attemptedProviders' as attempted
             from \"GenerationJob\"
             where \"createdAt\" > now() - interval '10 min'
             order by \"createdAt\" desc;"
```

Если хоть один scenario упал — НЕ merge'им изменения, fix → перепроход.
