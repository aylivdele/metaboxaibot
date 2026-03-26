import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { HeyGenVoice, UserUpload } from "../../types.js";

interface HeyGenVoicePickerProps {
  /** Currently selected official voice_id (empty string = none) */
  voiceId: string;
  /** Currently selected user upload URL stored as voice_url (empty string = none) */
  voiceUrl: string;
  /** S3 key of the selected upload — used to identify selection reliably across URL refreshes */
  voiceS3Key: string;
  /** Called when user picks an official voice: sets voice_id, clears voice_url */
  onChange: (key: string, value: unknown) => void;
}

export function HeyGenVoicePicker({
  voiceId,
  voiceUrl,
  voiceS3Key,
  onChange,
}: HeyGenVoicePickerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"official" | "uploads">(
    voiceUrl || voiceS3Key ? "uploads" : "official",
  );
  const [voices, setVoices] = useState<HeyGenVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [langFilter, setLangFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
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
    if (tab === "uploads") {
      setUploadsLoading(true);
      api.uploads
        .list("voice")
        .then(setUploads)
        .catch(() => setUploads([]))
        .finally(() => setUploadsLoading(false));
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

  const selectUpload = (upload: UserUpload) => {
    onChange("voice_url", upload.url);
    onChange("voice_s3key", upload.s3Key ?? "");
    onChange("voice_id", "");
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
          onClick={() => setTab("official")}
        >
          {t("uploads.officialVoices")}
        </button>
        <button
          className={`voice-picker__tab${tab === "uploads" ? " voice-picker__tab--active" : ""}`}
          onClick={() => setTab("uploads")}
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
                  className={`voice-picker__item${voiceId === voice.voice_id && !voiceUrl ? " voice-picker__item--selected" : ""}`}
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

      {tab === "uploads" &&
        (uploadsLoading ? (
          <div className="voice-picker__loading">Загрузка…</div>
        ) : uploads.length === 0 ? (
          <div className="voice-picker__empty">{t("uploads.emptyVoices")}</div>
        ) : (
          <div className="voice-picker__list">
            {uploads.map((upload) => {
              const isSelected = upload.s3Key
                ? voiceS3Key === upload.s3Key
                : voiceUrl === upload.url;
              return (
                <div
                  key={upload.id}
                  className={`voice-picker__item${isSelected ? " voice-picker__item--selected" : ""}`}
                  onClick={() => selectUpload(upload)}
                >
                  <div className="voice-picker__item-info">
                    <span className="voice-picker__item-name">{upload.name}</span>
                    <span className="voice-picker__item-meta">
                      {new Date(upload.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className={`voice-picker__play-btn${playingId === upload.id ? " voice-picker__play-btn--playing" : ""}${loadingId === upload.id ? " voice-picker__play-btn--loading" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      playPreview(upload.id, upload.url);
                    }}
                    title="Прослушать"
                  >
                    {loadingId === upload.id ? "⏳" : playingId === upload.id ? "⏹" : "▶"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
