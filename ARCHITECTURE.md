# Metabox AI Bot — Архитектура и план разработки

## Архитектура приложения

### Структура монорепозитория (pnpm workspaces)

```
metabox-bot/
├── packages/
│   ├── bot/                    # Telegram Bot (Grammy.js)
│   │   ├── src/
│   │   │   ├── commands/       # /start, /menu, /gpt, /design, /audio, /video
│   │   │   ├── handlers/       # Обработчики сообщений, callback query
│   │   │   ├── keyboards/      # Reply & inline клавиатуры
│   │   │   ├── scenes/         # FSM-сцены (grammy/scenes)
│   │   │   ├── middlewares/    # Auth, rate-limit, i18n, token check
│   │   │   ├── i18n/           # Переводы (14 языков, .ftl или .json)
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── api/                    # REST API (Fastify)
│   │   ├── src/
│   │   │   ├── routes/         # /users, /dialogs, /tokens, /webhooks
│   │   │   ├── services/       # Бизнес-логика
│   │   │   ├── ai/             # AI-адаптеры
│   │   │   │   ├── llm/        # OpenAI, Anthropic, Google, Qwen
│   │   │   │   ├── image/      # MidJourney, DALL-E, Flux, Imagen, etc.
│   │   │   │   ├── video/      # Sora, Kling, RunWay, Veo, Luma, etc.
│   │   │   │   └── audio/      # TTS, voice clone, Suno, etc.
│   │   │   ├── db/             # Prisma client, migrations
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── worker/                 # BullMQ workers (async задачи)
│   │   ├── src/
│   │   │   ├── queues/         # image.queue, video.queue, audio.queue
│   │   │   ├── processors/     # Логика обработки задач
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── webapp/                 # Telegram Mini App (React + Vite)
│   │   ├── src/
│   │   │   ├── pages/          # Profile, Dialogs, Tariffs, Settings
│   │   │   ├── components/
│   │   │   ├── hooks/          # useTelegramUser, useTokens
│   │   │   └── api/            # Клиент для backend API
│   │   └── package.json
│   │
│   └── shared/                 # Общие типы и константы
│       ├── src/
│       │   ├── types/          # TS-типы (User, Dialog, Token, etc.)
│       │   ├── constants/      # STATES, MODEL_IDS, LANGUAGES
│       │   └── utils/
│       └── package.json
│
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.bot
│   │   ├── Dockerfile.api
│   │   └── Dockerfile.worker
│   └── nginx/
│       └── nginx.conf
├── prisma/
│   ├── schema.prisma           # Единая схема БД
│   └── migrations/
├── docker-compose.yml
├── docker-compose.prod.yml
├── pnpm-workspace.yaml
├── package.json                # Root (turbo, eslint, ts configs)
└── turbo.json
```

---

### Ключевые технологии

| Слой          | Технология                 | Обоснование                                          |
| ------------- | -------------------------- | ---------------------------------------------------- |
| Bot framework | Grammy.js                  | Современный, TS-native, middleware/scenes из коробки |
| API framework | Fastify                    | Быстрый, schema validation, хорошая экосистема       |
| ORM           | Prisma                     | Type-safe, миграции, хорошо с PostgreSQL             |
| Queue         | BullMQ + Redis             | Надёжные очереди для async AI генерации              |
| Mini App      | React + Vite + TailwindCSS | Быстрая сборка, @telegram-apps/sdk                   |
| Monorepo      | Turborepo + pnpm           | Кэширование билдов, параллельные задачи              |
| AI Gateway    | Единый адаптер-паттерн     | Легко добавлять новые провайдеры                     |
| Storage       | AWS S3 / Cloudflare R2     | Изображения, аудио, видео                            |
| Monitoring    | Pino (logs) + Prometheus   | Структурированные логи, метрики                      |

---

### Схема базы данных (ключевые модели)

