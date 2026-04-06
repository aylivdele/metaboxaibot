/** Per-model UI translations (name / description). Falls back to AIModel definition strings. */
export interface ModelTranslation {
  name?: string;
  description?: string;
  descriptionOverride?: string;
}

/** Per-setting UI translations (label / description / option labels). Falls back to ModelSettingDef strings. */
export interface SettingTranslation {
  label?: string;
  description?: string;
  /** Maps option value → localized label. */
  options?: Record<string, string>;
}

export const MODEL_TRANSLATIONS_EN: Record<string, ModelTranslation> = {
  // ── GPT ─────────────────────────────────────────────────────────────────────
  "gpt-5.4-pro": {
    name: "🧠 GPT 5.4 Pro",
    description: "The most powerful OpenAI model — maximum accuracy and the deepest reasoning.",
  },
  "gpt-5.4": {
    name: "💬 GPT 5.4",
    description: "OpenAI flagship with a great balance of intelligence and speed.",
  },
  "gpt-5-pro": {
    name: "💡 GPT 5 Pro",
    description: "Previous OpenAI flagship — solid balance of intelligence and speed.",
  },
  "gpt-5-nano": {
    name: "✨ GPT 5 Nano",
    description: "Lightest and cheapest in the GPT 5 lineup — instant responses.",
  },
  "o4-mini": {
    name: "🔬 GPT-o4 Mini",
    description: "OpenAI reasoning model — chain-of-thought for complex tasks at a low price.",
  },
  "o3-mini": {
    name: "🔩 GPT-o3 Mini",
    description: "Compact OpenAI reasoning model — great price-to-accuracy ratio.",
  },
  "claude-opus": {
    name: "🎭 Claude 4.6 Opus",
    description:
      "Anthropic's most intelligent model, best for complex analytical and creative tasks. Understands images.",
  },
  "claude-opus-4-5": {
    name: "🃏 Claude 4.5 Opus",
    description: "Previous Anthropic flagship — deep analysis and long texts. Understands images.",
  },
  "claude-sonnet": {
    name: "📜 Claude 4.6 Sonnet",
    description:
      "Fast and smart — Anthropic's best price-to-quality ratio. Excellent for code, text and analysis.",
  },
  "claude-sonnet-4-5": {
    name: "🖊️ Claude 4.5 Sonnet",
    description: "Reliable Anthropic workhorse, great for code and writing.",
  },
  "claude-haiku": {
    name: "🍃 Claude 4.5 Haiku",
    description: "Anthropic's fastest and cheapest model — instant responses for simple tasks.",
  },
  "gemini-3-pro": {
    name: "💎 Gemini 3 Pro",
    description: "Google's flagship — massive context and multimodality. Supports web search.",
  },
  "gemini-3.1-pro": {
    name: "💍 Gemini 3.1 Pro",
    description: "Updated Gemini 3 Pro with improved instruction following. Web search.",
  },
  "gemini-2-flash": {
    name: "🌟 Gemini 2.5 Flash",
    description:
      "Fast and affordable Google model with reasoning — great price-to-quality. Supports web search.",
  },
  "gemini-2-flash-lite": {
    name: "⭐ Gemini 2.5 Flash Lite",
    description: "Google's lightest and cheapest model — ideal for simple tasks at minimal cost.",
  },
  "deepseek-r1": {
    name: "🔍 DeepSeek R1",
    description:
      "Reasoning model from China, competitor to o1 — strong at math and code. Open weights.",
  },
  "deepseek-v3": {
    name: "🐋 DeepSeek V3",
    description: "Fast model, excellent for general tasks and text generation at very low cost.",
  },
  "grok-4": {
    name: "🤖 Grok 4",
    description: "xAI (Elon Musk) flagship — powerful reasoning with access to X data.",
  },
  "grok-4-fast": {
    name: "🏎️ Grok 4-fast",
    description: "Accelerated Grok 4 from xAI — fast responses with reasoning.",
  },
  "perplexity-sonar-pro": {
    name: "🌐 Perplexity Sonar Pro + Internet",
    description: "Powerful AI search with deep answers — real-time data from the internet.",
  },
  "perplexity-sonar-research": {
    name: "🔭 Perplexity Sonar Deep Research",
    description: "Autonomous researcher — analyzes dozens of sources in one query.",
  },
  "perplexity-sonar": {
    name: "📡 Perplexity Sonar + Internet",
    description: "Fast AI search with real-time internet data.",
  },
  "qwen-3-max-thinking": {
    name: "🧮 Qwen 3 Max Thinking",
    description: "Alibaba's largest reasoning model — competitor to GPT and Claude.",
  },
  "qwen-3-thinking": {
    name: "💭 Qwen 3 Thinking",
    description: "Alibaba's mid-size reasoning model — strong at code and math.",
  },
  // ── Audio ────────────────────────────────────────────────────────────────────
  "tts-openai": {
    name: "🔊 Speech Synthesis (OpenAI)",
    description:
      "OpenAI text-to-speech. Multiple voices, natural intonation and fast generation for any text.",
  },
  "voice-clone": {
    name: "🎤 Voice Cloning",
    description:
      "Creates your voice profile in ElevenLabs from a short audio sample. Ready voice is available in ElevenLabs TTS and video avatars.",
  },
  "tts-el": {
    name: "🔊 Speech Synthesis (ElevenLabs)",
    description: "ElevenLabs text-to-speech with a wide library of voices or your cloned voices.",
  },
  suno: {
    name: "🎵 Music Generation (Suno)",
    description:
      "Generates full music tracks with vocals and arrangement from a text description of style and mood.",
  },
  "sounds-el": {
    name: "🔔 Sound Effects (ElevenLabs)",
    description:
      "Generates original sound effects from a description. Ideal for video, games and podcasts. English prompts recommended.",
  },
  "music-el": {
    name: "🎶 Music (ElevenLabs)",
    description:
      "Generates background music, ambient and musical atmospheres from a text description.",
  },
  // ── Design ───────────────────────────────────────────────────────────────────
  "nano-banana-pro": {
    name: "🍌 Nano Banana PRO",
    description:
      "Generates realistic photos and lets you edit details with words: 'remove background', 'add a hat', 'make it evening'.",
  },
  "nano-banana-2": {
    name: "🍌 Nano Banana 2",
    description:
      "Generates and edits realistic photos from text commands. Supports web search and enhanced thinking for precise prompt following.",
  },
  midjourney: {
    name: "🎨 MidJourney v7",
    description:
      "Creates the most beautiful and stylish images. Best choice for art, illustrations and striking visuals.",
  },
  "gpt-image-1.5": {
    name: "🖼️ GPT Image 1.5",
    description:
      "Best at understanding complex text prompts. Accurately renders what you describe, including text in images.",
  },
  "stable-diffusion": {
    name: "🌊 Stable Diffusion 3.5",
    description:
      "Generates detailed images in any style: from photorealism to anime and fantasy. English prompts only!",
  },
  "dall-e-3": {
    name: "🎯 DALL-E 3 Turbo",
    description:
      "Simple OpenAI generator. Understands prompts in any language — great for quick ideas.",
  },
  "ideogram-quality": {
    name: "✍️ Ideogram v3.0 Quality",
    description:
      "Best at rendering readable text in images. Ideal for logos, posters, covers and ads. Maximum quality.",
  },
  "ideogram-balanced": {
    name: "✍️ Ideogram v3.0 Balanced",
    description:
      "Best at rendering readable text in images. Ideal for logos, posters, covers and ads. Balanced quality and speed.",
  },
  "ideogram-turbo": {
    name: "✍️ Ideogram v3.0 Turbo",
    description:
      "Best at rendering readable text in images. Ideal for logos, posters, covers and ads. Fast and budget-friendly.",
  },
  "imagen-4-fast": {
    name: "🔮 Imagen 4 Fast",
    description:
      "Fast Google Imagen 4. High photorealism and accurate text-following with minimal wait time.",
  },
  "imagen-4": {
    name: "🔮 Imagen 4",
    description: "Standard Google Imagen 4. High photorealism and accurate text-following.",
  },
  "imagen-4-ultra": {
    name: "🔮 Imagen 4 Ultra",
    description:
      "Maximum quality Google Imagen 4. Highest detail and photorealism for professional tasks.",
  },
  flux: {
    name: "⚡ FLUX.2",
    description:
      "Maximally realistic photos in seconds. Best choice for fast, photo-realistic results.",
  },
  "flux-pro": {
    name: "⚡ FLUX.2 Pro",
    description:
      "Professional FLUX.2 — maximum quality, better prompt adherence, supports editing uploaded images.",
  },
  "recraft-v3": {
    name: "🖌️ Recraft v3",
    description:
      "Quickly creates illustrations, icons and graphics in a consistent style. Great for design and presentations.",
  },
  "recraft-v4": {
    name: "🖌️ Recraft V4",
    description:
      "Built for design and marketing: clean composition, precise text rendering and professional polish.",
  },
  "recraft-v4-pro": {
    name: "💠 Recraft V4 Pro",
    description:
      "Extended Recraft V4 with higher resolution and detail. Ideal for demanding design projects.",
  },
  "recraft-v4-vector": {
    name: "📐 Recraft V4 Vector (SVG)",
    description:
      "Generates scalable SVG vectors — perfect for logos, illustrations and icons. Scales to any size without quality loss.",
  },
  "recraft-v4-pro-vector": {
    name: "📐 Recraft V4 Pro Vector (SVG)",
    description:
      "Professional vector generation with maximum SVG quality. For complex illustrations and branding.",
  },
  "seedream-5": {
    name: "🛍️ Seedream 5.0 (ByteDance)",
    description:
      "Perfect for product photos, clothing and catalogs. Creates clean, professional images for sales.",
  },
  "seedream-4.5": {
    name: "🛍️ Seedream 4.5",
    description:
      "Previous Seedream — slightly simpler but faster and cheaper. Good for bulk product photo generation.",
  },
  // ── Video ────────────────────────────────────────────────────────────────────
  kling: {
    name: "🎥 Kling 3.0",
    description:
      "Generates videos up to 10 seconds with audio. Best at reproducing human movements.",
  },
  "kling-pro": {
    name: "🎥 Kling 3.0 Pro",
    description:
      "Pro version — generates videos up to 10 seconds with audio. Best at reproducing human movements.",
  },
  "higgsfield-lite": {
    name: "🎬 Higgsfield Lite",
    description:
      "Specializes in realistic human animation — facial expressions, gestures and body movements look natural.",
  },
  higgsfield: {
    name: "🎬 Higgsfield Turbo",
    description:
      "Turbo version. Specializes in realistic human animation — facial expressions, gestures and body movements look natural.",
  },
  "higgsfield-preview": {
    name: "🎬 Higgsfield Preview",
    description:
      "Flagship version with maximum quality — most realistic lighting, detail and cinematic quality.",
    descriptionOverride:
      "Flagship version with maximum quality — most realistic lighting, detail and cinematic quality.",
  },
  veo: {
    name: "📽️ Veo 3",
    description:
      "Google video with audio and voices. Supports vertical format for Reels and Shorts. Send a photo with text — the video starts from your photo.",
  },
  "veo-fast": {
    name: "📽️ Veo 3 Fast",
    description:
      "Fast and more affordable Veo 3 from Google. With audio and voices. Send a photo with text — the video starts from your photo.",
  },
  sora: {
    name: "🌌 Sora 2",
    description:
      "The most realistic video from OpenAI. Objects move as in reality, with audio and correct physics. Send a photo with text — it becomes the first frame.",
  },
  runway: {
    name: "🛫 Runway Gen-4.5",
    description:
      "Full control over video: specify what and how should move, control the camera. The professional's choice.",
  },
  heygen: {
    name: "👤 HeyGen",
    description:
      "Popular among solo creators, influencers and small teams. For avatars, lip-sync and video translation in 175+ languages.",
  },
  seedance: {
    name: "💃 Seedance 1.5 Pro (ByteDance)",
    description:
      "Creates video with expressive and unusual movement. Great for creative and stylized clips.",
  },
  "luma-ray2": {
    name: "☀️ Luma: Ray 2",
    description:
      "Realistic video from Luma AI. Smooth movements, cinematic quality. Supports photo as the first frame.",
  },
  minimax: {
    name: "🎦 MiniMax Video-01",
    description:
      "Chinese video model with excellent character movement quality. Generates 6-second clips with high smoothness.",
  },
  pika: {
    name: "📸 Pika 2.2",
    description:
      "Fast videos with cool special effects: explosions, melting, compression. Perfect for TikTok and Reels.",
  },
  "hailuo-fast": {
    name: "🎞️ Hailuo 2.3",
    description:
      "Fast Hailuo 2.3 by MiniMax — ~40% cheaper with similar quality. Requires a photo as the first frame.",
  },
  hailuo: {
    name: "🎞️ Hailuo 2.3",
    description:
      "MiniMax video model with 1080p support and 10-second clips. Accepts a photo as the first frame.",
  },
  wan: {
    name: "🏯 Wan 2.6 (Alibaba)",
    description:
      "Alibaba video model with high movement quality and 1080p support. Send a photo with text for image-to-video mode.",
  },
};

