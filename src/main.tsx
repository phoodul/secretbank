import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./lib/i18n";
import "./styles/globals.css";

// Dev-only: expose Tauri IPC helpers on window for DevTools-driven manual testing.
// Stripped out of production builds by Vite's dead-code elimination.
// Note: Database is intentionally excluded — direct SQL access requires sql:allow-execute
// capability which is not granted to the frontend in any build.
if (import.meta.env.DEV) {
  void Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]).then(
    ([core, event]) => {
      (
        window as unknown as {
          __dev: {
            invoke: typeof core.invoke;
            listen: typeof event.listen;
          };
        }
      ).__dev = {
        invoke: core.invoke,
        listen: event.listen,
      };
      console.info("[dev] window.__dev = { invoke, listen } is ready");
    },
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="secretbank-theme">
      <App />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>,
);
