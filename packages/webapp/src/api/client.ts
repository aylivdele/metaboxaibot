import type {
  UserProfile,
  Dialog,
  UserState,
  Model,
  AdminUsersResponse,
  GalleryResponse,
} from "../types.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

let _initDataRaw: string | null = null;

export function setInitDataRaw(raw: string): void {
  _initDataRaw = raw;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (_initDataRaw) {
    headers["Authorization"] = `tma ${_initDataRaw}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    verify: (initData: string) =>
      request<{ id: string; tokenBalance: string }>("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ initData }),
      }),
  },

  profile: {
    get: () => request<UserProfile>("/profile"),
  },

  dialogs: {
    list: (section?: string) =>
      request<Dialog[]>(section ? `/dialogs?section=${section}` : "/dialogs"),
    create: (section: string, modelId: string, title?: string) =>
      request<Dialog>("/dialogs", {
        method: "POST",
        body: JSON.stringify({ section, modelId, title }),
      }),
    rename: (id: string, title: string) =>
      request<{ id: string; title: string }>(`/dialogs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    delete: (id: string) => request<{ success: boolean }>(`/dialogs/${id}`, { method: "DELETE" }),
    activate: (id: string) =>
      request<{ success: boolean }>(`/dialogs/${id}/activate`, { method: "POST" }),
  },

  state: {
    get: () => request<UserState>("/state"),
    patch: (body: { modelId?: string; section?: string; dialogId?: string | null }) =>
      request<{ success: boolean }>("/state", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  models: {
    list: (section?: string) =>
      request<Model[]>(section ? `/models?section=${section}` : "/models"),
  },

  payments: {
    createInvoice: (planId: string) =>
      request<{ invoiceUrl: string }>("/payments/invoice", {
        method: "POST",
        body: JSON.stringify({ planId }),
      }),
  },

  gallery: {
    list: (params: { section?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params.section) qs.set("section", params.section);
      if (params.page) qs.set("page", String(params.page));
      if (params.limit) qs.set("limit", String(params.limit));
      return request<GalleryResponse>(`/gallery?${qs.toString()}`);
    },
    download: (id: string) =>
      request<{ success: boolean }>(`/gallery/${id}/download`, { method: "POST" }),
  },

  admin: {
    users: (params: { page?: number; limit?: number; search?: string }) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set("page", String(params.page));
      if (params.limit) qs.set("limit", String(params.limit));
      if (params.search) qs.set("search", params.search);
      return request<AdminUsersResponse>(`/admin/users?${qs.toString()}`);
    },
    grant: (userId: string, amount: number, reason?: string) =>
      request<{ success: boolean; newBalance: string }>("/admin/grant", {
        method: "POST",
        body: JSON.stringify({ userId, amount, reason }),
      }),
    block: (userId: string, blocked: boolean) =>
      request<{ success: boolean; isBlocked: boolean }>("/admin/block", {
        method: "POST",
        body: JSON.stringify({ userId, blocked }),
      }),
    setRole: (userId: string, role: string) =>
      request<{ success: boolean }>("/admin/role", {
        method: "POST",
        body: JSON.stringify({ userId, role }),
      }),
  },
};
