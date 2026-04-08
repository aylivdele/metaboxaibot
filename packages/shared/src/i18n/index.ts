import type { Language } from "../types/user.js";

export interface Translations {
  start: {
    welcome: string;
    tokensGranted: string;
    yourBalance: string;
    restart: string;
    videoIntro: string;
    mainMenuTitle: string;
    community: string;
    support: string;
    howToVideo_vk: string;
    howToVideo_yt: string;
    knowledgeBase: string;
    channel: string;
    metaboxLinked: string;
    metaboxLinkFailed: string;
    accountsMerged: string;
  };
  menu: {
    profile: string;
    gpt: string;
    design: string;
    audio: string;
    video: string;
    storage: string;
    help: string;
    knowledgeBase: string;
  };
  gpt: {
    sectionTitle: string;
    activateEditor: string;
    management: string;
    newDialog: string;
    prompts: string;
    gptEditorActivated: string;
    newDialogCreated: string;
    photoDefaultPrompt: string;
    backToMain: string;
    dialogSelected: string;
  };
  design: {
    sectionTitle: string;
    sectionTooltip: string;
    management: string;
    newDialog: string;
    backToMain: string;
    modelActivated: string;
    generating: string;
    asyncPending: string;
    generationFailed: string;
    photoSaved: string;
    photoAsReference: string;
    withReference: string;
    refSelected: string;
    refine: string;
    chooseModel: string;
  };
  audio: {
    sectionTitle: string;
    management: string;
    tts: string;
    ttsEl: string;
    ttsOpenai: string;
    voiceClone: string;
    music: string;
    musicEl: string;
    musicSuno: string;
    sounds: string;
    backToMain: string;
    ttsActivated: string;
    ttsElActivated: string;
    voiceCloneActivated: string;
    voiceCloneNeedsAudio: string;
    voiceCloneProcessing: string;
    voiceCloneSuccess: string;
    voiceCloneFailed: string;
    musicActivated: string;
    musicElActivated: string;
    soundsActivated: string;
    activated: string;
    processing: string;
    asyncPending: string;
    generationFailed: string;
  };
  video: {
    sectionTitle: string;
    sectionTooltip: string;
    avatars: string;
    lipSync: string;
    newDialog: string;
    backToMain: string;
    modelActivated: string;
    queuing: string;
    asyncPending: string;
    generationFailed: string;
    management: string;
    avatarActivated: string;
    lipSyncActivated: string;
    videoPhotoSaved: string;
    videoDriverSaved: string;
    videoVoiceSaved: string;
    videoVoiceQueuing: string;
    elVoiceGenerating: string;
    elVoiceTtsExtraCharge: string;
    avatarPhotoSaved: string;
    myVoiceDefaultName: string;
    myAvatarDefaultName: string;
    hintHeygen: string;
    hintDid: string;
    hintHiggsfield: string;
    higgsfieldRequiresImage: string;
    runwayRequiresImage: string;
    imageIgnoredUnsupported: string;
    hintVideoDefault: string;
    avatarCreationCancelled: string;
    avatarCreationStarted: string;
    avatarReady: string;
  };
  errors: {
    noTool: string;
    noToolGpt: string;
    noToolDesign: string;
    noToolAudio: string;
    noToolVideo: string;
    unexpected: string;
    insufficientTokens: string;
    noSubscription: string;
    noSubscriptionForPurchase: string;
    userBlocked: string;
    sendOriginalFailed: string;
    fileTooLargeForTelegram: string;
    contentPolicyViolation: string;
    recraftImg2imgSvgUnsupported: string;
    recraftImg2imgFileTooLarge: string;
    recraftImg2imgDimensionsTooLarge: string;
    recraftImg2imgResolutionTooLarge: string;
    gptImageModerationBlocked: string;
    audioSensitiveWord: string;
    audioGenerateFailed: string;
    audioCreateTaskFailed: string;
    generationTimeout: string;
    generationFailed: string;
    // HeyGen
    heygenBlockedWords: string;
    heygenNsfw: string;
    heygenCelebrity: string;
    heygenChildSafety: string;
    heygenPolicyViolation: string;
    heygenNoFace: string;
    heygenMultipleFaces: string;
    heygenBadImageQuality: string;
    heygenInvalidText: string;
    heygenVideoFormat: string;
    heygenAudioFormat: string;
    heygenFileFormat: string;
    heygenVideoTooShort: string;
    heygenFileTooLong: string;
    heygenAudioTooLong: string;
    heygenAudioLengthMismatch: string;
    heygenAvatarNotFound: string;
    heygenVoiceNotFound: string;
    heygenVoicePremium: string;
    heygenTtsLanguage: string;
    heygenTrialLimit: string;
    heygenAvatarPermission: string;
    heygenUserBlocked: string;
    heygenTierRequired: string;
    heygenRejected: string;
    // Luma
    lumaBlacklistedWords: string;
    lumaImageModeration: string;
    lumaPromptModeration: string;
    lumaImageLoadError: string;
    lumaPromptRequired: string;
    lumaPromptTooShort: string;
    lumaPromptTooLong: string;
    lumaLoopUnsupported: string;
    lumaNoKeyframes: string;
    lumaUnknownRequestType: string;
    lumaRejected: string;
    // MiniMax
    minimaxSensitiveContent: string;
    minimaxInvalidChars: string;
    minimaxInvalidParams: string;
    minimaxUsageLimit: string;
    minimaxRejected: string;
    // Runway
    runwayModeration: string;
    runwayInvalidAsset: string;
    runwayRejected: string;
    // Replicate
    replicateOom: string;
    replicateInvalidParams: string;
    replicateFileTooLarge: string;
    // Fal
    falContentPolicy: string;
    falNoMediaGenerated: string;
    falImageTooSmall: string;
    falImageTooLarge: string;
    falImageLoadError: string;
    falFileDownloadError: string;
    falFaceDetectionError: string;
    falFileTooLarge: string;
    falFileTooLargeLimit: string;
    falAudioTooLong: string;
    falAudioTooShort: string;
    falVideoTooLong: string;
    falVideoTooShort: string;
    falUnsupportedFormat: string;
    falUnsupportedFormatList: string;
    falInvalidArchive: string;
    falInvalidArchiveExts: string;
    falArchiveTooFew: string;
    falArchiveTooFewExts: string;
    falArchiveTooMany: string;
    falFeatureNotSupported: string;
    falOneOf: string;
    falOneOfField: string;
  };
  common: {
    backToMain: string;
    profile: string;
    knowledgeBase: string;
    management: string;
    newDialog: string;
    comingSoon: string;
    tokens: string;
    sendOriginal: string;
    downloadFile: string;
    tariffs: string;
    costPerRequest: string;
    costRangePerRequest: string;
    costPerMPixel: string;
    costPerSecond: string;
    costRangePerSecond: string;
    costPerKChar: string;
    costRangePerKChar: string;
  };
  payments: {
    success: string;
    error: string;
  };
  linkMetabox: {
    title: string;
    subtitle: string;
    newAccount: string;
    existingAccount: string;
    registerHint: string;
    loginHint: string;
    password: string;
    submit: string;
    error: string;
  };
}

const cache = new Map<Language, Translations>();

async function loadLocale(lang: Language): Promise<Translations> {
  const mod = await import(`./locales/${lang}.js`);
  return mod.default as Translations;
}

/**
 * Загружает переводы при старте приложения.
 * Языки без перевода автоматически используют английский как fallback.
 */
export async function preloadLocales(languages: Language[]): Promise<void> {
  await Promise.all(
    languages.map(async (lang) => {
      try {
        cache.set(lang, await loadLocale(lang));
      } catch {
        // Нет файла перевода — будет использован fallback на en
      }
    }),
  );
}

/**
 * Синхронно возвращает перевод для указанного языка.
 * Требует предварительного вызова preloadLocales().
 */
export function getT(lang: Language): Translations {
  return cache.get(lang) ?? (cache.get("en") as Translations);
}
