import { useState } from "react";
import { useI18n } from "../i18n.js";
import { GptManagementView } from "../components/management/GptManagementView.js";
import { MediaSettingsView } from "../components/management/MediaSettingsView.js";
import { VoicesView } from "../components/management/VoicesView.js";

type ManageTab = "gpt" | "design" | "video" | "audio" | "uploads";

export function ManagementPage({
  initialSection,
  initialModelId,
  initialAction,
  finishedOnboarding,
}: {
  initialSection?: string;
  initialModelId?: string;
  initialAction?: string;
  finishedOnboarding: boolean;
}) {
  const { t } = useI18n();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [tab, setTab] = useState<ManageTab>(
    initialSection === "design"
      ? "design"
      : initialSection === "video"
        ? "video"
        : initialSection === "audio"
          ? "audio"
          : initialSection === "uploads"
            ? "uploads"
            : "gpt",
  );
  const [audioInitialModel, setAudioInitialModel] = useState<string | undefined>(undefined);

  const goToAudioModel = (modelId: string) => {
    setAudioInitialModel(modelId);
    setTab("audio");
  };

  return (
    <div className="manage-root">
      {!finishedOnboarding && !bannerDismissed && (
        <div className="manage-onboarding-banner">
          <span>{t("manage.onboardingBanner")}</span>
          <button
            className="manage-onboarding-banner__close"
            onClick={() => setBannerDismissed(true)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}
      <div className="manage-tabs">
        {(["gpt", "design", "video", "audio", "uploads"] as ManageTab[]).map((s) => (
          <button
            key={s}
            className={`manage-tab${tab === s ? " manage-tab--active" : ""}`}
            onClick={() => setTab(s)}
          >
            {t(`manage.tab.${s}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>
      <div className="manage-content">
        {tab === "gpt" && <GptManagementView initialAction={initialAction} />}
        {tab === "design" && <MediaSettingsView section="design" initialModelId={initialModelId} />}
        {tab === "video" && <MediaSettingsView section="video" initialModelId={initialModelId} />}
        {tab === "audio" && (
          <MediaSettingsView section="audio" initialModelId={audioInitialModel ?? initialModelId} />
        )}
        {tab === "uploads" && <VoicesView onGoToVoiceClone={() => goToAudioModel("voice-clone")} />}
      </div>
    </div>
  );
}
