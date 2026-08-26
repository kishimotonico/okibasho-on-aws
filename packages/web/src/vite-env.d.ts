/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HOSTED_UI_BASE_URL?: string;
  readonly VITE_OIDC_ISSUER?: string;
  readonly VITE_WEB_APP_CLIENT_ID?: string;
  readonly VITE_IDENTITY_POOL_ID?: string;
  readonly VITE_USER_POOL_ID?: string;
  readonly VITE_REGION?: string;
  readonly VITE_PAGES_BUCKET?: string;
  readonly VITE_PAGES_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
