export default {
  start: {
    welcome:
      '🔶 Welcome to Metabox! By continuing, you agree to the <a href="https://google.com">Terms of Service</a>. Please choose your language:',
    tokensGranted:
      '⚡ 5.50 tokens have been credited for you to explore the bot. To learn more about your account and plans, click the "Profile" button below.',
    yourBalance:
      '💰 Your balance: {balance} tokens. To view your account and plans, click the "Profile" button below.',
    restart: "Restart",
    videoIntro:
      "📌 A brief overview of the main bot tools.\nMetabox provides access to more than 70 AI tools.\n📎 Detailed video on how to use the bot and description of all features",
    mainMenuTitle: "🏠 Main Menu\nChoose a section 👇",
    community: "📢 Our Community",
    support: "💬 Support",
    howToVideo_vk: "▶️ How to use? Video (VK)",
    howToVideo_yt: "▶️ How to use? Video (YT)",
    knowledgeBase: "📖 Knowledge Base",
    channel: "📢 Metabox Family Channel",
    metaboxLinked: "✅ Metabox account linked successfully!",
    metaboxLinkFailed: "❌ Failed to link account. Please try again.",
    accountsMerged:
      "✅ Accounts merged! Your tokens and subscription have been transferred to your meta-box.ru account.",
  },
  menu: {
    profile: "👤 Profile",
    gpt: "💡 GPTs/Claude/Gemini",
    design: "🎨 AI Design",
    audio: "🎧 AI Audio",
    video: "🎬 Video of the Future",
    storage: "📁 Media Storage",
    help: "❓ Help",
    knowledgeBase: "📖 Knowledge Base",
  },
  gpt: {
    sectionTitle:
      "💡 GPTs/Claude/Gemini\n\n🎙 With voice, ✍ text, 🖼 image — ask any questions in a convenient way and Metabox will instantly find a solution + 🌐 web access (only version 4 models).",
    activateEditor: "🔆 Activate GPT Editor",
    management: "⚙ Management",
    newDialog: "💬 New Dialog",
    prompts: "📋 Prompts",
    gptEditorActivated:
      '🔆 GPT Editor activated! Now you can use the OpenAI editor to draw or modify your image.\nSend an image with a request in one message or just ask 👇\nIf you decide to change the model, go to the "⚙ Management" menu.',
    newDialogCreated:
      '💬 New dialog created. View all dialogs in the "⚙ Management" menu, "Dialogs" tab.',
    photoDefaultPrompt: "Here is the image",
    backToMain: "🏠 Main Menu",
    dialogSelected: "✅ Dialog selected: {title}\nModel: {model}",
  },
  design: {
    sectionTitle: "🎨 AI Design",
    sectionTooltip: "Choose a section to work with images 👇",
    management: "⚙ Management",
    newDialog: "🎨 New Image",
    backToMain: "🏠 Back to Main Menu",
    modelActivated: "🎨 Model activated.\nSend me a prompt to generate an image.",
    generating: "🎨 Generating your image...",
    asyncPending: "⏳ Your image is being generated. You will receive it as soon as it's ready.",
    generationFailed: "❌ Generation failed. Please try again.",
    photoSaved: "📎 Photo set as reference. Send your prompt.",
    photoAsReference: "[user photo reference]",
    withReference: "(with reference)",
    refSelected: "✅ Selected as reference",
    refine: "🔄 Refine",
    chooseModel: "🎨 Choose model",
  },
  audio: {
    sectionTitle: "🎧 AI Audio\nChoose a section to work with audio 👇",
    management: "⚙ Management",
    tts: "🗣 Speech synthesis",
    ttsEl: "🔊 TTS ElevenLabs",
    ttsOpenai: "🗣 OpenAI TTS",
    voiceClone: "🎙 Voice Clone",
    music: "🎵 Music generation",
    musicEl: "🎶 Music (ElevenLabs)",
    musicSuno: "🎵 Suno",
    sounds: "🔊 Sound Effects",
    backToMain: "🏠 Back to Main Menu",
    ttsActivated:
      "🗣 Text-to-Speech (OpenAI) activated.\nSend me any text and I will convert it to speech.",
    ttsElActivated:
      "🔊 ElevenLabs TTS activated.\nSend me any text to synthesize. Configure the voice in Management settings.",
    voiceCloneActivated:
      "🎙 Voice cloning.\nSend me a voice message or audio file (MP3/WAV/OGG) — I will create your voice profile in ElevenLabs.\nThe recommended minimum length is 30 seconds.\nThe voice will then be available in TTS ElevenLabs and video avatar settings.\n",
    voiceCloneNeedsAudio: "Please send a voice message or audio file for voice cloning.",
    voiceCloneProcessing: "⏳ Creating your voice profile...",
    voiceCloneSuccess:
      "✅ Voice «{name}» created! It is now available in ElevenLabs TTS and video avatar settings.",
    voiceCloneFailed: "❌ Failed to create voice. Check the file format and try again.",
    musicActivated:
      "🎵 Music generation (Suno) activated.\nDescribe the music you want (genre, mood, style) and I will create it.",
    musicElActivated:
      "🎶 ElevenLabs music activated.\nDescribe the sound atmosphere or melody and I will generate it.",
    soundsActivated:
      '🔊 Sound effects activated.\nDescribe the sound you want (e.g. "rain on a window", "thunder") and I will generate it.',
    activated: "🎧 Audio activated.\nSend me your request.",
    processing: "🎧 Processing your audio request...",
    asyncPending: "⏳ Your audio is being generated. You will receive it as soon as it's ready.",
    generationFailed: "❌ Audio generation failed. Please try again.",
  },
  video: {
    sectionTitle: "🎬 Video of the Future",
    sectionTooltip: "Choose a section to work with video 👇",
    avatars: "👾 Avatars",
    lipSync: "🔄 Lip Sync",
    newDialog: "🎬 New Video",
    backToMain: "🏠 Back to Main Menu",
    modelActivated:
      "🎬 Model activated.\nSend me a text prompt (and optionally attach an image) to generate a video.",
    queuing: "🎬 Queuing your video generation...",
    asyncPending:
      "⏳ Your video is being generated. This may take several minutes — you will receive it when it's ready.",
    generationFailed: "❌ Failed to queue video generation. Please try again.",
    management: "⚙ Management",
    avatarActivated:
      "Send the text you want the avatar to speak.\nCustomize the voice and background via the Management button.",
    lipSyncActivated:
      "Optionally send a photo with a face first, then send the text to be spoken.\nWithout a photo, the default avatar will be used.",
    videoVoiceQueuing: "🎬 Audio received, queuing generation...",
    elVoiceGenerating: "🎙 Generating speech via ElevenLabs...",
    elVoiceTtsExtraCharge:
      "⚠️ A cloned ElevenLabs voice is selected — an additional TTS charge will be applied.",
    hintHeygen:
      "👾 Set up your avatar and voice in the ⚙ Management section.\n\n📸 To create a personal photo avatar: open Management → HeyGen → My Avatars → Create avatar, then return to the chat and send a photo with your face.\n\n✉️ Send text → the avatar will speak it. If a cloned ElevenLabs voice is selected, speech will be synthesised via ElevenLabs (extra TTS charge).\n🎙 Or send a voice message / audio file directly — the avatar will lip-sync to your recording without TTS.",
    hintDid:
      "📸 Send a photo with a face — it will become the avatar.\n\n✉️ Send text → the avatar will speak it. If a cloned ElevenLabs voice is selected, speech will be synthesised via ElevenLabs (extra TTS charge).\n🎙 Or send a voice message / audio file directly — the avatar will lip-sync to your recording without TTS.\n⚙ Voice and other settings are available on the Management page.",
    hintHiggsfield:
      "📸 Send a photo to create an animation.\nYou can also pick several motion presets in Management section of Mini App.\n✉️ Once ready — send a text describing a video you want to generate.",
    higgsfieldRequiresImage:
      "❌ Higgsfield requires an image to generate video. Please send a photo first, then your text prompt.",
    runwayRequiresImage:
      "❌ Runway requires an image to generate video. Please send a photo first, then your text prompt.",
    imageIgnoredUnsupported:
      "⚠️ This model does not support image input — your photo will be ignored.",
    hintVideoDefault:
      "✉️ Send a text prompt to generate a video.\n🖼 Optionally attach an image — the video will start from it.",
    videoPhotoSaved: "📸 Photo saved for use in next generation.",
    videoDriverSaved: "🎬 Driver video saved for use in next generation.",
    videoVoiceSaved: "🎙 Voice sample saved. Now send the text for the avatar to speak.",
    avatarPhotoSaved:
      "📸 Avatar photo saved and selected. Send the text for the avatar to speak.\nYou can change the photo in Management → HeyGen → Avatar.",
    myVoiceDefaultName: "My voice",
    myAvatarDefaultName: "My avatar",
    avatarCreationStarted:
      "⏳ Great! Your avatar is being created, this will take a few minutes. I'll notify you when it's ready.",
    avatarCreationCancelled: "❌ Avatar creation cancelled.",
    avatarReady: "✅ Your avatar is ready! Open HeyGen settings and select it.",
    avatarFailed: "❌ Failed to create avatar. Please try again.",
  },
  errors: {
    unexpected: "Unexpected error. Please, try again later.",
    sendOriginalFailed: "Failed to send the file. Please try again later or contact support.",
    noToolGpt:
      "💡 You are in the GPT section.\n\nTo get started, create or select a dialog in the Management section 👇",
    noToolDesign:
      "🎨 You are in the Design section.\n\nChoose a model to generate an image 👇\nDescribe what you want to create.",
    noToolAudio: "🎧 You are in the Audio section.\n\nChoose a tool to work with audio 👇",
    noToolVideo:
      "🎬 You are in the Video section.\n\nChoose a model to generate a video 👇\nDescribe what you want to create.",
    noTool: "⚠️ No section selected.\n\nChoose a section to get started 👇",
    insufficientTokens: "❌ Insufficient tokens. Please top up your balance in the Plans section.",
    noSubscription: "❌ An active subscription is required to use the bot.",
    noSubscriptionForPurchase: "❌ Token packages are only available with an active subscription.",
    userBlocked: "❌ Your account has been blocked. Contact support.",
    fileTooLargeForTelegram: "The file is too large to send via Telegram.",
    contentPolicyViolation:
      "❌ Your request was rejected due to a content policy violation. Please modify your prompt and try again.",
    recraftImg2imgSvgUnsupported:
      "❌ SVG images cannot be used as a reference for Recraft img2img. Please send a raster image (PNG, JPEG, or WebP) instead.",
    recraftImg2imgFileTooLarge:
      "❌ The reference image is too large ({sizeMb} MB). Recraft img2img accepts files up to {maxMb} MB.",
    recraftImg2imgDimensionsTooLarge:
      "❌ The reference image dimensions {width}×{height} px exceed the Recraft img2img limit of {max} px per side.",
    recraftImg2imgResolutionTooLarge:
      "❌ The reference image resolution {width}×{height} ({mp} MP) exceeds the Recraft img2img limit of 16 MP.",
    gptImageModerationBlocked:
      "❌ Your request was rejected by the safety system. Violations: {violations}. Please modify your prompt and try again.",
  },
  common: {
    backToMain: "🏠 Back to Main Menu",
    profile: "👤 Profile",
    knowledgeBase: "📖 Knowledge Base",
    management: "⚙ Management",
    newDialog: "💬 New Dialog",
    comingSoon: " — coming soon.",
    tokens: "tokens",
    sendOriginal: "📎 Send as file",
    downloadFile: "⬇️ Download",
    tariffs: "💳 Plans",
    costPerRequest: "💰 {cost} ✦ per request",
    costRangePerRequest: "💰 {min} – {max} ✦ per request",
    costPerMPixel: "💰 {cost} ✦ per megapixel",
    costPerSecond: "💰 {cost} ✦ per second",
    costRangePerSecond: "💰 {min} – {max} ✦ per second",
    costPerKChar: "💰 {cost} ✦ per 1K characters",
    costRangePerKChar: "💰 {min} – {max} ✦ per 1K characters",
  },
  payments: {
    success: "✅ Payment successful! Tokens have been credited to your balance.",
    error: "⚠️ Payment received but tokens could not be credited. Please contact support.",
  },
  linkMetabox: {
    title: "Metabox Learning",
    subtitle: "Link your Metabox account to access the learning section.",
    newAccount: "Create account",
    existingAccount: "I already have an account",
    registerHint: "Enter an email and password to create your Metabox account.",
    loginHint: "Enter your existing Metabox email and password.",
    password: "Password",
    submit: "Continue",
    error: "Error. Please check your details and try again.",
  },
} as const;
