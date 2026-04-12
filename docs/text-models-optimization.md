# Оптимизация использования текстовых LLM

Документ описывает механизмы экономии токенов и управления контекстом для текстовых
моделей в нашем боте: что делают провайдеры автоматически, что мы должны делать сами,
и какие фичи стоит реализовать.

---

## 1. Prompt caching (cached input)

Идея общая у всех провайдеров: если префикс промпта совпадает с префиксом недавнего
запроса, сервер переиспользует внутренние KV-кеши модели и берёт за эти токены
существенно меньшую цену.

### OpenAI (automatic prompt caching)

- **Автоматически** для запросов с префиксом ≥1024 токенов. Настраивать ничего не нужно.
- Кешируется блоками по 128 токенов — эффективная длина hit'а округляется вниз.
- **Скидка**: cached input tokens стоят **50% обычных** (для большинства моделей; gpt-5
  и o-серия — 75%).
- **TTL**: 5–10 минут с последнего использования (продлевается на каждом hit'е). В
  off-peak часы может жить до часа.
- **Условие hit'а**: идентичный префикс (включая system prompt, tools и первые
  messages). Любое изменение в начале — cache miss.
- **В usage**: `prompt_tokens_details.cached_tokens` показывает сколько токенов
  префикса попало в кеш.

### Anthropic (explicit `cache_control`)

- **Не автоматический** — нужно явно помечать `cache_control: {type: "ephemeral"}` на
  блоки, которые хочешь закешировать.
- До 4 cache breakpoints на запрос. Всё что до breakpoint'а кешируется.
- **Скидка**: cached input tokens стоят **10% обычных** (90% скидка — самая
  агрессивная).
- **Стоимость записи в кеш**: первый запрос с cache write платит **125% обычной цены**
  за эти токены (наценка 25%). Break-even на 2-м hit'е.
- **TTL**: 5 минут (по умолчанию) или 1 час (beta `extended-cache-ttl-2025-04-11`,
  стоит дороже).
- **Минимум**: 1024 токена для Sonnet/Opus, 2048 для Haiku.

### Gemini (implicit + explicit)

- **Implicit caching**: автоматически для моделей 2.5+. Аналогично OpenAI — hit при
  совпадении префикса.
- **Explicit caching** (Context Caching API): создаёшь `cachedContent` объект с TTL
  (минимум 1 минута, по умолчанию 1 час), потом ссылаешься `cached_content` в
  запросах.
- **Скидка**: implicit ~75% дешевле; explicit ~75% + отдельная **плата за хранение**
  ($1/1M tokens/hour для 2.5 Pro).
- **Минимум**: 32K токенов для explicit.

### Где это даёт реальную экономию у нас

1. **Длинные диалоги с PDF** (db_history + Anthropic): PDF переотправляется каждый
   turn. Если пометить `cache_control` на блок с документом — каждый последующий turn
   стоит 10% от стоимости документа. Для 100-страничного PDF разница может быть в 10
   раз на стоимости диалога.
2. **Фиксированный system prompt**: длинный system-prompt кешируется автоматически у
   OpenAI/Gemini. У Anthropic — нужно явно пометить.
3. **Text-class re-inlining**: наш pipeline перечитывает .csv/.docx из S3 каждый turn
   и инлайнит в history. Эти блоки стабильные → идеальный кандидат на caching.

### Что нужно в коде

- **OpenAI, Gemini**: ничего, caching включается автоматически. Главное — обеспечить
  **стабильность префикса** (никаких timestamp/user_id в начале system prompt).
- **Anthropic**: добавить `cache_control: {type: "ephemeral"}` на последний блок
  system prompt и/или последний history message перед current turn. Параметр
  передаётся в `ContentBlockParam` SDK Anthropic.

---

## 2. Другие пути оптимизации

По убыванию soft ROI:

### 2.1. Prompt caching (★★★★★)

См. раздел 1 — самый большой экономический эффект.

### 2.2. Token-aware history truncation (★★★★)

Сейчас `AnthropicAdapter.contextMaxMessages = 50` — жёсткий count лимит. С большими
вложениями 50 сообщений могут не влезть в context window. Нужно:

- **Token-aware truncation**: считать токены префикса и вырезать старые сообщения,
  когда превышен budget (например 80% от context window модели).
- **Per-message cost check**: оценочную стоимость запроса логировать; при превышении
  threshold — warning пользователю.
- **Keep-head-and-tail**: всегда держать первое сообщение (часто несёт тему/ключевой
  контекст) + последние N. Дешёвая эвристика.

### 2.3. Summary compression (★★★)

Когда история перерастает лимит, **суммаризировать** старую часть через дешёвую
модель (Haiku/Flash). Pattern: каждые 20 turn'ов background-job сворачивает первые 10
в 1–2-абзацное саммари и хранит как pinned system message.

Diminishing returns на очень длинных диалогах. Сложность: хранить summary отдельным
полем в `Dialog`, инвалидировать при редактировании сообщений.

