// ── StandaloneCard ────────────────────────────────────────────────────────────

import { MODEL_TRANSLATIONS } from "@metabox/shared-browser";
import { useState } from "react";
import { useI18n } from "../../i18n";
import type { Model } from "../../types";
import { modelCostLabel } from "../../utils/mediaSettingsViewHelpers";
import { SettingsPanel } from "./SettingsPanel";

interface StandaloneCardProps {
  model: Model;
  isActive: boolean;
  savedId: string | null;
  allModelSettings: Record<string, Record<string, unknown>>;
  onActivate: (modelId: string) => Promise<void>;
  onSettingChange: (key: string, value: unknown) => void;
  onReset: (modelId: string) => void;
}

export function StandaloneCard({
  model,
  isActive,
  savedId,
  allModelSettings,
  onActivate,
  onSettingChange,
  onReset,
}: StandaloneCardProps) {
  const { t, locale } = useI18n();
  const modelT = (MODEL_TRANSLATIONS[locale] ?? MODEL_TRANSLATIONS["en"] ?? {})[model.id];
  const [activating, setActivating] = useState(false);
  const cost = modelCostLabel(model, allModelSettings[model.id] ?? {}, t);

  const handleActivate = async () => {
    setActivating(true);
    try {
      await onActivate(model.id);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className={`family-card${isActive ? " family-card--active" : ""}`}>
      <div className="family-card__header">
        <span className="family-card__name">{modelT?.name ?? model.name}</span>
        {isActive && <span className="family-card__badge">{t("imageSettings.active")}</span>}
      </div>
      {(modelT?.descriptionOverride ??
        model.descriptionOverride ??
        modelT?.description ??
        model.description) && (
        <p className="family-card__desc">
          {modelT?.descriptionOverride ??
            model.descriptionOverride ??
            modelT?.description ??
            model.description}
        </p>
      )}
      {model.settings.length > 0 && (
        <div className="family-card__row family-card__row--settings">
          <SettingsPanel
            settings={model.settings}
            values={allModelSettings[model.id] ?? {}}
            onChange={onSettingChange}
          />
        </div>
      )}
      <div className="family-card__btn-row">
        <button
          className="family-card__activate-btn"
          onClick={() => void handleActivate()}
          disabled={activating || isActive}
        >
          {activating
            ? t("imageSettings.activating")
            : isActive
              ? t("imageSettings.activated")
              : t("imageSettings.activate")}
        </button>
        {model.settings.length > 0 && (
          <button
            className="family-card__reset-btn"
            onClick={() => onReset(model.id)}
            title={t("imageSettings.resetTitle")}
          >
            {t("imageSettings.reset")}
          </button>
        )}
      </div>
      {cost && <div className="family-card__cost">{cost}</div>}
      {savedId === model.id && (
        <div className="model-settings-saved">{t("imageSettings.saved")}</div>
      )}
    </div>
  );
}
