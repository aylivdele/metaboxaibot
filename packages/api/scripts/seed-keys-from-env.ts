/**
 * Migration helper: для каждого непустого env-ключа создать запись в ProviderKey
 * с приоритетом 0 и label "env:<PROVIDER>". Идемпотентен — пропускает если запись
 * с таким label уже существует.
 *
 * Запуск: pnpm -F @metabox/api exec tsx scripts/seed-keys-from-env.ts
 *
 * После сидинга админ через /admin/keys повышает priority новых ключей или
 * удаляет env-ключи и убирает переменные из окружения.
 */
import "dotenv/config";
import { db } from "../src/db.js";
import { config, encryptSecret, maskKey } from "@metabox/shared";

interface Seed {
  provider: string;
  apiKey: string | undefined;
}

const seeds: Seed[] = [
  { provider: "openai", apiKey: config.ai.openai },
  { provider: "anthropic", apiKey: config.ai.anthropic },
  { provider: "google", apiKey: config.ai.google },
  { provider: "alibaba", apiKey: config.ai.alibaba },
  { provider: "grok", apiKey: config.ai.grok },
  { provider: "deepseek", apiKey: config.ai.deepseek },
  { provider: "perplexity", apiKey: config.ai.perplexity },
  { provider: "fal", apiKey: config.ai.fal },
  { provider: "replicate", apiKey: config.ai.replicate },
  { provider: "runway", apiKey: config.ai.runway },
  { provider: "luma", apiKey: config.ai.luma },
  { provider: "elevenlabs", apiKey: config.ai.elevenlabs },
  { provider: "heygen", apiKey: config.ai.heygen },
  { provider: "did", apiKey: config.ai.did },
  { provider: "higgsfield", apiKey: config.ai.higgsfieldApiKey },
  // higgsfield_soul требует пару key:secret в одной строке (см. envKeyForProvider).
  // Пропускаем если хотя бы одна переменная не задана.
  {
    provider: "higgsfield_soul",
    apiKey:
      config.ai.higgsfieldApiKey && config.ai.higgsfieldApiSecret
        ? `${config.ai.higgsfieldApiKey}:${config.ai.higgsfieldApiSecret}`
        : undefined,
  },
  { provider: "apipass", apiKey: config.ai.apipass },
  { provider: "recraft", apiKey: config.ai.recraft },
  { provider: "minimax", apiKey: config.ai.minimax },
  { provider: "kie", apiKey: config.ai.kie },
  { provider: "evolink", apiKey: config.ai.evolink },
];

async function main(): Promise<void> {
  let created = 0;
  let skipped = 0;
  let absent = 0;

  for (const { provider, apiKey } of seeds) {
    if (!apiKey) {
      absent++;
      continue;
    }
    const label = `env:${provider.toUpperCase()}`;
    const existing = await db.providerKey.findFirst({
      where: { provider, label },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      console.log(`[skip] ${provider} (${label}) already exists: ${existing.id}`);
      continue;
    }
    const row = await db.providerKey.create({
      data: {
        provider,
        label,
        keyCipher: encryptSecret(apiKey),
        keyMask: maskKey(apiKey),
        priority: 0,
        isActive: true,
        notes: "Seeded from env. Lower priority than admin-managed keys.",
      },
    });
    created++;
    console.log(`[create] ${provider} (${label}) → ${row.id}`);
  }

  console.log(
    `\nDone. created=${created}, skipped=${skipped}, env-absent=${absent}, total-attempted=${seeds.length}`,
  );
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("seed-keys-from-env failed:", err);
  await db.$disconnect();
  process.exit(1);
});
