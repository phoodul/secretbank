/** Output of the Rust `env_scan_folder` Tauri command. */
export interface DetectedKey {
  file_path: string;
  line: number;
  env_var_name: string | null;
  /** Slug of the matched issuer preset, or null when only entropy fired. */
  issuer_slug: string | null;
  /** Last 4 chars of the raw value (UX hint; never the full secret). */
  value_hint: string;
  /** Confidence score in `[0.0, 1.0]`. */
  confidence: number;
}

/** Payload emitted on `scan:progress`. */
export type ScanProgress = { phase: "started"; path: string } | { phase: "done"; count: number };
