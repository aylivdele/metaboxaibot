import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { HeyGenAvatar, UserAvatar } from "../../types.js";

interface HeyGenAvatarPickerProps {
  /** Currently selected official avatar_id (empty string = none) */
  avatarId: string;
  /** Currently selected photo avatar image_asset_id (empty string = none) */
  imageAssetId: string;
  /** Called when user picks an official avatar or a pre-created avatar */
  onChange: (changes: Record<string, unknown>) => void;
}

export function HeyGenAvatarPicker({ avatarId, imageAssetId, onChange }: HeyGenAvatarPickerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"official" | "myAvatars">(imageAssetId ? "myAvatars" : "official");
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [myAvatars, setMyAvatars] = useState<UserAvatar[]>([]);
  const [myAvatarsLoading, setMyAvatarsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [genderFilter, setGenderFilter] = useState("all");

  useEffect(() => {
    if (tab === "official" && avatars.length === 0) {
      setAvatarsLoading(true);
      api.heygenAvatars
        .list()
        .then(setAvatars)
        .catch(() => setAvatars([]))
        .finally(() => setAvatarsLoading(false));
    }
    if (tab === "myAvatars") {
      setMyAvatarsLoading(true);
      api.userAvatars
        .list("heygen")
        .then(setMyAvatars)
        .catch(() => setMyAvatars([]))
        .finally(() => setMyAvatarsLoading(false));
    }
  }, [tab, avatars.length]);

  const selectOfficial = (id: string) => {
    onChange({
      avatar_id: id,
      image_asset_id: "",
      talking_photo_id: "",
      avatar_photo_url: "",
      avatar_photo_s3key: "",
    });
  };

  const selectMyAvatar = (avatar: UserAvatar) => {
    if (avatar.status !== "ready" || !avatar.externalId) return;
    onChange({
      image_asset_id: avatar.externalId,
      talking_photo_id: "",
      avatar_id: "",
      avatar_photo_url: "",
      avatar_photo_s3key: "",
    });
  };

  const handleCreateAvatar = async () => {
    setCreating(true);
    try {
      await api.userAvatars.startCreation("heygen");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAvatar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await api.userAvatars.delete(id).catch(() => void 0);
    setMyAvatars((prev) => prev.filter((a) => a.id !== id));
    // Clear selection if the deleted avatar was selected
    const deleted = myAvatars.find((a) => a.id === id);
    if (deleted?.externalId && deleted.externalId === imageAssetId) {
      onChange({
        image_asset_id: "",
        talking_photo_id: "",
        avatar_id: "",
        avatar_photo_url: "",
        avatar_photo_s3key: "",
      });
    }
  };

  const filtered = avatars.filter((a) => genderFilter === "all" || a.gender === genderFilter);

  return (
    <div className="voice-picker">
      <div className="voice-picker__tabs">
        <button
          className={`voice-picker__tab${tab === "official" ? " voice-picker__tab--active" : ""}`}
          onClick={() => setTab("official")}
        >
          {t("uploads.officialAvatars")}
        </button>
        <button
          className={`voice-picker__tab${tab === "myAvatars" ? " voice-picker__tab--active" : ""}`}
          onClick={() => setTab("myAvatars")}
        >
          {t("uploads.myAvatars")}
        </button>
      </div>

      {tab === "official" &&
        (avatarsLoading ? (
          <div className="voice-picker__loading">Загрузка аватаров…</div>
        ) : (
          <>
            <div className="voice-picker__filters">
              <div className="voice-picker__gender-btns">
                {(["all", "male", "female"] as const).map((g) => (
                  <button
                    key={g}
                    className={`voice-picker__gender-btn${genderFilter === g ? " voice-picker__gender-btn--active" : ""}`}
                    onClick={() => setGenderFilter(g)}
                  >
                    {g === "all" ? "Все" : g === "male" ? "М" : "Ж"}
                  </button>
                ))}
              </div>
            </div>
            <div className="avatar-picker__grid">
              {filtered.map((avatar) => {
                const isSelected = avatarId === avatar.avatar_id && !imageAssetId;
                return (
                  <div
                    key={avatar.avatar_id}
                    className={`avatar-picker__item${isSelected ? " avatar-picker__item--selected" : ""}`}
                    onClick={() => selectOfficial(avatar.avatar_id)}
                  >
                    {avatar.preview_image_url ? (
                      <img
                        className="avatar-picker__img"
                        src={avatar.preview_image_url}
                        alt={avatar.avatar_name}
                      />
                    ) : (
                      <div className="avatar-picker__img avatar-picker__img--placeholder">👤</div>
                    )}
                    <span className="avatar-picker__name">{avatar.avatar_name}</span>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="voice-picker__empty">Аватары не найдены</div>
              )}
            </div>
          </>
        ))}

      {tab === "myAvatars" && (
        <>
          <button
            className="voice-picker__create-btn"
            onClick={handleCreateAvatar}
            disabled={creating}
          >
            {creating ? "…" : t("uploads.createAvatar")}
          </button>

          {myAvatarsLoading ? (
            <div className="voice-picker__loading">Загрузка…</div>
          ) : myAvatars.length === 0 ? (
            <div className="voice-picker__empty">{t("uploads.emptyAvatars")}</div>
          ) : (
            <div className="avatar-picker__grid">
              {myAvatars.map((avatar) => {
                const isReady = avatar.status === "ready";
                const isSelected = isReady && avatar.externalId === imageAssetId;
                return (
                  <div
                    key={avatar.id}
                    className={`avatar-picker__item${isSelected ? " avatar-picker__item--selected" : ""}${!isReady ? " avatar-picker__item--disabled" : ""}`}
                    onClick={() => selectMyAvatar(avatar)}
                  >
                    {avatar.previewUrl ? (
                      <img
                        className="avatar-picker__img"
                        src={avatar.previewUrl}
                        alt={avatar.name}
                      />
                    ) : (
                      <div className="avatar-picker__img avatar-picker__img--placeholder">
                        {avatar.status === "creating"
                          ? "⏳"
                          : avatar.status === "failed"
                            ? "❌"
                            : "👤"}
                      </div>
                    )}
                    <span className="avatar-picker__name">
                      {avatar.status === "creating" ? t("uploads.avatarCreating") : avatar.name}
                    </span>
                    {isReady && (
                      <button
                        className="avatar-picker__delete-btn"
                        onClick={(e) => handleDeleteAvatar(e, avatar.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
