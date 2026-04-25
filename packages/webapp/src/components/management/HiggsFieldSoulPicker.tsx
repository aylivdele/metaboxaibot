import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { UserAvatar } from "../../types.js";
import { closeMiniApp } from "../../utils/telegram.js";

interface HiggsFieldSoulPickerProps {
  /** Currently selected custom_reference_id */
  soulId: string;
  onChange: (changes: Record<string, unknown>) => void;
}

export function HiggsFieldSoulPicker({ soulId, onChange }: HiggsFieldSoulPickerProps) {
  const { t } = useI18n();
  const [souls, setSouls] = useState<UserAvatar[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createHint, setCreateHint] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.userAvatars
      .list("higgsfield_soul")
      .then(setSouls)
      .catch(() => setSouls([]))
      .finally(() => setLoading(false));
  }, []);

  const selectSoul = (avatar: UserAvatar) => {
    if (avatar.status !== "ready" || !avatar.externalId) return;
    onChange({ custom_reference_id: avatar.externalId });
  };

  const deselectSoul = () => {
    onChange({ custom_reference_id: "" });
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.userAvatars.startCreation("higgsfield_soul");
      setCreateHint(true);
      setTimeout(() => setCreateHint(false), 5000);
      closeMiniApp();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await api.userAvatars.delete(id).catch(() => void 0);
    const deleted = souls.find((s) => s.id === id);
    setSouls((prev) => prev.filter((s) => s.id !== id));
    if (deleted?.externalId && deleted.externalId === soulId) {
      onChange({ custom_reference_id: "" });
    }
  };

  return (
    <div className="voice-picker">
      {createHint && <div className="activated-popup">{t("uploads.createSoulHint")}</div>}

      <button className="voice-picker__create-btn" onClick={handleCreate} disabled={creating}>
        {creating ? "…" : t("uploads.createSoul")}
      </button>

      {loading ? (
        <div className="voice-picker__loading">{t("uploads.soulCreating")}</div>
      ) : souls.length === 0 ? (
        <div className="voice-picker__empty">{t("uploads.noSouls")}</div>
      ) : (
        <div className="avatar-picker__grid">
          {souls.map((soul) => {
            const isReady = soul.status === "ready";
            const isOrphaned = soul.status === "orphaned";
            const isSelected = isReady && soul.externalId === soulId;
            const isDisabled = !isReady;
            return (
              <div
                key={soul.id}
                className={`avatar-picker__item${isSelected ? " avatar-picker__item--selected" : ""}${isDisabled ? " avatar-picker__item--disabled" : ""}`}
                onClick={() => (isSelected ? deselectSoul() : selectSoul(soul))}
                title={isOrphaned ? t("uploads.avatarOrphanedHint") : undefined}
              >
                {soul.previewUrl && !isOrphaned ? (
                  <img className="avatar-picker__img" src={soul.previewUrl} alt={soul.name} />
                ) : (
                  <div className="avatar-picker__img avatar-picker__img--placeholder">
                    {soul.status === "creating"
                      ? "⏳"
                      : isOrphaned
                        ? "⚠️"
                        : soul.status === "failed"
                          ? "❌"
                          : "👤"}
                  </div>
                )}
                <span className="avatar-picker__name">
                  {soul.status === "creating"
                    ? t("uploads.soulCreating")
                    : isOrphaned
                      ? `${soul.name} — ${t("uploads.avatarOrphaned")}`
                      : soul.name}
                </span>
                {(isReady || isOrphaned) && (
                  <button
                    className="avatar-picker__delete-btn"
                    onClick={(e) => handleDelete(e, soul.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
