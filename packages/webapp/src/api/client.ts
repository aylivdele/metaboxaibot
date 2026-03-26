import type {
  UserProfile,
  Dialog,
  Message,
  UserState,
  Model,
  AdminUsersResponse,
  BannerSlide,
  GalleryResponse,
  CatalogResponse,
  HeyGenVoice,
  HeyGenAvatar,
  HiggsFieldMotion,
  DIDVoice,
  UserUpload,
} from "../types.js";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

let _initDataRaw: string | null = null;
let _webToken: string | null = null;

export function setInitDataRaw(raw: string): void {
  _initDataRaw = raw;
}

export function setWebToken(token: string): void {
  _webToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (_initDataRaw) {
    headers["Authorization"] = `tma ${_initDataRaw}`;
  } else if (_webToken) {
    headers["Authorization"] = `wtoken ${_webToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as Record<
      string,
      unknown
    >;
    const error = new Error((err.error as string) ?? `HTTP ${res.status}`) as Error &
      Record<string, unknown>;
    if (err.code) error.code = err.code;
    if (err.linkedTo) error.linkedTo = err.linkedTo;
    throw error;
  }

  return res.json() as Promise<T>;
}

async function uploadRequest<T>(path: string, body: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (_initDataRaw) {
    headers["Authorization"] = `tma ${_initDataRaw}`;
  } else if (_webToken) {
    headers["Authorization"] = `wtoken ${_webToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body,
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
    verifyToken: (token: string) =>
      request<{ id: string; tokenBalance: string }>("/auth/webtoken", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
  },

  profile: {
    get: () => request<UserProfile>("/profile"),
    partnerBalance: () =>
      request<{
        balance: number;
        totalEarned: number;
        totalWithdrawn: number;
        userStatus: string;
        referralCode: string | null;
      }>("/profile/partner-balance"),
    metaboxSso: () => request<{ ssoUrl: string }>("/profile/metabox-sso"),
    metaboxRegister: (
      email: string,
      password: string,
      firstName?: string,
      lastName?: string,
      username?: string,
    ) =>
      request<{ ssoUrl: string }>("/profile/metabox-register", {
        method: "POST",
        body: JSON.stringify({ email, password, firstName, lastName, username }),
      }),
    metaboxLogin: (email: string, password: string) =>
      request<{ ssoUrl: string }>("/profile/metabox-login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
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
    messages: (id: string) => request<Message[]>(`/dialogs/${id}/messages`),
  },

  state: {
    get: () => request<UserState>("/state"),
    patch: (body: {
      gptModelId?: string;
      section?: string;
      dialogId?: string | null;
      sectionModelId?: string;
    }) =>
      request<{ success: boolean }>("/state", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    activate: (section: string, modelId: string) =>
      request<{ success: boolean }>("/state/activate", {
        method: "POST",
        body: JSON.stringify({ section, modelId }),
      }),
  },

  models: {
    list: (section?: string) =>
      request<Model[]>(section ? `/models?section=${section}` : "/models"),
  },

  tariffs: {
    catalog: () => request<CatalogResponse>("/tariffs/catalog"),
  },

  payments: {
    createInvoice: (type: string, id: string, period?: string, name?: string) =>
      request<{ invoiceUrl: string }>("/payments/invoice", {
        method: "POST",
        body: JSON.stringify({ type, id, period, name }),
      }),
    createCardInvoice: (type: string, id: string, period?: string) =>
      request<{ paymentUrl: string }>("/payments/card-invoice", {
        method: "POST",
        body: JSON.stringify({ type, id, period }),
      }),
  },

  metaboxAibot: {
    products: () =>
      request<{ id: string; name: string; tokens: number; priceRub: string }[]>(
        "/metabox-aibot/products",
      ),
    buy: (productId: string) =>
      request<{ paymentUrl: string }>("/metabox-aibot/buy", {
        method: "POST",
        body: JSON.stringify({ productId }),
      }),
  },

  slides: {
    list: () => request<{ slides: BannerSlide[] }>("/slides"),
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

  imageSettings: {
    get: () => request<Record<string, { aspectRatio: string }>>("/image-settings"),
    set: (modelId: string, aspectRatio: string) =>
      request<{ success: boolean }>("/image-settings", {
        method: "PATCH",
        body: JSON.stringify({ modelId, aspectRatio }),
      }),
  },

  videoSettings: {
    get: () =>
      request<Record<string, { aspectRatio?: string; duration?: number }>>("/video-settings"),
    set: (modelId: string, patch: { aspectRatio?: string; duration?: number }) =>
      request<{ success: boolean }>("/video-settings", {
        method: "PATCH",
        body: JSON.stringify({ modelId, ...patch }),
      }),
  },

  heygenVoices: {
    list: () => request<HeyGenVoice[]>("/heygen-voices"),
  },

  heygenAvatars: {
    list: () => request<HeyGenAvatar[]>("/heygen-avatars"),
  },

  higgsfieldMotions: {
    list: () => request<HiggsFieldMotion[]>("/higgsfield-motions"),
  },

  didVoices: {
    list: () => request<DIDVoice[]>("/d-id-voices"),
  },

  uploads: {
    list: (type?: string) => request<UserUpload[]>(type ? `/uploads?type=${type}` : "/uploads"),
    rename: (id: string, name: string) =>
      request<UserUpload>(`/uploads/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) => request<{ success: boolean }>(`/uploads/${id}`, { method: "DELETE" }),
  },

  modelSettings: {
    get: () => request<Record<string, Record<string, unknown>>>("/model-settings"),
    set: (modelId: string, settings: Record<string, unknown>) =>
      request<{ success: boolean }>("/model-settings", {
        method: "PATCH",
        body: JSON.stringify({ modelId, settings }),
      }),
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
    slides: {
      list: () => request<{ slides: BannerSlide[] }>("/admin/slides"),
      create: (data: FormData) => uploadRequest<BannerSlide>("/admin/slides", data),
      update: (id: string, data: Record<string, unknown>) =>
        request<BannerSlide>(`/admin/slides/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        request<{ success: boolean }>(`/admin/slides/${id}`, { method: "DELETE" }),
      reorder: (slideIds: string[]) =>
        request<{ success: boolean }>("/admin/slides/reorder", {
          method: "POST",
          body: JSON.stringify({ slideIds }),
        }),
    },
  },
};
