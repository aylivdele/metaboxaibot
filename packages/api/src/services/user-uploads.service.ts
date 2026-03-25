import { db } from "../db.js";
import type { UserUpload } from "@prisma/client";

export const userUploadsService = {
  async create(
    userId: bigint,
    params: { type: string; name: string; url: string; s3Key?: string },
  ): Promise<UserUpload> {
    return db.userUpload.create({
      data: { userId, ...params },
    });
  },

  async list(userId: bigint): Promise<UserUpload[]> {
    return db.userUpload.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async rename(id: string, userId: bigint, name: string): Promise<UserUpload | null> {
    const upload = await db.userUpload.findFirst({ where: { id, userId } });
    if (!upload) return null;
    return db.userUpload.update({ where: { id }, data: { name } });
  },

  async delete(id: string, userId: bigint): Promise<boolean> {
    const upload = await db.userUpload.findFirst({ where: { id, userId } });
    if (!upload) return false;
    await db.userUpload.delete({ where: { id } });
    return true;
  },
};
