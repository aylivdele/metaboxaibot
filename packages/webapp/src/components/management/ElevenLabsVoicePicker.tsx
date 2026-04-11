import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { ElevenLabsVoice, UserVoice } from "../../types.js";
import { VoiceList, type VoiceListItem } from "./VoiceList.js";

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

  const selectOfficial = (item: VoiceListItem) => {
    onChange("voice_id", item.id);
  };

  const selectCloned = (item: VoiceListItem) => {
    const voice = myVoices.find((v) => v.id === item.id);
    if (!voice) return;
    onChange("voice_id", voice.externalId ?? "");
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

  const officialItems: VoiceListItem[] = filtered.map((v) => ({
    id: v.voice_id,
    name: v.name,
    meta: [
      v.language,
      v.gender ? (v.gender === "male" ? "М" : v.gender === "female" ? "Ж" : v.gender) : null,
    ]
      .filter(Boolean)
      .join(" · "),
    hasPreview: !!v.preview_url,
    resolvePreviewUrl: v.preview_url ? () => v.preview_url! : undefined,
  }));

  const mineItems: VoiceListItem[] = myVoices.map((v) => ({
    id: v.id,
    name: v.name,
    meta: `ElevenLabs · ${new Date(v.createdAt).toLocaleDateString()}`,
    hasPreview: v.hasAudio,
    resolvePreviewUrl: v.hasAudio
      ? async () => (await api.userVoices.previewUrl(v.id)).url
      : undefined,
  }));

  const mineSelectedId = myVoices.find((v) => v.externalId === voiceId)?.id ?? null;

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
          className={`voice-picker__tab${tab === "mine" ? " voice-picker__tab--active" : ""}`}
          onClick={() => setTab("mine")}
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
            <VoiceList
              items={officialItems}
              selectedId={voiceId}
              onSelect={selectOfficial}
              emptyText="Голоса не найдены"
            />
          </>
        ))}

      {tab === "mine" &&
        (myVoicesLoading ? (
          <div className="voice-picker__loading">Загрузка…</div>
        ) : (
          <VoiceList
            items={mineItems}
            selectedId={mineSelectedId}
            onSelect={selectCloned}
            emptyText={t("uploads.emptyVoices")}
          />
        ))}
    </div>
  );
}
