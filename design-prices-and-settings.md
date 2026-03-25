# Design-секция: актуальные цены и дополнительные настройки

> Источники: официальные сайты провайдеров, март 2026.
> Цены — за одно изображение, если не указано иное.

---

## FAL.ai модели

### FLUX / FLUX Pro

| Наш ID   | FAL endpoint      | Цена          | Наша цена | Расхождение      |
| -------- | ----------------- | ------------- | --------- | ---------------- |
| flux     | fal-ai/flux-2     | **$0.012/MP** | $0.025/MP | в 2× дороже ❌   |
| flux-pro | fal-ai/flux-2-pro | **$0.030/MP** | $0.040/MP | в 1.3× дороже ❌ |

**Пример:** 1024×1024 = 1MP → flux: $0.012, flux-pro: $0.030.
1920×1080 = 1.83MP → flux: $0.022, flux-pro: $0.055 (за доп. мегапиксели — половина базовой ставки).

**Существующие настройки верны.** Дополнительных параметров у этих моделей нет.

---

### Nano Banana Pro

| Наш ID          | FAL endpoint           | Цена           | Наша цена     |
| --------------- | ---------------------- | -------------- | ------------- |
| nano-banana-pro | fal-ai/nano-banana-pro | **$0.150/img** | $0.150/img ✅ |

**Дополнительные настройки для добавления:**

```
key: "safety_tolerance"
label: "Допустимый контент"
description: "1 — строгая фильтрация, 6 — минимальная. По умолчанию 4."
type: "slider", min: 1, max: 6, step: 1, default: 4
```

**Расширенные aspect ratio** (сейчас у нас только 5 вариантов, доступно 11):

- Добавить: `21:9`, `3:2`, `5:4`, `4:5`, `2:3`
- Итого должно быть: `21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16`

---

### Seedream 5 / Seedream 4.5

| Наш ID       | FAL endpoint                                    | Цена           | Наша цена     |
| ------------ | ----------------------------------------------- | -------------- | ------------- |
| seedream-5   | fal-ai/bytedance/seedream/v5/lite/text-to-image | **$0.035/img** | $0.035/img ✅ |
| seedream-4.5 | fal-ai/bytedance/seedream/v4.5/text-to-image    | **$0.040/img** | $0.040/img ✅ |

Цены верные ✅. Настройки (guidance_scale, seed) — актуальны.

---

### GPT-Image 1.5

| Наш ID        | FAL endpoint         | Цена                                | Наша цена              | Расхождение |
| ------------- | -------------------- | ----------------------------------- | ---------------------- | ----------- |
| gpt-image-1.5 | fal-ai/gpt-image-1.5 | **$0.009–$0.133/img** (по качеству) | $0.040/img фиксировано | ❌ неверная |

**Реальные цены по качеству (1024×1024):**

- Low: $0.009
- Medium: $0.034
- High: $0.133

**Дополнительные настройки для добавления:**

```
key: "quality"
label: "Качество"
description: "low — очень быстро и дёшево ($0.009), medium — баланс ($0.034), high — максимальная детализация ($0.133)."
type: "select"
options: [low, medium, high]
default: "medium"
```

---

### Stable Diffusion (via FAL/Replicate)

| Наш ID           | Endpoint                     | Цена            | Наша цена  | Расхождение |
| ---------------- | ---------------------------- | --------------- | ---------- | ----------- |
| stable-diffusion | Replicate: stability-ai/sdxl | **$0.0045/img** | $0.003/img | ≈ близко ❌ |

**Настройки верны** (negative_prompt, guidance_scale, num_inference_steps).

---

## OpenAI — DALL-E 3

| Наш ID                        | Цена (standard)                   | Цена (HD)                  | Наша цена | Расхождение        |
| ----------------------------- | --------------------------------- | -------------------------- | --------- | ------------------ |
| dall-e-3                      | **$0.040** (1024×1024)            | **$0.080** (1024×1024)     | $0.040    | только standard ✅ |
| dall-e-3 (landscape/portrait) | **$0.080** (1792×1024, 1024×1792) | **$0.120** (те же размеры) | —         | не учтено          |

**Примечание:** Наша цена $0.040 верна только для standard 1024×1024. При HD или нестандартных размерах цена вдвое выше — стоит учитывать при billing.

Существующие настройки (quality: standard/hd, style: vivid/natural) — **верны и полные** ✅.

---

## Replicate модели

### Midjourney Diffusion

| Наш ID     | Replicate model               | Цена           | Наша цена  | Расхождение     |
| ---------- | ----------------------------- | -------------- | ---------- | --------------- |
| midjourney | tstramer/midjourney-diffusion | **$0.089/img** | $0.030/img | в 3× дешевле ❌ |

> **Важно:** `tstramer/midjourney-diffusion` — это сторонняя community-модель на Replicate, не настоящий Midjourney. Цена $0.089, а не $0.030. Настоящий Midjourney API не имеет официального публичного доступа.

---

### Ideogram V3

| Наш ID   | Replicate model         | Цена                          | Наша цена  | Расхождение     |
| -------- | ----------------------- | ----------------------------- | ---------- | --------------- |
| ideogram | ideogram-ai/ideogram-v3 | **$0.03–$0.09/img** (по тиру) | $0.040/img | зависит от тира |

**Реальные цены по тирам:**

- Turbo: $0.030
- Balanced: $0.060
- Quality: $0.090

**Дополнительные настройки для добавления:**

```
key: "rendering_speed"
label: "Качество / скорость"
description: "turbo — быстро и дёшево ($0.03), balanced — баланс ($0.06), quality — максимальное качество ($0.09)."
type: "select"
options: [turbo, balanced, quality]
default: "balanced"
```

