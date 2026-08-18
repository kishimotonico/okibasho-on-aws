/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOSTED_UI_BASE_URL?: string;
  readonly VITE_WEB_APP_CLIENT_ID?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
