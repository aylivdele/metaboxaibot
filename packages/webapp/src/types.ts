export interface UserProfile {
  id: string;
  username: string | null;
  firstName: string | null;
  language: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  tokenBalance: string;
  referralCount: number;
  createdAt: string;
  metaboxUserId: string | null;
  metaboxReferralCode: string | null;
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

export interface ModelSettingOption {
  value: string | number | boolean;
  label: string;
}

export interface ModelSettingDef {
  key: string;
  label: string;
  description?: string;
  type:
    | "select"
    | "slider"
    | "toggle"
    | "text"
    | "number"
    | "voice-picker"
    | "did-voice-picker"
    | "color"
    | "avatar-picker";
  options?: ModelSettingOption[];
  min?: number;
  max?: number;
  step?: number;
  default: string | number | boolean | null;
}

export interface HeyGenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio: string | null;
}

export interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url: string | null;
}

export interface DIDVoice {
  id: string;
  name: string;
  gender: string;
  language: string;
  provider: string;
  styles: string[];
  description: string;
}

export interface UserUpload {
  id: string;
  type: string;
  name: string;
  url: string;
  s3Key: string | null;
  createdAt: string;
}

export interface Model {
  id: string;
  name: string;
  description: string;
  section: string;
  provider: string;
  /** Family this model belongs to, null for standalone models. */
  familyId: string | null;
  /** Version label within the family, e.g. "v3", "v4". */
  versionLabel: string | null;
  /** Variant label within the family, e.g. "Standard", "Pro", "Vector". */
  variantLabel: string | null;
  /** Per-variant description override shown instead of family description. */
  descriptionOverride: string | null;
  supportsImages: boolean;
  supportsVoice: boolean;
  supportsWeb: boolean;
  isAsync: boolean;
  isLLM: boolean;
  /** Fixed cost in internal tokens per request (0 for LLM and per-MP models) */
  tokenCostPerRequest: number;
  /** Estimated cost in internal tokens per typical message (LLM only, 0 for fixed-cost models) */
  tokenCostApproxMsg: number;
  /** Cost per megapixel in internal tokens (>0 only for per-megapixel billing models, e.g. FLUX) */
  tokenCostPerMPixel: number;
  /**
   * Cost per 1M video tokens in internal tokens (>0 only for per-video-token models, e.g. Seedance).
   * videoTokens = (width × height × fps × duration) / 1024
   */
  tokenCostPerMVideoToken: number;
  /** FPS used in video token calculation (0 if not applicable). */
  videoFps: number;
  /** Cost per second in internal tokens (>0 only for per-second billing models, e.g. Kling, Pika). */
  tokenCostPerSecond: number;
  supportedAspectRatios?: string[] | null;
  supportedDurations?: number[] | null;
  durationRange?: { min: number; max: number } | null;
  /** Configurable generation parameters. Empty array if none. */
  settings: ModelSettingDef[];
}

export interface UserState {
  state: string;
  section: string | null;
  gptModelId: string | null;
  gptDialogId: string | null;
  designDialogId: string | null;
  audioDialogId: string | null;
  videoDialogId: string | null;
  designModelId: string | null;
  audioModelId: string | null;
  videoModelId: string | null;
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

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
}

export interface GalleryItem {
  id: string;
  section: string;
  modelId: string;
  prompt: string;
  s3Key: string | null;
  outputUrl: string | null;
  completedAt: string | null;
}

export interface GalleryResponse {
  items: GalleryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface CatalogPeriod {
  priceRub: string;
  stars: number;
}

export interface CatalogSubscription {
  id: string;
  name: string;
  tokens: number;
  /** Only available periods are included (M1 always present; M3/M6/M12 only if discount > 0). */
  periods: Partial<Record<"M1" | "M3" | "M6" | "M12", CatalogPeriod>>;
}

export interface CatalogTokenPackage {
  id: string;
  name: string;
  tokens: number;
  priceRub: string;
  stars: number;
  badge: string | null;
}

export interface CatalogResponse {
  subscriptions: CatalogSubscription[];
  tokenPackages: CatalogTokenPackage[];
  canPayByCard: boolean;
  usdtRubRate: number;
}

export type Page = "profile" | "management" | "tariffs" | "referral" | "admin" | "linkMetabox";
