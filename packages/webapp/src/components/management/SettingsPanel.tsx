import type { ModelSettingDef } from "../../types.js";
import { CustomSlider } from "./CustomSlider.js";
import { HeyGenVoicePicker } from "./HeyGenVoicePicker.js";
import { DIDVoicePicker } from "./DIDVoicePicker.js";
import { HeyGenAvatarPicker } from "./HeyGenAvatarPicker.js";

interface SettingsPanelProps {
  settings: ModelSettingDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function SettingsPanel({ settings, values, onChange }: SettingsPanelProps) {
  if (!settings || settings.length === 0) return null;
  return (
    <div className="settings-panel">
      {settings.map((def) => {
        const val = values[def.key] !== undefined ? values[def.key] : def.default;
        return (
          <div key={def.key} className="settings-panel__row">
            <span className="settings-panel__label">{def.label}</span>
            {def.description && <span className="settings-panel__desc">{def.description}</span>}
            {def.type === "select" && (
              <div className="image-settings-ratios">
                {def.options!.map((opt) => (
                  <button
                    key={String(opt.value)}
                    className={`ratio-btn${val === opt.value ? " ratio-btn--active" : ""}`}
                    onClick={() => onChange(def.key, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {def.type === "slider" && (
              <div className="settings-panel__slider-row">
                <CustomSlider
                  min={def.min ?? 0}
                  max={def.max ?? 100}
                  step={def.step ?? 1}
                  value={Number(val ?? def.min ?? 0)}
                  onChange={(v) => onChange(def.key, v)}
                />
                <span className="settings-panel__slider-value">{Number(val ?? def.min ?? 0)}</span>
              </div>
            )}
            {def.type === "toggle" && (
              <div className="settings-panel__toggle-row">
                <label className="settings-panel__toggle-label">
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={(e) => onChange(def.key, e.target.checked)}
                  />
                  <span className="settings-panel__toggle-track" />
                </label>
              </div>
            )}
            {def.type === "text" && (
              <textarea
                className="settings-panel__textarea"
                value={String(val ?? "")}
                rows={2}
                onChange={(e) => onChange(def.key, e.target.value)}
              />
            )}
            {def.type === "number" && (
              <input
                type="number"
                className="settings-panel__number"
                min={def.min}
                max={def.max}
                placeholder="auto"
                value={val !== null && val !== undefined ? String(val) : ""}
                onChange={(e) => onChange(def.key, e.target.value ? Number(e.target.value) : null)}
              />
            )}
            {def.type === "color" && (
              <div className="settings-panel__color-row">
                <input
                  type="color"
                  className="settings-panel__color-input"
                  value={String(val ?? "#FFFFFF")}
                  onChange={(e) => onChange(def.key, e.target.value)}
                />
                <span className="settings-panel__color-hex">{String(val ?? "#FFFFFF")}</span>
              </div>
            )}
            {def.type === "voice-picker" && (
              <HeyGenVoicePicker
                voiceId={String(values["voice_id"] ?? "")}
                voiceUrl={String(values["voice_url"] ?? "")}
                voiceS3Key={String(values["voice_s3key"] ?? "")}
                onChange={onChange}
              />
            )}
            {def.type === "did-voice-picker" && (
              <DIDVoicePicker
                voiceId={String(values["voice_id"] ?? "")}
                voiceUrl={String(values["voice_url"] ?? "")}
                voiceS3Key={String(values["voice_s3key"] ?? "")}
                onChange={onChange}
              />
            )}
            {def.type === "avatar-picker" && (
              <HeyGenAvatarPicker
                avatarId={String(values["avatar_id"] ?? "")}
                avatarPhotoUrl={String(values["avatar_photo_url"] ?? "")}
                avatarPhotoS3Key={String(values["avatar_photo_s3key"] ?? "")}
                onChange={onChange}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
