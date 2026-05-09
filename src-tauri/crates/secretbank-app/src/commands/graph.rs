//! Tauri commands for the dependency graph (T043).
//!
//! `graph_fetch` returns a React Flow-friendly payload (nodes + edges) built
//! from the full entity slices in SQLite. `blast_radius_for_credential` runs
//! the BFS engine from `secretbank-core` and returns the bucketed result.
//! `graph_for_credential` returns a 1-hop mini-graph for extension popup hover
//! (T-24-E-G1-1): center = credential, fan-out = projects.

use std::collections::HashMap;

use secretbank_core::{
    blast_radius::blast_radius,
    graph::{DependencyGraph, EdgeKind, NodeRef},
    BlastRadius, CredentialId, Deployment, DeploymentPlatform, Env, Issuer,
};
use secretbank_storage::sqlite::{
    repositories::{
        credential::CredentialRepo, deployment::DeploymentRepo, issuer::IssuerRepo,
        project::ProjectRepo, usage::UsageRepo,
    },
    StorageError,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;

use crate::context::AppContext;

// ---------------------------------------------------------------------------
// Mini-graph wire types (T-24-E-G1-1)
// ---------------------------------------------------------------------------

/// 최대 표시 project 노드 수 (popup 인지부하 제한 — M24 1.5 MAX_VISIBLE 정책).
const MAX_VISIBLE_PROJECTS: usize = 5;

/// mini-graph 의 project 노드 하나.
///
/// credential plaintext 없음 — id/label/env 최소 정보만.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MiniGraphProjectNode {
    pub id: String,
    pub label: String,
    /// "prod" / "staging" / "dev"
    pub env: String,
}

/// mini-graph 의 에지 하나 (credential → project).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MiniGraphEdge {
    pub from: String,
    pub to: String,
}

