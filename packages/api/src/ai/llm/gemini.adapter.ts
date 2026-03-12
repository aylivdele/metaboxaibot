import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import type { LLMAdapter, LLMInput, LLMOutput, MessageRecord } from "./base.adapter.js";

const MODEL_MAP: Record<string, string> = {
  "gemini-2-flash": "gemini-2.0-flash",
  "gemini-2-pro": "gemini-2.0-pro",
};

/**
 * Google Gemini adapter (db_history strategy).
 * Sends last N messages from DB as chat history.
 */
export class GeminiAdapter implements LLMAdapter {
  readonly contextStrategy = "db_history" as const;
  readonly contextMaxMessages: number;

  private genai: GoogleGenerativeAI;
  private apiModel: string;

  constructor(
    private readonly modelId: string,
    contextMaxMessages = 50,
    apiKey = process.env.GOOGLE_AI_API_KEY,
  ) {
    this.genai = new GoogleGenerativeAI(apiKey!);
    this.apiModel = MODEL_MAP[modelId] ?? modelId;
    this.contextMaxMessages = contextMaxMessages;
  }

  async chat(input: LLMInput): Promise<LLMOutput> {
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(input)) {
      chunks.push(chunk);
    }
    return { text: chunks.join(""), tokensUsed: 0 };
  }

  async *chatStream(input: LLMInput): AsyncGenerator<string> {
    const model = this.genai.getGenerativeModel({
      model: this.apiModel,
      ...(input.systemPrompt ? { systemInstruction: input.systemPrompt } : {}),
    });

    const history: Content[] = (input.history ?? []).map((m: MessageRecord) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });

    const userParts: Content["parts"] = input.imageUrl
      ? [
          { text: input.prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: await fetchImageAsBase64(input.imageUrl),
            },
          },
        ]
      : [{ text: input.prompt }];

    const result = await chat.sendMessageStream(userParts);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}
