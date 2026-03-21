import { useEffect, useState, useCallback } from "react";
import { api, API_BASE } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { AdminUser, UserProfile, BannerSlide } from "../types.js";

type AdminTab = "users" | "slides";

export function AdminPage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  useEffect(() => {
    api.profile.get().then(setProfile).catch(console.error);
  }, []);

  if (!profile) {
    return <div className="page-loading">{t("common.loading")}</div>;
  }

  if (profile.role !== "ADMIN" && profile.role !== "MODERATOR") {
    return (
      <div className="page">
        <div className="admin-access-denied">
          <div className="admin-access-denied__icon">🔒</div>
          <div className="admin-access-denied__title">{t("admin.accessDenied")}</div>
          <div className="admin-access-denied__text">{t("admin.accessDeniedText")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("admin.title")}</h2>
        <p className="page-subtitle">{t("admin.subtitle")}</p>
      </div>

      <div className="admin-tabs">
        <button
          className={`admin-tab${activeTab === "users" ? " admin-tab--active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          {t("admin.tabUsers")}
        </button>
        <button
          className={`admin-tab${activeTab === "slides" ? " admin-tab--active" : ""}`}
          onClick={() => setActiveTab("slides")}
        >
          {t("admin.tabSlides")}
        </button>
      </div>

      {activeTab === "users" && <UsersTab profile={profile} />}
      {activeTab === "slides" && <SlidesTab />}
    </div>
  );
}

/* ── Users Tab ─────────────────────────────────────────────────────────────── */

function UsersTab({ profile }: { profile: UserProfile }) {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState("");

  const limit = 20;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.users({
        page,
        limit,
        search: search || undefined,
      });
      setUsers(res.users);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadUsers().catch(console.error);
  }, [loadUsers]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleBlock = async (userId: string, blocked: boolean) => {
    await api.admin.block(userId, blocked);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isBlocked: blocked } : u)));
  };

  const handleGrant = async (userId: string) => {
    const amount = parseFloat(grantAmount);
    if (!amount || amount <= 0) return;
    const res = await api.admin.grant(userId, amount);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, tokenBalance: res.newBalance } : u)),
    );
    setGrantingId(null);
    setGrantAmount("");
  };

  const handleSetRole = async (userId: string, role: string) => {
    await api.admin.setRole(userId, role);
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: role as AdminUser["role"] } : u)),
    );
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <div className="admin-stats">
        <div className="admin-stat">
          <div className="admin-stat__value">{total}</div>
          <div className="admin-stat__label">{t("admin.totalUsers")}</div>
        </div>
      </div>

      <div className="admin-search">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={t("admin.searchPlaceholder")}
        />
      </div>

      {loading ? (
        <div className="page-loading">{t("common.loading")}</div>
      ) : users.length === 0 ? (
        <div className="empty-state">{t("admin.noUsers")}</div>
      ) : (
        <div className="admin-user-list">
          {users.map((user) => (
            <div
              key={user.id}
              className={`admin-user-card${user.isBlocked ? " admin-user-card--blocked" : ""}`}
            >
              <div className="admin-user-card__header">
                <div>
                  <div className="admin-user-card__name">{user.firstName ?? "—"}</div>
                  <div className="admin-user-card__username">
                    {user.username ? `@${user.username}` : `ID: ${user.id}`}
                  </div>
                </div>
                <span
                  className={`admin-user-card__role admin-user-card__role--${user.role.toLowerCase()}`}
                >
                  {user.role}
                </span>
              </div>

              <div className="admin-user-card__meta">
                <span>
                  {t("admin.balance")}: ✦ {Number(user.tokenBalance).toFixed(2)}
                </span>
                <span>
                  {t("admin.joined")}: {new Date(user.createdAt).toLocaleDateString()}
                </span>
                {user.isBlocked && (
                  <span style={{ color: "var(--danger)" }}>🚫 {t("admin.blocked")}</span>
                )}
              </div>

              <div className="admin-user-card__actions">
                {profile.role === "ADMIN" && user.role !== "ADMIN" && (
                  <button
                    className="admin-btn admin-btn--accent"
                    onClick={() => handleSetRole(user.id, "ADMIN")}
                  >
                    {t("admin.makeAdmin")}
                  </button>
                )}
                {profile.role === "ADMIN" && user.role !== "MODERATOR" && user.role !== "ADMIN" && (
                  <button
                    className="admin-btn admin-btn--accent"
                    onClick={() => handleSetRole(user.id, "MODERATOR")}
                  >
                    {t("admin.makeModerator")}
                  </button>
                )}
                {profile.role === "ADMIN" && user.role !== "USER" && (
                  <button
                    className="admin-btn admin-btn--accent"
                    onClick={() => handleSetRole(user.id, "USER")}
                  >
                    {t("admin.makeUser")}
                  </button>
                )}

                {user.isBlocked ? (
                  <button
                    className="admin-btn admin-btn--success"
                    onClick={() => handleBlock(user.id, false)}
                  >
                    {t("admin.unblock")}
                  </button>
                ) : (
                  <button
                    className="admin-btn admin-btn--danger"
                    onClick={() => handleBlock(user.id, true)}
                  >
                    {t("admin.block")}
                  </button>
                )}

                {grantingId === user.id ? (
                  <div className="admin-grant-form">
                    <input
                      type="number"
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(e.target.value)}
                      placeholder={t("admin.grantAmount")}
                      autoFocus
                    />
                    <button onClick={() => handleGrant(user.id)}>{t("admin.grantSubmit")}</button>
                    <button
                      className="admin-btn"
                      onClick={() => {
                        setGrantingId(null);
                        setGrantAmount("");
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    className="admin-btn admin-btn--accent"
                    onClick={() => setGrantingId(user.id)}
                  >
                    {t("admin.grant")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="admin-pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t("admin.prevPage")}
          </button>
          <span className="admin-pagination__info">
            {page} / {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("admin.nextPage")}
          </button>
        </div>
      )}
    </>
  );
}

/* ── Slides Tab ────────────────────────────────────────────────────────────── */

function SlidesTab() {
  const { t } = useI18n();
  const [slides, setSlides] = useState<BannerSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [duration, setDuration] = useState("4");

  const loadSlides = useCallback(async () => {
    try {
      const res = await api.admin.slides.list();
      setSlides(res.slides);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSlides().catch(console.error);
  }, [loadSlides]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      if (linkUrl.trim()) formData.append("linkUrl", linkUrl.trim());
      formData.append("displaySeconds", duration || "4");
      await api.admin.slides.create(formData);
      resetForm();
      await loadSlides();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setLinkUrl("");
    setDuration("4");
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("admin.slides.confirmDelete"))) return;
    await api.admin.slides.delete(id);
    await loadSlides();
  };

  const handleToggleActive = async (slide: BannerSlide) => {
    await api.admin.slides.update(slide.id, {
      active: !slide.active,
    });
    await loadSlides();
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    const newSlides = [...slides];
    const target = index + direction;
    if (target < 0 || target >= newSlides.length) return;
    [newSlides[index], newSlides[target]] = [newSlides[target], newSlides[index]];
    setSlides(newSlides);
    await api.admin.slides.reorder(newSlides.map((s) => s.id));
  };

  if (loading) {
    return <div className="page-loading">{t("common.loading")}</div>;
  }

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        {!isAdding && (
          <button className="admin-btn admin-btn--accent" onClick={() => setIsAdding(true)}>
            {t("admin.slides.add")}
          </button>
        )}
      </div>

      {isAdding && (
        <div className="admin-slide-form">
          <div className="admin-slide-form__group">
            <label className="admin-slide-form__label">{t("admin.slides.imageLabel")}</label>
            <div className="admin-slide-form__upload">
              <input type="file" accept="image/*" onChange={handleFileChange} />
              <div className="admin-slide-form__upload-text">{t("admin.slides.chooseFile")}</div>
              <div className="admin-slide-form__hint">{t("admin.slides.aspectHint")}</div>
            </div>
            {preview && <img src={preview} alt="Preview" className="admin-slide-form__preview" />}
          </div>

          <div className="admin-slide-form__group">
            <label className="admin-slide-form__label">{t("admin.slides.linkUrl")}</label>
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder={t("admin.slides.linkPlaceholder")}
            />
          </div>

          <div className="admin-slide-form__group">
            <label className="admin-slide-form__label">{t("admin.slides.duration")}</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min="1"
              max="30"
            />
          </div>

          <div className="admin-slide-form__buttons">
            <button
              className="admin-btn admin-btn--accent"
              onClick={handleSave}
              disabled={!file || uploading}
            >
              {uploading ? t("admin.slides.uploading") : t("admin.slides.save")}
            </button>
            <button className="admin-btn" onClick={resetForm}>
              {t("admin.slides.cancel")}
            </button>
          </div>
        </div>
      )}

      {slides.length === 0 ? (
        <div className="empty-state">{t("admin.slides.empty")}</div>
      ) : (
        slides.map((slide, i) => (
          <div key={slide.id} className="admin-slide-card">
            <img
              src={`${API_BASE}${slide.imageUrl}`}
              alt=""
              className="admin-slide-card__preview"
            />
            <div className="admin-slide-card__meta">
              <span
                className={`admin-slide-card__badge admin-slide-card__badge--${
                  slide.active ? "active" : "inactive"
                }`}
              >
                {slide.active ? t("admin.slides.active") : t("admin.slides.inactive")}
              </span>
              <span>⏱ {slide.displaySeconds}s</span>
              {slide.linkUrl && (
                <span>
                  🔗 {slide.linkUrl.length > 30 ? slide.linkUrl.slice(0, 30) + "…" : slide.linkUrl}
                </span>
              )}
            </div>
            <div className="admin-slide-card__actions">
              <button className="admin-btn" disabled={i === 0} onClick={() => handleMove(i, -1)}>
                {t("admin.slides.moveUp")}
              </button>
              <button
                className="admin-btn"
                disabled={i === slides.length - 1}
                onClick={() => handleMove(i, 1)}
              >
                {t("admin.slides.moveDown")}
              </button>
              <button
                className="admin-btn admin-btn--accent"
                onClick={() => handleToggleActive(slide)}
              >
                {slide.active ? t("admin.slides.inactive") : t("admin.slides.active")}
              </button>
              <button
                className="admin-btn admin-btn--danger"
                onClick={() => handleDelete(slide.id)}
              >
                {t("admin.slides.delete")}
              </button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
