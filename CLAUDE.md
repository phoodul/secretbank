# Session Rules

## 세션 시작 시
아래 파일이 존재하면 반드시 읽고 컨텍스트를 복원하라:
1. `docs/project-decisions.md` — 확정된 핵심 결정 사항. 이 파일의 내용을 근거 없이 변경하지 마라.
2. `docs/progress.md` — 워크플로우 진행 상태
3. `docs/work-log.md` — 작업 이력

## 결정 즉시 기록 (세션 끝이 아니라 결정 확정 직후)
사용자가 결정을 확정하면 **다음 작업으로 넘어가기 전에 즉시** `docs/project-decisions.md`에 기록하라.
- "나중에 한꺼번에" 기록하지 마라. 결정 하나가 확정되면 그 즉시 파일에 쓰고 다음으로 넘어가라.
- 기술 선택, 아키텍처 결정, 명명 규칙, 필수/선택 구분, 요구사항 변경 등
- "OO를 하기로 했다"는 고수준 요약이 아니라 **구체적 내용**을 적어라
- 예: "Flutter = 크로스 플랫폼 (Android, iOS, Web), 모바일 전용이 아님"

## 작업 완료 전
1. `docs/project-decisions.md`에 누락된 결정이 없는지 최종 확인하라.
2. 현재 진행 상태를 `docs/progress.md`에 업데이트하라.
3. 주요 변경이 있었다면 `docs/work-log.md`에 기록하라.

project-decisions.md가 아직 없으면 생성하라. 형식:
```markdown
# Project Decisions
## [날짜] [주제]
- 결정: ...
- 이유: ...
- 영향: ...
```

# Project Overview
@README.md

# Stack
- Framework: Tauri v2
- Backend: Rust
- Frontend: React + TypeScript (or Svelte — adjust per project)
- Styling: Tailwind CSS
- Platforms: Windows, macOS, Linux

# Environment Setup
- `npm install` — 프론트엔드 의존성 설치
- Rust + Cargo 필수 (`rustup install stable`)
- Node.js 20+ 필수
- 시스템 의존성: https://v2.tauri.app/start/prerequisites/

# Build & Test
- `cargo tauri dev` — dev mode with hot reload
- `cargo tauri build` — production build
- `cargo test` — Rust unit tests
- `npm run test` — frontend tests
- `cargo clippy` — Rust linter
- `npm run lint` — frontend linter

# Architecture
- Rust backend handles: file system, system APIs, heavy computation
- Frontend handles: UI rendering, user interaction
- Communication via Tauri commands (`#[tauri::command]`)
- Use Tauri's permission system for filesystem/network access
- Keep Rust logic in `src-tauri/src/`, frontend in `src/`

# Constraints
- Never hardcode file paths — use Tauri's path API
- Never use `unsafe` Rust without justification
- Minimize IPC calls — batch data when possible
- Test on all target platforms before release
