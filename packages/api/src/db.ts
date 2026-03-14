import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { config } from "@metabox/shared";

const pool = new pg.Pool({ connectionString: config.db.url });
const adapter = new PrismaPg(pool);

export const db = new PrismaClient({ adapter });
