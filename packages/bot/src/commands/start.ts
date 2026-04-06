import { InlineKeyboard } from "grammy";
import type { BotContext } from "../types/context.js";
import { userService } from "../services/user.service.js";
import { userStateService } from "@metabox/api/services";
import { db } from "@metabox/api/db";
import { buildLanguageKeyboard } from "../keyboards/language.keyboard.js";
import { buildMainMenuKeyboard } from "../keyboards/main-menu.keyboard.js";
import { SUPPORTED_LANGUAGES, getT, config } from "@metabox/shared";
import type { Language, Translations } from "@metabox/shared";
import {
  verifyLinkToken,
  getSubscriptionStatus,
  grantMetaboxSubscription,
  markTokensGrantedOnMetabox,
  getPendingTokenGrants,
  markOrderGrantedOnMetabox,
} from "@metabox/api/services";
import { logger } from "../logger.js";

/**
 * Sync all pending grants from Metabox for a newly linked/started user:
 *  1. Active subscription not yet credited to the bot
 *  2. Token-pack orders not yet credited to the bot
 */
async function syncMetaboxGrants(userId: bigint): Promise<void> {
  // 1. Subscription sync
  const { subscription } = await getSubscriptionStatus(userId);
  if (
    subscription &&
    !subscription.tokensGrantedToBot &&
    new Date(subscription.endDate) > new Date()
  ) {
    const granted = await grantMetaboxSubscription({
      userId,
      tokens: subscription.tokensGranted,
      endDate: new Date(subscription.endDate),
      planName: subscription.planName,
      metaboxSubscriptionId: subscription.subscriptionId,
    });
    if (granted) {
      await markTokensGrantedOnMetabox(subscription.subscriptionId);
    }
  }

  // 2. Token-pack orders sync
  const pendingOrders = await getPendingTokenGrants(userId);
  for (const order of pendingOrders) {
    try {
      await db.user.update({
        where: { id: userId },
        data: { tokenBalance: { increment: order.tokens } },
      });
      await db.tokenTransaction.create({
        data: {
          userId,
          amount: order.tokens,
          type: "credit",
          reason: "metabox_purchase",
          description: order.description,
        },
      });
      await markOrderGrantedOnMetabox(order.orderId);
    } catch (err) {
      logger.error({ err, orderId: order.orderId }, "[syncMetaboxGrants] token order grant failed");
    }
  }
}

/**
 * /start — handles deep link params, resets FSM state, shows language selection.
 *
 * Supported deep link params:
 *   /start link_<TOKEN>  — Metabox→Bot account linking (TelegramAuthToken)
 *   /start ref_<TG_ID>   — referral link from another bot user
 */
