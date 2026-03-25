import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { Dialog, Message } from "../../types.js";

interface ChatHistoryProps {
  dialog: Dialog;
  onBack: () => void;
}

export function ChatHistory({ dialog, onBack }: ChatHistoryProps) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    api.dialogs
      .messages(dialog.id)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dialog.id]);

  useEffect(() => {
    if (!loading && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [loading, messages]);

  return (
    <div className="chat-view">
      <div className="chat-view__header">
        <button className="chat-back-btn" onClick={onBack}>
          {t("manage.back")}
        </button>
        <div className="chat-view__title">
          <div className="chat-view__name">{dialog.title ?? dialog.modelId}</div>
          <div className="chat-view__model">{dialog.modelId}</div>
        </div>
      </div>

      <div className="chat-messages" ref={containerRef}>
        {loading && <div className="chat-empty">{t("common.loading")}</div>}
        {!loading && messages.length === 0 && (
          <div className="chat-empty">{t("manage.noMessages")}</div>
        )}
        {!loading &&
          messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
              {msg.mediaUrl && msg.mediaType === "image" && (
                <img className="chat-bubble__image" src={msg.mediaUrl} alt="" loading="lazy" />
              )}
              {msg.content && <div className="chat-bubble__text">{msg.content}</div>}
              <div className="chat-bubble__time">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