```prisma
model User {
  id             BigInt             @id              // Telegram user ID
  username       String?
  language       String             @default("en")
  tokenBalance   Decimal            @default(5.50)
  isNew          Boolean            @default(true)
  createdAt      DateTime           @default(now())
  referredBy     BigInt?
  dialogs        Dialog[]
  transactions   TokenTransaction[]
}

model Dialog {
  id        String    @id @default(cuid())
  userId    BigInt
  section   String    // gpt | design | audio | video
  modelId   String    // gpt-4o | claude-sonnet | midjourney | etc.
  title     String?
  isActive  Boolean   @default(true)
  messages  Message[]
  createdAt DateTime  @default(now())

  // Контекст на стороне провайдера
  contextStrategy      String   @default("db_history")
  // "provider_thread"  — OpenAI Assistants (thread_id хранится в providerThreadId)
  // "provider_chain"   — OpenAI Responses API (last response_id в providerLastResponseId)
  // "db_history"       — Anthropic, Gemini и др. (история из БД, последние N сообщений)
  providerThreadId     String?  // OpenAI Assistants: thread_id
  providerLastResponseId String? // OpenAI Responses API: предыдущий response_id для цепочки
}

model Message {
  id               String   @id @default(cuid())
  dialogId         String
  role             String   // user | assistant
  content          String
  mediaUrl         String?
  tokensUsed       Decimal  @default(0)
  providerMessageId String? // OpenAI Assistants: message_id (для управления историей)
  createdAt        DateTime @default(now())
}

model TokenTransaction {
  id        String   @id @default(cuid())
  userId    BigInt
  amount    Decimal
  type      String   // credit | debit
  reason    String   // welcome_bonus | ai_usage | purchase
  createdAt DateTime @default(now())
}
```

---

### Стратегии хранения контекста по провайдерам

| Провайдер                   | Стратегия         | Как работает                                                                                                                                            |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI GPT-4o, o-series** | `provider_chain`  | Responses API: каждый ответ имеет `response_id`. Передаём `previous_response_id` — провайдер сам ведёт историю. В БД пишем только для отображения в UI. |
| **OpenAI Assistants**       | `provider_thread` | Создаём `Thread` при старте диалога, сохраняем `thread_id`. Добавляем сообщения через API, запускаем `Run`. Полная история на стороне OpenAI.           |
| **Anthropic Claude**        | `db_history`      | Серверного контекста нет. Берём последние N сообщений из БД, отправляем массивом `messages[]` в каждом запросе.                                         |
| **Google Gemini**           | `db_history`      | Серверного контекста для диалогов нет (есть `cachedContent` только для системных промптов). Отправляем `contents[]` из БД.                              |
| **Qwen и другие**           | `db_history`      | Аналогично Anthropic — история из БД.                                                                                                                   |

**Ограничение истории (`db_history`):** отправляем последние **50 сообщений** (настраивается per-model через `contextMaxMessages` в конфиге модели). Это покрывает ~90% реальных диалогов и не раздувает контекстное окно.

---

### Паттерн AI-адаптера (с поддержкой мультичатов)

```typescript
// packages/api/src/ai/base.adapter.ts
interface ChatInput {
  prompt: string;
  imageUrl?: string;
  audioUrl?: string;
  // Контекст: зависит от стратегии провайдера
  history?: Array<{ role: "user" | "assistant"; content: string }>;  // db_history
  previousResponseId?: string;   // provider_chain
  threadId?: string;             // provider_thread
}

interface ChatOutput {
  text: string;
  tokensUsed: number;
  // Возвращаем для сохранения в Dialog
  newResponseId?: string;        // provider_chain: сохранить как providerLastResponseId
  newThreadId?: string;          // provider_thread: при первом вызове
  newMessageId?: string;         // provider_thread: id сообщения от ассистента
}

interface LLMAdapter {
  chat(input: ChatInput): Promise<ChatOutput>;
  chatStream(input: ChatInput): AsyncIterable<string>; // для streaming в Telegram
  estimateCost(promptTokens: number, completionTokens: number): number;
  contextStrategy: "provider_thread" | "provider_chain" | "db_history";
  contextMaxMessages: number; // актуально только для db_history
}

// Фабрика — выбирает адаптер по model ID
class LLMAdapterFactory {
  static create(modelId: string): LLMAdapter { ... }
}
```

**Поток обработки сообщения в диалоге:**

```
Пользователь → бот → api/services/chat.service.ts
  1. Загрузить Dialog (+ contextStrategy, providerThreadId, providerLastResponseId)
  2. Если db_history: загрузить последние N сообщений из БД
  3. Вызвать LLMAdapter.chatStream(input)
  4. Стримить ответ в Telegram (edit_message по мере поступления)
  5. Сохранить сообщения в БД
  6. Обновить Dialog.providerLastResponseId / providerThreadId если нужно
  7. Списать токены
```

