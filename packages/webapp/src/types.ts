export interface UserProfile {
  id: string;
  username: string | null;
  firstName: string | null;
  language: string;
  tokenBalance: string;
  referralCount: number;
  createdAt: string;
  transactions: Transaction[];
}

export interface Transaction {
  id: string;
  amount: string;
  type: "credit" | "debit";
  reason: string;
  modelId: string | null;
  createdAt: string;
}

export interface Dialog {
  id: string;
  section: string;
  modelId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Model {
  id: string;
  name: string;
  section: string;
  provider: string;
  costPerRequest: number;
  supportsImages: boolean;
  supportsVoice: boolean;
  isAsync: boolean;
}

export interface UserState {
  state: string;
  section: string | null;
  modelId: string | null;
  dialogId: string | null;
}

export type Page = "profile" | "management" | "tariffs" | "referral";
