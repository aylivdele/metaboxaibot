import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { ElevenLabsVoice } from "../../types.js";
import { VoiceList, type VoiceListItem } from "./VoiceList.js";

interface ElevenLabsVoicePickerProps {
  voiceId: string;
  onChange: (key: string, value: unknown) => void;
}

/**
 * Picker для tts-el модели — показывает ТОЛЬКО официальные ElevenLabs voices.
 *
 * Клонированные голоса юзеров после миграции живут на Cartesia → доступны в
 * tts-cartesia модели через CartesiaVoicePicker. tts-el остаётся для тех кто
 * хочет именно официальный EL-каталог (нейтральные голоса с уникальной
 * выразительностью multilingual_v2). Cтарые legacy-EL голоса не показываем
 * здесь намеренно — их единственный путь использования теперь через
 * CartesiaVoicePicker, где `resolveVoiceForTTS` принудительно мигрирует их
 * на Cartesia и переключает адаптер.
 */
export function ElevenLabsVoicePicker({ voiceId, onChange }: ElevenLabsVoicePickerProps) {
  const { t } = useI18n();
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [langFilter, setLangFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");

  useEffect(() => {
    if (voices.length === 0) {
      setVoicesLoading(true);
      api.elevenlabsVoices
        .list()
        .then(setVoices)
        .catch(() => setVoices([]))
        .finally(() => setVoicesLoading(false));
    }
  }, [voices.length]);

  const selectOfficial = (item: VoiceListItem) => {
    onChange("voice_id", item.id);
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
        ? v.gender === "male"
          ? t("picker.genderM")
          : v.gender === "female"
            ? t("picker.genderF")
            : v.gender
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    hasPreview: !!v.preview_url,
    resolvePreviewUrl: v.preview_url ? () => v.preview_url! : undefined,
  }));

  return (
    <div className="voice-picker">
      {voicesLoading ? (
        <div className="voice-picker__loading">{t("picker.loadingVoices")}</div>
      ) : (
        <>
          <div className="voice-picker__hint">💡 {t("uploads.elevenlabsLangHint")}</div>
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
      )}
    </div>
  );
}
