/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
