---
name: ui-prototype
description: "UX Research 결과를 기반으로 프로젝트의 디자인 시스템 초기 설정을 자동 구성한다. ux-researcher가 작성한 docs/ux_research.md를 읽고, 사용자가 승인한 옵션에 따라 토큰/테마/컴포넌트 기반 파일을 생성."
---

# UI Prototype: Design System Bootstrap

## Prerequisites

1. `docs/ux_research.md` must exist (written by ux-researcher agent)
2. User must have approved a design system option from the research report

If either is missing, inform the user and stop.

## Execution Steps

### Step 1: Read Context

- Read `docs/ux_research.md` for the approved design system
- Read `docs/project-decisions.md` for stack and UI/UX decisions
- Identify: framework, component library, motion library, theming approach

### Step 2: Install Dependencies

Based on the approved option, run the appropriate install commands:

- Identify exact packages from `docs/ux_research.md` "Packages" field
- Run the package manager command (npm/pnpm/uv/flutter pub)
- Verify installation success

### Step 3: Generate Design Token Foundation

Generate the project's design token file based on the chosen system:

**For CSS/Tailwind projects** — create `styles/tokens.css`:

- Color palette (semantic: primary, secondary, surface, error, etc.)
- Typography scale (font sizes, weights, line heights)
- Spacing scale (4px base or project-defined)
- Border radius scale
- Shadow definitions
- Breakpoints
- Motion duration/easing tokens

**For Flutter projects** — create `lib/theme/tokens.dart`:

- ColorScheme definition
- TextTheme definition
- Spacing constants
- Border radius constants

**For Tailwind v4 projects** — extend `app.css` with `@theme`:

- Map design tokens to CSS custom properties
- Define semantic color aliases

### Step 4: Generate Base Theme

Create the theme configuration file:

- Light/dark mode support
- System preference detection
- Theme switching mechanism skeleton

### Step 5: Generate Component Scaffolding

If a component library was chosen, set up the initial config:

- shadcn/ui: run `npx shadcn@latest init` with project preferences
- Material 3: configure `ThemeData` with custom tokens
- Other: create component index file referencing the library

### Step 6: Generate Accessibility Baseline

Create `lib/a11y/` or equivalent:

- Accessibility testing config (axe-core for web, accessibility inspector for Flutter)
- Focus management utilities
- Screen reader landmark structure

### Step 7: Update CLAUDE.md

Append a `# UI/UX Architecture` section to the project's CLAUDE.md:

```markdown
# UI/UX Architecture

## Design System

- Component Library: [chosen library]
- Design Tokens: [token file path]
- Theme: [theme file path]

## UI Rules

- Use design tokens for all visual values — no hardcoded colors/sizes
- Follow [chosen library] component API — do not create custom versions of existing components
- All interactive elements must have accessible labels
- Support prefers-reduced-motion and prefers-color-scheme
- [Any additional rules from ux_research.md recommendations]
```

### Step 8: Update project-decisions.md

Record the design system decision immediately.

## Constraints

- NEVER choose a design system without user approval
- Generate MINIMAL scaffolding — only what's needed to start
- Do NOT create sample pages or demo components
- Match the project's existing code style and conventions
- If the project already has UI files, integrate rather than overwrite
