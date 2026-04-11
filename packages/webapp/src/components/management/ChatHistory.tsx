import { useEffect, useRef, useState, useMemo } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { Dialog, Message } from "../../types.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.use({
  breaks: true, // single newline → <br>
  gfm: true, // GitHub Flavored Markdown (tables, strikethrough, etc.)
});

function renderMarkdown(text: string): string {
  const raw = marked.parse(text) as string;
  return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}

function MessageText({ content, role }: { content: string; role: "user" | "assistant" }) {
  // User messages are plain text (no markdown conversion needed)
  if (role === "user") {
    return <div className="chat-bubble__text chat-bubble__text--plain">{content}</div>;
  }
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className="chat-bubble__text chat-bubble__text--md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

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
              {msg.attachments?.length ? (
                <div className="chat-bubble__attachments">
                  {msg.attachments.map((a, i) => (
                    <a
                      key={`${msg.id}-${i}`}
                      className="chat-bubble__attachment"
                      href={a.previewUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      📄 {a.name}
                    </a>
                  ))}
                </div>
              ) : null}
              {msg.content && <MessageText content={msg.content} role={msg.role} />}
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
