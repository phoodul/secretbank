import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./lib/i18n";
import "./styles/globals.css";

// Dev-only: expose Tauri APIs on window for DevTools-driven manual testing.
// Stripped out of production builds by Vite's dead-code elimination.
if (import.meta.env.DEV) {
  void Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
    import("@tauri-apps/plugin-sql"),
  ]).then(([core, event, sql]) => {
    (
      window as unknown as {
        __dev: {
          invoke: typeof core.invoke;
          listen: typeof event.listen;
          Database: typeof sql.default;
        };
      }
    ).__dev = {
      invoke: core.invoke,
      listen: event.listen,
      Database: sql.default,
    };
    // eslint-disable-next-line no-console
    console.info("[dev] window.__dev = { invoke, listen, Database } is ready");
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="api-vault-theme">
      <App />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>,
);