export async function handleStart(ctx: BotContext): Promise<void> {
  const param = ctx.match as string | undefined;

  // ── Metabox→Bot account linking ────────────────────────────────────────────
  if (param?.startsWith("link_") && ctx.user) {
    const token = param.slice("link_".length);
    try {
      const botPurchase = await db.tokenTransaction.findFirst({
        where: { userId: ctx.user.id, type: "credit", reason: "purchase" },
        select: { id: true },
      });
      const { metaboxUserId, referralCode, mergedFrom } = await verifyLinkToken(
        token,
        ctx.user.id,
        {
          telegramUsername: ctx.from?.username,
          firstName: ctx.from?.first_name,
          lastName: ctx.from?.last_name,
          referrerTelegramId: ctx.user.referredById,
          botHasPurchase: !!botPurchase,
          botCreatedAt: ctx.user.createdAt,
        },
      );
      await db.user.update({
        where: { id: ctx.user.id },
        data: { metaboxUserId, metaboxReferralCode: referralCode },
      });
      await ctx.reply(ctx.t.start.metaboxLinked ?? "✅ Аккаунт Metabox успешно привязан!");
      if (mergedFrom) {
        await ctx.reply(
          ctx.t.start.accountsMerged ??
            "✅ Аккаунты объединены! Ваши токены и подписка перенесены на аккаунт meta-box.ru.",
        );
      }

      // Sync subscription and pending token grants from Metabox after linking
      void syncMetaboxGrants(ctx.user.id).catch((err) => {
        logger.error({ err }, "[start link] grant sync failed");
      });
    } catch (err) {
      const apiErr = err as { code?: string; data?: Record<string, unknown> };

      // ── Mentor conflict — ask user to choose ──
      if (apiErr.code === "MENTOR_CONFLICT" && apiErr.data) {
        const d = apiErr.data as {
          token: string;
          siteMentor: { name: string; contact: string };
          botMentor: { name: string; contact: string };
        };
        const siteName = d.siteMentor?.contact
          ? `${d.siteMentor.name} (${d.siteMentor.contact})`
          : d.siteMentor?.name || "Неизвестен";
        const botName = d.botMentor?.contact
          ? `${d.botMentor.name} (${d.botMentor.contact})`
          : d.botMentor?.name || "Неизвестен";

        await ctx.reply(
          `⚠️ *Обнаружен конфликт наставников*\n\n` +
            `На вашем аккаунте Metabox наставник:\n*${siteName}*\n\n` +
            `В AI Box боте ваш наставник:\n*${botName}*\n\n` +
            `При объединении аккаунтов необходимо выбрать одного наставника.`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: `Оставить ${d.siteMentor?.name || "Наставника с сайта"}`,
                    callback_data: `merge:site:${d.token}`,
                  },
                ],
                [
                  {
                    text: `Оставить ${d.botMentor?.name || "Наставника из бота"}`,
                    callback_data: `merge:bot:${d.token}`,
                  },
                ],
                [{ text: "❌ Отмена", callback_data: "merge:cancel" }],
              ],
            },
          },
        );
        return;
      }

      // ── MERGE_BLOCKED (row 13): both mentors + both have purchases ──
      if (apiErr.code === "MERGE_BLOCKED" && apiErr.data) {
        const d = apiErr.data as {
          siteMentor: { name: string; contact: string };
          botMentor: { name: string; contact: string };
        };
        const siteName = d.siteMentor?.contact
          ? `${d.siteMentor.name} (${d.siteMentor.contact})`
          : d.siteMentor?.name || "Неизвестен";
        const botName = d.botMentor?.contact
          ? `${d.botMentor.name} (${d.botMentor.contact})`
          : d.botMentor?.name || "Неизвестен";

        await ctx.reply(
          `⛔ *Невозможно объединить аккаунты*\n\n` +
            `У вас разные наставники и на обоих аккаунтах есть покупки.\n\n` +
            `Наставник на сайте: *${siteName}*\n` +
            `Наставник в боте: *${botName}*\n\n` +
            `Если у вас есть вопросы — обратитесь в поддержку: @${config.supportTg}`,
          { parse_mode: "Markdown" },
        );
        return;
      }

      let msg = "❌ Не удалось привязать аккаунт. Попробуйте ещё раз.";
      if (apiErr.code === "TELEGRAM_MISMATCH") {
        const linkedTg = apiErr.data?.linkedUsername ? ` (@${apiErr.data.linkedUsername})` : "";
        msg = `⚠️ Невозможно привязать AI Box.\n\nВаш аккаунт на сайте уже привязан к другому Telegram${linkedTg}.\n\nИспользуйте тот же Telegram-аккаунт для привязки.\n\nЕсли это ошибка — напишите в поддержку: @${config.supportTg}`;
      } else if (apiErr.code === "TELEGRAM_ALREADY_LINKED") {
        const email = apiErr.data?.linkedEmail ? String(apiErr.data.linkedEmail) : "";
        msg = `⚠️ Этот Telegram уже привязан к другому аккаунту на Metabox${email ? ` (${email})` : ""}.\n\nЕсли это ошибка — напишите в поддержку: @${config.supportTg}`;
      }
      await ctx.reply(msg);
    }
    return;
  }

  // ── Referral deep link ─────────────────────────────────────────────────────
  if (param?.startsWith("ref_") && ctx.user && ctx.user.referredById) {
    // User already has a referrer — notify with mentor name
    let mentorName = "";
    try {
      const mentor = await db.user.findUnique({
        where: { id: ctx.user.referredById },
        select: { firstName: true, lastName: true, username: true },
      });
      if (mentor) {
        const name = mentor.firstName
          ? `${mentor.firstName}${mentor.lastName ? ` ${mentor.lastName}` : ""}`
          : mentor.username || "";
        const contact = mentor.username ? ` (@${mentor.username})` : "";
        mentorName = name ? `: ${name}${contact}` : "";
      }
    } catch {
      /* ignore */
    }
    await ctx
      .reply(`ℹ️ У вас уже есть наставник${mentorName}. Реферальная ссылка не была применена.`)
      .catch(() => {});
  }
  // Store resolved referrer info for registerBotUser
  let resolvedReferrerUserId: string | null = null;

  if (param?.startsWith("ref_") && ctx.user && !ctx.user.referredById) {
    const refParam = param.slice("ref_".length);

    // Try as referralCode first (new format: ref_HU6PQYST)
    // Then fall back to telegramId (legacy format: ref_6186315229)
    let referrerId: bigint | null = null;

    if (/^\d+$/.test(refParam)) {
      // Legacy: numeric telegramId
      const legacyId = BigInt(refParam);
      if (legacyId !== ctx.user.id) {
        const exists = await db.user.findUnique({
          where: { id: legacyId },
          select: { id: true },
        });
        if (exists) referrerId = legacyId;
      }
    }

    if (!referrerId) {
      // New: referralCode → resolve via Metabox API
      try {
        const { resolveReferralCode } = await import("@metabox/api/services");
        const resolved = await resolveReferralCode(refParam);
        if (resolved?.telegramId) {
          const resolvedId = BigInt(resolved.telegramId);
          if (resolvedId !== ctx.user.id) {
            const exists = await db.user.findUnique({
              where: { id: resolvedId },
              select: { id: true },
            });
            if (exists) {
              referrerId = resolvedId;
            }
          }
        }
        // Save userId even if telegramId is null (referrer has no bot)
        if (!referrerId && resolved?.userId) {
          resolvedReferrerUserId = resolved.userId;
        }
      } catch {
        // Metabox API unavailable — skip referral
      }
    }

    if (referrerId) {
      await db.user.update({
        where: { id: ctx.user.id },
        data: { referredById: referrerId },
      });
    }
  }

  if (ctx.user) {
    await userStateService.setState(ctx.user.id, "IDLE");

    // Register stub account on Metabox (or link existing)
    if (config.metabox?.apiUrl) {
      (async () => {
        try {
          // Re-read user from DB to get updated referredById (set in ref_ handler above)
          const freshUser = await db.user.findUnique({
            where: { id: ctx.user!.id },
            select: { referredById: true, firstName: true, lastName: true, username: true },
          });
          const { registerBotUser } = await import("@metabox/api/services");
          const result = await registerBotUser({
            telegramId: ctx.user!.id,
            firstName: freshUser?.firstName ?? ctx.user!.firstName,
            lastName: freshUser?.lastName ?? ctx.user!.lastName,
            username: freshUser?.username ?? ctx.user!.username,
            referrerTelegramId: freshUser?.referredById ?? ctx.user!.referredById,
            referrerUserId: resolvedReferrerUserId ?? undefined,
          });
          if (result?.ok) {
            if (!result.isStub) {
              // Real account found — auto-link
              await db.user.update({
                where: { id: ctx.user!.id },
                data: {
                  metaboxUserId: result.userId,
                  metaboxReferralCode: result.referralCode,
                },
              });
              // Notify user about auto-linking
              const mentorInfo = result.mentor
                ? `\nВаш наставник: ${result.mentor.name}${result.mentor.telegramUsername ? ` (@${result.mentor.telegramUsername})` : ""}`
                : "";
              await ctx
                .reply(`✅ Мы нашли ваш аккаунт на Metabox и привязали его к боту.${mentorInfo}`)
                .catch(() => {});

              // Sync subscription + pending token grants from Metabox
              void syncMetaboxGrants(ctx.user!.id).catch((err) => {
                logger.error({ err }, "[start registerBotUser] grant sync failed");
              });
            } else {
              // Stub account — store referralCode but NOT metaboxUserId
              await db.user.update({
                where: { id: ctx.user!.id },
                data: { metaboxReferralCode: result.referralCode },
              });
            }
          }
        } catch (registerErr) {
          logger.error({ err: registerErr }, "[start] registerBotUser failed");
        }
      })();
    }
  }
  await ctx.reply(ctx.t.start.welcome, {
    reply_markup: buildLanguageKeyboard(),
    parse_mode: "HTML",
  });
}