---

### State Machine бота (Grammy Scenes)

```
IDLE ──/start──► LANGUAGE_SELECT ──выбор──► MAIN_MENU
                                              │
                    ┌─────────────────────────┼────────────────────┐
                    ▼                         ▼                    ▼
              GPT_SECTION             DESIGN_SECTION        VIDEO_SECTION
                    │                         │                    │
              GPT_ACTIVE              DESIGN_ACTIVE         VIDEO_ACTIVE
          (диалог с LLM)           (генерация изображений) (генерация видео)
```

**Состояния:**

| State            | Описание                            |
| ---------------- | ----------------------------------- |
| `IDLE`           | Нет выбранного инструмента          |
| `MAIN_MENU`      | Главное меню                        |
| `GPT_SECTION`    | Раздел GPTs/Claude/Gemini           |
| `GPT_ACTIVE`     | Модель активирована, ведётся диалог |
| `DESIGN_SECTION` | Раздел Дизайн с ИИ                  |
| `DESIGN_ACTIVE`  | Модель дизайна активирована         |
| `AUDIO_SECTION`  | Раздел Аудио с ИИ                   |
| `AUDIO_ACTIVE`   | Аудио модель активирована           |
| `VIDEO_SECTION`  | Раздел Видео будущего               |
| `VIDEO_ACTIVE`   | Видео модель активирована           |

---

## Поэтапный план разработки

### Этап 1 — Фундамент (1–2 недели)

- [ ] Инициализация монорепо: pnpm workspaces + Turborepo
- [ ] Docker Compose: PostgreSQL, Redis, pgAdmin
- [ ] Prisma schema + начальные миграции
- [ ] Настройка TypeScript, ESLint, Prettier для всех пакетов
- [ ] CI-скелет (GitHub Actions: lint + typecheck)
- [ ] Базовая структура `packages/shared` (типы, константы, языки)

### Этап 2 — Telegram Bot: /start и меню (1–2 недели)

- [ ] Скелет Grammy-бота с вебхуком (или long polling для dev)
- [ ] Команда `/start` → inline-кнопки выбора языка (14 шт.)
- [ ] Middleware i18n (загрузка переводов по `user.language`)
- [ ] Регистрация нового пользователя в БД + начисление 5.50 токенов
- [ ] Отправка 3 приветственных сообщений (токены / видео-кружок / главное меню)
- [ ] Reply Keyboard главного меню
- [ ] Обработчик ошибок и сообщение "инструмент не выбран"
- [ ] Команды `/menu`, `/gpt`, `/design`, `/audio`, `/video`

### Этап 3 — Раздел GPTs/Claude/Gemini (1–2 недели)

**Мультичаты и контекст:**

- [ ] Grammy Scene: `GPT_SECTION` → `GPT_ACTIVE`
- [ ] Reply Keyboard раздела
- [ ] Создание нового диалога (запись в БД + инициализация контекста у провайдера)
- [ ] Список диалогов пользователя + переключение активного (`UserState.dialogId`)
- [ ] Переименование и удаление диалогов (через Mini App)

**OpenAI (стратегия `provider_chain` — Responses API):**

- [ ] Адаптер GPT-4o: `previous_response_id` для цепочки ответов без передачи истории
- [ ] Сохранение `response_id` в `Dialog.providerLastResponseId` после каждого ответа
- [ ] Streaming ответа: `edit_message` по мере поступления токенов

**OpenAI Assistants (стратегия `provider_thread`):**

- [ ] При создании диалога — создаём `Thread` → сохраняем `thread_id` в `Dialog.providerThreadId`
- [ ] Добавление сообщений через `thread.messages.create` + запуск `Run`
- [ ] Polling/streaming статуса Run → отправка результата пользователю

**Anthropic Claude / Gemini / Qwen (стратегия `db_history`):**

- [ ] Адаптер Claude: загрузка последних N сообщений из БД → передача в `messages[]`
- [ ] Адаптер Gemini: аналогично через `contents[]`
- [ ] Адаптер Qwen: аналогично
- [ ] Настройка `contextMaxMessages` per-model (по умолчанию 50)

