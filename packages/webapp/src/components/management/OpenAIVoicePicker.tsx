import { useI18n } from "../../i18n.js";
import { VoiceList, type VoiceListItem } from "./VoiceList.js";

interface OpenAIVoicePickerProps {
  voice: string;
  onChange: (key: string, value: unknown) => void;
}

type VoiceDef = {
  id: string;
  name: string;
  metaKey:
    | "voice.meta.neutral"
    | "voice.meta.male"
    | "voice.meta.female"
    | "voice.meta.british"
    | "voice.meta.deepMale"
    | "voice.meta.calm";
};

const VOICES: VoiceDef[] = [
  { id: "alloy", name: "Alloy", metaKey: "voice.meta.neutral" },
  { id: "ash", name: "Ash", metaKey: "voice.meta.male" },
  { id: "coral", name: "Coral", metaKey: "voice.meta.female" },
  { id: "echo", name: "Echo", metaKey: "voice.meta.neutral" },
  { id: "fable", name: "Fable", metaKey: "voice.meta.british" },
  { id: "nova", name: "Nova", metaKey: "voice.meta.female" },
  { id: "onyx", name: "Onyx", metaKey: "voice.meta.deepMale" },
  { id: "sage", name: "Sage", metaKey: "voice.meta.calm" },
  { id: "shimmer", name: "Shimmer", metaKey: "voice.meta.female" },
];

export function OpenAIVoicePicker({ voice, onChange }: OpenAIVoicePickerProps) {
  const { t } = useI18n();
  const items: VoiceListItem[] = VOICES.map((v) => ({
    id: v.id,
    name: v.name,
    meta: t(v.metaKey),
    hasPreview: true,
    resolvePreviewUrl: () => `/voice-samples/openai/${v.id}.wav`,
  }));

  return (
    <VoiceList
      items={items}
      selectedId={voice || null}
      onSelect={(item) => onChange("voice", item.id)}
      emptyText=""
    />
  );
}
