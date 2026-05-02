//! Tauri commands for the dependency graph (T043).
//!
//! `graph_fetch` returns a React Flow-friendly payload (nodes + edges) built
//! from the full entity slices in SQLite. `blast_radius_for_credential` runs
//! the BFS engine from `api-vault-core` and returns the bucketed result.

use std::collections::HashMap;

use api_vault_core::{
    blast_radius::blast_radius,
    graph::{DependencyGraph, EdgeKind, NodeRef},
    BlastRadius, CredentialId, Deployment, DeploymentPlatform, Env, Issuer,
};
use api_vault_storage::sqlite::{
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
    issuer_map: &HashMap<String, &api_vault_core::Issuer>,
    cred_map: &HashMap<String, &api_vault_core::Credential>,
    project_map: &HashMap<String, &api_vault_core::Project>,
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
    let cred_map: HashMap<String, &api_vault_core::Credential> =
        credentials.iter().map(|c| (c.id.to_string(), c)).collect();
    let project_map: HashMap<String, &api_vault_core::Project> =
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use api_vault_core::{CredentialId, ProjectId};
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
}
