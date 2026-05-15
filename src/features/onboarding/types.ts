/** Output of the Rust `env_scan_prepare` Tauri command (single entry). */
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

/** Full response of `env_scan_prepare`. Plaintext values live only in
 *  the backend session keyed by `sessionId`. */
export interface EnvScanPreview {
  sessionId: string;
  entries: DetectedKey[];
  expiresAtUnixMs: number;
  scannedPath: string;
}

/** Per-entry commit result returned by `env_scan_commit`. */
export interface EnvScanRowResult {
  entryIndex: number;
  credentialId: string | null;
  error: string | null;
}

/** Aggregate commit response. */
export interface EnvScanCommitResult {
  projectId: string | null;
  projectName: string;
  credentialsCreated: number;
  usagesCreated: number;
  failed: number;
  rows: EnvScanRowResult[];
}

/** Payload emitted on `scan:progress`. */
export type ScanProgress = { phase: "started"; path: string } | { phase: "done"; count: number };
