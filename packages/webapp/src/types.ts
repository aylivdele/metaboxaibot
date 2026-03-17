export interface UserProfile {
  id: string;
  username: string | null;
  firstName: string | null;
  language: string;
  role: "USER" | "MODERATOR" | "ADMIN";
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
  costUsdPerRequest: number;
  supportsImages: boolean;
  supportsVoice: boolean;
  isAsync: boolean;
}

export interface UserState {
  state: string;
  section: string | null;
  modelId: string | null;
  gptDialogId: string | null;
  designDialogId: string | null;
  audioDialogId: string | null;
  videoDialogId: string | null;
}

export interface AdminUser {
  id: string;
  username: string | null;
  firstName: string | null;
  tokenBalance: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  isBlocked: boolean;
  createdAt: string;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface BannerSlide {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  displaySeconds: number;
  sortOrder: number;
  active: boolean;
}

export type Page = "profile" | "management" | "tariffs" | "referral" | "admin";
