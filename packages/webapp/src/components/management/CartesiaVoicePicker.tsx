import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { CartesiaVoice, UserVoice } from "../../types.js";
import { VoiceList, type VoiceListItem } from "./VoiceList.js";

interface CartesiaVoicePickerProps {
  voiceId: string;
  onChange: (key: string, value: unknown) => void;
}

/**
 * Picker для tts-cartesia модели. Показывает официальные Cartesia voices +
 * клонированные голоса юзера (которые после миграции тоже на Cartesia).
 *
 * Зеркалит ElevenLabsVoicePicker, но без вкладки "Мои" в чужой реализации —
 * клонированные голоса юзера показываются на отдельной вкладке "Мои голоса".
 */
export function CartesiaVoicePicker({ voiceId, onChange }: CartesiaVoicePickerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"official" | "mine">("official");
  const [voices, setVoices] = useState<CartesiaVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [myVoices, setMyVoices] = useState<UserVoice[]>([]);
  const [myVoicesLoading, setMyVoicesLoading] = useState(false);
  const [langFilter, setLangFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");

  useEffect(() => {
    if (tab === "official" && voices.length === 0) {
      setVoicesLoading(true);
      api.cartesiaVoices
        .list()
        .then(setVoices)
        .catch(() => setVoices([]))
        .finally(() => setVoicesLoading(false));
    }
    if (tab === "mine") {
      setMyVoicesLoading(true);
      // Все клонированные голоса юзера: Cartesia (новые) + legacy ElevenLabs.
      // Audio-processor под капотом подбирает правильный TTS-адаптер по
      // фактическому provider'у через resolveVoiceForTTS.
      api.userVoices
        .list()
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
    // Persist стабильный UserVoice.id — worker резолвит фактический external
    // voice_id и стики ключ через `resolveVoiceForTTS`.
    onChange("voice_id", voice.id);
  };

  const uniqueLanguages = Array.from(
    new Set(voices.map((v) => v.language).filter(Boolean) as string[]),
  ).sort();
  const showLanguage = uniqueLanguages.length > 1;
  const languages = ["all", ...uniqueLanguages];

  const filtered = voices.filter(
    (v) =>
      (langFilter === "all" || v.language === langFilter) &&
      (genderFilter === "all" || v.gender === genderFilter),
  );

  const officialItems: VoiceListItem[] = filtered.map((v) => ({
    id: v.voice_id,
    name: v.name,
    meta: [
      showLanguage ? v.language : null,
      v.gender
        ? v.gender === "masculine" || v.gender === "male"
          ? t("picker.genderM")
          : v.gender === "feminine" || v.gender === "female"
            ? t("picker.genderF")
            : v.gender
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    hasPreview: !!v.preview_url,
    resolvePreviewUrl: v.preview_url ? () => v.preview_url! : undefined,
  }));

  const mineItems: VoiceListItem[] = myVoices.map((v) => ({
    id: v.id,
    name: v.name,
    meta: new Date(v.createdAt).toLocaleDateString(),
    hasPreview: v.hasAudio,
    resolvePreviewUrl: v.hasAudio
      ? async () => (await api.userVoices.previewUrl(v.id)).url
      : undefined,
  }));

  // voice_id is the local UserVoice.id for cloned voices. Fall back to
  // externalId for records saved before this migration (backward compat).
  const mineSelectedId = voiceId
    ? (myVoices.find((v) => v.id === voiceId)?.id ??
      myVoices.find((v) => v.externalId === voiceId)?.id ??
      null)
    : null;

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
          <div className="voice-picker__loading">{t("picker.loadingVoices")}</div>
        ) : (
          <>
            <div className="voice-picker__filters">
              {showLanguage && (
                <select
                  className="voice-picker__filter-select"
                  value={langFilter}
                  onChange={(e) => setLangFilter(e.target.value)}
                >
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {l === "all" ? t("picker.langAll") : l}
                    </option>
                  ))}
                </select>
              )}
              <div className="voice-picker__gender-btns">
                {(["all", "male", "female"] as const).map((g) => (
                  <button
                    key={g}
                    className={`voice-picker__gender-btn${genderFilter === g ? " voice-picker__gender-btn--active" : ""}`}
                    onClick={() => setGenderFilter(g)}
                  >
                    {g === "all"
                      ? t("picker.genderAll")
                      : g === "male"
                        ? t("picker.genderM")
                        : t("picker.genderF")}
                  </button>
                ))}
              </div>
            </div>
            <VoiceList
              items={officialItems}
              selectedId={voiceId}
              onSelect={selectOfficial}
              emptyText={t("picker.noVoices")}
            />
          </>
        ))}

      {tab === "mine" &&
        (myVoicesLoading ? (
          <div className="voice-picker__loading">{t("picker.loading")}</div>
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
