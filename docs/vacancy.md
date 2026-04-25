# Fullstack TypeScript-разработчик — MetaBox AI Bot

**Опыт:** от 1 года коммерческой разработки
**Формат:** удалённо
**Занятость:** полная

---

## О проекте

MetaBox — AI-платформа с Telegram-ботом для генерации изображений, видео, аудио и работы с LLM. Проект состоит из двух монорепозиториев: Telegram-бот (микросервисная архитектура) и веб-платформа (сайт + админка). Интегрируемся с OpenAI, Anthropic Claude, Google GenAI, Fal.ai, Replicate, HeyGen, Runway, Luma, MiniMax и другими AI-провайдерами.

---

## Стек технологий

### Backend

- TypeScript, Node.js 20+
- Fastify (REST API)
- grammY (Telegram Bot API)
- Prisma ORM + PostgreSQL 16
- BullMQ + Redis 7 (очереди задач)
- S3-совместимое хранилище (AWS SDK)
- FFmpeg (обработка медиа)
- Pino (логирование), Sentry (мониторинг ошибок)
- prom-client (метрики Prometheus)

### Frontend

- React 18/19, Next.js 14 (App Router)
- Vite (Telegram Mini App)
- Tailwind CSS
- NextAuth (аутентификация)
- Telegram Mini Apps SDK

### Инфраструктура

- Docker, Docker Compose
- Turborepo, pnpm (монорепозиторий)
- GitHub Actions (CI/CD)
- Nginx, Grafana, Promtail, cAdvisor (мониторинг)

---

## Чем предстоит заниматься

- Разрабатывать и поддерживать backend-сервисы бота (API, воркеры, очереди)
- Интегрировать новые AI-модели и провайдеры (генерация изображений, видео, аудио, аватаров)
- Развивать веб-платформу (Next.js): личный кабинет, админ-панель, платёжные интеграции
- Проектировать схему БД (Prisma-миграции), оптимизировать запросы
- Работать с очередями задач (BullMQ) для асинхронной обработки генераций
- Участвовать в код-ревью, улучшать архитектуру и CI/CD

---

## Что ожидаем

### Обязательно

- Уверенный TypeScript (от 1 года в продакшене)
- Опыт с Node.js и хотя бы одним HTTP-фреймворком (Fastify / Express / Koa)
- Опыт работы с PostgreSQL и любой ORM (Prisma — плюс)
- Понимание REST API, работа с внешними API (HTTP-клиенты, вебхуки)
- Базовое знание React и Next.js
- Git, Docker на уровне уверенного пользователя
- Умение читать документацию на английском

### Будет плюсом

- Опыт разработки Telegram-ботов (grammY / Telegraf)
- Работа с очередями сообщений (BullMQ / RabbitMQ / Kafka)
- Опыт интеграции с AI API (OpenAI, Anthropic и т.д.)
- Знакомство с Turborepo / pnpm workspaces
- Опыт с S3 / MinIO
- Понимание FFmpeg и обработки медиафайлов
- Опыт настройки CI/CD (GitHub Actions)
- Знакомство с мониторингом (Prometheus, Grafana)

---

## Условия

- Полностью удалённая работа
- Современный стек без легаси
- Влияние на архитектурные решения
- Работа с передовыми AI-технологиями