export const SETTING_TRANSLATIONS_EN: Record<string, SettingTranslation> = {
  // ── LLM ──────────────────────────────────────────────────────────────────────
  temperature: {
    label: "Temperature",
    description:
      "Randomness of responses: lower = more precise and predictable, higher = more varied and creative.",
  },
  max_tokens: {
    label: "Max response length",
    description:
      "Maximum number of words the AI can write in one response. Increase for long texts.",
  },
  system_prompt: {
    label: "System prompt",
    description:
      "Hidden instruction the AI always follows: set a role, style or constraints for the entire dialog.",
  },
  search_recency_filter: {
    label: "Search recency",
    description: "Limit search to recent content: last hour, day, week or month.",
    options: { month: "Month", week: "Week", day: "Day", hour: "Hour" },
  },
  search_context_size: {
    label: "Search depth",
    description: "low — faster and cheaper, high — more sources and accurate but costlier.",
    options: { low: "Low", medium: "Medium", high: "High" },
  },
  search_domain_filter: {
    label: "Domain filter",
    description:
      "Restrict search to specific domains (comma-separated, e.g. wikipedia.org, bbc.com). Empty = no restriction.",
  },
  reasoning_effort: {
    label: "Reasoning depth",
    description:
      "How much effort the model spends thinking: low — fast, high — more thorough and accurate but slower.",
    options: { low: "Low", medium: "Medium", high: "High", xhigh: "Max" },
  },
  verbosity: {
    label: "Response detail",
    description:
      "low — brief answers, medium — balanced, high — detailed (for explanations and analysis).",
    options: { low: "Concise", medium: "Standard", high: "Detailed" },
  },
  extended_thinking: {
    label: "Extended thinking",
    description:
      "Model thinks longer before responding — more accurate for complex tasks but slower.",
  },
  enable_thinking: {
    label: "Thinking mode",
    description:
      "Model reasons before responding — more accurate for complex tasks but uses more output tokens.",
  },
  thinking_budget: {
    label: "Thinking budget",
    description: "How many tokens the model can spend on internal reasoning (0 = disabled).",
  },
  // ── Shared (media) ───────────────────────────────────────────────────────────
  aspect_ratio: {
    label: "Aspect ratio",
    description: "Shape of the output image: landscape, portrait or square.",
    options: {
      "1280:720": "Landscape 16:9",
      "720:1280": "Portrait 9:16",
      "1104:832": "Landscape 4:3",
      "832:1104": "Portrait 3:4",
      "960:960": "Square 1:1",
      "1584:672": "Wide 21:9",
    },
  },
  duration: {
    label: "Duration",
    description: "Duration of the video clip in seconds.",
  },
  seed: {
    label: "Seed",
    description: "Fixed seed for reproducibility. Empty = random each time.",
  },
  negative_prompt: {
    label: "Negative prompt",
    description: "What should NOT appear: list unwanted objects, styles or features.",
  },
  output_format: {
    label: "Output format",
    description: "Format of the resulting image.",
  },
  num_inference_steps: {
    label: "Generation steps",
    description:
      "Number of processing iterations: more steps = more detailed and higher quality, but slower.",
  },
  guidance_scale: {
    label: "Prompt guidance (CFG)",
    description:
      "How strictly the AI follows your text. High = literal, low = creative interpretation.",
  },
  cfg_scale: {
    label: "Prompt guidance (CFG)",
    description:
      "How accurately the video reflects your description: closer to 1 = strict, closer to 0 = more freedom.",
  },
  cfg: {
    label: "Prompt guidance (CFG)",
    description:
      "How strictly the AI follows your text. High = literal, low = creative interpretation.",
  },
  acceleration: {
    label: "Acceleration",
    description: "Generation speed: none = maximum quality, regular = balanced, high = fast.",
  },
  enable_prompt_expansion: {
    label: "Prompt expansion",
    description: "Automatically expands your prompt to improve the result.",
  },
  enhance_prompt: {
    label: "Prompt enhancement",
    description: "Automatically improves your prompt using AI for a more detailed result.",
  },
  prompt_extend: {
    label: "Prompt enhancement",
    description: "Automatically expands your prompt via LLM for a more detailed result.",
  },
  resolution: {
    label: "Resolution",
    description: "Quality / detail level of the output.",
  },
  generate_audio: {
    label: "Generate audio",
    description: "Enable automatic audio generation for the video.",
  },
  loop: {
    label: "Loop video",
    description: "Last frame smoothly transitions to first — perfect for seamless animations.",
  },
  motions: {
    label: "Motion presets",
    description: "Choose one or more camera motion presets. Multiple presets can be combined.",
  },
  person_generation: {
    label: "Person generation",
    description: "Whether people are allowed to appear in the video.",
    options: { dont_allow: "Not allowed", allow_adult: "Adults allowed" },
  },
  camera_horizontal: {
    label: "Camera: left / right",
    description: "Horizontal camera pan: negative = left, positive = right.",
  },
  camera_vertical: {
    label: "Camera: up / down",
    description: "Vertical camera pan: negative = down, positive = up.",
  },
  camera_zoom: {
    label: "Camera zoom",
    description: "Camera zoom: positive = zoom in, negative = zoom out.",
  },
  quality: {
    label: "Quality",
    description: "low — fast, medium — balanced, high — maximum. Affects price.",
  },
  size: {
    label: "Size",
    description: "Output image size. Affects price.",
  },
  output_compression: {
    label: "Compression",
    description: "Compression level for JPEG/WebP (0 = lossless, 100 = maximum). No effect on PNG.",
  },
  background: {
    label: "Background",
    description: "transparent — transparent background (PNG/WebP only), opaque — solid.",
  },
  moderation: {
    label: "Moderation",
    description: "low — relaxed content filtering, auto — standard.",
  },
  prompt_strength: {
    label: "Prompt strength (img2img)",
    description: "Degree of modification in img2img. 1.0 = full change, 0 = no change.",
  },
  go_fast: {
    label: "Fast mode",
    description: "fp8 quantization instead of bf16. Faster, slightly lower quality.",
  },
  output_quality: {
    label: "Output quality",
    description: "Compression quality (0–100). No effect on PNG.",
  },
  extra_lora: {
    label: "Extra LoRA",
    description: "URL or path to LoRA weights (HuggingFace, CivitAI, Replicate, .safetensors).",
  },
  lora_scale: {
    label: "LoRA strength",
    description: "Intensity of the primary LoRA. Optimal: 0–1.",
  },
  extra_lora_scale: {
    label: "Extra LoRA strength",
    description: "Intensity of the additional LoRA. Optimal: 0–1.",
  },
  disable_safety_checker: {
    label: "Disable safety filter",
    description: "Disable content safety checks.",
  },
  enable_web_search: {
    label: "Web search",
    description: "Allow the model to access the internet to refine prompt details. Affects price.",
  },
  thinking_level: {
    label: "Thinking level",
    description:
      "Minimal — slight instruction-following boost, High — deep prompt analysis. Disabled = no extra thinking. Affects price.",
    options: { "": "Disabled" },
  },
  // ── Design-specific ───────────────────────────────────────────────────────────
  style_type: {
    label: "Style",
    description: "Artistic direction for the image.",
  },
  style_preset: {
    label: "Art preset",
    description: "Ready-made artistic style for the image (V3 models only).",
  },
  magic_prompt_option: {
    label: "Magic Prompt",
    description: "Automatically enhances your prompt for a more beautiful and detailed result.",
  },
  image_size: {
    label: "Resolution",
    description: "1K — standard, 2K — higher. Affects generation time.",
  },
  safety_filter_level: {
    label: "Safety filter",
    description:
      "block_only_high — most lenient, block_medium_and_above — moderate, block_low_and_above — strict.",
    options: {
      block_only_high: "Lenient",
      block_medium_and_above: "Moderate",
      block_low_and_above: "Strict",
    },
  },
  style: {
    label: "Style",
    description: "Artistic direction: realistic photos, digital illustrations or vector graphics.",
    options: {
      realistic_image: "Realistic",
      digital_illustration: "Illustration",
      vector_illustration: "Vector",
    },
  },
  substyle: {
    label: "Sub-style",
    description: "Refines the artistic style. Depends on the selected style.",
  },
  no_text: {
    label: "No text",
    description: "Prevent the model from adding text, inscriptions or lettering to the image.",
  },
  artistic_level: {
    label: "Artistic level",
    description: "0 — close to reality, 5 — maximally stylized and artistic.",
  },
  strength: {
    label: "Modification strength",
    description:
      "Used when editing an image. 0 — barely change the original, 1 — follow only the prompt.",
  },
  // ── Audio-specific ────────────────────────────────────────────────────────────
  model: {
    label: "TTS model",
    description:
      "tts-1 — standard quality, tts-1-hd — high quality, gpt-4o-mini-tts — style-controlled via instructions. Affects price.",
  },
  model_id: {
    label: "Synthesis model",
    description:
      "multilingual_v2 — maximum quality (costlier), turbo_v2_5 — 2× faster and cheaper.",
    options: {
      eleven_multilingual_v2: "Multilingual v2 (max quality)",
      eleven_turbo_v2_5: "Turbo v2.5 (faster, cheaper)",
    },
  },
  voice: {
    label: "Voice",
    description:
      "Timbre and style. Alloy and Echo — neutral, Onyx — deep male, Nova and Shimmer — female.",
  },
  voice_id: {
    label: "Voice",
    description: "Choose a voice from the official library or your cloned voices.",
  },
  speed: {
    label: "Speech speed",
    description: "Narration pace: 1.0 = normal speed, lower = slower, higher = faster.",
  },
  format: {
    label: "Audio format",
    description: "MP3 — universal and compact, FLAC — lossless, Opus — for streaming.",
  },
  instructions: {
    label: "Voice instructions",
    description:
      "Only for gpt-4o-mini-tts: specify tone, emotion and speech style. E.g. 'Speak slowly and solemnly'.",
  },
  remove_background_noise: {
    label: "Remove background noise",
    description:
      "Removes background noise before cloning. Do not use if the recording is already clean.",
  },
  stability: {
    label: "Stability",
    description:
      "Voice consistency: high = even and monotone, low = more expressive and emotional.",
  },
  similarity_boost: {
    label: "Similarity boost",
    description: "How precisely the selected voice's timbre is reproduced.",
  },
  use_speaker_boost: {
    label: "Speaker Boost",
    description: "Enhances voice quality and clarity.",
  },
  model_version: {
    label: "Model version",
    description: "V4_5 — recommended (up to 8 min), V5 / V5_5 — latest versions.",
    options: { V4_5: "V4.5 (recommended)", V5_5: "V5.5 (latest)" },
  },
  make_instrumental: {
    label: "Instrumental only",
    description: "Generate music without vocals — instrumental track only.",
  },
  lyrics: {
    label: "Song lyrics",
    description: "Ready-made song text. If provided — the model won't generate its own lyrics.",
  },
  duration_seconds: {
    label: "Duration (sec)",
    description: "Specific duration in seconds.",
  },
  prompt_influence: {
    label: "Prompt influence",
    description:
      "How closely the output follows the description (0.0–1.0). Lower = more variation.",
  },
  // ── Video avatar ──────────────────────────────────────────────────────────────
  avatar_id: {
    label: "Avatar",
    description: "Choose an official HeyGen avatar or upload your own photo.",
  },
  background_color: { label: "Background color" },
  expressiveness: {
    label: "Expressiveness",
    description: "For photo avatars only.",
    options: { low: "Low", medium: "Medium", high: "High" },
  },
  motion_prompt: {
    label: "Motion description",
    description: "For photo avatars only.",
  },
  voice_settings_enabled: { label: "Configure voice" },
  voice_speed: { label: "Speech speed" },
  voice_pitch: { label: "Voice pitch" },
  voice_locale: { label: "Voice language" },
};

/** Map of locale code → model translations. Russian falls back to model definition strings. */
export const MODEL_TRANSLATIONS: Record<string, Record<string, ModelTranslation>> = {
  en: MODEL_TRANSLATIONS_EN,
  ru: {},
};

/** Map of locale code → setting translations. Russian falls back to ModelSettingDef strings. */
export const SETTING_TRANSLATIONS: Record<string, Record<string, SettingTranslation>> = {
  en: SETTING_TRANSLATIONS_EN,
  ru: {},
};

/**
 * Returns localised display strings for a model.
 * Falls back to the raw model definition strings when no translation exists.
 */
export function resolveModelDisplay(
  modelId: string,
  lang: string,
  fallback: { name: string; description?: string | null; descriptionOverride?: string | null },
): { name: string; description: string } {
  // Only use translations for the requested locale — no cross-locale fallback.
  // If the locale has no entry, fall back to the model definition strings (fallback),
  // which are already in the correct language (e.g. Russian for ru locale).
  const mt = MODEL_TRANSLATIONS[lang]?.[modelId];
  const name = mt?.name ?? fallback.name;
  const description =
    mt?.descriptionOverride ??
    fallback.descriptionOverride ??
    mt?.description ??
    fallback.description ??
    "";
  return { name, description };
}
