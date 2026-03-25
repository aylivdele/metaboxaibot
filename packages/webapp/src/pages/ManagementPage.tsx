import { useState } from "react";
import { useI18n } from "../i18n.js";
import { GptManagementView } from "../components/management/GptManagementView.js";
import { MediaSettingsView } from "../components/management/MediaSettingsView.js";
import { UploadsView } from "../components/management/UploadsView.js";

type ManageTab = "gpt" | "design" | "video" | "audio" | "uploads";

export function ManagementPage({ initialSection }: { initialSection?: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ManageTab>(
    initialSection === "design"
      ? "design"
      : initialSection === "video"
        ? "video"
        : initialSection === "audio"
          ? "audio"
          : "gpt",
  );

  return (
    <div className="manage-root">
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
        {tab === "gpt" && <GptManagementView />}
        {tab === "design" && <MediaSettingsView section="design" />}
        {tab === "video" && <MediaSettingsView section="video" />}
        {tab === "audio" && <MediaSettingsView section="audio" />}
        {tab === "uploads" && <UploadsView />}
      </div>
    </div>
  );
}
