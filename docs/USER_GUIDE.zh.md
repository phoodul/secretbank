# Secretbank — 用户指南（简体中文）

> 理解依赖图的密钥管理工具。不仅存储密钥，还告诉你**谁在使用、用在哪里、撤销后会破坏什么**。

本指南涵盖桌面应用、CLI、MCP 服务器、VS Code 扩展 — 按使用频率排序。

---

## 目录

1. [安装与首次启动](#1-安装与首次启动)
2. [桌面端 — 凭证管理](#2-桌面端--凭证管理)
3. [桌面端 — 依赖图 / 影响范围](#3-桌面端--依赖图--影响范围)
4. [桌面端 — 事件源（NVD/GHSA）](#4-桌面端--事件源nvdghsa)
5. [桌面端 — 紧急吊销（Kill Switch）](#5-桌面端--紧急吊销kill-switch)
6. [桌面端 — RAILGUARD（AI 编辑器防护）](#6-桌面端--railguardai-编辑器防护)
7. [桌面端 — 供应链扫描](#7-桌面端--供应链扫描)
8. [桌面端 — 多设备同步](#8-桌面端--多设备同步)
9. [CLI — `Secretbank`](#9-cli--Secretbank)
10. [MCP 服务器 — Claude / Cursor / Copilot Chat](#10-mcp-服务器--claude--cursor--copilot-chat)
11. [VS Code 扩展](#11-vs-code-扩展)
12. [备份与恢复](#12-备份与恢复)
13. [故障排除](#13-故障排除)
14. [常见问题](#14-常见问题)

---

## 1. 安装与首次启动

### 1.1 系统要求

- Windows 10+ (x64)、macOS 12+（Apple Silicon 或 Intel）、Linux（Ubuntu 22+ / glibc 2.35+）。
- 100 MB 磁盘空间，200 MB 内存。
- 网络**可选**。仅同步、事件源、供应链扫描需要联网。本地金库完全离线工作。

### 1.2 安装

| 平台    | 方式                                                           |
| :------ | :------------------------------------------------------------- |
| Windows | `secretbank_x64-setup.exe` 或 `winget install secretbank`      |
| macOS   | `secretbank_universal.dmg` 或 `brew install --cask secretbank` |
| Linux   | `.deb` / `.AppImage` / `.rpm` 或 `snap install secretbank`     |

构建版本：https://github.com/phoodul/secretbank/releases

### 1.3 首次启动 — 设置主密码

1. 首次启动时显示 "**Create vault**"（创建金库）。
2. 输入主密码（建议 16 字符以上 — 4–6 个随机单词）。
3. 选择 Vault Charter 模式（推荐：**Single charter** 单宪章模式）。点击 **Create vault**，会显示一份可打印的宪章 — 6 个 Diceware 单词加 4 位验证码。**打印或写在纸上，离线保存。** 不要粘贴到剪贴板管理器。宪章只显示一次。
4. 确认 "I've saved it"（已保存），创建一个空金库。（Shamir 2-of-3 模式与恢复说明详见 §12.3。）

> ⚠️ 如果你**同时**丢失主密码和 Vault Charter，数据将**无法恢复**。我们也无能为力 — 这是 Zero-Knowledge 架构的代价。

### 1.4 锁定与解锁

- 闲置 5 分钟后自动锁定（可配置）。
- 右键单击托盘 / 菜单栏图标 → **Lock vault** 立即锁定。
- 输入密码解锁。连续 5 次失败后冷却 1 分钟。

---

## 2. 桌面端 — 凭证管理

### 2.1 创建凭证

1. 侧边栏 **Credentials** → **+ New**。
2. 必填项：
   - **Issuer** — `OpenAI`、`Stripe`、`AWS` 等。快速选择 + 自动补全。
   - **Name** — 易读名称，如 `prod-billing-key`。
   - **Value** — 密钥/令牌。输入时遮罩显示。
3. 可选项：
   - **Environment** — `dev` / `staging` / `prod` 标签。
   - **Expires at** — 过期前 7 天自动通知。
   - **Scopes / Notes** — 自由文本。
4. **Save** — 加密存储到本地 SQLite。明文从内存中立即清零。

### 2.2 查看 / 复制

- 点击条目 → 侧边栏显示元数据。
- **Reveal** — 重新输入密码后显示明文 30 秒。
- **Copy** — 复制到剪贴板，30 秒后自动清除（可配置）。
- **History** — 过去的轮换记录（保留最近 5 代）。

### 2.3 搜索与筛选

- Cmd/Ctrl + K → 全局命令面板。
  - 组合筛选：`> issuer:openai env:prod`。
- 左上角搜索框支持模糊匹配。

### 2.4 轮换（Rotate）

1. 凭证条目的 ⋮ 菜单 → **Rotate**。
2. 粘贴新值 — 旧值移到 history。
3. 切换 **Verify with provider**（测试期免费 — 见 §14 常见问题；Pro 套餐尚未启用）以 ping 服务商 healthcheck。

---

## 3. 桌面端 — 依赖图 / 影响范围

### 3.1 依赖图

侧边栏 **Graph** → 全屏。

```
Issuer ─▶ Credential ─▶ Usage（代码位置）─▶ Project ─▶ Deployment ─▶ URL
```

- 双击节点查看详情。
- 在顶部搜索栏输入名称聚焦并高亮邻居节点。
- 节点颜色表示风险评分（绿色 = 安全，红色 = 高风险）— **仅供参考，不是绝对值**。

### 3.2 注册使用位置（Usage）

只有当系统知道每个密钥被消费的位置时，依赖图才有意义。

**自动（推荐）— Drop-zone 扫描：**

1. 侧边栏 **Scan** → 拖入项目文件夹。
2. 通过 regex + AST 检测 `.env*`、`process.env.X`、`os.getenv("X")`、`Bun.env.X`。
3. 列出每个发现，选择匹配的凭证并 **Link**（关联）。

**手动**：凭证详情 → **Add usage** → 输入文件路径 + 行号。

### 3.3 Blast Radius 模拟（影响范围预览）

1. 凭证详情 → **Blast Radius**。
2. 撤销时会受影响的节点显示为红色 — **仅预览**。
3. 点击 **Apply** 才会真正执行。
4. 影响范围确认无误后，使用 **Revoke** 进行撤销。

---

## 4. 桌面端 — 事件源（NVD/GHSA）

### 4.1 功能说明

- 后台轮询 NVD、GHSA、主要 issuer 的 RSS 源。
- 仅在本地与你的凭证 `issuer` slug 进行匹配。
- 服务器永远不知道你拥有哪些密钥。

### 4.2 视图

侧边栏 **Incidents**：

- **Affecting you** — 与你的金库匹配的事件。
- **All** — 所有轮询到的事件。

每张卡片显示：

- 标题、发布日期、来源链接。
- **Affected credentials** — 与此事件匹配的 N 个凭证。
- **Action** — `Rotate`（轮换）、`Snooze`（暂缓）、`Mark resolved`（标记已解决）。

### 4.3 通知

- 命中时显示原生 OS toast（Tauri notification 插件）。
- 设置中可配置静默时段 / 周末模式。

---

## 5. 桌面端 — 紧急吊销（Kill Switch）

### 5.1 使用场景

- 笔记本丢失、GitHub push 泄露、同事被迫离职。
- 单个密钥、整个 issuer，或一次撤销所有 `prod` 凭证。

### 5.2 操作步骤

1. 凭证详情 → **Kill**（红色按钮）。
2. 确认对话框：blast-radius 预览 + 重新输入密码。
3. 撤销后审计日志记录此事件，并在事件源中添加自报告事件。

### 5.3 Auto-revoke（测试期免费，Pro 启用前所有人可用）

支持 `revoke` 端点的 issuer（Stripe、GitHub PAT 等），kill switch 可以同时调用 API 让服务器端也失效。**v0.1.0-pre8 测试期对所有用户开放**（§14 FAQ）。

---

## 6. 桌面端 — RAILGUARD（AI 编辑器防护）

防止 AI 编辑器（Cursor、Copilot、Claude Code）通过训练、日志或外部调用意外泄漏你的密钥。

### 6.1 工作原理

1. 分析金库中的凭证模式 → 自动生成 regex 规则集。
2. 以 `.cursorrules` / `CLAUDE.md` / `.github/copilot-instructions.md` 格式导出规则集。
3. 放在项目根目录，AI 编辑器会拦截 / 遮罩密钥的 I/O。

### 6.2 使用方法

1. 侧边栏 **RAILGUARD** → **Generate**。
2. 选择目标编辑器（可多选）。
3. 选择项目目录 → 写入规则集文件。
4. **Verify** 运行示例场景，确认编辑器实际应用了规则集。

### 6.3 自动更新

- 添加新凭证时可自动刷新规则集（设置）。
- 应用前以 diff 形式显示更新供你审核。

---

## 7. 桌面端 — 供应链扫描

这是相对于 1Password / Doppler / Infisical 的核心差异化优势。

### 7.1 检查内容

检查项目的 npm / Cargo / PyPI 依赖在 OSV.dev 数据库中是否有**密钥泄漏历史**。读取 lockfile 进行精确版本匹配，而非近似匹配。

### 7.2 运行扫描

1. **Scan** → **Add project** → 选择项目根目录。
2. **Run scan**。
3. 结果：
   - 找到的 manifests / 检测的依赖数 / 匹配的告警数。
   - 分类：secret-leak、supply-chain、crypto-weak。
   - 点击告警跳转到 OSV / GHSA 源。

### 7.3 与依赖图集成

扫描结果自动写入依赖图：

- `Project` → `Package`（按风险着色）→ 受影响的 `Credential`。
- 跨域影响范围叙事："此 npm 包有已知的密钥泄漏历史 → 此项目依赖它 → 这些凭证存在风险。"

### 7.4 支持的 manifest

| 生态系统          | Manifest       | Lockfile（精确版本解析）              |
| :---------------- | :------------- | :------------------------------------ |
| npm / pnpm / yarn | `package.json` | `package-lock.json`、`pnpm-lock.yaml` |
| Cargo（Rust）     | `Cargo.toml`   | `Cargo.lock`                          |

PyPI / GoMod / Maven：目前只支持 manifest（lockfile 解析在规划中）。

---

## 8. 桌面端 — 多设备同步

> **测试期状态**：当前对所有用户免费（测试期 Pro 套餐尚未启用 — §14 FAQ）。从第二台设备读写同一金库。

### 8.1 配对（Pair）

**设备 1（host）** — Settings → **Sync** → **Pair new device** → 显示 6 位 PIN（60 秒 TTL）。

**设备 2（joiner）**：

1. 全新安装时，在首次启动屏幕选择 **Pair with another device**。
2. 输入 host 的 PIN。
3. 建立 X25519 ECDH 通道，安全传输主密码 / 密钥材料。
4. 不需要重新输入主密码。

### 8.2 Zero-knowledge 保证

- 中继服务器仅存储密文。明文、主密钥，甚至依赖图节点名称都在客户端加密。
- AAD（附加认证数据）将每段密文绑定到 `user:<userId>:cred:<credId>` — 防止交换攻击。

### 8.3 冲突解决

- Yjs CRDT 按意图自动合并（不是 last-write-wins）。
- 必要时冲突会显示在 Sync 标签页供手动审核。

---

## 9. CLI — `Secretbank`

同一金库，无 GUI。

### 9.1 安装

桌面安装程序会将其添加到 PATH。或者：

```sh
brew install secretbank           # macOS
winget install secretbank         # Windows
cargo install secretbank-cli      # 所有平台
```

### 9.2 命令

```sh
Secretbank list [--issuer <slug>] [--env dev|staging|prod]
# 列出凭证（不显示值）。

Secretbank reveal <id-or-name>
# 输入密码 → 值输出到 stdout。30 秒后退出。

Secretbank run <id-or-name> -- <command>
# 将凭证注入环境变量后执行命令。
# 示例：Secretbank run prod-stripe -- npm run deploy
```

### 9.3 环境变量注入（`run`）

`Secretbank run` 仅将选中的凭证放入子进程的环境变量。通过 `Secretbank.json` 将凭证 ID 映射到环境变量名：

```json
{
  "credentials": [
    { "id": "prod-stripe", "env": "STRIPE_SECRET_KEY" },
    { "id": "prod-openai", "env": "OPENAI_API_KEY" }
  ]
}
```

```sh
Secretbank run --config Secretbank.json -- node server.js
```

### 9.4 安全提示

- 明文仅存在于子进程内存中；CLI 退出时清零。
- 故意没有 `--print` 标志 — 不要 `echo` `Secretbank reveal` 的结果。
- 注意 shell 历史记录。直接使用值，不要捕获。

---

## 10. MCP 服务器 — Claude / Cursor / Copilot Chat

通过 [Model Context Protocol](https://modelcontextprotocol.io) 与金库对话。

### 10.1 启动服务器

```sh
Secretbank mcp serve              # stdio（Claude Desktop / Cursor）
Secretbank mcp serve --port 3737  # SSE（Copilot Chat 等）
```

### 10.2 暴露的工具

| 工具                         | 说明                          |
| :--------------------------- | :---------------------------- |
| `list_credentials`           | 仅元数据，不返回值            |
| `reveal_credential`          | 经用户 OS 确认对话框后返回值  |
| `check_railguard_status`     | 项目中是否存在 RAILGUARD 规则 |
| `suggest_railguard_template` | 生成针对各编辑器的规则集草稿  |
| `check_supply_chain_risk`    | 对当前项目运行供应链扫描      |

### 10.3 Claude Desktop

`~/.claude/mcp.json`：

```json
{
  "mcpServers": {
    "secretbank": {
      "command": "Secretbank",
      "args": ["mcp", "serve"]
    }
  }
}
```

重启后，在聊天中：`@secretbank list openai`。

### 10.4 Cursor

Settings → MCP → 添加相同的 JSON。

### 10.5 权限模型

- `reveal_credential` **始终**需要 OS 确认对话框。AI 无法绕过。
- 每次调用都记录在审计日志中。

---

## 11. VS Code 扩展

### 11.1 安装

- 在 VS Code Marketplace 搜索 "Secretbank"。
- 或在 Open VSX 搜索同名扩展。

### 11.2 命令（命令面板）

- `Secretbank: List credentials`
- `Secretbank: Reveal credential` — 输入密码 → 复制到剪贴板。
- `Secretbank: Scan workspace for supply-chain risk`

### 11.3 Language Model 工具（VS Code 1.96+）

任何实现 VS Code LM tool API 的聊天宿主 — Copilot Chat、Claude、Cursor — 都会自动识别：

- `#Secretbank` — 列出凭证。
- `#supplyrisk` — 供应链扫描。

### 11.4 编辑器界面

- **状态栏** — 盾牌图标 → 打开凭证列表。
- **悬停** — 在 `package.json` / `Cargo.toml` 的依赖行上悬停查看上次扫描的告警提示。
- **Code lens** — 风险依赖行显示内联 "🔑 N advisor(ies)" lens。点击 → Problems 面板。
- **Problems 面板** — 来源为 `secretbank` 的诊断。

### 11.5 设置

```json
{
  "Secretbank.cliPath": "Secretbank",
  "Secretbank.scanOnStartup": false
}
```

---

## 12. 备份与恢复

### 12.1 备份

- Settings → **Export encrypted backup** → 生成 `.Secretbank-backup` 文件。
- 文件用主密码加密 — 可以安全地放在云端。
- 建议：每周一次 + 每次更改主密码后。

### 12.2 恢复（新设备或重新安装）

1. 在首次启动屏幕选择 **Restore from backup**。
2. 提供备份文件 + 主密码。
3. 完成。依赖图、usage、RAILGUARD 规则集 — 全部保留。

### 12.3 丢失主密码 — Vault Charter

创建金库时可以颁发 **Vault Charter** — 这是密码丢失时唯一能解锁金库的密钥。中继服务器无能为力：你的数据在本设备上端到端加密。

两种模式（创建金库时选择，恢复时可更改）：

- **Single charter**（推荐）。6 个 Diceware 单词 + 4 位验证码。一张纸，离线保存。

  ```
  TUNDRA HARBOR FLINT MOTH OPAL CASCADE - 7042
  ```

  4 位验证码可立即拒绝单词级别的拼写错误 — 不会在你不知情的情况下生成无用的恢复密钥。

- **Shamir 2-of-3**（高级）。三张纸，**任意两张**可重建宪章。分发给家人 / 律师 / 保险柜 — 丢失一张不会丢失金库，且单张被盗不会泄漏关于密钥的任何比特。

恢复步骤：

1. 在锁定屏幕，点击 **Forgot your passphrase?**
2. 选择你使用的模式（single / Shamir）。
3. 输入宪章（或任意 2/3 份额）和新密码。
4. 金库会以新密码重新颁发。旧宪章作废；可选择颁发新宪章（推荐 — 旧宪章在纸上可能已泄漏）。

可选 **7 天冷却**（Settings → Security）：恢复后即使密码正确，金库也拒绝解锁 7 天。这是针对 "笔记本被盗 + 宪章被盗" 场景的纵深防御 — 给你时间远程擦除金库文件。

宪章也丢了？数据无法恢复。这是 Zero-Knowledge 的代价。

---

## 13. 故障排除

### 13.1 Windows — "Windows 已保护你的电脑" SmartScreen 警告

**现象：** 首次启动时，Windows 显示 "Microsoft Defender SmartScreen 已阻止启动无法识别的应用"。

**原因：** 在我们购买 Windows OV/EV 代码签名证书之前（出货后采购 — 不在 v0.1.x 之内），安装程序未签名。SmartScreen 会标记每个未签名的 `.exe`，直到足够多的用户安装建立 "声誉"。

**解决方法（用户）：** 点击 **More info** → **Run anyway**。金库不受影响 — 二进制文件与 GitHub Actions 从公开 AGPL 源代码构建的相同。

**解决方法（我们，出货后）：** 一旦发布 OV 证书，新安装将不再显示此警告。

### 13.2 macOS — "App is damaged and can't be opened"

**现象：** macOS 拒绝启动应用，提示已损坏。

**原因：** Gatekeeper 阻止来自未识别开发者的未公证应用。v0.1.x 我们有 Tauri 更新签名密钥但尚未取得 Apple Developer 公证。

**解决方法：**

```sh
xattr -cr "/Applications/Secretbank.app"
```

此命令会去除 Gatekeeper 在下载时添加的隔离属性。之后双击即可正常启动。

或者，在 **Security & Privacy** 面板中，首次启动失败后点击 **Open Anyway**。

### 13.3 Linux — `error while loading shared libraries: libwebkit2gtk-4.1.so.0`

**现象：** 在 Ubuntu/Debian 上提示缺少库文件。

**原因：** Tauri v2 需要 WebKit2GTK 4.1（比某些发行版默认的 GTK 4.0 更新）。

**解决方法（Debian/Ubuntu）：**

```sh
sudo apt-get install -y libwebkit2gtk-4.1-0 libayatana-appindicator3-1
```

**解决方法（Fedora/RHEL）：**

```sh
sudo dnf install -y webkit2gtk4.1 libappindicator-gtk3
```

### 13.4 输入正确密码却显示 "Vault is locked"

**可能原因：**

1. **冷却生效中** — Charter 恢复后（默认 7 天）。Settings → Security → "Charter recovery cooldown" 可查看是否启用。解决方法：等待，或点击 **Clear cooldown**（已审计）。
2. **错误的金库文件。** 默认路径：`~/.local/share/secretbank/vault.age`（Linux）、`~/Library/Application Support/secretbank/vault.age`（macOS）、`%APPDATA%\secretbank\vault.age`（Windows）。如果你迁移机器时没有复制此文件，那就是空的新金库。
3. **Caps Lock 或不同键盘布局。** 听起来很基础 — 但仍是头号原因。

### 13.5 自动更新器找不到新版本

**现象：** 即使 GitHub 有新 Release，仍显示 "You're up to date"。

**诊断：**

- 检查 **Settings → Updates** 中上次检查的时间戳。
- 验证可访问 `github.com`（更新器请求 `releases/latest/download/latest.json`）。
- 对预发布标签（`v0.1.0-pre1`），更新器在稳定通道上**故意**跳过。

**强制刷新：**

1. 退出应用。
2. 删除更新器缓存：
   - macOS：`~/Library/Caches/secretbank/updater/`
   - Linux：`~/.cache/secretbank/updater/`
   - Windows：`%LOCALAPPDATA%\secretbank\Cache\updater\`
3. 重新启动。

### 13.6 CLI — `Secretbank: command not found`

CLI 二进制随桌面应用一起安装。将其添加到 PATH：

| OS               | 路径                                                     |
| :--------------- | :------------------------------------------------------- |
| macOS            | `/Applications/Secretbank.app/Contents/MacOS/Secretbank` |
| Linux (deb/rpm)  | `/usr/bin/Secretbank`                                    |
| Linux (AppImage) | 先解压，二进制位于 `usr/bin/Secretbank`                  |
| Windows          | `%LOCALAPPDATA%\Programs\secretbank\Secretbank.exe`      |

为方便起见，软链接到已在 PATH 上的目录：

```sh
# macOS
sudo ln -s "/Applications/Secretbank.app/Contents/MacOS/Secretbank" /usr/local/bin/Secretbank

# Linux
sudo ln -s /usr/bin/Secretbank /usr/local/bin/Secretbank

# Windows（PowerShell 管理员）
New-Item -ItemType SymbolicLink -Path "C:\Windows\Secretbank.exe" `
  -Target "$env:LOCALAPPDATA\Programs\secretbank\Secretbank.exe"
```

### 13.7 MCP 服务器未在 Claude Desktop / Cursor 中显示

**验证配置：**

- Claude Desktop：`~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）或 `%APPDATA%\Claude\claude_desktop_config.json`（Windows）。本指南 §10.3 有完整 JSON。
- Cursor：`~/.cursor/mcp.json`。

**常见错误：**

- Windows 上路径使用单反斜杠 — 在 JSON 中必须**双重转义**：`"C:\\Users\\you\\..."`。
- Claude Desktop 必须**完全退出**（不仅仅是关闭）才能重新加载配置：托盘图标 → Quit，然后重启。
- 当 host 调用 `reveal_credential` 时，金库必须**已解锁** — MCP 服务器查询活动的桌面会话。锁定 = 空。

### 13.8 Charter 恢复被拒绝 — "Charter does not unlock this vault"

宪章通过**内容**（6 个单词）和**验证码**（旁边打印的 4 位数字）双重验证。任何单词中的一个字母拼错都会导致 SHA-256 校验失败，在尝试任何解密前就被拒绝。

步骤：

1. 对照打印件重新检查**6 个单词**。单词使用 EFF large wordlist — 常见的短英文单词。
2. 重新检查**4 位验证码**（`0000` 到 `9999` 之间的数字）。它不区分大小写但必须完全相同。
3. Shamir 2-of-3：只需要**任意 2/3** 份额。如果你有三份，尝试不同的两份组合 — 一份可能有拼写错误，另外两份是干净的。

如果单词完全正确但恢复仍失败，金库文件本身可能已被替换（例如，OS 重新安装覆盖了你的数据目录）。在这种情况下，宪章是给另一个金库的，无法恢复。

---

## 14. 常见问题

**Q. 这与 1Password / Bitwarden 有何不同？**
A. 它们是金库。我们是金库 + **依赖图** + **影响范围模拟** + **供应链扫描** + **RAILGUARD**，全部一站式。你可以看到哪些代码、部署和 URL 依赖每个密钥 — 以及撤销时会破坏什么。

**Q. 什么是免费的？**
A. **测试期内一切都免费** — 包括多设备 E2EE 同步、auto-revoke、自动轮换。我们将仅在以下条件满足后引入 Pro 套餐：(1) 我们自己使用应用一周以了解真实工作流程；(2) 律师审查了我们的条款 / 隐私 / 支付政策；(3) 我们交付通用密码金库功能 (M24)；(4) 收集大约 100–500 名用户的反馈。在那之前，**$0 / 无需信用卡 / 本地金库无需账户**。

**Q. 接下来会有什么？**
A. 路线图（未承诺日期）：

- **通用密码金库**（1Password 风格）— M24，正在积极设计中
- 针对 Stripe / GitHub / AWS API 密钥的 Auto-revoke
- 各服务商的 Auto-rotation 钩子
- 浏览器扩展（Chrome / Firefox / Safari）
- 团队 / 组织 / 共享金库（RBAC + SSO）
- 移动应用（iOS / Android — Tauri Mobile）

**Q. Pro 定价何时开始？**
A. 我们不承诺日期。触发条件是上述四个。我们将提前 30 天宣布。现有数据不受影响 — 本地金库永久保持 AGPL-3.0。

**Q. 如果你们公司倒闭怎么办？**
A. 你的数据保留在磁盘上，以加密的 SQLite 形式存储。CLI 和桌面应用是 AGPL — 自己构建并继续使用。

**Q. 同步服务器能读取我的密钥吗？**
A. 不能。它只存储设备上产生的 ChaCha20-Poly1305 密文。服务器源代码在 [`/ee/`](../ee/) 中可供验证。

**Q. 我想贡献代码。**
A. https://github.com/phoodul/secretbank — 欢迎 issues 和 PRs。合并前需要 CLA。

**Q. 我发现了安全问题。**
A. 通过 PGP 加密邮件发送到 security@secretbank.app。90 天负责任披露。

---

最后更新：2026-05-04 — v0.1.0-pre8 第一个有效预发布 + 测试期免费定价政策决定 + M24（通用密码）里程碑新增。
