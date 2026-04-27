/**
 * Vitest setup — устанавливает test-stub env-переменные ДО импорта модулей.
 * Worker импортирует @metabox/api/services/key-pool который тянет config из shared,
 * а тот бросает на import-time для отсутствующих req()-переменных.
 */
process.env.BOT_TOKEN = process.env.BOT_TOKEN ?? "test:bot-token";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://test/test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.KEY_VAULT_MASTER =
  process.env.KEY_VAULT_MASTER ?? "test-vault-master-key-32-bytes-base64===========";
