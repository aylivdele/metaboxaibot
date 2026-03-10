import type { Section } from "./user.js";

export type MessageRole = "user" | "assistant";
export type MediaType = "image" | "video" | "audio";
export type JobStatus = "pending" | "processing" | "done" | "failed";

/**
 * Стратегия хранения контекста диалога:
 * - provider_chain:  OpenAI Responses API — цепочка через previous_response_id
 * - provider_thread: OpenAI Assistants — Thread на стороне OpenAI
 * - db_history:      Anthropic, Gemini и др. — история из нашей БД
 */
export type ContextStrategy = "provider_chain" | "provider_thread" | "db_history";

export interface DialogDto {
  id: string;
  userId: bigint;
  section: Section;
  modelId: string;
  title?: string;
  isActive: boolean;
  contextStrategy: ContextStrategy;
  providerThreadId?: string;
  providerLastResponseId?: string;
  createdAt: Date;
}

export interface MessageDto {
  id: string;
  dialogId: string;
  role: MessageRole;
  content: string;
  mediaUrl?: string;
  mediaType?: MediaType;
  tokensUsed: number;
  createdAt: Date;
}

export interface GenerationJobDto {
  id: string;
  userId: bigint;
  dialogId: string;
  section: string;
  modelId: string;
  status: JobStatus;
  prompt: string;
  outputUrl?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}
