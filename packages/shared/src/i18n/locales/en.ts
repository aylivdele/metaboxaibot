export default {
  start: {
    welcome:
      "🔶 Welcome to Metabox! By continuing, you agree to the Terms of Service ([link]). Please choose your language:",
    tokensGranted:
      '⚡ 5.50 tokens have been credited for you to explore the bot. To learn more about your account and plans, click the "Profile" button below in the main menu.',
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
    storage: "🖼 Image Storage",
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
    newDialog: "💬 New Dialog",
    backToMain: "🏠 Back to Main Menu",
  },
  audio: {
    sectionTitle: "🎧 AI Audio\nChoose a section to work with audio 👇",
    tts: "🗣 Text to Speech",
    voiceClone: "🎙 Voice Clone",
    music: "🎵 Music Generation",
    sounds: "🔊 Sound Effects",
    backToMain: "🏠 Back to Main Menu",
  },
  video: {
    sectionTitle: "🎬 Video of the Future\nChoose a section to work with video 👇",
    avatars: "👾 Avatars",
    lipSync: "🔄 Lip Sync",
    newDialog: "🎬 New Video",
    backToMain: "🏠 Back to Main Menu",
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
  },
} as const;
