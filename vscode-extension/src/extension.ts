/**
 * API Vault — VS Code extension entry point.
 *
 * M21-1 (commands + status bar) + M21-2 (Language Model tools + hover provider).
 *
 * Commands (palette):
 *   - apivault.list           — Quick pick of credentials
 *   - apivault.reveal         — pick → passphrase → clipboard
 *   - apivault.scanSupplyChain — workspace scan → Problems panel
 *
 * Language model tools (Copilot Chat / Claude / Cursor / any 1.96+ host):
 *   - apivault_list_credentials
 *   - apivault_scan_supply_chain
 *
 * Editor surface:
 *   - status bar item ($(shield))
 *   - package.json hover provider — last scan's advisory tooltip on dep lines
 *   - Problems panel diagnostics (scoped to "api-vault")
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
/**
 * In-memory cache of the last successful supply scan. Hover provider reads
 * this so users see the advisory tooltip without re-running the scan.
 */
const lastScan: Map<string, SupplyAdvisory[]> = new Map(); // key = package name (lowercase)

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

  // Language Model tools — Copilot Chat / Claude / Cursor / any host that
  // implements vscode.lm 1.96+. Tools are advertised in package.json and
  // their `invoke` is wired here.
  if (typeof vscode.lm?.registerTool === "function") {
    context.subscriptions.push(
      vscode.lm.registerTool("apivault_list_credentials", new ListCredentialsTool()),
      vscode.lm.registerTool("apivault_scan_supply_chain", new ScanSupplyChainTool()),
    );
  }

  // Hover provider — package.json + Cargo.toml deps show advisory tooltip
  // from last scan.
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: "json", pattern: "**/package.json" },
      { provideHover: providePackageJsonHover },
    ),
    vscode.languages.registerHoverProvider(
      { language: "toml", pattern: "**/Cargo.toml" },
      { provideHover: provideCargoTomlHover },
    ),
  );

  // Code-lens — show "🔑 N advisory" lens on the line above each risky
  // dep in package.json / Cargo.toml. Click → opens the Problems panel.
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { language: "json", pattern: "**/package.json" },
        { language: "toml", pattern: "**/Cargo.toml" },
      ],
      new ManifestCodeLensProvider(),
    ),
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
      const advisories = await scanWorkspace(root);
      cacheScanResults(advisories);
      surfaceDiagnostics(advisories);
      void vscode.window.showInformationMessage(
        advisories.length === 0
          ? "API Vault: no supply-chain advisories matched."
          : `API Vault: ${advisories.length} advisory(ies) — check the Problems panel.`,
      );
    },
  );
}

function cacheScanResults(advisories: SupplyAdvisory[]): void {
  lastScan.clear();
  for (const a of advisories) {
    const key = a.package.toLowerCase();
    const list = lastScan.get(key) ?? [];
    list.push(a);
    lastScan.set(key, list);
  }
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

  const cargoPath = path.join(root, "Cargo.toml");
  try {
    const raw = await fs.readFile(cargoPath, "utf-8");
    const deps = parseCargoDeps(raw);
    for (const [name, version] of deps) {
      if (
        version === "workspace" ||
        version === "path" ||
        version === "git" ||
        version === "*"
      ) {
        continue;
      }
      const advs = await queryOsv("cargo", name, normalizeVersion(version));
      for (const a of advs) {
        out.push({ ...a, manifest: "Cargo.toml" });
      }
    }
  } catch {
    // Cargo.toml missing — silent.
  }
  return out;
}

/**
 * Tiny TOML-deps extractor. We avoid pulling a full TOML parser into the
 * VS Code extension bundle and instead recognise the two common forms:
 *   `name = "1.0"`
 *   `name = { version = "1.0", ... }`
 * Anything else (workspace, path, git, *) is mapped to a placeholder so
 * scanWorkspace can skip it.
 */
function parseCargoDeps(toml: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const lines = toml.split(/\r?\n/);
  let inDeps = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    const sectionMatch = /^\[([^\]]+)\]\s*$/.exec(line);
    if (sectionMatch) {
      const name = sectionMatch[1].trim();
      inDeps =
        name === "dependencies" ||
        name === "dev-dependencies" ||
        name === "build-dependencies" ||
        name.endsWith(".dependencies");
      continue;
    }
    if (!inDeps || line.length === 0) continue;
    const m = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!m) continue;
    const name = m[1];
    const valueRaw = m[2].trim();
    let version: string | null = null;
    if (/^"[^"]+"$/.test(valueRaw)) {
      version = valueRaw.slice(1, -1);
    } else if (valueRaw.startsWith("{")) {
      const v = /version\s*=\s*"([^"]+)"/.exec(valueRaw);
      if (v) version = v[1];
      else if (/workspace\s*=\s*true/.test(valueRaw)) version = "workspace";
      else if (/path\s*=/.test(valueRaw)) version = "path";
      else if (/git\s*=/.test(valueRaw)) version = "git";
    }
    if (version) out.push([name, version]);
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

