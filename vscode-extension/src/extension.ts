/**
 * API Vault — VS Code extension entry point.
 *
 * MVP (M21-1): three commands + status bar.
 *   - `apivault.list`              → Quick pick of credentials (`apivault list --json`)
 *   - `apivault.reveal`            → user picks a credential → clipboard
 *   - `apivault.scanSupplyChain`   → run supply scan on workspace root, surface
 *                                     advisories in the Problems panel.
 *
 * Talks to the desktop app via the `apivault` CLI binary (Rust). MCP server
 * native registration (M21-2) is deferred until VS Code's MCP API stabilises;
 * the CLI route works today on every VS Code 1.84+.
 */

import * as vscode from "vscode";
import { exec, ExecException } from "node:child_process";

interface CredentialSummary {
  id: string;
  issuer: string;
  name: string;
  env: string;
  status: string;
}

interface SupplyAdvisory {
  package: string;
  ecosystem: string;
  version: string;
  manifest: string;
  source_id: string;
  severity: string;
  category: string;
  summary: string;
}

let statusItem: vscode.StatusBarItem | undefined;
let diagnostics: vscode.DiagnosticCollection | undefined;

export function activate(context: vscode.ExtensionContext): void {
  statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusItem.text = "$(shield) API Vault";
  statusItem.tooltip = "Click to list credentials";
  statusItem.command = "apivault.list";
  statusItem.show();
  context.subscriptions.push(statusItem);

  diagnostics = vscode.languages.createDiagnosticCollection("apivault");
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.commands.registerCommand("apivault.list", cmdList),
    vscode.commands.registerCommand("apivault.reveal", cmdReveal),
    vscode.commands.registerCommand("apivault.scanSupplyChain", cmdScanSupplyChain),
  );

  // Optional auto-scan on startup.
  const cfg = vscode.workspace.getConfiguration("apivault");
  if (cfg.get<boolean>("scanOnStartup", false)) {
    void cmdScanSupplyChain();
  }
}

export function deactivate(): void {
  statusItem?.dispose();
  diagnostics?.dispose();
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function cliPath(): string {
  const cfg = vscode.workspace.getConfiguration("apivault");
  return cfg.get<string>("cliPath", "apivault");
}

interface RunResult {
  stdout: string;
  stderr: string;
}

function runCli(args: string[], stdinPassphrase?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = exec(
      `${quoteArg(cliPath())} ${args.map(quoteArg).join(" ")}`,
      { maxBuffer: 32 * 1024 * 1024 },
      (err: ExecException | null, stdout: string, stderr: string) => {
        if (err) {
          reject(new Error(`apivault CLI failed (${err.code ?? "?"}): ${stderr || err.message}`));
          return;
        }
        resolve({ stdout, stderr });
      },
    );
    if (stdinPassphrase != null && child.stdin) {
      child.stdin.end(stdinPassphrase + "\n");
    }
  });
}

function quoteArg(s: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdList(): Promise<void> {
  let result: RunResult;
  try {
    result = await runCli(["list", "--json"]);
  } catch (e) {
    void vscode.window.showErrorMessage(`API Vault list failed: ${(e as Error).message}`);
    return;
  }
  let parsed: { credentials: CredentialSummary[] };
  try {
    parsed = JSON.parse(result.stdout);
  } catch (e) {
    void vscode.window.showErrorMessage(`Could not parse CLI output: ${(e as Error).message}`);
    return;
  }
  const items: vscode.QuickPickItem[] = parsed.credentials.map((c) => ({
    label: c.name,
    description: `${c.issuer} · ${c.env}`,
    detail: `${c.id}  (${c.status})`,
  }));
  if (items.length === 0) {
    void vscode.window.showInformationMessage("API Vault: no credentials yet.");
    return;
  }
  await vscode.window.showQuickPick(items, {
    placeHolder: `${items.length} credential(s) — pick one to copy id`,
  });
}

async function cmdReveal(): Promise<void> {
  // Step 1 — pick credential via list.
  let parsed: { credentials: CredentialSummary[] };
  try {
    const r = await runCli(["list", "--json"]);
    parsed = JSON.parse(r.stdout);
  } catch (e) {
    void vscode.window.showErrorMessage(`API Vault list failed: ${(e as Error).message}`);
    return;
  }
  const items: vscode.QuickPickItem[] = parsed.credentials
    .filter((c) => c.status === "active")
    .map((c) => ({ label: c.name, description: `${c.issuer} · ${c.env}`, detail: c.id }));
  if (items.length === 0) {
    void vscode.window.showInformationMessage("API Vault: no active credentials.");
    return;
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Pick a credential to reveal — value will be copied to clipboard",
  });
  if (!picked || !picked.detail) return;

  // Step 2 — passphrase prompt (no shell echo in VS Code).
  const passphrase = await vscode.window.showInputBox({
    prompt: "API Vault passphrase",
    password: true,
    ignoreFocusOut: true,
  });
  if (!passphrase) return;

  // Step 3 — `apivault reveal <id> --print` reads passphrase from stdin.
  // We use `--print` so the value comes back to us; we then write it to the
  // clipboard ourselves and avoid storing it on the user's terminal history.
  let revealed: RunResult;
  try {
    revealed = await runCli(["reveal", picked.detail, "--print"], passphrase);
  } catch (e) {
    void vscode.window.showErrorMessage(`Reveal failed: ${(e as Error).message}`);
    return;
  }
  const value = revealed.stdout.trim();
  if (!value) {
    void vscode.window.showWarningMessage("API Vault returned an empty value.");
    return;
  }
  await vscode.env.clipboard.writeText(value);
  void vscode.window.showInformationMessage(
    `Copied ${picked.label} — clipboard will not auto-clear (use the desktop app for auto-clear).`,
  );
}