**Общее:**

- [ ] `chat.service.ts` — единый сервис, выбирает стратегию по `Dialog.contextStrategy`
- [ ] Сохранение всех сообщений в БД (для UI и fallback)
- [ ] Списание токенов за каждый запрос
- [ ] Проверка баланса перед запросом
- [ ] GPT Editor режим (активация, инструкция пользователю)

### Этап 4 — Раздел Дизайн (1–2 недели)

- [ ] Grammy Scene: `DESIGN_SECTION` → `DESIGN_ACTIVE`
- [ ] Адаптер DALL-E 3 (OpenAI Images API)
- [ ] Адаптер Flux (через Replicate / FAL.ai)
- [ ] Адаптеры: Imagen, Stable Diffusion, IdeoGram, MidJourney
- [ ] BullMQ: очередь `image.queue` для async генерации
- [ ] Worker: обработка задачи → загрузка в S3 → отправка пользователю
- [ ] Хранилище изображений (S3-совместимое)
- [ ] Раздел "Хранилище изображений" (`IMAGE_STORAGE`)

### Этап 5 — Раздел Видео (1–2 недели)

- [ ] Grammy Scene: `VIDEO_SECTION` → `VIDEO_ACTIVE`
- [ ] Reply Keyboard с 22 инструментами (точно по ТЗ)
- [ ] BullMQ: очередь `video.queue` (долгие задачи)
- [ ] Адаптеры: Kling, Sora, RunWay, Veo, Luma, MiniMax, Pika, Hailuo, HeyGen, D-ID и др.
- [ ] Уведомление пользователя о готовности видео
- [ ] Загрузка видео через S3 + отправка в Telegram

### Этап 6 — Раздел Аудио (1 неделя)

- [ ] Grammy Scene: `AUDIO_SECTION` → `AUDIO_ACTIVE`
- [ ] Адаптер TTS (OpenAI TTS / ElevenLabs)
- [ ] Адаптер клонирования голоса (ElevenLabs)
- [ ] Адаптер генерации музыки (Suno API)
- [ ] Адаптер генерации звуков

### Этап 7 — Telegram Mini App (2–3 недели)

- [ ] Инициализация React + Vite + `@telegram-apps/sdk`
- [ ] Авторизация через `initData` (верификация на бэкенде)
- [ ] Страница "Профиль": баланс, история транзакций
- [ ] Страница "Управление" → вкладка "Модель": выбор активной модели
- [ ] Страница "Управление" → вкладка "Диалоги":
  - [ ] Список всех диалогов пользователя (по секциям)
  - [ ] Переключение активного диалога (обновляет `UserState.dialogId`)
  - [ ] Создание нового диалога
  - [ ] Переименование диалога
  - [ ] Удаление диалога (+ очистка провайдерского контекста если `provider_thread`)
- [ ] Страница "Тарифы": покупка токенов (Telegram Stars / внешний платёж)
- [ ] Реферальная программа

### Этап 8 — Системные задачи (1–2 недели)

- [ ] Rate limiting (middleware Grammy)
- [ ] Admin API (выдача токенов, блокировка пользователей)
- [ ] Мониторинг: Pino логи + Prometheus метрики
- [ ] Алерты на ошибки (Sentry или аналог)
- [ ] Настройка Nginx reverse proxy
- [ ] Docker Compose production конфиг
- [ ] Документация API (Fastify Swagger)

### Этап 9 — Тестирование и запуск

- [ ] Unit-тесты AI-адаптеров (Jest/Vitest)
- [ ] Интеграционные тесты API
- [ ] E2E тест бота (grammy-test)
- [ ] Нагрузочное тестирование очередей
- [ ] Деплой (VPS / Railway / Fly.io)
- [ ] Настройка Telegram Webhook на production URL

---

## Рекомендуемый порядок старта

1. **Этап 1** — без него ничего не работает, обязателен первым
2. **Этапы 2–3** — последовательно, основа бота
3. **Этап 7 (Mini App)** можно вести параллельно с Этапом 3 — они независимы
4. **Этапы 4–6** (Дизайн, Видео, Аудио) можно вести параллельно разными разработчиками — адаптеры изолированы
5. **Этап 8** — не откладывать на конец, логи и мониторинг нужны с раннего этапа
