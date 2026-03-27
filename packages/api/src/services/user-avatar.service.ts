import { db } from "../db.js";
import type { UserAvatar } from "@prisma/client";

export const userAvatarService = {
  async list(userId: bigint, provider?: string): Promise<UserAvatar[]> {
    return db.userAvatar.findMany({
      where: { userId, ...(provider ? { provider } : {}) },
      orderBy: { createdAt: "desc" },
    });
  },

  async findById(id: string): Promise<UserAvatar | null> {
    return db.userAvatar.findUnique({ where: { id } });
  },

  async create(userId: bigint, params: { provider: string; name: string }): Promise<UserAvatar> {
    return db.userAvatar.create({
      data: { userId, ...params, status: "creating" },
    });
  },

  async updateStatus(
    id: string,
    params: { status: string; externalId?: string; previewUrl?: string },
  ): Promise<UserAvatar> {
    return db.userAvatar.update({ where: { id }, data: params });
  },

  async rename(id: string, userId: bigint, name: string): Promise<UserAvatar | null> {
    const avatar = await db.userAvatar.findFirst({ where: { id, userId } });
    if (!avatar) return null;
    return db.userAvatar.update({ where: { id }, data: { name } });
  },

  async delete(id: string, userId: bigint): Promise<boolean> {
    const avatar = await db.userAvatar.findFirst({ where: { id, userId } });
    if (!avatar) return false;
    await db.userAvatar.delete({ where: { id } });
    return true;
  },
};
