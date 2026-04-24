use api_vault_railguard::{render, RenderContext, RuleKind};

fn minimal_ctx() -> RenderContext {
    RenderContext::new("demo")
}

fn rich_ctx() -> RenderContext {
    RenderContext {
        project_name: "billing".into(),
        frameworks: vec!["Next.js".into(), "Tailwind".into(), "Prisma".into()],
        issuers: vec!["Stripe".into(), "OpenAI".into(), "GitHub".into()],
    }
}

fn assert_render_invariants(output: &str, project_name: &str, kind_label: &str) {
    assert!(
        !output.contains("{{"),
        "[{kind_label}] 치환되지 않은 placeholder '{{{{' 가 남아 있음"
    );
    assert!(
        output.contains(project_name),
        "[{kind_label}] project_name '{project_name}' 가 출력에 없음"
    );
    for n in 1..=10usize {
        assert!(
            output.contains(&format!("{n}.")),
            "[{kind_label}] rule #{n} 번호가 출력에 없음"
        );
    }
}

fn assert_rich_extras(output: &str, kind_label: &str) {
    assert!(
        output.contains("Next.js") || output.contains("Tailwind") || output.contains("Prisma"),
        "[{kind_label}] rich fixture 의 프레임워크 이름이 출력에 없음"
    );
    assert!(
        output.contains("Stripe") || output.contains("OpenAI") || output.contains("GitHub"),
        "[{kind_label}] rich fixture 의 issuer 이름이 출력에 없음"
    );
}

// ── minimal fixture × 4 rule kinds ─────────────────────────────────────────

#[test]
fn minimal_cursorrules() {
    let out = render(RuleKind::CursorRules, &minimal_ctx()).expect("render 실패");
    assert_render_invariants(&out, "demo", "minimal/cursorrules");
}

#[test]
fn minimal_windsurfrules() {
    let out = render(RuleKind::WindsurfRules, &minimal_ctx()).expect("render 실패");
    assert_render_invariants(&out, "demo", "minimal/windsurfrules");
}

#[test]
fn minimal_claude_md() {
    let out = render(RuleKind::ClaudeMd, &minimal_ctx()).expect("render 실패");
    assert_render_invariants(&out, "demo", "minimal/claude_md");
}

#[test]
fn minimal_copilot_instructions() {
    let out = render(RuleKind::CopilotInstructions, &minimal_ctx()).expect("render 실패");
    assert_render_invariants(&out, "demo", "minimal/copilot_instructions");
}

// ── rich fixture × 4 rule kinds ────────────────────────────────────────────

#[test]
fn rich_cursorrules() {
    let out = render(RuleKind::CursorRules, &rich_ctx()).expect("render 실패");
    assert_render_invariants(&out, "billing", "rich/cursorrules");
    assert_rich_extras(&out, "rich/cursorrules");
}

#[test]
fn rich_windsurfrules() {
    let out = render(RuleKind::WindsurfRules, &rich_ctx()).expect("render 실패");
    assert_render_invariants(&out, "billing", "rich/windsurfrules");
    assert_rich_extras(&out, "rich/windsurfrules");
}

#[test]
fn rich_claude_md() {
    let out = render(RuleKind::ClaudeMd, &rich_ctx()).expect("render 실패");
    assert_render_invariants(&out, "billing", "rich/claude_md");
    assert_rich_extras(&out, "rich/claude_md");
}

#[test]
fn rich_copilot_instructions() {
    let out = render(RuleKind::CopilotInstructions, &rich_ctx()).expect("render 실패");
    assert_render_invariants(&out, "billing", "rich/copilot_instructions");
    assert_rich_extras(&out, "rich/copilot_instructions");
}