**Стиль V3** — подтверждено: только `AUTO, GENERAL, REALISTIC, DESIGN` (V3). Настройки верные ✅.

---

## Google — Imagen 4

| Наш ID   | Endpoint                  | Цена                          | Наша цена  | Расхождение     |
| -------- | ------------------------- | ----------------------------- | ---------- | --------------- |
| imagen-4 | Vertex AI / ai.google.dev | **$0.02–$0.06/img** (по тиру) | $0.030/img | зависит от тира |

**Реальные цены по тирам:**

- Fast: $0.020 (до 1408×768)
- Standard: $0.040
- Ultra: $0.060 (до 2816×1536 — уникальное разрешение)

**Дополнительные настройки для добавления:**

```
key: "mode"
label: "Качество / скорость"
description: "fast — быстро и дёшево, standard — стандарт, ultra — максимальное разрешение до 2.8K."
type: "select"
options: [fast, standard, ultra]
default: "standard"
```

---

## Recraft

### Recraft V3

| Наш ID     | Recraft model | Цена                                         | Наша цена     |
| ---------- | ------------- | -------------------------------------------- | ------------- |
| recraft-v3 | recraftv3     | **$0.040/img** (raster), $0.080/img (vector) | $0.040/img ✅ |

**Существующие стили (у нас 3) — в реальности 20+.** Примеры полного списка V3:

- `realistic_image` + substyles: `b_and_w`, `hard_flash`, `hdr`, `natural_light`, `studio_portrait`, `enterprise`, `motion_blur`
- `digital_illustration` + substyles: `pixel_art`, `hand_drawn`, `grain`, `infantile_sketch`, `2d_art_poster`, `engraving_color`, `70s`
- `vector_illustration` + substyles: `engraving`, `line_art`, `linocut`
- Отдельные стили: `realistic_image/b_and_w`, `icon`, `any`

**Дополнительные настройки для добавления:**

```
key: "substyle"
label: "Под-стиль"
description: "Уточняет художественный стиль: b_and_w, hard_flash, pixel_art, grain и другие. Зависит от выбранного стиля."
type: "text", default: ""
```

```
key: "no_text"
label: "Без текста"
description: "Запретить модели добавлять текст, надписи и леттеринг в изображение."
type: "toggle", default: false
```

```
key: "artistic_level"
label: "Художественность"
description: "0 — близко к реальности, 5 — максимально стилизованно и художественно."
type: "slider", min: 0, max: 5, step: 1, default: 2
```

---

### Recraft V4 / V4 Pro / V4 Vector / V4 Pro Vector

| Наш ID                | Цена           | Наша цена     | Разрешение |
| --------------------- | -------------- | ------------- | ---------- |
| recraft-v4            | **$0.040/img** | $0.040/img ✅ | 1024×1024  |
| recraft-v4-pro        | **$0.250/img** | $0.250/img ✅ | 2048×2048  |
| recraft-v4-vector     | **$0.080/img** | $0.080/img ✅ | —          |
| recraft-v4-pro-vector | **$0.300/img** | $0.300/img ✅ | —          |

Цены верные ✅.

**Для V4 (не-vector) — добавить настройки:**

```
key: "no_text"
label: "Без текста"
description: "Запретить модели добавлять текст, надписи и леттеринг в изображение."
type: "toggle", default: false
```

**Примечание:** Recraft V4 не использует систему стилей — они убраны в пользу prompt-based управления. Это верно отражено в наших настройках (только seed) ✅.

---

## Сводная таблица расхождений цен

| Провайдер | Наш ID           | Текущая цена | Актуальная цена | Расхождение           |
| --------- | ---------------- | ------------ | --------------- | --------------------- |
| FAL       | flux             | $0.025/MP    | $0.012/MP       | в 2× ❌               |
| FAL       | flux-pro         | $0.040/MP    | $0.030/MP       | в 1.3× ❌             |
| FAL       | gpt-image-1.5    | $0.040 fix   | $0.009–$0.133   | зависит от quality ❌ |
| Replicate | midjourney       | $0.030       | $0.089          | в 3× дешевле ❌       |
| Google    | imagen-4         | $0.030       | $0.020–$0.060   | зависит от тира ❌    |
| Replicate | ideogram         | $0.040       | $0.030–$0.090   | зависит от тира ❌    |
| Replicate | stable-diffusion | $0.003       | $0.0045         | ~1.5× ❌              |

---

## Дополнительные настройки для добавления (summary)

| Настройка                | Модели                                 | Тип                            | Примечание                        |
| ------------------------ | -------------------------------------- | ------------------------------ | --------------------------------- |
| `safety_tolerance`       | nano-banana-pro                        | slider 1–6                     | default: 4                        |
| Расширить `aspect_ratio` | nano-banana-pro                        | —                              | добавить 21:9, 3:2, 5:4, 4:5, 2:3 |
| `quality`                | gpt-image-1.5                          | select: low/medium/high        | влияет на цену                    |
| `rendering_speed`        | ideogram                               | select: turbo/balanced/quality | влияет на цену                    |
| `mode`                   | imagen-4                               | select: fast/standard/ultra    | влияет на цену и разрешение       |
| `substyle`               | recraft-v3                             | text                           | уточняет стиль                    |
| `no_text`                | recraft-v3, recraft-v4, recraft-v4-pro | toggle                         | запрет текста на изображении      |
| `artistic_level`         | recraft-v3                             | slider 0–5                     | степень стилизации                |
