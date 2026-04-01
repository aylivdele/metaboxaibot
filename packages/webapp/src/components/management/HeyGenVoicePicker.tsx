import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { HeyGenVoice, UserVoice } from "../../types.js";

interface HeyGenVoicePickerProps {
  voiceId: string;
  onChange: (key: string, value: unknown) => void;
}

export function HeyGenVoicePicker({ voiceId, onChange }: HeyGenVoicePickerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"official" | "mine">("official");
  const [voices, setVoices] = useState<HeyGenVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [myVoices, setMyVoices] = useState<UserVoice[]>([]);
  const [myVoicesLoading, setMyVoicesLoading] = useState(false);
  const [langFilter, setLangFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (tab === "official" && voices.length === 0) {
      setVoicesLoading(true);
      api.heygenVoices
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
    setLoadingId(null);
  };

  const playPreview = (id: string, url: string) => {
    if (playingId === id || loadingId === id) {
      stopAudio();
      return;
    }
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    setLoadingId(id);
    audio.addEventListener(
      "canplay",
      () => {
        setLoadingId(null);
        setPlayingId(id);
      },
      { once: true },
    );
    audio.play().catch(() => setLoadingId(null));
    audio.onended = () => setPlayingId(null);
  };

  const selectOfficial = (id: string) => {
    onChange("voice_id", id);
    onChange("voice_url", "");
    onChange("voice_s3key", "");
  };

  const selectClonedVoice = (voice: UserVoice) => {
    onChange("voice_id", voice.externalId ?? "");
    onChange("voice_url", "");
    onChange("voice_s3key", "");
  };

  const languages = [
    "all",
    ...Array.from(new Set(voices.map((v) => v.language).filter(Boolean))).sort(),
  ];
  const filteredVoices = voices.filter(
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
              {filteredVoices.map((voice) => (
                <div
                  key={voice.voice_id}
                  className={`voice-picker__item${voiceId === voice.voice_id ? " voice-picker__item--selected" : ""}`}
                  onClick={() => selectOfficial(voice.voice_id)}
                >
                  <div className="voice-picker__item-info">
                    <span className="voice-picker__item-name">{voice.name}</span>
                    <span className="voice-picker__item-meta">
                      {voice.language}
                      {voice.gender
                        ? ` · ${voice.gender === "male" ? "М" : voice.gender === "female" ? "Ж" : voice.gender}`
                        : ""}
                    </span>
                  </div>
                  {voice.preview_audio && (
                    <button
                      className={`voice-picker__play-btn${playingId === voice.voice_id ? " voice-picker__play-btn--playing" : ""}${loadingId === voice.voice_id ? " voice-picker__play-btn--loading" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        playPreview(voice.voice_id, voice.preview_audio!);
                      }}
                      title="Прослушать"
                    >
                      {loadingId === voice.voice_id
                        ? "⏳"
                        : playingId === voice.voice_id
                          ? "⏹"
                          : "▶"}
                    </button>
                  )}
                </div>
              ))}
              {filteredVoices.length === 0 && (
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
              return (
                <div
                  key={voice.id}
                  className={`voice-picker__item${isSelected ? " voice-picker__item--selected" : ""}`}
                  onClick={() => selectClonedVoice(voice)}
                >
                  <div className="voice-picker__item-info">
                    <span className="voice-picker__item-name">{voice.name}</span>
                    <span className="voice-picker__item-meta">
                      ElevenLabs · {new Date(voice.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {voice.previewUrl && (
                    <button
                      className={`voice-picker__play-btn${playingId === voice.id ? " voice-picker__play-btn--playing" : ""}${loadingId === voice.id ? " voice-picker__play-btn--loading" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        playPreview(voice.id, voice.previewUrl!);
                      }}
                      title="Прослушать"
                    >
                      {loadingId === voice.id ? "⏳" : playingId === voice.id ? "⏹" : "▶"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
