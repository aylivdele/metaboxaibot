/**
 * Admin REST client — обёртки над `/admin/proxies` и `/admin/provider-keys`.
 * Endpoint защищён ADMIN-ролью на бэке (см. routes/admin-keys.ts).
 */
import { apiClient } from "./client";

export interface ProxyDto {
  id: string;
  label: string;
  protocol: "http" | "https" | "socks5";
  host: string;
  port: number;
  hasUsername: boolean;
  hasPassword: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderKeyDto {
  id: string;
  provider: string;
  label: string;
  keyMask: string;
  proxyId: string | null;
  proxy: { id: string; label: string } | null;
  priority: number;
  isActive: boolean;
  notes: string | null;
  requestCount: string;
  errorCount: string;
  lastUsedAt: string | null;
  lastErrorAt: string | null;
  lastErrorText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KeyStatsDto {
  requestCount: string;
  errorCount: string;
  lastUsedAt: string | null;
  lastErrorAt: string | null;
  lastErrorText: string | null;
  currentCooldownMs: number | null;
  cooldownReason: string | null;
}

export interface ProviderSummary {
  provider: string;
  activeKeyCount: number;
  hasEnvFallback: boolean;
}

export interface ProxyCreateBody {
  label: string;
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  isActive?: boolean;
  notes?: string;
}

export interface KeyCreateBody {
  provider: string;
  label: string;
  keyValue: string;
  proxyId?: string | null;
  priority?: number;
  isActive?: boolean;
  notes?: string;
}

export const adminApi = {
  // Proxies
  listProxies: () => apiClient<{ proxies: ProxyDto[] }>("/admin/proxies"),
  createProxy: (body: ProxyCreateBody) =>
    apiClient<{ proxy: ProxyDto }, ProxyCreateBody>("/admin/proxies", { method: "POST", body }),
  updateProxy: (id: string, body: Partial<ProxyCreateBody>) =>
    apiClient<{ proxy: ProxyDto }, Partial<ProxyCreateBody>>(`/admin/proxies/${id}`, {
      method: "PATCH",
      body,
    }),
  deleteProxy: (id: string) =>
    apiClient<{ success: true }>(`/admin/proxies/${id}`, { method: "DELETE" }),
  testProxy: (id: string) =>
    apiClient<{ ok: boolean; ip?: string; error?: string }>(`/admin/proxies/${id}/test`, {
      method: "POST",
    }),

  // Provider keys
  listKeys: (provider?: string) =>
    apiClient<{ keys: ProviderKeyDto[] }>("/admin/provider-keys", {
      query: provider ? { provider } : undefined,
    }),
  createKey: (body: KeyCreateBody) =>
    apiClient<{ key: ProviderKeyDto }, KeyCreateBody>("/admin/provider-keys", {
      method: "POST",
      body,
    }),
  updateKey: (id: string, body: Partial<Omit<KeyCreateBody, "provider">>) =>
    apiClient<{ key: ProviderKeyDto }, Partial<Omit<KeyCreateBody, "provider">>>(
      `/admin/provider-keys/${id}`,
      { method: "PATCH", body },
    ),
  deleteKey: (id: string) =>
    apiClient<{ success: true }>(`/admin/provider-keys/${id}`, { method: "DELETE" }),
  keyStats: (id: string) => apiClient<KeyStatsDto>(`/admin/provider-keys/${id}/stats`),
  clearKeyThrottle: (id: string) =>
    apiClient<{ success: true }>(`/admin/provider-keys/${id}/clear-throttle`, {
      method: "POST",
    }),

  // Providers summary
  listProviders: () => apiClient<{ providers: ProviderSummary[] }>("/admin/providers"),

  // ── Pricing ──────────────────────────────────────────────────────────────
  pricing: {
    getAll: () => apiClient<PricingSnapshotDto>("/admin/pricing"),
    setModel: (id: string, body: { multiplier: number; note?: string | null }) =>
      apiClient<{ model: ModelPricingDto }, typeof body>(`/admin/pricing/model/${id}`, {
        method: "PUT",
        body,
      }),
    deleteModel: (id: string) =>
      apiClient<{ success: true; model: ModelPricingDto | null }>(`/admin/pricing/model/${id}`, {
        method: "DELETE",
      }),
    setGlobal: (body: { multiplier: number; note?: string | null }) =>
      apiClient<{ global: PricingEntryDto | null; configDefault: number }, typeof body>(
        "/admin/pricing/global",
        { method: "PUT", body },
      ),
    deleteGlobal: () =>
      apiClient<{ success: true; configDefault: number }>("/admin/pricing/global", {
        method: "DELETE",
      }),
  },
};

// ── Pricing types ──────────────────────────────────────────────────────────

export interface PricingEntryDto {
  multiplier: number;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface ModelPricingDto {
  id: string;
  name: string;
  section: string;
  provider: string;
  isLLM: boolean;
  baseTokens: number;
  effectiveTokens: number;
  multiplier: number;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface PricingSnapshotDto {
  configDefault: number;
  global: PricingEntryDto | null;
  models: ModelPricingDto[];
}
