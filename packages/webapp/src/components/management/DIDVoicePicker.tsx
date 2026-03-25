import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { DIDVoice, UserUpload } from "../../types.js";

interface DIDVoicePickerProps {
  voiceId: string;
  voiceUrl: string;
  onChange: (key: string, value: unknown) => void;
}

export function DIDVoicePicker({ voiceId, voiceUrl, onChange }: DIDVoicePickerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"official" | "uploads">(voiceUrl ? "uploads" : "official");
  const [voices, setVoices] = useState<DIDVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [langFilter, setLangFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (tab === "official" && voices.length === 0) {
      setVoicesLoading(true);
      api.didVoices
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
  };

  const selectOfficial = (id: string, provider: string) => {
    onChange("voice_id", id);
    onChange("voice_provider", provider);
    onChange("voice_url", "");
  };

  const selectUpload = (url: string) => {
    onChange("voice_url", url);
    onChange("voice_id", "");
    onChange("voice_provider", "");
  };

  const languages = [
    "all",
    ...Array.from(new Set(voices.map((v) => v.language).filter(Boolean))).sort(),
  ];
  const providers = [
    "all",
    ...Array.from(new Set(voices.map((v) => v.provider).filter(Boolean))).sort(),
  ];
  const filtered = voices.filter(
    (v) =>
      (langFilter === "all" || v.language === langFilter) &&
      (genderFilter === "all" || v.gender === genderFilter) &&
      (providerFilter === "all" || v.provider === providerFilter),
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
          className={`voice-picker__tab${tab === "uploads" ? " voice-picker__tab--active" : ""}`}
          onClick={() => {
            stopAudio();
            setTab("uploads");
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
              <select
                className="voice-picker__filter-select"
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p === "all" ? "Все провайдеры" : p}
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
              {filtered.map((voice) => (
                <div
                  key={voice.id}
                  className={`voice-picker__item${voiceId === voice.id && !voiceUrl ? " voice-picker__item--selected" : ""}`}
                  onClick={() => selectOfficial(voice.id, voice.provider)}
                >
                  <div className="voice-picker__item-info">
                    <span className="voice-picker__item-name">{voice.name}</span>
                    <span className="voice-picker__item-meta">
                      {voice.provider} · {voice.language}
                      {voice.gender
                        ? ` · ${voice.gender === "male" ? "М" : voice.gender === "female" ? "Ж" : voice.gender}`
                        : ""}
                    </span>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
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
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className={`voice-picker__item${voiceUrl === upload.url ? " voice-picker__item--selected" : ""}`}
                onClick={() => selectUpload(upload.url)}
              >
                <div className="voice-picker__item-info">
                  <span className="voice-picker__item-name">{upload.name}</span>
                  <span className="voice-picker__item-meta">
                    {new Date(upload.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
