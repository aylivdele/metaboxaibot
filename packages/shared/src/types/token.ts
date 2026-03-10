export type TransactionType = "credit" | "debit";
export type TransactionReason =
  | "welcome_bonus"
  | "ai_usage"
  | "purchase"
  | "referral_bonus"
  | "admin";

export interface TokenTransactionDto {
  id: string;
  userId: bigint;
  amount: number;
  type: TransactionType;
  reason: TransactionReason;
  modelId?: string;
  dialogId?: string;
  createdAt: Date;
}