/// extension popup hover 에 응답할 1-hop subgraph.
///
/// - `center_label`: issuer name + masked credential name (plaintext ❌).
/// - `project_nodes`: credential → project 1-hop 팬아웃 (최대 MAX_VISIBLE_PROJECTS).
/// - `edges`: center → project 엣지.
/// - `hidden_count`: 잘린 project 수 ("+N more" UI 표시용).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CredentialMiniGraph {
    pub center_id: String,
    pub center_label: String,
    pub project_nodes: Vec<MiniGraphProjectNode>,
    pub edges: Vec<MiniGraphEdge>,
    pub hidden_count: usize,
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Issuer,
    Credential,
    Project,
    Deployment,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphNode {
    /// Stable node id (ULID string). Maps to React Flow `Node.id`.
    pub id: String,
    pub kind: NodeKind,
    /// Human-readable label for the node.
    pub label: String,
    /// Per-kind extra fields for frontend enrichment.
    pub meta_json: serde_json::Value,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GraphEdgeKind {
    Issues,
    UsedBy,
    DeployedAs,
}

impl From<EdgeKind> for GraphEdgeKind {
    fn from(k: EdgeKind) -> Self {
        match k {
            EdgeKind::Issues => GraphEdgeKind::Issues,
            EdgeKind::UsedBy => GraphEdgeKind::UsedBy,
            EdgeKind::DeployedAs => GraphEdgeKind::DeployedAs,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphEdge {
    /// Deterministic edge id: `"{source}->{target}:{kind:?}"`.
    pub id: String,
    pub source: String,
    pub target: String,
    pub kind: GraphEdgeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphPayload {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "snake_case")]
pub enum GraphCommandError {
    #[error("internal: {message}")]
    Internal { message: String },
}

impl From<StorageError> for GraphCommandError {
    fn from(e: StorageError) -> Self {
        Self::Internal {
            message: e.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Shared graph loader
// ---------------------------------------------------------------------------

async fn load_graph(state: &State<'_, AppContext>) -> Result<DependencyGraph, StorageError> {
    let issuers = IssuerRepo::new(&state.pool).list().await?;
    let credentials = CredentialRepo::new(&state.pool).list_all().await?;
    let usages = UsageRepo::new(&state.pool).list_all().await?;
    let projects = ProjectRepo::new(&state.pool).list().await?;
    let deployments = DeploymentRepo::new(&state.pool).list_all().await?;

    Ok(DependencyGraph::build(
        &issuers,
        &credentials,
        &usages,
        &projects,
        &deployments,
    ))
}

// ---------------------------------------------------------------------------
// Node-id helper
// ---------------------------------------------------------------------------

fn node_id_string(nr: NodeRef) -> String {
    match nr {
        NodeRef::Issuer(id) => id.to_string(),
        NodeRef::Credential(id) => id.to_string(),
        NodeRef::Project(id) => id.to_string(),
        NodeRef::Deployment(id) => id.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Node label / meta builder
// ---------------------------------------------------------------------------

fn env_str(env: Env) -> &'static str {
    match env {
        Env::Dev => "dev",
        Env::Staging => "staging",
        Env::Prod => "prod",
    }
}

fn platform_str(p: DeploymentPlatform) -> &'static str {
    match p {
        DeploymentPlatform::Vercel => "vercel",
        DeploymentPlatform::Railway => "railway",
        DeploymentPlatform::Fly => "fly",
        DeploymentPlatform::Netlify => "netlify",
        DeploymentPlatform::Other => "other",
    }
}

fn deployment_label(dep: &Deployment) -> String {
    format!("{} @ {}", dep.url, env_str(dep.env))
}

fn to_graph_node(
    nr: NodeRef,
    issuer_map: &HashMap<String, &secretbank_core::Issuer>,
    cred_map: &HashMap<String, &secretbank_core::Credential>,
    project_map: &HashMap<String, &secretbank_core::Project>,
    dep_map: &HashMap<String, &Deployment>,
) -> GraphNode {
    let id = node_id_string(nr);
    match nr {
        NodeRef::Issuer(_) => {
            let (label, meta) = issuer_map
                .get(&id)
                .map(|iss| {
                    let label = iss.display_name.clone();
                    let meta = json!({
                        "slug": iss.slug,
                        "docs_url": iss.docs_url,
                        "icon_key": iss.icon_key,
                    });
                    (label, meta)
                })
                .unwrap_or_else(|| (format!("<missing issuer: {id}>"), json!({})));
            GraphNode {
                id,
                kind: NodeKind::Issuer,
                label,
                meta_json: meta,
            }
        }
        NodeRef::Credential(_) => {
            let (label, meta) = cred_map
                .get(&id)
                .map(|cred| {
                    let label = cred.name.clone();
                    let meta = json!({
                        "env": env_str(cred.env),
                        "status": format!("{:?}", cred.status).to_lowercase(),
                        "issuer_id": cred.issuer_id.to_string(),
                        "expires_at": cred.expires_at.map(|t| t.unix_timestamp_nanos() / 1_000_000),
                    });
                    (label, meta)
                })
                .unwrap_or_else(|| (format!("<missing credential: {id}>"), json!({})));
            GraphNode {
                id,
                kind: NodeKind::Credential,
                label,
                meta_json: meta,
            }
        }
        NodeRef::Project(_) => {
            let (label, meta) = project_map
                .get(&id)
                .map(|proj| {
                    let label = proj.name.clone();
                    let meta = json!({
                        "repo_url": proj.repo_url,
                        "framework": proj.framework,
                    });
                    (label, meta)
                })
                .unwrap_or_else(|| (format!("<missing project: {id}>"), json!({})));
            GraphNode {
                id,
                kind: NodeKind::Project,
                label,
                meta_json: meta,
            }
        }
        NodeRef::Deployment(_) => {
            let (label, meta) = dep_map
                .get(&id)
                .map(|dep| {
                    let label = deployment_label(dep);
                    let meta = json!({
                        "platform": platform_str(dep.platform),
                        "env": env_str(dep.env),
                        "url": dep.url,
                        "project_id": dep.project_id.to_string(),
                    });
                    (label, meta)
                })
                .unwrap_or_else(|| (format!("<missing deployment: {id}>"), json!({})));
            GraphNode {
                id,
                kind: NodeKind::Deployment,
                label,
                meta_json: meta,
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn graph_fetch(state: State<'_, AppContext>) -> Result<GraphPayload, GraphCommandError> {
    let issuers = IssuerRepo::new(&state.pool).list().await?;
    let credentials = CredentialRepo::new(&state.pool).list_all().await?;
    let usages = UsageRepo::new(&state.pool).list_all().await?;
    let projects = ProjectRepo::new(&state.pool).list().await?;
    let deployments = DeploymentRepo::new(&state.pool).list_all().await?;

    let graph = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);

    // Index entities by ULID string for O(1) label/meta lookup.
    let issuer_map: HashMap<String, &Issuer> =
        issuers.iter().map(|i| (i.id.to_string(), i)).collect();
    let cred_map: HashMap<String, &secretbank_core::Credential> =
        credentials.iter().map(|c| (c.id.to_string(), c)).collect();
    let project_map: HashMap<String, &secretbank_core::Project> =
        projects.iter().map(|p| (p.id.to_string(), p)).collect();
    let dep_map: HashMap<String, &Deployment> =
        deployments.iter().map(|d| (d.id.to_string(), d)).collect();

    let nodes: Vec<GraphNode> = graph
        .nodes()
        .map(|nr| to_graph_node(nr, &issuer_map, &cred_map, &project_map, &dep_map))
        .collect();

    let edges: Vec<GraphEdge> = graph
        .edges()
        .map(|(src, dst, kind)| {
            let src_id = node_id_string(src);
            let dst_id = node_id_string(dst);
            let gkind: GraphEdgeKind = kind.into();
            GraphEdge {
                id: format!("{src_id}->{dst_id}:{kind:?}"),
                source: src_id,
                target: dst_id,
                kind: gkind,
            }
        })
        .collect();

    Ok(GraphPayload { nodes, edges })
}

#[tauri::command]
pub async fn blast_radius_for_credential(
    id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<BlastRadius, GraphCommandError> {
    let graph = load_graph(&state).await?;
    Ok(blast_radius(&graph, id))
}

/// Extension popup hover 용 credential 1-hop mini-graph 반환 (T-24-E-G1-1).
///
/// center = credential, 팬아웃 = UsedBy 에지로 연결된 project 들.
/// project 가 MAX_VISIBLE_PROJECTS(5) 초과이면 앞 5개만 포함하고
/// `hidden_count` 에 나머지 수를 담는다.
///
/// center_label = issuer display_name (credential plaintext ❌).
/// audit log 1건 (`extension.graph.fetch`) 기록.
#[tauri::command]
pub async fn graph_for_credential(
    credential_id: CredentialId,
    state: State<'_, AppContext>,
) -> Result<CredentialMiniGraph, GraphCommandError> {
    use secretbank_audit::{actions, AuditActor};

    let issuers = IssuerRepo::new(&state.pool).list().await?;
    let credentials = CredentialRepo::new(&state.pool).list_all().await?;
    let usages = UsageRepo::new(&state.pool).list_all().await?;
    let projects = ProjectRepo::new(&state.pool).list().await?;
    let deployments = DeploymentRepo::new(&state.pool).list_all().await?;

    let graph = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);

    // center_label — issuer display_name (credential plaintext 없음).
    let cred = credentials.iter().find(|c| c.id == credential_id);
    let issuer_name = cred
        .and_then(|c| issuers.iter().find(|i| i.id == c.issuer_id))
        .map(|i| i.display_name.clone())
        .unwrap_or_else(|| credential_id.to_string());
    let center_label = issuer_name;

    // project_map: ProjectId → Project (label/env 조회용).
    let project_map: HashMap<String, &secretbank_core::Project> =
        projects.iter().map(|p| (p.id.to_string(), p)).collect();

    // 1-hop: credential → UsedBy → project.
    let mini = extract_credential_mini_graph(&graph, credential_id, &project_map, &center_label);

    // audit log (best-effort).
    state
        .audit
        .record(
            AuditActor::LocalUser,
            actions::EXT_GRAPH_FETCH,
            "credential",
            credential_id.to_string(),
            None,
        )
        .await;

    Ok(mini)
}

// ---------------------------------------------------------------------------
// mini-graph 추출 헬퍼 (순수 함수 — 테스트 용이)
// ---------------------------------------------------------------------------

/// DependencyGraph 에서 credential_id 의 1-hop subgraph 를 추출한다.
///
/// `credential → (UsedBy) → project` 방향 에지만 추출.
/// 결과 project 수가 MAX_VISIBLE_PROJECTS 초과이면 잘라내고 hidden_count 설정.
pub fn extract_credential_mini_graph(
    graph: &DependencyGraph,
    credential_id: CredentialId,
    project_map: &HashMap<String, &secretbank_core::Project>,
    center_label: &str,
) -> CredentialMiniGraph {
    let center_id = credential_id.to_string();

    // credential 노드에서 나가는 UsedBy 에지의 target (project) 수집.
    let mut project_ids: Vec<String> = graph
        .edges()
        .filter_map(|(src, dst, kind)| {
            if kind == EdgeKind::UsedBy {
                if let NodeRef::Credential(cid) = src {
                    if cid == credential_id {
                        if let NodeRef::Project(pid) = dst {
                            return Some(pid.to_string());
                        }
                    }
                }
            }
            None
        })
        .collect();

    // 결정성: ID 문자열 정렬 (같은 입력 → 같은 출력).
    project_ids.sort();

    let total = project_ids.len();
    let hidden_count = total.saturating_sub(MAX_VISIBLE_PROJECTS);

    // 최대 MAX_VISIBLE_PROJECTS 만 표시.
    let visible_ids: Vec<String> = project_ids.into_iter().take(MAX_VISIBLE_PROJECTS).collect();

    let project_nodes: Vec<MiniGraphProjectNode> = visible_ids
        .iter()
        .map(|pid| {
            let (label, env) = project_map
                .get(pid)
                .map(|p| (p.name.clone(), "prod".to_string()))
                .unwrap_or_else(|| (format!("<project:{pid}>"), "prod".to_string()));
            MiniGraphProjectNode {
                id: pid.clone(),
                label,
                env,
            }
        })
        .collect();

    let edges: Vec<MiniGraphEdge> = visible_ids
        .iter()
        .map(|pid| MiniGraphEdge {
            from: center_id.clone(),
            to: pid.clone(),
        })
        .collect();

    CredentialMiniGraph {
        center_id,
        center_label: center_label.to_string(),
        project_nodes,
        edges,
        hidden_count,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use secretbank_core::{CredentialId, ProjectId};
    use serde_json::json;

    fn make_cred_node(id: &str) -> GraphNode {
        GraphNode {
            id: id.to_string(),
            kind: NodeKind::Credential,
            label: "My API Key".to_string(),
            meta_json: json!({ "env": "prod", "status": "active" }),
        }
    }

    fn make_project_node(id: &str) -> GraphNode {
        GraphNode {
            id: id.to_string(),
            kind: NodeKind::Project,
            label: "My Project".to_string(),
            meta_json: json!({ "repo_url": null, "framework": null }),
        }
    }

    // -----------------------------------------------------------------------
    // Test 1: GraphPayload round-trips through JSON
    // -----------------------------------------------------------------------

    #[test]
    fn graph_payload_round_trips_through_json() {
        let cred_id = CredentialId::new().to_string();
        let proj_id = ProjectId::new().to_string();

        let payload = GraphPayload {
            nodes: vec![make_cred_node(&cred_id), make_project_node(&proj_id)],
            edges: vec![GraphEdge {
                id: format!("{cred_id}->{proj_id}:UsedBy"),
                source: cred_id.clone(),
                target: proj_id.clone(),
                kind: GraphEdgeKind::UsedBy,
            }],
        };

        let serialized = serde_json::to_string(&payload).expect("serialize failed");
        let deserialized: GraphPayload =
            serde_json::from_str(&serialized).expect("deserialize failed");

        assert_eq!(
            payload, deserialized,
            "GraphPayload must round-trip through JSON"
        );
    }

    // -----------------------------------------------------------------------
    // Test 2: GraphEdgeKind serializes to snake_case
    // -----------------------------------------------------------------------

    #[test]
    fn graph_edge_kind_serializes_to_snake_case() {
        assert_eq!(
            serde_json::to_value(GraphEdgeKind::UsedBy).unwrap(),
            json!("used_by"),
            "UsedBy must serialize as \"used_by\""
        );
        assert_eq!(
            serde_json::to_value(GraphEdgeKind::DeployedAs).unwrap(),
            json!("deployed_as"),
            "DeployedAs must serialize as \"deployed_as\""
        );
        assert_eq!(
            serde_json::to_value(GraphEdgeKind::Issues).unwrap(),
            json!("issues"),
            "Issues must serialize as \"issues\""
        );
    }

    // -----------------------------------------------------------------------
    // Test 3: NodeKind serializes to snake_case
    // -----------------------------------------------------------------------

    #[test]
    fn node_kind_serializes_to_snake_case() {
        assert_eq!(
            serde_json::to_value(NodeKind::Issuer).unwrap(),
            json!("issuer")
        );
        assert_eq!(
            serde_json::to_value(NodeKind::Credential).unwrap(),
            json!("credential")
        );
        assert_eq!(
            serde_json::to_value(NodeKind::Project).unwrap(),
            json!("project")
        );
        assert_eq!(
            serde_json::to_value(NodeKind::Deployment).unwrap(),
            json!("deployment")
        );
    }

    // -----------------------------------------------------------------------
    // Test 4: EdgeKind From conversion covers all variants
    // -----------------------------------------------------------------------

    #[test]
    fn edge_kind_from_converts_all_variants() {
        // Exhaustive match — compile error if EdgeKind gains a new variant.
        let pairs: &[(EdgeKind, GraphEdgeKind)] = &[
            (EdgeKind::Issues, GraphEdgeKind::Issues),
            (EdgeKind::UsedBy, GraphEdgeKind::UsedBy),
            (EdgeKind::DeployedAs, GraphEdgeKind::DeployedAs),
        ];

        for (core_kind, expected) in pairs {
            let converted: GraphEdgeKind = (*core_kind).into();
            assert_eq!(
                converted, *expected,
                "EdgeKind::{core_kind:?} must convert to GraphEdgeKind::{expected:?}"
            );
        }
    }

    // -----------------------------------------------------------------------
    // T-24-E-G1-1 mini-graph 테스트 helpers
    // -----------------------------------------------------------------------

    use secretbank_core::{
        graph::DependencyGraph,
        id::{IssuerId, UsageId},
        models::{
            credential::{CredentialStatus, Env},
            deployment::DeploymentPlatform,
            usage::UsageWhereKind,
        },
        Credential, DeploymentId, Issuer, Project, Usage,
    };
    use time::OffsetDateTime;

    fn make_issuer(id: IssuerId, name: &str) -> Issuer {
        let now = OffsetDateTime::UNIX_EPOCH;
        Issuer {
            id,
            slug: id.to_string(),
            display_name: name.to_string(),
            docs_url: None,
            issue_url: None,
            status_url: None,
            security_feed_url: None,
            connector_id: None,
            icon_key: None,
            default_primary_label: None,
            default_secondary_label: None,
            domains: vec![],
            created_at: now,
            updated_at: now,
        }
    }

    fn make_credential(id: CredentialId, issuer_id: IssuerId) -> Credential {
        Credential {
            id,
            issuer_id,
            name: id.to_string(),
            env: Env::Prod,
            scope: None,
            vault_ref: format!("credentials/{id}"),
            created_at: OffsetDateTime::UNIX_EPOCH,
            last_rotated_at: None,
            expires_at: None,
            owner: None,
            rotation_policy_days: None,
            rotation_runbook_id: None,
            status: CredentialStatus::Active,
            hash_hint: None,
            kind: secretbank_core::CredentialKind::ApiKey,
            url: None,
            username: None,
            secondary_value_ref: None,
            primary_label: None,
            secondary_label: None,
        }
    }

    fn make_project(id: ProjectId, name: &str) -> Project {
        let now = OffsetDateTime::UNIX_EPOCH;
        Project {
            id,
            name: name.to_string(),
            repo_url: None,
            framework: None,
            runtime: None,
            local_path: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn make_usage(cred_id: CredentialId, proj_id: ProjectId) -> Usage {
        Usage {
            id: UsageId::new(),
            credential_id: cred_id,
            project_id: proj_id,
            deployment_id: None,
            where_kind: UsageWhereKind::EnvVar,
            where_value: "API_KEY".to_string(),
            verified_at: None,
            verified_by: None,
        }
    }

    fn make_deployment(proj_id: ProjectId) -> secretbank_core::Deployment {
        secretbank_core::Deployment {
            id: DeploymentId::new(),
            project_id: proj_id,
            url: "https://example.com".to_string(),
            platform: DeploymentPlatform::Other,
            env: Env::Prod,
            created_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    // -----------------------------------------------------------------------
    // G1-1-T1: 0 projects → empty mini-graph, hidden_count=0
    // -----------------------------------------------------------------------

    #[test]
    fn g1_1_t1_no_projects_yields_empty_mini_graph() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();

        let issuers = vec![make_issuer(iss_id, "GitHub")];
        let creds = vec![make_credential(cred_id, iss_id)];
        let graph = DependencyGraph::build(&issuers, &creds, &[], &[], &[]);

        let project_map: HashMap<String, &secretbank_core::Project> = HashMap::new();
        let mini = extract_credential_mini_graph(&graph, cred_id, &project_map, "GitHub");

        assert_eq!(mini.center_id, cred_id.to_string());
        assert_eq!(mini.center_label, "GitHub");
        assert!(
            mini.project_nodes.is_empty(),
            "0 projects → no project_nodes"
        );
        assert!(mini.edges.is_empty(), "0 projects → no edges");
        assert_eq!(mini.hidden_count, 0);
    }

    // -----------------------------------------------------------------------
    // G1-1-T2: 3 projects → all visible, hidden_count=0
    // -----------------------------------------------------------------------

    #[test]
    fn g1_1_t2_three_projects_all_visible() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj_ids: Vec<ProjectId> = (0..3).map(|_| ProjectId::new()).collect();

        let issuers = vec![make_issuer(iss_id, "Stripe")];
        let creds = vec![make_credential(cred_id, iss_id)];
        let projects: Vec<Project> = proj_ids
            .iter()
            .enumerate()
            .map(|(i, &pid)| make_project(pid, &format!("Project {i}")))
            .collect();
        let usages: Vec<Usage> = proj_ids
            .iter()
            .map(|&pid| make_usage(cred_id, pid))
            .collect();
        let deployments: Vec<secretbank_core::Deployment> =
            proj_ids.iter().map(|&pid| make_deployment(pid)).collect();

        let graph = DependencyGraph::build(&issuers, &creds, &usages, &projects, &deployments);

        let project_map: HashMap<String, &secretbank_core::Project> =
            projects.iter().map(|p| (p.id.to_string(), p)).collect();
        let mini = extract_credential_mini_graph(&graph, cred_id, &project_map, "Stripe");

        assert_eq!(mini.project_nodes.len(), 3, "3 projects → 3 nodes");
        assert_eq!(mini.edges.len(), 3, "3 edges");
        assert_eq!(mini.hidden_count, 0, "hidden_count=0 when ≤MAX_VISIBLE");

        // 모든 에지 source = cred_id.
        for edge in &mini.edges {
            assert_eq!(edge.from, cred_id.to_string());
        }
    }

    // -----------------------------------------------------------------------
    // G1-1-T3: 7 projects → 5 visible + hidden_count=2
    // -----------------------------------------------------------------------

    #[test]
    fn g1_1_t3_seven_projects_truncated_to_five() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj_ids: Vec<ProjectId> = (0..7).map(|_| ProjectId::new()).collect();

        let issuers = vec![make_issuer(iss_id, "AWS")];
        let creds = vec![make_credential(cred_id, iss_id)];
        let projects: Vec<Project> = proj_ids
            .iter()
            .enumerate()
            .map(|(i, &pid)| make_project(pid, &format!("Service {i}")))
            .collect();
        let usages: Vec<Usage> = proj_ids
            .iter()
            .map(|&pid| make_usage(cred_id, pid))
            .collect();
        let deployments: Vec<secretbank_core::Deployment> =
            proj_ids.iter().map(|&pid| make_deployment(pid)).collect();

        let graph = DependencyGraph::build(&issuers, &creds, &usages, &projects, &deployments);

        let project_map: HashMap<String, &secretbank_core::Project> =
            projects.iter().map(|p| (p.id.to_string(), p)).collect();
        let mini = extract_credential_mini_graph(&graph, cred_id, &project_map, "AWS");

        assert_eq!(
            mini.project_nodes.len(),
            MAX_VISIBLE_PROJECTS,
            "7 projects → 5 visible"
        );
        assert_eq!(mini.edges.len(), MAX_VISIBLE_PROJECTS, "5 edges");
        assert_eq!(mini.hidden_count, 2, "7 - 5 = 2 hidden");
    }

    // -----------------------------------------------------------------------
    // G1-1-T4: 결정성 — 같은 입력은 항상 같은 순서
    // -----------------------------------------------------------------------

    #[test]
    fn g1_1_t4_deterministic_output() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj_ids: Vec<ProjectId> = (0..4).map(|_| ProjectId::new()).collect();

        let issuers = vec![make_issuer(iss_id, "OpenAI")];
        let creds = vec![make_credential(cred_id, iss_id)];
        let projects: Vec<Project> = proj_ids
            .iter()
            .enumerate()
            .map(|(i, &pid)| make_project(pid, &format!("App {i}")))
            .collect();
        let usages: Vec<Usage> = proj_ids
            .iter()
            .map(|&pid| make_usage(cred_id, pid))
            .collect();

        let graph = DependencyGraph::build(&issuers, &creds, &usages, &projects, &[]);
        let project_map: HashMap<String, &secretbank_core::Project> =
            projects.iter().map(|p| (p.id.to_string(), p)).collect();

        let mini1 = extract_credential_mini_graph(&graph, cred_id, &project_map, "OpenAI");
        let mini2 = extract_credential_mini_graph(&graph, cred_id, &project_map, "OpenAI");

        assert_eq!(mini1, mini2, "동일 입력 → 동일 출력 (결정성)");
    }

    // -----------------------------------------------------------------------
    // G1-1-T5: audit action 상수 검증
    // -----------------------------------------------------------------------

    #[test]
    fn g1_1_t5_audit_action_constant() {
        assert_eq!(
            secretbank_audit::actions::EXT_GRAPH_FETCH,
            "extension.graph.fetch"
        );
    }

    // -----------------------------------------------------------------------
    // G1-1-T6: CredentialMiniGraph round-trips through JSON
    // -----------------------------------------------------------------------

    #[test]
    fn g1_1_t6_mini_graph_json_round_trip() {
        let cred_id = CredentialId::new().to_string();
        let proj_id = ProjectId::new().to_string();

        let mini = CredentialMiniGraph {
            center_id: cred_id.clone(),
            center_label: "GitHub".to_string(),
            project_nodes: vec![MiniGraphProjectNode {
                id: proj_id.clone(),
                label: "My App".to_string(),
                env: "prod".to_string(),
            }],
            edges: vec![MiniGraphEdge {
                from: cred_id.clone(),
                to: proj_id.clone(),
            }],
            hidden_count: 0,
        };

        let serialized = serde_json::to_string(&mini).expect("serialize");
        let deserialized: CredentialMiniGraph =
            serde_json::from_str(&serialized).expect("deserialize");
        assert_eq!(mini, deserialized, "CredentialMiniGraph must round-trip");
    }
}
