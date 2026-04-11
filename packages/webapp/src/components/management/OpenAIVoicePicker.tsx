import { VoiceList, type VoiceListItem } from "./VoiceList.js";

interface OpenAIVoicePickerProps {
  voice: string;
  onChange: (key: string, value: unknown) => void;
}

const VOICES: { id: string; name: string; meta: string }[] = [
  { id: "alloy", name: "Alloy", meta: "Нейтральный" },
  { id: "ash", name: "Ash", meta: "Мужской" },
  { id: "coral", name: "Coral", meta: "Женский" },
  { id: "echo", name: "Echo", meta: "Нейтральный" },
  { id: "fable", name: "Fable", meta: "Британский" },
  { id: "nova", name: "Nova", meta: "Женский" },
  { id: "onyx", name: "Onyx", meta: "Глубокий мужской" },
  { id: "sage", name: "Sage", meta: "Спокойный" },
  { id: "shimmer", name: "Shimmer", meta: "Женский" },
];

export function OpenAIVoicePicker({ voice, onChange }: OpenAIVoicePickerProps) {
  const items: VoiceListItem[] = VOICES.map((v) => ({
    id: v.id,
    name: v.name,
    meta: v.meta,
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
