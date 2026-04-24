//! RAILGUARD — AI 코딩 도구용 보안 가드레일 룰 파일 생성기.
//!
//! 4가지 룰 파일 (Cursor / Windsurf / Claude / Copilot) 을 프로젝트 컨텍스트로
//! 렌더한다. 프로젝트 메타(이름, 감지된 프레임워크, 등록된 issuer 목록) 를
//! 주입해 바이브 코더가 즉시 쓸 수 있는 규칙으로 만든다.

use serde::{Deserialize, Serialize};
use thiserror::Error;

const CURSORRULES_TPL: &str = include_str!("../templates/cursorrules.tpl");
const WINDSURFRULES_TPL: &str = include_str!("../templates/windsurfrules.tpl");
const CLAUDE_MD_TPL: &str = include_str!("../templates/claude_md.tpl");
const COPILOT_INSTRUCTIONS_TPL: &str = include_str!("../templates/copilot_instructions.tpl");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuleKind {
    CursorRules,
    WindsurfRules,
    ClaudeMd,
    CopilotInstructions,
}

impl RuleKind {
    /// 프로젝트 루트 기준 출력 경로 (forward-slash, POSIX style — caller 가 PathBuf 변환).
    pub fn output_path(&self) -> &'static str {
        match self {
            RuleKind::CursorRules => ".cursorrules",
            RuleKind::WindsurfRules => ".windsurfrules",
            RuleKind::ClaudeMd => "CLAUDE.md",
            RuleKind::CopilotInstructions => ".github/copilot-instructions.md",
        }
    }

    fn template(&self) -> &'static str {
        match self {
            RuleKind::CursorRules => CURSORRULES_TPL,
            RuleKind::WindsurfRules => WINDSURFRULES_TPL,
            RuleKind::ClaudeMd => CLAUDE_MD_TPL,
            RuleKind::CopilotInstructions => COPILOT_INSTRUCTIONS_TPL,
        }
    }

    pub fn all() -> [RuleKind; 4] {
        [
            RuleKind::CursorRules,
            RuleKind::WindsurfRules,
            RuleKind::ClaudeMd,
            RuleKind::CopilotInstructions,
        ]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderContext {
    pub project_name: String,
    /// Detected frameworks, e.g. ["Next.js", "Tailwind"]. Rendered as a comma-joined list.
    pub frameworks: Vec<String>,
    /// Issuer display names present in the project, e.g. ["OpenAI", "Stripe"].
    pub issuers: Vec<String>,
}

impl RenderContext {
    pub fn new(project_name: impl Into<String>) -> Self {
        Self {
            project_name: project_name.into(),
            frameworks: Vec::new(),
            issuers: Vec::new(),
        }
    }
}

#[derive(Debug, Error)]
pub enum RenderError {
    #[error("render failed: {0}")]
    Internal(String),
}

/// 단순 `{{VAR}}` 치환. 현재는 조건/반복이 필요 없어 handlebars/tera 대신 str::replace.
pub fn render(kind: RuleKind, ctx: &RenderContext) -> Result<String, RenderError> {
    let template = kind.template();
    let frameworks = if ctx.frameworks.is_empty() {
        "general".to_string()
    } else {
        ctx.frameworks.join(", ")
    };
    let issuers = if ctx.issuers.is_empty() {
        "your providers".to_string()
    } else {
        ctx.issuers.join(", ")
    };
    let out = template
        .replace("{{PROJECT_NAME}}", &ctx.project_name)
        .replace("{{FRAMEWORKS}}", &frameworks)
        .replace("{{ISSUERS}}", &issuers);
    Ok(out)
}
