import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { config } from "@metabox/shared";

const pool = new pg.Pool({ connectionString: config.db.url });
const adapter = new PrismaPg(pool);

export const db = new PrismaClient({ adapter });

/** Closes Prisma + the underlying pg pool for graceful shutdown. */
export async function closeDb(): Promise<void> {
  await db.$disconnect().catch(() => void 0);
  await pool.end().catch(() => void 0);
}