async function cmdScanSupplyChain(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showErrorMessage("Open a workspace first.");
    return;
  }
  const root = folder.uri.fsPath;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "API Vault: scanning supply chain…",
      cancellable: false,
    },
    async () => {
      diagnostics?.clear();

      // We use the CLI's not-yet-existing `supply scan --json` flag in v2;
      // for now we shell out to the desktop's HTTP API or fall back to a
      // simple manifest read + osv.dev REST call. MVP: parse package.json
      // here and POST one OSV query per dep — same shape as the Rust
      // matcher, just inline so we don't depend on a bundled binary the
      // user hasn't installed yet.
      const advisories = await scanWorkspace(root);
      surfaceDiagnostics(advisories);
      void vscode.window.showInformationMessage(
        advisories.length === 0
          ? "API Vault: no supply-chain advisories matched."
          : `API Vault: ${advisories.length} advisory(ies) — check the Problems panel.`,
      );
    },
  );
}

// ---------------------------------------------------------------------------
// Inline scan (MVP) — bundled-binary-free path.
//
// In v2 (M21-2) we'll spawn `apivault-mcp` and route through MCP tools so the
// extension stays a thin shell.
// ---------------------------------------------------------------------------

async function scanWorkspace(root: string): Promise<SupplyAdvisory[]> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const out: SupplyAdvisory[] = [];

  const pkgPath = path.join(root, "package.json");
  try {
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const [name, version] of Object.entries(deps)) {
      const advs = await queryOsv("npm", name, normalizeVersion(version));
      for (const a of advs) {
        out.push({ ...a, manifest: "package.json" });
      }
    }
  } catch {
    // package.json missing or malformed — silent in MVP.
  }
  return out;
}

function normalizeVersion(v: string): string {
  // Strip ^ ~ >= etc. for OSV query.
  return v.replace(/^[\^~><=\s]+/, "").trim() || "0.0.0";
}

async function queryOsv(
  ecosystem: string,
  name: string,
  version: string,
): Promise<Omit<SupplyAdvisory, "manifest">[]> {
  try {
    const resp = await fetch("https://api.osv.dev/v1/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        package: { name, ecosystem: osvEcosystem(ecosystem) },
        version,
      }),
    });
    if (!resp.ok) return [];
    const json = (await resp.json()) as {
      vulns?: { id: string; summary?: string }[];
    };
    return (json.vulns ?? []).map((v) => ({
      package: name,
      ecosystem,
      version,
      source_id: v.id,
      severity: "medium",
      category: classifyCategory(v.summary ?? ""),
      summary: v.summary ?? v.id,
    }));
  } catch {
    return [];
  }
}

function osvEcosystem(s: string): string {
  if (s === "npm") return "npm";
  if (s === "pypi") return "PyPI";
  if (s === "cargo") return "crates.io";
  return s;
}

function classifyCategory(text: string): string {
  const lc = text.toLowerCase();
  if (
    lc.includes("credential") ||
    lc.includes("secret") ||
    lc.includes("exfil") ||
    lc.includes("token theft")
  ) {
    return "secret_leak";
  }
  if (
    lc.includes("typosquat") ||
    lc.includes("supply chain") ||
    lc.includes("hijack") ||
    lc.includes("malicious package")
  ) {
    return "supply_chain";
  }
  return "other";
}

function surfaceDiagnostics(advisories: SupplyAdvisory[]): void {
  if (!diagnostics) return;
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;
  const grouped = new Map<string, vscode.Diagnostic[]>();
  for (const a of advisories) {
    const uri = vscode.Uri.joinPath(folder.uri, a.manifest);
    const sev =
      a.severity === "critical" || a.severity === "high"
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;
    const d = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      `[${a.category}] ${a.package}@${a.version} — ${a.summary} (${a.source_id})`,
      sev,
    );
    d.source = "api-vault";
    const list = grouped.get(uri.fsPath) ?? [];
    list.push(d);
    grouped.set(uri.fsPath, list);
  }
  for (const [path, list] of grouped) {
    diagnostics.set(vscode.Uri.file(path), list);
  }
}
