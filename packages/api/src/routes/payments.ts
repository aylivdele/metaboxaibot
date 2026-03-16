import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { telegramAuthHook } from "../middlewares/telegram-auth.js";
import { paymentService } from "../services/payment.service.js";

type AuthRequest = FastifyRequest & { userId: bigint };

export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", telegramAuthHook);

  /** POST /payments/invoice — create Telegram Stars invoice link for a plan */
  fastify.post<{ Body: { planId: string } }>("/payments/invoice", async (request, reply) => {
    const { planId } = request.body;
    if (!planId) return reply.code(400).send({ error: "planId is required" });

    // userId is verified by telegramAuthHook but not needed for invoice creation
    void (request as AuthRequest).userId;

    const invoiceUrl = await paymentService.createInvoiceLink(planId);
    return { invoiceUrl };
  });
};
