import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { ElevenLabsVoice, UserVoice } from "../../types.js";

interface ElevenLabsVoicePickerProps {
  voiceId: string;
  onChange: (key: string, value: unknown) => void;
}

export function ElevenLabsVoicePicker({ voiceId, onChange }: ElevenLabsVoicePickerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"official" | "mine">("official");
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [myVoices, setMyVoices] = useState<UserVoice[]>([]);
  const [myVoicesLoading, setMyVoicesLoading] = useState(false);
  const [langFilter, setLangFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (tab === "official" && voices.length === 0) {
      setVoicesLoading(true);
      api.elevenlabsVoices
        .list()
        .then(setVoices)
        .catch(() => setVoices([]))
        .finally(() => setVoicesLoading(false));
    }
    if (tab === "mine") {
      setMyVoicesLoading(true);
      api.userVoices
        .list("elevenlabs")
        .then(setMyVoices)
        .catch(() => setMyVoices([]))
        .finally(() => setMyVoicesLoading(false));
    }
  }, [tab, voices.length]);

  const stopAudio = () => {
    audioRef.current?.pause();
    setPlayingId(null);
  };

  const togglePreview = (id: string, previewUrl: string) => {
    if (playingId === id) {
      stopAudio();
      return;
    }
    stopAudio();
    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    audio.play().catch(() => void 0);
    setPlayingId(id);
    audio.onended = () => setPlayingId(null);
  };

  const toggleMyVoicePreview = async (e: React.MouseEvent, voice: UserVoice) => {
    e.stopPropagation();
    if (playingId === voice.id) {
      stopAudio();
      return;
    }
    try {
      const { url } = await api.userVoices.previewUrl(voice.id);
      togglePreview(voice.id, url);
    } catch {
      // ignore
    }
  };

  const handleDeleteMyVoice = async (e: React.MouseEvent, voice: UserVoice) => {
    e.stopPropagation();
    if (!confirm(`Удалить голос «${voice.name}»?`)) return;
    await api.userVoices.delete(voice.id).catch(() => void 0);
    setMyVoices((prev) => prev.filter((v) => v.id !== voice.id));
    if (voiceId === voice.externalId) onChange("voice_id", "");
  };

  const languages = [
    "all",
    ...Array.from(new Set(voices.map((v) => v.language).filter(Boolean) as string[])).sort(),
  ];

  const filtered = voices.filter(
    (v) =>
      (langFilter === "all" || v.language === langFilter) &&
      (genderFilter === "all" || v.gender === genderFilter),
  );

  return (
    <div className="voice-picker">
      <div className="voice-picker__tabs">
        <button
          className={`voice-picker__tab${tab === "official" ? " voice-picker__tab--active" : ""}`}
          onClick={() => {
            stopAudio();
            setTab("official");
          }}
        >
          {t("uploads.officialVoices")}
        </button>
        <button
          className={`voice-picker__tab${tab === "mine" ? " voice-picker__tab--active" : ""}`}
          onClick={() => {
            stopAudio();
            setTab("mine");
          }}
        >
          {t("uploads.myVoices")}
        </button>
      </div>

      {tab === "official" &&
        (voicesLoading ? (
          <div className="voice-picker__loading">Загрузка голосов…</div>
        ) : (
          <>
            <div className="voice-picker__filters">
              <select
                className="voice-picker__filter-select"
                value={langFilter}
                onChange={(e) => setLangFilter(e.target.value)}
              >
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {l === "all" ? "Все языки" : l}
                  </option>
                ))}
              </select>
              <div className="voice-picker__gender-btns">
                {(["all", "male", "female"] as const).map((g) => (
                  <button
                    key={g}
                    className={`voice-picker__gender-btn${genderFilter === g ? " voice-picker__gender-btn--active" : ""}`}
                    onClick={() => setGenderFilter(g)}
                  >
                    {g === "all" ? "Все" : g === "male" ? "М" : "Ж"}
                  </button>
                ))}
              </div>
            </div>
            <div className="voice-picker__list">
              {filtered.map((voice) => {
                const isSelected = voiceId === voice.voice_id;
                const isPlaying = playingId === voice.voice_id;
                return (
                  <div
                    key={voice.voice_id}
                    className={`voice-picker__item${isSelected ? " voice-picker__item--selected" : ""}`}
                    onClick={() => onChange("voice_id", voice.voice_id)}
                  >
                    <div className="voice-picker__item-info">
                      <span className="voice-picker__item-name">{voice.name}</span>
                      <span className="voice-picker__item-meta">
                        {[
                          voice.language,
                          voice.gender
                            ? voice.gender === "male"
                              ? "М"
                              : voice.gender === "female"
                                ? "Ж"
                                : voice.gender
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    {voice.preview_url && (
                      <button
                        className={`voice-picker__preview-btn${isPlaying ? " voice-picker__preview-btn--playing" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePreview(voice.voice_id, voice.preview_url!);
                        }}
                        title={isPlaying ? "Стоп" : "Прослушать"}
                      >
                        {isPlaying ? "⏹" : "▶"}
                      </button>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="voice-picker__empty">Голоса не найдены</div>
              )}
            </div>
          </>
        ))}

      {tab === "mine" &&
        (myVoicesLoading ? (
          <div className="voice-picker__loading">Загрузка…</div>
        ) : myVoices.length === 0 ? (
          <div className="voice-picker__empty">{t("uploads.emptyVoices")}</div>
        ) : (
          <div className="voice-picker__list">
            {myVoices.map((voice) => {
              const isSelected = voiceId === voice.externalId;
              const isPlaying = playingId === voice.id;
              return (
                <div
                  key={voice.id}
                  className={`voice-picker__item${isSelected ? " voice-picker__item--selected" : ""}`}
                  onClick={() => onChange("voice_id", voice.externalId ?? "")}
                >
                  <div className="voice-picker__item-info">
                    <span className="voice-picker__item-name">{voice.name}</span>
                    <span className="voice-picker__item-meta">
                      {new Date(voice.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {voice.hasAudio && (
                    <button
                      className={`voice-picker__preview-btn${isPlaying ? " voice-picker__preview-btn--playing" : ""}`}
                      onClick={(e) => toggleMyVoicePreview(e, voice)}
                      title={isPlaying ? "Стоп" : "Прослушать"}
                    >
                      {isPlaying ? "⏹" : "▶"}
                    </button>
                  )}
                  <button
                    className="voice-picker__preview-btn"
                    onClick={(e) => handleDeleteMyVoice(e, voice)}
                    title="Удалить"
                  >
                    🗑
                  </button>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
