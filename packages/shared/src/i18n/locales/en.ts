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
    backToMain: "🏠 Main Menu",
  },
  design: {
    sectionTitle: "🎨 AI Design\nChoose a section to work with images 👇",
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
  },
  audio: {
    sectionTitle: "🎧 AI Audio\nChoose a section to work with audio 👇",
    tts: "🗣 Text to Speech",
    voiceClone: "🎙 Voice Clone",
    music: "🎵 Music Generation",
    sounds: "🔊 Sound Effects",
    backToMain: "🏠 Back to Main Menu",
    ttsActivated: "🗣 Text-to-Speech activated.\nSend me any text and I will convert it to speech.",
    voiceCloneActivated:
      "🎙 Voice synthesis activated.\nSend me a text and it will be spoken in a natural AI voice.",
    musicActivated:
      "🎵 Music generation activated.\nDescribe the music you want (genre, mood, style) and I will create it.",
    soundsActivated:
      '🔊 Sound effects activated.\nDescribe the sound you want (e.g. "rain on a window", "thunder") and I will generate it.',
    activated: "🎧 Audio activated.\nSend me your request.",
    processing: "🎧 Processing your audio request...",
    asyncPending: "⏳ Your audio is being generated. You will receive it as soon as it's ready.",
    generationFailed: "❌ Audio generation failed. Please try again.",
  },
  video: {
    sectionTitle: "🎬 Video of the Future\nChoose a section to work with video 👇",
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
  },
  errors: {
    unexpected: "Unexpected error. Please, try again later.",
    noTool:
      "⚠️ No tool selected for working with the bot.\nPlease use the navigation to activate the desired function (see photo) ↕️\n*If the ☰ menu button (highlighted in red in the photo) has disappeared, type /start to restart the bot* 🔄",
    insufficientTokens:
      "❌ Insufficient tokens. Please top up your balance in the Profile section.",
    userBlocked: "❌ Your account has been blocked. Contact support.",
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
  },
  payments: {
    success: "✅ Payment successful! Tokens have been credited to your balance.",
    error: "⚠️ Payment received but tokens could not be credited. Please contact support.",
  },
} as const;
