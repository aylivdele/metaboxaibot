import { db } from "../db.js";
import { WELCOME_BONUS_TOKENS } from "@metabox/shared";
import type { UserDto, Language } from "@metabox/shared";
import type { User } from "@prisma/client";

function mapUser(user: User): UserDto {
  return {
    id: user.id,
    username: user.username ?? undefined,
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    language: user.language as Language,
    tokenBalance: Number(user.tokenBalance),
    isNew: user.isNew,
    isBlocked: user.isBlocked,
    createdAt: user.createdAt,
    referredById: user.referredById ?? null,
    metaboxUserId: user.metaboxUserId ?? null,
  };
}

export const userService = {
  async upsert(params: {
    id: bigint;
    username?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<UserDto> {
    const { id, username, firstName, lastName } = params;
    const user = await db.user.upsert({
      where: { id },
      create: { id, username, firstName, lastName },
      update: { username, firstName, lastName },
    });
    return mapUser(user);
  },

  async setLanguage(userId: bigint, language: Language): Promise<UserDto> {
    const user = await db.user.update({
      where: { id: userId },
      data: { language },
    });
    return mapUser(user);
  },

  async creditWelcomeBonus(userId: bigint): Promise<void> {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 3);

    await db.$transaction([
      db.user.update({
        where: { id: userId },
        data: {
          isNew: false,
          subscriptionTokenBalance: { increment: WELCOME_BONUS_TOKENS },
        },
      }),
      db.tokenTransaction.create({
        data: {
          userId,
          amount: WELCOME_BONUS_TOKENS,
          type: "credit",
          reason: "welcome_bonus",
        },
      }),
    ]);

    // Create Trial subscription in LocalSubscription (source of truth)
    await db.localSubscription.upsert({
      where: { userId },
      create: {
        userId,
        planName: "Trial",
        period: "M1",
        tokensGranted: WELCOME_BONUS_TOKENS,
        startDate: new Date(),
        endDate: trialEndDate,
        isActive: true,
      },
      update: {
        planName: "Trial",
        tokensGranted: WELCOME_BONUS_TOKENS,
        endDate: trialEndDate,
        isActive: true,
      },
    });
  },
};
