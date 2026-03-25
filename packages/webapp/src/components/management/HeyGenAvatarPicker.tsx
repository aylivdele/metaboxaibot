import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { HeyGenAvatar, UserUpload } from "../../types.js";

interface HeyGenAvatarPickerProps {
  /** Currently selected official avatar_id (empty string = none) */
  avatarId: string;
  /** Currently selected user photo URL stored as avatar_photo_url (empty string = none) */
  avatarPhotoUrl: string;
  /** Called when user picks an official avatar or a photo upload */
  onChange: (key: string, value: unknown) => void;
}

export function HeyGenAvatarPicker({
  avatarId,
  avatarPhotoUrl,
  onChange,
}: HeyGenAvatarPickerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"official" | "uploads">(avatarPhotoUrl ? "uploads" : "official");
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
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
    if (tab === "uploads") {
      setUploadsLoading(true);
      api.uploads
        .list("avatar_photo")
        .then(setUploads)
        .catch(() => setUploads([]))
        .finally(() => setUploadsLoading(false));
    }
  }, [tab, avatars.length]);

  const selectOfficial = (id: string) => {
    onChange("avatar_id", id);
    onChange("avatar_photo_url", "");
  };

  const selectPhoto = (url: string) => {
    onChange("avatar_photo_url", url);
    onChange("avatar_id", "");
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
          className={`voice-picker__tab${tab === "uploads" ? " voice-picker__tab--active" : ""}`}
          onClick={() => setTab("uploads")}
        >
          {t("uploads.myPhotos")}
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
                const isSelected = avatarId === avatar.avatar_id && !avatarPhotoUrl;
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

      {tab === "uploads" &&
        (uploadsLoading ? (
          <div className="voice-picker__loading">Загрузка…</div>
        ) : uploads.length === 0 ? (
          <div className="voice-picker__empty">{t("uploads.emptyPhotos")}</div>
        ) : (
          <div className="avatar-picker__grid">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className={`avatar-picker__item${avatarPhotoUrl === upload.url ? " avatar-picker__item--selected" : ""}`}
                onClick={() => selectPhoto(upload.url)}
              >
                <img className="avatar-picker__img" src={upload.url} alt={upload.name} />
                <span className="avatar-picker__name">{upload.name}</span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
