import type { ModelSettingDef, UnavailableRule } from "../../types.js";
import { CustomSlider } from "./CustomSlider.js";
import { HeyGenVoicePicker } from "./HeyGenVoicePicker.js";
import { DIDVoicePicker } from "./DIDVoicePicker.js";
import { HeyGenAvatarPicker } from "./HeyGenAvatarPicker.js";
import { HiggsFieldMotionPicker } from "./HiggsFieldMotionPicker.js";
import type { MotionEntry } from "./HiggsFieldMotionPicker.js";

function isPresent(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === "" || v === 0) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function evalRule(rule: UnavailableRule, vals: Record<string, unknown>): boolean {
  if ("and" in rule) return rule.and.every((r) => evalRule(r, vals));
  if ("or" in rule) return rule.or.some((r) => evalRule(r, vals));
  const v = vals[rule.key];
  if (rule.present !== undefined) return isPresent(v);
  if (rule.absent !== undefined) return !isPresent(v);
  if ("eq" in rule) return v === rule.eq;
  if ("neq" in rule) return v !== rule.neq;
  return false;
}

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
        if (def.unavailableIf && evalRule(def.unavailableIf, values)) return null;
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
                imageAssetId={String(values["image_asset_id"] ?? "")}
                onChange={(changes) => Object.entries(changes).forEach(([k, v]) => onChange(k, v))}
              />
            )}
            {def.type === "motion-picker" && (
              <HiggsFieldMotionPicker
                value={(values[def.key] as MotionEntry[] | null) ?? []}
                onChange={(v) => onChange(def.key, v)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
