# Система расчёта токенов (биллинг)

> Дата: 2026-03-17

---

## 1. Ключевая идея

Вся система построена на одном принципе: **внутренние кредиты (токены) — это нормализованная USD-стоимость с наценкой**. Пользователь покупает кредиты за Telegram Stars, мы тратим их пропорционально тому, сколько реально платим провайдеру.

---

## 2. Единица измерения: внутренний токен

Из `config.billing` (`packages/shared/src/config.ts`):

```
usdPerToken  = $0.043   ← сколько стоит 1 внутренний токен (Pro-план)
targetMargin = 2.0      ← наценка 2× над себестоимостью провайдера
```

**Откуда взялось $0.043?** Из пакета Pro (см. `pricing-analysis.md`):
- Пользователь покупает: 500 Stars → 150 токенов
- Разработчик получает: 500 × $0.013 = $6.50
- $6.50 ÷ 150 = **$0.043 за токен**

Оба значения переопределяются через env-переменные без правки кода:
```bash
BILLING_USD_PER_TOKEN=0.043
BILLING_TARGET_MARGIN=2.0
```

---

## 3. Единственная формула для всего

Функция `calculateCost` в `packages/api/src/services/token.service.ts`:

```
providerUsdCost =
    model.costUsdPerRequest
  + inputTokens  × model.inputCostUsdPerMToken  / 1_000_000
  + outputTokens × model.outputCostUsdPerMToken / 1_000_000

internalCredits = (providerUsdCost / usdPerToken) × targetMargin
```

Формула универсальна: для медиа-моделей токенные поля равны нулю, для LLM — `costUsdPerRequest` равен нулю.

---

## 4. Поля модели (`AIModel`)

Определены в `packages/shared/src/types/ai.ts`:

| Поле | Тип | Описание |
|---|---|---|
| `costUsdPerRequest` | `number` | Себестоимость одного запроса в USD. Для медиа: реальная цена провайдера. Для LLM: всегда `0`. |
| `inputCostUsdPerMToken` | `number` | USD за миллион входных токенов. Для медиа: всегда `0`. |
| `outputCostUsdPerMToken` | `number` | USD за миллион выходных токенов. Для медиа: всегда `0`. |

---

## 5. Два режима работы

### 5.1 LLM-модели (чат) — переменная стоимость

`costUsdPerRequest = 0`, стоимость полностью определяется числом токенов диалога.

Значения для всех моделей (`packages/shared/src/constants/models.ts`):

| Модель | input $/M | output $/M |
|---|---|---|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o Mini | $0.15 | $0.60 |
| GPT-4o Assistants | $2.50 | $10.00 |
| Claude Sonnet 4.5 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |
| Gemini 2.0 Flash | $0.10 | $0.40 |
| Gemini 2.5 Pro | $1.25 | $10.00 |
| Qwen Max | $1.20 | $6.00 |

**Пример — Claude Sonnet, запрос: 500 input + 300 output API-токенов:**
```
providerUsdCost = 0
  + 500 × $3.00  / 1_000_000 = $0.00150
  + 300 × $15.00 / 1_000_000 = $0.00450
  = $0.00600

internalCredits = ($0.006 / $0.043) × 2.0 ≈ 0.28 кредита
```

**Пример — Claude Sonnet, длинный диалог: 5 000 input + 2 000 output:**
```
providerUsdCost = $0.01500 + $0.03000 = $0.04500
internalCredits = ($0.045 / $0.043) × 2.0 ≈ 2.09 кредита
```

Чем длиннее история диалога — тем больше списывается. Это честно: мы платим провайдеру больше, пользователь тратит больше.

### 5.2 Медиа-модели (изображения, видео, аудио) — фиксированная стоимость

`inputCostUsdPerMToken = 0`, `outputCostUsdPerMToken = 0`, стоимость определяется только `costUsdPerRequest`.

Значения для всех моделей (середина диапазона реальных цен провайдера):

