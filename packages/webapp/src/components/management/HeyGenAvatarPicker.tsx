import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client.js";
import { useI18n } from "../../i18n.js";
import type { HeyGenAvatar, UserAvatar } from "../../types.js";
import { closeMiniApp } from "../../utils/telegram.js";

const PAGE_SIZE = 20;

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

  // Official avatars state
  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [genderFilter, setGenderFilter] = useState("all");
  const [search, setSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the filter state for which current avatars were fetched
  const fetchedFilterRef = useRef({ gender: "all", search: "" });

  // My avatars state
  const [myAvatars, setMyAvatars] = useState<UserAvatar[]>([]);
  const [myAvatarsLoading, setMyAvatarsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createHint, setCreateHint] = useState(false);

  const fetchAvatars = (gender: string, searchVal: string, token?: string) => {
    const isLoadMore = !!token;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    api.heygenAvatars
      .list({ token, limit: PAGE_SIZE, gender, search: searchVal || undefined })
      .then((res) => {
        setAvatars((prev) => (isLoadMore ? [...prev, ...res.items] : res.items));
        setHasMore(res.has_more);
        setNextToken(res.next_token);
        fetchedFilterRef.current = { gender, search: searchVal };
      })
      .catch(() => {
        if (!isLoadMore) setAvatars([]);
      })
      .finally(() => {
        if (isLoadMore) setLoadingMore(false);
        else setLoading(false);
      });
  };

  // Initial load / tab switch
  useEffect(() => {
    if (tab === "official" && avatars.length === 0) {
      fetchAvatars(genderFilter, search);
    }
    if (tab === "myAvatars") {
      setMyAvatarsLoading(true);
      api.userAvatars
        .list("heygen")
        .then(setMyAvatars)
        .catch(() => setMyAvatars([]))
        .finally(() => setMyAvatarsLoading(false));
    }
  }, [tab]);

  // Refetch when gender filter changes
  const handleGenderChange = (g: string) => {
    setGenderFilter(g);
    setAvatars([]);
    fetchAvatars(g, search);
  };

  // Debounced search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setAvatars([]);
      fetchAvatars(genderFilter, val);
    }, 400);
  };

  const handleLoadMore = () => {
    if (!nextToken || loadingMore) return;
    fetchAvatars(genderFilter, search, nextToken);
  };

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
      setCreateHint(true);
      setTimeout(() => setCreateHint(false), 5000);
      closeMiniApp();
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAvatar = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await api.userAvatars.delete(id).catch(() => void 0);
    setMyAvatars((prev) => prev.filter((a) => a.id !== id));
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

  return (
    <div className="voice-picker">
      {createHint && <div className="activated-popup">{t("uploads.createAvatarHint")}</div>}
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

      {tab === "official" && (
        <>
          <div className="voice-picker__filters">
            <input
              className="voice-picker__search"
              type="text"
              placeholder="Поиск…"
              value={search}
              onChange={handleSearchChange}
            />
            <div className="voice-picker__gender-btns">
              {(["all", "Man", "Woman"] as const).map((g) => (
                <button
                  key={g}
                  className={`voice-picker__gender-btn${genderFilter === g ? " voice-picker__gender-btn--active" : ""}`}
                  onClick={() => handleGenderChange(g)}
                >
                  {g === "all" ? "Все" : g === "Man" ? "М" : "Ж"}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="voice-picker__loading">Загрузка аватаров…</div>
          ) : (
            <>
              <div className="avatar-picker__grid">
                {avatars.map((avatar) => {
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
                {!loading && avatars.length === 0 && (
                  <div className="voice-picker__empty">Аватары не найдены</div>
                )}
                {hasMore && (
                  <button
                    className="voice-picker__load-more avatar-picker__load-more"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Загрузка…" : "Загрузить ещё"}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

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