### 2.4. Output cap для дешёвых turn'ов (★★★)

Сейчас `max_tokens` приходит из настроек модели. Стоит проверить, что для коротких
follow-up'ов мы не выдаём 4096 токенов output space — влияет на latency. Низкий
приоритет (платим только за реально сгенерированное).

### 2.5. Model routing / cascading (★★★)

Дешёвая модель пробует ответить → если уверенность низкая → эскалация на дорогую.
Требует evaluation layer. Сложно делать хорошо.

### 2.6. Batch API (★★)

OpenAI/Anthropic дают **50% скидку** на input+output для batch-запросов. Не для
интерактивного чата, но применимо к:

- **Autotranslation** промптов (у нас уже есть).
- **Генерация заголовков диалогов** (background-job).
- **Moderation/labeling** старых сообщений.

Latency 24h. Бот пользоваться не может, background — да.

### 2.7. Structured outputs / tool use (★★)

`response_format: json_schema` / tool-use для service-эндпоинтов (генерация
заголовков). Не экономит токены, но убирает retry-loops.

### 2.8. Deduplication attachment reads (★★)

`augmentHistoryMessage` на каждый turn делает S3 GET для всех text-class документов в
истории. Если в одном диалоге одна и та же таблица фигурирует в 20 turn'ах — это 20
S3 GET. Тривиальный fix — in-memory LRU `s3Key → extracted text` внутри одного
запроса (Map в начале `sendMessageStream`).

### 2.9. Token estimation pre-flight (★)

Перед отправкой грубо посчитать input tokens (tiktoken/аналог) и, если превышает
баланс пользователя, отказывать до похода в API. Сейчас `checkBalance(userId, 0)`
проверяет только "не ноль ли". Может сэкономить деньги на запросах, падающих в
середине из-за `INSUFFICIENT_TOKENS`.

---

## 3. Context windows — как это работает

**Короткий ответ: ничего не сжимается и не сдвигается автоматически. Это целиком
наша ответственность.**

### По провайдерам

**OpenAI (Responses API с `previous_response_id`)**
Мы используем `provider_chain` — OpenAI **сам держит** предыдущий контекст на своей
стороне, мы передаём только `previous_response_id` и новое сообщение. Но это **не
бесконечный контекст**: каждый запрос всё равно отправляет модели всю цепочку — мы
просто не платим bandwidth за перегон. Токены оплачиваются по полной (минус
caching). Когда общий размер цепочки превышает context window модели (gpt-5: 400K,
gpt-4o: 128K), OpenAI возвращает `context_length_exceeded`. Не сдвигает, не
обрезает, не суммаризирует.

**Anthropic / Gemini / Qwen / DeepSeek (db_history)**
Мы сами берём последние N сообщений (`contextMaxMessages`) и шлём их. Ограничение —
по count, **не по токенам**. При превышении context window провайдер возвращает
ошибку (`prompt is too long`, `context_length_exceeded`, `Request payload size
exceeds the limit`).

Автоматической обрезки старых сообщений на стороне сервера **нет ни у кого**.

### Что делает `contextMaxMessages`

Грубая эвристика: limit по количеству сообщений. 50 для Claude Sonnet с context
window 200K обычно OK (~2K токенов на сообщение в среднем). Но если в истории лежат
большие text extracts, .xlsx файлы — 5 сообщений могут не влезть.

### Что нужно с нашей стороны

1. **Token budget awareness**. Вместо `contextMaxMessages = 50` ввести
   `contextMaxTokens` per-model (из `AI_MODELS[id].contextWindow` минус reserved
   output). Считать токены истории и обрезать сообщения с начала, пока не влезет.
2. **Graceful overflow handling**. Если после максимальной обрезки запрос всё ещё не
   влезает (current user prompt + один документ > window) — понятная ошибка
   "Документ слишком большой для этой модели".
3. **Автоматический reset `previousResponseId`** для OpenAI при
   `context_length_exceeded`: стартовать новую цепочку с summary старой как system
   prompt.
4. **Warning при приближении к лимиту**. UX: "Ваш диалог использует 180K из 200K
   токенов".

---

## TL;DR приоритизация

**Immediate wins** (малый код, большой эффект):

1. **Token-aware history truncation** + graceful overflow → пользователь не должен
   встречать context overflow ошибок.
2. **In-memory dedup для `augmentHistoryMessage` S3 GET** — 10 минут работы.
3. **Anthropic `cache_control` на history prefix** — 5–10× экономия на длинных
   диалогах с документами.

**Medium wins**:

4. Проверить стабильность system prompt префикса у OpenAI/Gemini (для implicit
   caching).
5. Для OpenAI Responses — ловить `context_length_exceeded` и сбрасывать response
   chain (с переносом summary).

**Отложенное / сложное**:

6. Summary compression для очень длинных диалогов.
7. Batch API для background-задач (autotranslation, titles).
8. Pre-flight token estimation.
