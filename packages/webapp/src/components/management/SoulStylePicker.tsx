import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import type { SoulStyle } from "../../types.js";

interface SoulStylePickerProps {
  /** Currently selected style_id */
  styleId: string;
  onChange: (key: string, value: unknown) => void;
}

export function SoulStylePicker({ styleId, onChange }: SoulStylePickerProps) {
  const [styles, setStyles] = useState<SoulStyle[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.soulStyles
      .list()
      .then(setStyles)
      .catch(() => setStyles([]))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (style: SoulStyle) => {
    if (style.id === styleId) {
      onChange("style_id", null);
    } else {
      onChange("style_id", style.id);
    }
  };

  if (loading) {
    return <div className="motion-picker__loading">Loading styles…</div>;
  }

  if (styles.length === 0) {
    return <div className="motion-picker__empty">No styles available</div>;
  }

  return (
    <div className="motion-picker">
      {styleId && (
        <button className="voice-picker__create-btn" onClick={() => onChange("style_id", null)}>
          ✕ {styles.find((s) => s.id === styleId)?.name ?? styleId}
        </button>
      )}
      <div className="motion-picker__grid">
        {styles.map((style) => {
          const selected = style.id === styleId;
          return (
            <div
              key={style.id}
              className={`motion-picker__item${selected ? " motion-picker__item--selected" : ""}`}
              onClick={() => toggle(style)}
            >
              <img
                className="motion-picker__preview-img"
                src={style.preview_url}
                alt={style.name}
              />
              <span className="motion-picker__item-name">{style.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
