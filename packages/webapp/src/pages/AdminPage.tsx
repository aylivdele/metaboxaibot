import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client.js";
import { useI18n } from "../i18n.js";
import type { AdminUser, UserProfile } from "../types.js";

export function AdminPage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState("");

  const limit = 20;

  useEffect(() => {
    api.profile.get().then(setProfile).catch(console.error);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.users({ page, limit, search: search || undefined });
      setUsers(res.users);
      setTotal(res.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    if (profile && (profile.role === "ADMIN" || profile.role === "MODERATOR")) {
      loadUsers().catch(console.error);
    }
  }, [profile, loadUsers]);

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

  if (!profile) return <div className="page-loading">{t("common.loading")}</div>;

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

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("admin.title")}</h2>
        <p className="page-subtitle">{t("admin.subtitle")}</p>
      </div>

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
                {/* Role management — only for ADMIN */}
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

                {/* Block/unblock */}
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

                {/* Grant tokens */}
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
    </div>
  );
}
