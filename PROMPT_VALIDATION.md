# Валидация и перевод @-ссылок в промптах

Ветка: `fix/MET-422-kling-dog-elements-v2`

## Проблема

До этого изменения пользователи, писавшие `@element_dog` или `@Element1` в Kling-промптах,
либо получали непонятную ошибку API через несколько минут, либо запрос уходил молча с
неверными данными. Единого синтаксиса не было — KIE ожидал `@elementN` (строчные буквы),
FAL ожидал `@ElementN` (с заглавной), Evolink ожидал `<<<image_N>>>`. Пользователь был
обязан знать, какой провайдер активен в данный момент.

## Решение

### Единый канонический синтаксис

Пользователь всегда пишет одинаково, независимо от активного провайдера:

| Ссылка | Значение |
|--------|---------|
| `@Element1`..`@ElementN` | Слоты элементов Kling (`ref_element_N`) |
| `@Image1`..`@ImageN` | Массив референсных изображений (`ref_images`) |
| `@Video` | Одно референсное видео (`motion_video` / `ref_videos`) |

Варианты написания (`@element1`, `@IMAGE2`) молча нормализуются — ошибка не показывается.

### Предварительная валидация

Ошибки возвращаются **до** вызова API с понятным локализованным сообщением:

| Ошибка | Условие |
|--------|---------|
| `promptRefElementWordName` | Стиль `@element_dog` (словесное имя, не число) |
| `promptRefElementMissing` | `@Element2` в промпте, но слот 2 пуст |
| `promptRefElementOutOfRange` | `@Element5` при максимуме 3 у модели |
| `promptRefImageMissing` | `@Image3`, но загружено только 2 изображения |
| `promptRefImageOutOfRange` | `@Image9` при максимуме 7 у модели |
| `promptRefVideoMissing` | `@Video`, но видео в слотах нет |
| `promptRefVideoIndexed` | `@Video1` (модель использует единственный `@Video`) |
| `promptRefUnsupportedByModel` | Любая `@`-ссылка на модели без `promptRefs` |
| `promptRefUnknownToken` | Неизвестная ссылка на модели, которая поддерживает ссылки |

Модели **без** `promptRefs` в определении полностью пропускаются — символы `@` в промптах
для Runway, HeyGen, Luma и т.д. передаются без изменений.

### Перевод под конкретного провайдера (молчаливый)

| Провайдер | `@ElementN` → | `@ImageN` → |
|-----------|--------------|------------|
| FAL (kling-o3) | `@ElementN` (с заглавной) | `@ImageN` (с заглавной) |
| KIE (kling-3.0) | `@elementN` (строчные) | `@imageN` (строчные) |
| Evolink (kling-o3 fallback) | `<<<image_P>>>` | `<<<image_P>>>` |

Evolink использует позиционное отображение: если слоты заполнены с пропусками (слоты 1 и 3
заполнены, слот 2 пуст), `@Element3` корректно становится `<<<image_2>>>` — соответствуя
реальному индексу в массиве `image_urls`.

## Изменённые файлы

### Новые файлы
- `packages/shared/src/prompt-refs/canonical.ts` — регулярные выражения + тип `PromptRefCapabilities`
- `packages/api/src/services/prompt-ref.service.ts` — предварительный валидатор
- `packages/api/src/services/prompt-ref-translator.service.ts` — диалектный переводчик + `buildEvolinkElementPositions`

### Изменённые файлы
- `packages/shared/src/types/ai.ts` — `AIModel.promptRefs?: PromptRefCapabilities`
- `packages/shared/src/index.ts` — реэкспорт регулярных констант + `PromptRefCapabilities`
- `packages/shared/src/constants/models/video.models.ts` — `promptRefs` заполнен для всех вариантов kling и grok-imagine (основных и всех fallback)
- `packages/shared/src/i18n/locales/en.ts` — 10 новых ключей `video.*`, обновлены подсказки под канонический синтаксис
- `packages/shared/src/i18n/locales/ru.ts` — то же самое
- `packages/api/src/services/video-generation.service.ts` — `validateVideoRequest` вызывает валидатор до адаптера
- `packages/api/src/ai/video/fal.adapter.ts` — заменены `remapKlingElementSyntax` / `remapImageRefSyntax` на `translatePromptRefs`
- `packages/api/src/ai/video/kie.adapter.ts` — удалена старая узкая проверка `/@element_\w+/`, добавлен `translatePromptRefs` в kling-ветке
- `packages/api/src/ai/video/evolink.adapter.ts` — заменён `remapElementSyntax` на `translatePromptRefs` + `buildEvolinkElementPositions`
