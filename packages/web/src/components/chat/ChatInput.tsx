import { useRef, useEffect } from "react";
import { Send, Square } from "lucide-react";
import clsx from "clsx";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onAbort?: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onAbort,
  disabled,
  sending,
  placeholder = "Напишите сообщение…",
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !sending) onSubmit();
    }
  };

  return (
    <div className="border-t border-border bg-bg-card p-3">
      <div className="max-w-4xl mx-auto">
        <div
          className={clsx(
            "relative flex items-end gap-2 rounded-lg border transition-colors",
            "bg-bg-elevated border-border focus-within:border-accent",
          )}
        >
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={clsx(
              "flex-1 resize-none !bg-transparent !border-0 !ring-0",
              "!px-4 !py-3 text-[15px] max-h-[200px] min-h-[44px]",
              "focus:!shadow-none focus:!border-0",
            )}
            style={{ outline: "none" }}
          />
          {sending ? (
            <button
              type="button"
              onClick={onAbort}
              className="m-1.5 shrink-0 h-9 w-9 rounded flex items-center justify-center bg-danger text-white hover:opacity-90"
              aria-label="Остановить"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || !value.trim()}
              onClick={onSubmit}
              className="m-1.5 shrink-0 h-9 w-9 rounded flex items-center justify-center btn-primary !p-0 disabled:opacity-40"
              aria-label="Отправить"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <div className="text-[11px] text-text-hint text-right mt-1.5 pr-1">
          Enter — отправить, Shift+Enter — новая строка
        </div>
      </div>
    </div>
  );
}
