import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n.js";

export interface VoiceListItem {
  /** Stable key within the list. Compared against `selectedId` to mark selection. */
  id: string;
  name: string;
  meta?: string;
  /** When true, a play button is rendered and `resolvePreviewUrl` is called on click. */
  hasPreview: boolean;
  /** Either returns a URL directly or resolves one lazily (e.g. via API). */
  resolvePreviewUrl?: () => string | Promise<string>;
}

interface VoiceListProps {
  items: VoiceListItem[];
  selectedId: string | null;
  onSelect: (item: VoiceListItem) => void;
  emptyText: string;
}

/**
 * Unified voice list — shared by HeyGen / ElevenLabs / D-ID pickers
 * (both "official" and "my voices" tabs). Matches the style of the
 * HeyGen official voices tab. Not used on the standalone Voices page,
 * which has its own rename/delete affordances.
 */
export function VoiceList({ items, selectedId, onSelect, emptyText }: VoiceListProps) {
  const { t } = useI18n();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
    setLoadingId(null);
  };

  useEffect(() => () => stopAudio(), []);

  const play = async (item: VoiceListItem) => {
    if (playingId === item.id || loadingId === item.id) {
      stopAudio();
      return;
    }
    stopAudio();
    if (!item.resolvePreviewUrl) return;

    setLoadingId(item.id);
    let url: string;
    try {
      url = await item.resolvePreviewUrl();
    } catch (err) {
      console.error("Failed to resolve voice preview URL", err);
      setLoadingId(null);
      return;
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    audio.addEventListener(
      "canplay",
      () => {
        setLoadingId((cur) => (cur === item.id ? null : cur));
        setPlayingId(item.id);
      },
      { once: true },
    );
    audio.play().catch(() => setLoadingId((cur) => (cur === item.id ? null : cur)));
    audio.onended = () => setPlayingId((cur) => (cur === item.id ? null : cur));
  };

  if (items.length === 0) {
    return <div className="voice-picker__empty">{emptyText}</div>;
  }

  return (
    <div className="voice-picker__list">
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        const isPlaying = playingId === item.id;
        const isLoading = loadingId === item.id;
        return (
          <div
            key={item.id}
            className={`voice-picker__item${isSelected ? " voice-picker__item--selected" : ""}`}
            onClick={() => onSelect(item)}
          >
            <div className="voice-picker__item-info">
              <span className="voice-picker__item-name">{item.name}</span>
              {item.meta && <span className="voice-picker__item-meta">{item.meta}</span>}
            </div>
            {item.hasPreview && (
              <button
                className={`voice-picker__play-btn${isPlaying ? " voice-picker__play-btn--playing" : ""}${isLoading ? " voice-picker__play-btn--loading" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  void play(item);
                }}
                title={isPlaying ? t("picker.stop") : t("picker.play")}
              >
                {isLoading ? "⏳" : isPlaying ? "⏹" : "▶"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
