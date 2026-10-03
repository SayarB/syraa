import * as Sentry from "@sentry/react";

/**
 * Sentry error monitoring + tracing for the web UI. Off unless VITE_SENTRY_DSN is set at build
 * time (Vite inlines it). Must be imported before anything else in main.tsx.
 */

const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE?.trim() || undefined,
    integrations: [Sentry.browserTracingIntegration()],
    // Low traffic: keep every trace. Lower this if the free-tier span quota gets tight.
    tracesSampleRate: 1.0,
    // Same-origin API calls carry trace headers, so frontend traces can join backend ones later.
    tracePropagationTargets: [/^\/api\//],
    // Don't attach users' IP addresses to events. A user ID set via Sentry.setUser is still sent.
    dataCollection: { userInfo: false },
  });
}
