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
    selectLanguagePrompt: string;
    onboarding: string;
    onboardingGotIt: string;
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
    language: string;
    chooseLanguage: string;
    languageChanged: string;
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
    docDefaultPrompt: string;
    docUnsupportedType: string;
    docTooLarge: string;
    docModelNotSupported: string;
    docExtractFailed: string;
    docUploadFailed: string;
    contextOverflow: string;
    noActiveDialog: string;
    createDialog: string;
    backToMain: string;
    dialogSelected: string;
    dialogHint: {
      prompt: string;
      attach: string;
      thinkingWarning: string;
    };
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
    batchActions: string;
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
    chooseTtsProvider: string;
    chooseMusicProvider: string;
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
    heygenNeedsVoice: string;
    heygenNeedsAvatar: string;
    veoImageRequires8s: string;
    soulCreatePrompt: string;
    soulPhotoCount: string;
    soulCreateButton: string;
    soulCreating: string;
    soulReady: string;
    soulFailed: string;
    soulCancelled: string;
    soulCancelButton: string;
    soulMinPhotos: string;
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
    fileTooLargeForBotApi: string;
    mediaSlotExpired: string;
    mediaSlotDurationTooShort: string;
    mediaSlotDurationTooLong: string;
    mediaSlotDurationOutOfRange: string;
    mediaSlotFileTooLarge: string;
    mediaSlotImageTooSmall: string;
    mediaSlotImageTooLarge: string;
    mediaSlotReadMetadataFailed: string;
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
    generationStillRunning: string;
    generationTimedOut24h: string;
    modelTemporarilyUnavailable: string;
    soulProviderUnavailable: string;
    soulMissingAvatar: string;
    soulAvatarNotReady: string;
    soulDescribingReference: string;
    soulDescribeFailed: string;
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
    // ElevenLabs
    elevenlabsPromptTooLong: string;
    // Suno
    sunoPromptTooLong: string;
    // Higgsfield
    higgsfieldTooManyMotions: string;
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
    generationCostLine: string;
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
  voice: {
    transcribing: string;
    transcriptionResult: string;
    transcriptionHint: string;
    useAsPrompt: string;
    expired: string;
    failed: string;
    inputHint: string;
    avatarChoiceUseAudio: string;
    avatarChoiceTranscribe: string;
  };
  mediaInput: {
    firstFrame: string;
    lastFrame: string;
    reference: string;
    edit: string;
    styleReference: string;
    refElement1: string;
    refElement2: string;
    refElement3: string;
    refElement4: string;
    refElement5: string;
    refElementHint: string;
    referenceImages: string;
    referenceVideos: string;
    referenceAudios: string;
    referenceImagesHint: string;
    referenceVideosHint: string;
    referenceAudiosHint: string;
    drivingAudio: string;
    firstClip: string;
    firstFrameWanHint: string;
    lastFrameWanHint: string;
    drivingAudioHint: string;
    firstClipHint: string;
    motionImage: string;
    motionVideo: string;
    motionElement: string;
    motionVideoHint: string;
    motionElementHint: string;
    uploadPromptVideo: string;
    uploadPrompt: string;
    uploadPromptMulti: string;
    uploadPromptElement: string;
    imageSaved: string;
    imageSavedSingle: string;
    slotRequired: string;
    replace: string;
    remove: string;
    optional: string;
    required: string;
    doneUploading: string;
    readyForPrompt: string;
    readyForPromptOptional: string;
    startGeneration: string;
    cancel: string;
    uploadCancelled: string;
    refineUseActive: string;
    refineActiveLabel: string;
    refineChooseModel: string;
    refineNoSupport: string;
    refineChooseSlot: string;
    refineDesign: string;
    refineVideo: string;
    refineSaved: string;
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

/**
 * Builds the standard caption shown with a generation result:
 *   ✅ {modelName}: {prompt}{suffix}
 *   💰 Spent: {cost} ✦ · 💳 Balance: {total} ✦ (sub {sub} + {regular})
 *
 * `cost`/`sub`/`regular` may be undefined when deduction context is unavailable
 * (e.g. crash recovery) — the cost line is then omitted.
 */
export function buildResultCaption(
  t: Translations,
  displayName: string,
  prompt: string,
  opts?: {
    cost?: number;
    subscriptionBalance?: number;
    tokenBalance?: number;
    suffix?: string;
    maxPromptLen?: number;
  },
): string {
  const maxLen = opts?.maxPromptLen ?? 200;
  let sliced = prompt.slice(0, maxLen);
  if (prompt.length > maxLen) sliced += "...";
  const suffix = opts?.suffix ? ` ${opts.suffix}` : "";
  let caption = `✅ ${displayName}: ${sliced}${suffix}`;
  const cost = opts?.cost;
  const sub = opts?.subscriptionBalance;
  const reg = opts?.tokenBalance;
  if (cost !== undefined && sub !== undefined && reg !== undefined) {
    const total = sub + reg;
    const line = t.common.generationCostLine
      .replace("{cost}", String(Math.round(cost)))
      .replace("{total}", String(Math.round(total)))
      .replace("{sub}", String(Math.round(sub)))
      .replace("{regular}", String(Math.round(reg)));
    caption += `\n${line}`;
  }
  return caption;
}

/**
 * Builds a capability hint for a GPT dialog based on the model's features.
 * Used both in the mini-app activation route and the bot's new-dialog flow.
 */
export function buildDialogHint(
  t: Translations,
  model:
    | {
        supportsThinking?: boolean;
      }
    | undefined,
): string {
  if (!model) return "";

  const lines: string[] = [t.gpt.dialogHint.prompt, t.gpt.dialogHint.attach];

  if (model.supportsThinking) {
    lines.push(t.gpt.dialogHint.thinkingWarning);
  }

  return lines.join("\n");
}