/**
 * Callback handler for language selection buttons (data: lang_<code>).
 * Sets language, credits welcome bonus for new users, sends welcome messages.
 */
export async function handleLanguageSelect(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  const lang = data.replace("lang_", "") as Language;

  if (!SUPPORTED_LANGUAGES.includes(lang) || !ctx.user) {
    await ctx.answerCallbackQuery();
    return;
  }

  await ctx.answerCallbackQuery();

  const isNew = ctx.user.isNew;
  const updatedUser = await userService.setLanguage(ctx.user.id, lang);
  const t = getT(lang);

  if (isNew) {
    await userService.creditWelcomeBonus(ctx.user.id);
  }

  // Inline button to open Profile in mini app
  const webappUrl = config.bot.webappUrl;
  const profileKb = webappUrl
    ? new InlineKeyboard().webApp(t.menu.profile, `${webappUrl}?page=profile`)
    : undefined;

  // New users: show tokens credited; returning users: show current balance
  if (isNew) {
    await ctx.reply(t.start.tokensGranted, profileKb ? { reply_markup: profileKb } : undefined);
  } else {
    const balance = (updatedUser.tokenBalance as number).toFixed(2);
    const balanceText = t.start.yourBalance.replace("{balance}", balance);
    await ctx.reply(balanceText, profileKb ? { reply_markup: profileKb } : undefined);
  }

  // Main menu with reply keyboard
  await ctx.reply(t.start.mainMenuTitle, {
    reply_markup: buildMainMenuKeyboard(t, ctx.user?.id),
  });

  // Set per-chat bot commands in user's language
  if (ctx.chat?.id) {
    await ctx.api
      .setMyCommands(buildCommands(t), { scope: { type: "chat", chat_id: ctx.chat.id } })
      .catch(() => void 0);
  }

  ctx.user = { ...updatedUser, isNew: false };
}

function buildCommands(t: Translations) {
  return [
    { command: "start", description: t.start.restart },
    { command: "menu", description: t.start.mainMenuTitle.split("\n")[0] },
    // { command: "profile", description: t.menu.profile },
    { command: "gpt", description: t.menu.gpt },
    { command: "design", description: t.menu.design },
    { command: "audio", description: t.menu.audio },
    { command: "video", description: t.menu.video },
  ];
}
