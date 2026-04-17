import { create } from "zustand";
import type { DialogDto, MessageDto, ModelDto } from "@/api/chat";

export interface PendingMessage extends MessageDto {
  /** Локальный message, который ещё не прилетел из API (user → placeholder assistant). */
  pending?: boolean;
  /** true пока идёт streaming assistant-ответа. */
  streaming?: boolean;
  /** Ошибка streaming'a (если есть). */
  error?: string | null;
}

interface ChatState {
  dialogs: DialogDto[];
  models: ModelDto[];
  currentDialogId: string | null;
  messages: PendingMessage[];
  isSending: boolean;
  loadingDialogs: boolean;
  loadingMessages: boolean;

  setDialogs: (dialogs: DialogDto[]) => void;
  setModels: (models: ModelDto[]) => void;
  setCurrentDialog: (id: string | null) => void;
  setMessages: (messages: MessageDto[]) => void;
  appendMessage: (message: PendingMessage) => void;
  /** Обновить последнее сообщение assistant (для streaming). */
  updateLastAssistant: (patch: Partial<PendingMessage>) => void;
  setIsSending: (v: boolean) => void;
  setLoadingDialogs: (v: boolean) => void;
  setLoadingMessages: (v: boolean) => void;
  /** После переименования — обновить в списке. */
  patchDialog: (id: string, patch: Partial<DialogDto>) => void;
  removeDialog: (id: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  dialogs: [],
  models: [],
  currentDialogId: null,
  messages: [],
  isSending: false,
  loadingDialogs: false,
  loadingMessages: false,

  setDialogs: (dialogs) => set({ dialogs }),
  setModels: (models) => set({ models }),
  setCurrentDialog: (id) => set({ currentDialogId: id, messages: [] }),
  setMessages: (messages) => set({ messages }),
  appendMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateLastAssistant: (patch) =>
    set((s) => {
      const idx = [...s.messages].reverse().findIndex((m) => m.role === "assistant");
      if (idx === -1) return s;
      const realIdx = s.messages.length - 1 - idx;
      const next = s.messages.slice();
      next[realIdx] = { ...next[realIdx], ...patch };
      return { messages: next };
    }),
  setIsSending: (v) => set({ isSending: v }),
  setLoadingDialogs: (v) => set({ loadingDialogs: v }),
  setLoadingMessages: (v) => set({ loadingMessages: v }),
  patchDialog: (id, patch) =>
    set((s) => ({
      dialogs: s.dialogs.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  removeDialog: (id) =>
    set((s) => ({
      dialogs: s.dialogs.filter((d) => d.id !== id),
      currentDialogId: s.currentDialogId === id ? null : s.currentDialogId,
      messages: s.currentDialogId === id ? [] : s.messages,
    })),
  reset: () =>
    set({
      dialogs: [],
      models: [],
      currentDialogId: null,
      messages: [],
      isSending: false,
    }),
}));
