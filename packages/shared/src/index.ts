// Types
export type { Language, BotState, Section, UserDto, UserStateDto } from "./types/user.js";
export type {
  MessageRole,
  MediaType,
  JobStatus,
  ContextStrategy,
  DialogDto,
  MessageDto,
  GenerationJobDto,
} from "./types/dialog.js";
export type { TransactionType, TransactionReason, TokenTransactionDto } from "./types/token.js";
export type {
  AIModel,
  ModelFamily,
  ModelFamilyMember,
  ModelSettingDef,
  ModelSettingOption,
  ModelSettingType,
  ChatInput,
  ChatOutput,
  GenerationInput,
  GenerationOutput,
} from "./types/ai.js";

// Constants
export { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, RTL_LANGUAGES } from "./constants/languages.js";
export { AI_MODELS, MODELS_BY_SECTION } from "./constants/models.js";
export {
  MODEL_FAMILIES,
  FAMILIES_BY_SECTION,
  MODEL_TO_FAMILY,
} from "./constants/model-families.js";
export { BOT_STATES, SECTION_BY_STATE, WELCOME_BONUS_TOKENS } from "./constants/states.js";
export { PLANS } from "./constants/plans.js";
export type { Plan } from "./constants/plans.js";

// Errors
export { UserFacingError, resolveUserFacingError } from "./errors.js";

// Web token (URL-based auth for KeyboardButtonWebApp where initData is unavailable)
export { generateWebToken, verifyWebToken } from "./webtoken.js";

// Config
export { config } from "./config.js";
export type { Config } from "./config.js";

// i18n
export { getT, preloadLocales, buildDialogHint } from "./i18n/index.js";
export type { Translations } from "./i18n/index.js";
export {
  MODEL_TRANSLATIONS,
  SETTING_TRANSLATIONS,
  resolveModelDisplay,
} from "@metabox/shared-browser";
export type { ModelTranslation, SettingTranslation } from "@metabox/shared-browser";