// ---------------------------------------------------------------------------
// Hover providers — package.json + Cargo.toml
// ---------------------------------------------------------------------------

function providePackageJsonHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const line = document.lineAt(position.line).text;
  const match = /"([^"]+)"\s*:\s*"[^"]+"/.exec(line);
  if (!match) return undefined;
  return advisoryHover(match[1]);
}

function provideCargoTomlHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  // Cargo.toml dep lines: `serde = "1.0"` or `tokio = { version = "1" }`
  const line = document.lineAt(position.line).text;
  const match = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line);
  if (!match) return undefined;
  return advisoryHover(match[1]);
}

function advisoryHover(packageName: string): vscode.Hover | undefined {
  const advs = lastScan.get(packageName.toLowerCase());
  if (!advs || advs.length === 0) return undefined;
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.appendMarkdown(`**API Vault — ${advs.length} advisory(ies) for \`${packageName}\`**\n\n`);
  for (const a of advs.slice(0, 5)) {
    const tag = a.category === "secret_leak" ? "🔑" : a.category === "supply_chain" ? "📦" : "⚠️";
    md.appendMarkdown(`- ${tag} **${a.severity}** [${a.source_id}] — ${a.summary}\n`);
  }
  if (advs.length > 5) {
    md.appendMarkdown(`\n_…and ${advs.length - 5} more — see Problems panel_`);
  }
  return new vscode.Hover(md);
}

// ---------------------------------------------------------------------------
// Code-lens provider — risky dep lines
// ---------------------------------------------------------------------------

class ManifestCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    if (lastScan.size === 0) return lenses;

    const isPackageJson = document.fileName.endsWith("package.json");
    const isCargoToml = document.fileName.endsWith("Cargo.toml");
    if (!isPackageJson && !isCargoToml) return lenses;

    for (let i = 0; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      let pkgName: string | null = null;
      if (isPackageJson) {
        const m = /"([^"]+)"\s*:\s*"[^"]+"/.exec(text);
        if (m) pkgName = m[1];
      } else if (isCargoToml) {
        const m = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(text);
        if (m) pkgName = m[1];
      }
      if (!pkgName) continue;
      const advs = lastScan.get(pkgName.toLowerCase());
      if (!advs || advs.length === 0) continue;
      const cat = advs[0].category;
      const tag = cat === "secret_leak" ? "🔑" : cat === "supply_chain" ? "📦" : "⚠️";
      const range = new vscode.Range(i, 0, i, 1);
      lenses.push(
        new vscode.CodeLens(range, {
          title: `${tag} ${advs.length} advisor${advs.length === 1 ? "y" : "ies"} (${cat})`,
          command: "workbench.actions.view.problems",
        }),
      );
    }
    return lenses;
  }
}

// ---------------------------------------------------------------------------
// Language Model tools — Copilot Chat / Claude / Cursor / any 1.96+ host
// ---------------------------------------------------------------------------

class ListCredentialsTool
  implements vscode.LanguageModelTool<{ issuer?: string; env?: string }>
{
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ issuer?: string; env?: string }>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const args: string[] = ["list", "--json"];
    if (options.input?.env) args.push("--env", options.input.env);
    if (options.input?.issuer) args.push("--issuer", options.input.issuer);
    let result: RunResult;
    try {
      result = await runCli(args);
    } catch (e) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`apivault list failed: ${(e as Error).message}`),
      ]);
    }
    let parsed: { credentials: CredentialSummary[] } = { credentials: [] };
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      // fallthrough — empty list
    }
    const summary = `${parsed.credentials.length} credential(s) — metadata only, no secret values revealed.`;
    const body = parsed.credentials
      .map((c) => `- ${c.id}  ${c.issuer}/${c.name} (${c.env}, ${c.status})`)
      .join("\n");
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(`${summary}\n${body}`),
    ]);
  }
}

class ScanSupplyChainTool
  implements vscode.LanguageModelTool<{ category_filter?: string }>
{
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<{ category_filter?: string }>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart("No workspace open — can't scan."),
      ]);
    }
    const advisories = await scanWorkspace(folder.uri.fsPath);
    cacheScanResults(advisories);
    surfaceDiagnostics(advisories);

    const filter = options.input?.category_filter;
    const filtered =
      !filter || filter === "any"
        ? advisories
        : advisories.filter((a) => a.category === filter);

    if (filtered.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Scanned ${advisories.length} matched advisor(ies); none in category '${filter ?? "any"}'. Workspace looks clean.`,
        ),
      ]);
    }
    const body = filtered
      .slice(0, 25)
      .map(
        (a) =>
          `- [${a.severity}/${a.category}] ${a.package}@${a.version} (${a.manifest}): ${a.summary} (${a.source_id})`,
      )
      .join("\n");
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `${filtered.length} advisor(ies) for ${filter ?? "any"} category:\n${body}`,
      ),
    ]);
  }
}
