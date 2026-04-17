import { useMemo } from "react";
import clsx from "clsx";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { renderMarkdown } from "@/utils/markdown";
import type { PendingMessage } from "@/stores/chatStore";

interface Props {
  message: PendingMessage;
  modelName?: string;
}

export function MessageBubble({ message, modelName }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const html = useMemo(
    () => (isUser ? null : renderMarkdown(message.content || "")),
    [isUser, message.content],
  );

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={clsx(
        "flex w-full mb-4 group",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={clsx(
          "relative max-w-[85%] md:max-w-[75%] px-4 py-3 rounded",
          isUser
            ? "bg-[color:var(--accent-lighter)] text-text"
            : "bg-bg-card border border-border",
        )}
      >
        {!isUser && modelName && (
          <div className="text-[11px] font-semibold text-accent uppercase tracking-wide mb-1">
            {modelName}
          </div>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {message.content}
          </div>
        ) : (
          <div
            className="prose-invert text-sm leading-relaxed break-words [&_p]:my-2 [&_code]:bg-bg-elevated [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.9em] [&_pre]:bg-bg-elevated [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2 [&_a]:text-accent [&_a]:underline [&_ul]:ml-5 [&_ol]:ml-5 [&_li]:my-1"
            dangerouslySetInnerHTML={{ __html: html ?? "" }}
          />
        )}

        {message.streaming && (
          <span className="inline-block w-1.5 h-3.5 bg-accent rounded-sm ml-0.5 align-middle animate-pulse" />
        )}

        {message.error && (
          <div className="mt-2 text-xs text-danger">
            {message.error}
          </div>
        )}

        {!message.pending && message.content && (
          <button
            type="button"
            onClick={onCopy}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-bg-elevated hover:bg-bg-secondary rounded-sm px-1.5 py-1 text-text-hint hover:text-text"
            aria-label="Копировать"
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
