import type { UserProfile, Dialog, UserState, Model } from "../types.js";

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
};
