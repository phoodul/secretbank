/**
 * `addInitScript` payload that runs in the browser **before** any app code,
 * mocking Tauri's `invoke()` channel so the React app can boot in plain
 * Chromium without a Tauri runtime.
 *
 * Each test imports the source string (`tauriMockScript`) and feeds it into
 * `page.addInitScript({ content: ... })` together with a per-test command map.
 *
 * The map shape:
 *   { [command: string]: { kind: "ok"; value: unknown } | { kind: "err"; error: unknown } }
 *
 * Anything unmocked rejects with a recognisable error so tests can assert on
 * the unmocked path.
 */

export type CommandResult =
  | { kind: "ok"; value: unknown }
  | { kind: "err"; error: unknown };

export type CommandMap = Record<string, CommandResult>;

export const tauriMockScript = `
  (function () {
    const map = window.__API_VAULT_INVOKE_MAP__ || {};
    const settingMap = window.__API_VAULT_SETTING_MAP__ || {};
    function invoke(cmd, args) {
      // Per-key override for settings_get (lets tests mark e.g. onboarding done).
      if (cmd === "settings_get" && args && typeof args.key === "string") {
        if (Object.prototype.hasOwnProperty.call(settingMap, args.key)) {
          return Promise.resolve(settingMap[args.key]);
        }
      }
      const r = map[cmd];
      if (!r) {
        return Promise.reject({
          code: "internal",
          message: "[e2e-mock] no mock registered for: " + cmd,
        });
      }
      if (r.kind === "ok") return Promise.resolve(r.value);
      return Promise.reject(r.error);
    }
    // Tauri v2 IPC shim — both legacy and new namespaces routed to invoke.
    window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
    window.__TAURI_INTERNALS__.invoke = invoke;
    window.__TAURI_INTERNALS__.transformCallback = (cb) => cb;
    window.__TAURI__ = window.__TAURI__ || {};
    window.__TAURI__.invoke = invoke;
  })();
`;

export type SettingMap = Record<string, string | null>;

export function buildInitScript(map: CommandMap, settings: SettingMap = {}): string {
  // We attach the maps as globals so the IIFE above can read them.
  const cmdJson = JSON.stringify(map);
  const setJson = JSON.stringify(settings);
  return [
    `window.__API_VAULT_INVOKE_MAP__ = ${cmdJson};`,
    `window.__API_VAULT_SETTING_MAP__ = ${setJson};`,
    tauriMockScript,
  ].join("\n");
}
