import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import type {
  LLMAdapter,
  LLMInput,
  LLMOutput,
  MessageRecord,
  StreamResult,
} from "./base.adapter.js";
import { config } from "@metabox/shared";
import { fetchWithLog } from "../../utils/fetch.js";

const MODEL_MAP: Record<string, string> = {
  "gemini-2-flash": "gemini-2.5-flash",
  "gemini-2-pro": "gemini-2.5-pro",
  "gemini-3-pro": "gemini-3.0-pro",
  "gemini-3.1-pro": "gemini-3.1-pro",
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
    apiKey = config.ai.google,
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

  async *chatStream(input: LLMInput): AsyncGenerator<string, StreamResult, unknown> {
    const model = this.genai.getGenerativeModel({
      model: this.apiModel,
      ...(input.systemPrompt ? { systemInstruction: input.systemPrompt } : {}),
      generationConfig: {
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.maxTokens !== undefined ? { maxOutputTokens: input.maxTokens } : {}),
      },
    });

    const history: Content[] = (input.history ?? []).map((m: MessageRecord) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });

    const urls = input.imageUrls?.length ? input.imageUrls : input.imageUrl ? [input.imageUrl] : [];

    const userParts: Content["parts"] = urls.length
      ? [
          ...(input.prompt ? [{ text: input.prompt }] : []),
          ...(await Promise.all(
            urls.map(async (url) => ({
              inlineData: {
                mimeType: "image/jpeg",
                data: await fetchImageAsBase64(url),
              },
            })),
          )),
        ]
      : [{ text: input.prompt }];

    const result = await chat.sendMessageStream(userParts);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }

    const aggregated = await result.response;
    const usage = aggregated.usageMetadata;
    return {
      inputTokensUsed: usage?.promptTokenCount ?? 0,
      outputTokensUsed: usage?.candidatesTokenCount ?? 0,
    };
  }
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetchWithLog(url);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}
