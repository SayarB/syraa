// Sentry must initialise before anything else loads.
import "./instrument";
import * as Sentry from "@sentry/react";
import { type ErrorInfo, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Overriding React 19's error hooks replaces its default console logging, so log here too.
const logError = (error: unknown, errorInfo: ErrorInfo) => {
  console.error(error, errorInfo.componentStack);
};

createRoot(document.getElementById("root")!, {
  // Report render errors to Sentry (no-ops when Sentry is off).
  onUncaughtError: Sentry.reactErrorHandler(logError),
  onCaughtError: Sentry.reactErrorHandler(logError),
  onRecoverableError: Sentry.reactErrorHandler(logError),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
