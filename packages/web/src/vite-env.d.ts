/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_METABOX_SITE_URL: string;
  readonly VITE_TELEGRAM_BOT_USERNAME: string;
  readonly VITE_ENVIRONMENT: "development" | "stage" | "production";
  readonly VITE_DEV_API_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
