import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2, Pencil, Check, X as CloseIcon, Sparkles } from "lucide-react";
import clsx from "clsx";
import {
  listDialogs,
  createDialog,
  deleteDialog,
  renameDialog,
  getMessages,
  listModels,
  sendMessageStream,
  type DialogDto,
} from "@/api/chat";
import { ApiError } from "@/api/client";
import { useChatStore, type PendingMessage } from "@/stores/chatStore";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ChatInput } from "@/components/chat/ChatInput";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { Button } from "@/components/common/Button";

const DEFAULT_MODEL_ID = "gpt-4o"; // fallback, если история пустая — юзер переключит

export default function Chat() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const {
    dialogs,
    models,
    currentDialogId,
    messages,
    isSending,
    loadingDialogs,
    loadingMessages,
    setDialogs,
    setModels,
    setCurrentDialog,
    setMessages,
    appendMessage,
    updateLastAssistant,
    setIsSending,
    setLoadingDialogs,
    setLoadingMessages,
    patchDialog,
    removeDialog,
  } = useChatStore();

  const isTelegramLinked = useAuthStore((s) => !!s.user?.isTelegramLinked);
  const openTelegramLinkModal = useUIStore((s) => s.openTelegramLinkModal);
  const pushToast = useUIStore((s) => s.pushToast);

  const [input, setInput] = useState("");
  const [pickedModelId, setPickedModelId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Загрузка моделей и диалогов при маунте ─────────────────────────────
  useEffect(() => {
    if (!isTelegramLinked) return;
    let cancelled = false;

    (async () => {
      setLoadingDialogs(true);
      try {
        const [ms, ds] = await Promise.all([listModels("gpt"), listDialogs("gpt")]);
        if (cancelled) return;
        setModels(ms);
        setDialogs(ds);
        if (ms.length > 0) {
          setPickedModelId((prev) => prev ?? ms.find((m) => m.id === DEFAULT_MODEL_ID)?.id ?? ms[0].id);
        }
      } catch (err) {
        if (!(err instanceof ApiError) || err.code !== "TELEGRAM_NOT_LINKED") {
          pushToast({ type: "error", message: "Не удалось загрузить данные" });
        }
      } finally {
        setLoadingDialogs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTelegramLinked]);

  // ── Подгрузка сообщений при смене диалога ──────────────────────────────
  const loadMessagesFor = useCallback(
    async (dialogId: string) => {
      setLoadingMessages(true);
      try {
        const ms = await getMessages(dialogId);
        setMessages(ms);
      } catch {
        /* ignore */
      } finally {
        setLoadingMessages(false);
      }
    },
    [setMessages, setLoadingMessages],
  );

  useEffect(() => {
    const urlId = params.id ?? null;
    if (urlId && urlId !== currentDialogId) {
      setCurrentDialog(urlId);
      loadMessagesFor(urlId);
    } else if (!urlId && currentDialogId) {
      setCurrentDialog(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // ── Автоскролл ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.content]);

  // ── Отправка сообщения ──────────────────────────────────────────────────
  const onSubmit = async () => {
    const content = input.trim();
    if (!content || isSending) return;

    if (!isTelegramLinked) {
      openTelegramLinkModal("начать общение с нейросетью");
      return;
    }

    // Если нет активного диалога — сначала создаём
    let dialogId = currentDialogId;
    const modelId = pickedModelId ?? DEFAULT_MODEL_ID;

    if (!dialogId) {
      try {
        const d = await createDialog({
          section: "gpt",
          modelId,
          title: content.slice(0, 40),
        });
        dialogId = d.id;
        setDialogs([d, ...dialogs]);
        setCurrentDialog(d.id);
        navigate(`/app/chat/${d.id}`, { replace: true });
      } catch (err) {
        if (err instanceof ApiError && err.code === "TELEGRAM_NOT_LINKED") return;
        pushToast({ type: "error", message: "Не удалось создать чат" });
        return;
      }
    }

    setInput("");

    // Optimistic: добавляем user + пустой assistant-placeholder
    const now = new Date().toISOString();
    const userMsg: PendingMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content,
      mediaUrl: null,
      mediaType: null,
      createdAt: now,
    };
    const assistantMsg: PendingMessage = {
      id: `local-assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      mediaUrl: null,
      mediaType: null,
      createdAt: now,
      pending: true,
      streaming: true,
    };
    appendMessage(userMsg);
    appendMessage(assistantMsg);
    setIsSending(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      for await (const ev of sendMessageStream(dialogId!, content, ctrl.signal)) {
        if (ev.type === "chunk") {
          updateLastAssistant({
            content: (messagesRef.current.at(-1)?.content ?? "") + ev.text,
          });
        } else if (ev.type === "done") {
          updateLastAssistant({ streaming: false, pending: false });
          // Обновляем баланс (если захотим показывать)
        } else if (ev.type === "error") {
          updateLastAssistant({
            streaming: false,
            pending: false,
            error: ev.message,
          });
          pushToast({ type: "error", message: ev.message });
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        updateLastAssistant({
          streaming: false,
          pending: false,
          error: "Ошибка соединения",
        });
        pushToast({ type: "error", message: "Ошибка соединения" });
      } else {
        updateLastAssistant({ streaming: false, pending: false });
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  };

  // Вспомогательный ref на актуальное состояние messages (для корректного apple-chunks)
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const onAbort = () => {
    abortRef.current?.abort();
  };

  const onNewChat = () => {
    setCurrentDialog(null);
    navigate("/app/chat");
  };

  // Модель текущего чата
  const currentDialog = dialogs.find((d) => d.id === currentDialogId);
  const currentModelId = currentDialog?.modelId ?? pickedModelId;
  const currentModel = models.find((m) => m.id === currentModelId);

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="h-14 shrink-0 px-4 border-b border-border bg-bg-card flex items-center gap-3">
        <ChatTitle
          dialog={currentDialog}
          onRename={async (title) => {
            if (!currentDialog) return;
            try {
              await renameDialog(currentDialog.id, title);
              patchDialog(currentDialog.id, { title });
            } catch {
              pushToast({ type: "error", message: "Не удалось переименовать" });
            }
          }}
        />
        <div className="ml-auto flex items-center gap-2">
          <ModelSelector
            models={models}
            currentModelId={currentModelId ?? null}
            onPick={(id) => {
              // Если чата ещё нет — обновляем выбранную модель.
              // Если чат уже есть — нужен отдельный endpoint для смены модели существующего чата,
              // пока — просто запоминаем выбор для нового.
              setPickedModelId(id);
            }}
            disabled={!isTelegramLinked || !!currentDialog}
          />
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div ref={listRef} className="flex-1 overflow-y-auto p-4 md:p-6 max-w-4xl w-full mx-auto">
            {messages.length === 0 && !loadingMessages ? (
              <EmptyState modelName={currentModel?.name} onNewChat={onNewChat} />
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  modelName={m.role === "assistant" ? currentModel?.name : undefined}
                />
              ))
            )}
          </div>

          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={onSubmit}
            onAbort={onAbort}
            sending={isSending}
            disabled={loadingMessages}
            placeholder={
              isTelegramLinked
                ? "Напишите сообщение…"
                : "Привяжите Telegram, чтобы начать общение"
            }
          />
        </div>

        {/* История диалогов — desktop */}
        <aside className="hidden md:flex w-[260px] shrink-0 border-l border-border bg-bg-card flex-col">
          <div className="p-3 border-b border-border">
            <Button
              onClick={onNewChat}
              variant="secondary"
              size="sm"
              fullWidth
              leftIcon={<Plus size={16} />}
            >
              Новый чат
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingDialogs && (
              <div className="p-3 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-10 skeleton" />
                ))}
              </div>
            )}
            {!loadingDialogs && dialogs.length === 0 && (
              <div className="p-4 text-center text-xs text-text-hint">
                Пока нет чатов
              </div>
            )}
            {!loadingDialogs &&
              dialogs.map((d) => (
                <DialogListItem
                  key={d.id}
                  dialog={d}
                  active={d.id === currentDialogId}
                  onPick={() => navigate(`/app/chat/${d.id}`)}
                  onDelete={async () => {
                    if (!confirm("Удалить чат?")) return;
                    try {
                      await deleteDialog(d.id);
                      removeDialog(d.id);
                      if (currentDialogId === d.id) navigate("/app/chat");
                      pushToast({ type: "success", message: "Чат удалён" });
                    } catch {
                      pushToast({ type: "error", message: "Не удалось удалить" });
                    }
                  }}
                />
              ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function ChatTitle({
  dialog,
  onRename,
}: {
  dialog: DialogDto | undefined;
  onRename: (title: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(dialog?.title ?? "");
  }, [dialog?.title, dialog?.id]);

  if (!dialog) {
    return <div className="text-text-secondary font-medium">Новый чат</div>;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              onRename(value.trim());
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          className="!h-8 !text-sm max-w-xs"
        />
        <button
          onClick={() => {
            if (value.trim()) onRename(value.trim());
            setEditing(false);
          }}
          className="text-success hover:opacity-80"
        >
          <Check size={16} />
        </button>
        <button onClick={() => setEditing(false)} className="text-text-hint hover:text-text">
          <CloseIcon size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="font-semibold truncate">{dialog.title || "Без названия"}</div>
      <button
        onClick={() => setEditing(true)}
        className="text-text-hint hover:text-text transition-colors shrink-0"
        aria-label="Переименовать"
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

function DialogListItem({
  dialog,
  active,
  onPick,
  onDelete,
}: {
  dialog: DialogDto;
  active: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={clsx(
        "group px-3 py-2.5 border-b border-border cursor-pointer transition-colors flex items-start gap-2",
        active ? "bg-bg-secondary" : "hover:bg-bg-secondary",
      )}
      onClick={onPick}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {dialog.title || "Без названия"}
        </div>
        <div className="text-[11px] text-text-hint mt-0.5 truncate">
          {dialog.modelId} · {new Date(dialog.updatedAt).toLocaleDateString("ru-RU")}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 text-text-hint hover:text-danger shrink-0 transition-opacity"
        aria-label="Удалить"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function EmptyState({
  modelName,
  onNewChat,
}: {
  modelName?: string;
  onNewChat: () => void;
}) {
  const examples = [
    "Напиши план поста про новый продукт",
    "Объясни квантовую запутанность простыми словами",
    "Придумай название для кофейни в горном посёлке",
    "Переведи и адаптируй этот текст для русской аудитории",
  ];
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-full bg-accent-lighter flex items-center justify-center mb-4">
        <Sparkles size={28} className="text-accent" />
      </div>
      <h2 className="text-2xl font-bold mb-2">С чего начнём?</h2>
      <p className="text-text-secondary mb-8">
        {modelName
          ? `Вы пишете ${modelName}. Спросите что угодно.`
          : "Выберите модель и спросите что угодно."}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-xl w-full">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={onNewChat}
            className="card px-3 py-3 text-left text-sm text-text-secondary hover:text-text hover:border-accent transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