| Модель | `costUsdPerRequest` | Источник цены |
|---|---|---|
| DALL-E 3 | $0.040 | OpenAI, standard 1024×1024 |
| Midjourney | $0.030 | 3rd-party API $0.01–$0.05 |
| Flux | $0.010 | fal.ai $0.003–$0.030 |
| Ideogram | $0.040 | $0.020–$0.060 |
| Imagen 4 | $0.030 | Vertex AI $0.020–$0.040 |
| Stable Diffusion | $0.003 | Replicate $0.002–$0.005 |
| Kling (5s) | $0.525 | $0.35–$0.70 |
| Sora (5s) | $0.500 | $0.10/s × 5s |
| Runway (5s) | $0.750 | $0.50–$1.00 |
| Veo (5s) | $0.750 | $0.15/s × 5s |
| Luma DM | $0.079 | $0.033–$0.125 |
| MiniMax / Pika / Hailuo | $0.250 | $0.10–$0.40 |
| HeyGen | $1.500 | $1–$2/min |
| D-ID | $0.300 | $0.10–$0.50/clip |
| TTS OpenAI | $0.0045 | $0.015/1K chars, ~300 chars |
| Voice Clone (ElevenLabs) | $0.072 | $0.054–$0.090 / ~300 chars |
| Suno (1 трек) | $0.035 | $0.030–$0.040 |
| Sounds (ElevenLabs) | $0.048 | $0.036–$0.060 / ~200 chars |

**Пример — Kling (5s видеоклип):**
```
providerUsdCost = $0.525 + 0 + 0 = $0.525

internalCredits = ($0.525 / $0.043) × 2.0 = 12.21 × 2.0 ≈ 24.4 кредита
```

Реальная себестоимость: $0.525. Выручка с пользователя: 24.4 × $0.043 = **$1.05**. Маржа: **2×** ✅

**Пример — DALL-E 3 (одно изображение):**
```
providerUsdCost = $0.040

internalCredits = ($0.040 / $0.043) × 2.0 = 0.93 × 2.0 ≈ 1.86 кредита
```

**Пример — TTS OpenAI (~300 символов):**
```
providerUsdCost = $0.0045

internalCredits = ($0.0045 / $0.043) × 2.0 = 0.105 × 2.0 ≈ 0.21 кредита
```

---

## 6. Поток данных

### LLM-чат

```
Пользователь отправляет сообщение
  → chat.service.ts: stream запрос к адаптеру
  → LLM-адаптер стримит текст + возвращает StreamResult {
      inputTokensUsed:  N,   ← сырые API-токены
      outputTokensUsed: M,
    }
  → chat.service.ts вызывает calculateCost(model, N, M)
  → deductTokens(userId, result, modelId)
```

Если провайдер не вернул usage (сбой сети, старый адаптер) — срабатывает fallback:
```typescript
estimateTokens(content, responseText)
// Math.ceil((prompt.length + completion.length) / 4) / 1000
```

### Медиа (sync — DALL-E, TTS OpenAI, Sounds ElevenLabs)

```
Пользователь запрашивает генерацию
  → generation.service.ts / audio-generation.service.ts
  → adapter.generate(...)
  → успех → calculateCost(model)  ← без токенов
  → deductTokens(userId, cost, modelId)
```

### Медиа (async — Kling, Sora, Runway, Suno и т.д.)

```
Пользователь запрашивает генерацию
  → generation.service.ts: ставит job в BullMQ очередь
  → worker/processors/video.processor.ts (или image/audio)
  → провайдер завершил генерацию (polling)
  → calculateCost(model)
  → deductTokens(userId, cost, modelId)
```

Важно: при async-генерации **токены списываются только после успешного завершения**, не авансом.

---

## 7. Где что находится

| Компонент | Файл |
|---|---|
| Интерфейс `AIModel` | `packages/shared/src/types/ai.ts` |
| Конфиг биллинга | `packages/shared/src/config.ts` → `config.billing` |
| Данные по всем моделям | `packages/shared/src/constants/models.ts` |
| Функция `calculateCost` | `packages/api/src/services/token.service.ts` |
| Применение в LLM-чате | `packages/api/src/services/chat.service.ts` |
| Применение в sync медиа | `packages/api/src/services/generation.service.ts` |
| Применение в sync аудио | `packages/api/src/services/audio-generation.service.ts` |
| Применение в async воркерах | `packages/worker/src/processors/{image,video,audio}.processor.ts` |
| Интерфейс `StreamResult` | `packages/api/src/ai/llm/base.adapter.ts` |

---

## 8. Влияние targetMargin

При `usdPerToken = $0.043` и разных значениях `targetMargin`:

| targetMargin | Смысл | Gross Margin |
|---|---|---|
| `1.0` | Работаем в ноль (break-even) | 0% |
| `1.5` | 50% наценка | ~33% |
| `2.0` | **текущий дефолт** — 2× цена | ~50% |
| `3.0` | 3× цена | ~67% |

Например, при `targetMargin = 2.0` и реальной себестоимости $0.006 (Claude Sonnet, короткий запрос):
- Мы получаем: $0.006 × 2 = $0.012
- Прибыль: $0.006 (50% gross margin)
