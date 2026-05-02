//! Blast-radius BFS engine.
//!
//! Starting from a [`Credential`] node, this module performs a breadth-first
//! search over outgoing edges in the [`DependencyGraph`] to discover all
//! downstream entities that would be affected if the credential were revoked.
//!
//! # Depth semantics
//! - **depth 1 (primary)** — nodes directly connected to the credential via
//!   outgoing edges (typically [`NodeRef::Project`] nodes via `UsedBy` edges).
//! - **depth 2 (secondary)** — nodes one hop further downstream (typically
//!   [`NodeRef::Deployment`] nodes via `DeployedAs` edges).
//! - **depth 3+ (tertiary)** — reserved for future node types (URLs, services,
//!   etc.) that may extend the graph in later milestones.
//!
//! Upstream nodes (the [`NodeRef::Issuer`] that owns the credential) are
//! **never** included because the BFS follows only outgoing edges.

use std::collections::{HashSet, VecDeque};

use petgraph::Direction;
use serde::{Deserialize, Serialize};

use crate::graph::{DependencyGraph, NodeRef};
use crate::id::CredentialId;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/// All downstream nodes reachable from a credential, bucketed by BFS depth.
///
/// Each `Vec` is sorted deterministically (by variant discriminant, then
/// ULID string) so results are stable regardless of internal `HashMap`
/// iteration order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlastRadius {
    /// Nodes at BFS depth 1 (directly linked to the credential).
    pub primary: Vec<NodeRef>,
    /// Nodes at BFS depth 2 (one hop past primary).
    pub secondary: Vec<NodeRef>,
    /// Nodes at BFS depth ≥ 3 (reserved for future expansion).
    pub tertiary: Vec<NodeRef>,
}

impl BlastRadius {
    fn empty() -> Self {
        BlastRadius {
            primary: Vec::new(),
            secondary: Vec::new(),
            tertiary: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Ordering helper
// ---------------------------------------------------------------------------

/// Stable sort key for a [`NodeRef`]: (discriminant index, ULID string).
fn node_sort_key(n: &NodeRef) -> (u8, String) {
    match n {
        NodeRef::Issuer(id) => (0, id.to_string()),
        NodeRef::Credential(id) => (1, id.to_string()),
        NodeRef::Project(id) => (2, id.to_string()),
        NodeRef::Deployment(id) => (3, id.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Compute the blast radius of revoking `cred_id` in `graph`.
///
/// Returns a [`BlastRadius`] with downstream nodes bucketed by BFS depth:
/// - `primary`   — depth 1 (e.g. [`NodeRef::Project`] nodes)
/// - `secondary` — depth 2 (e.g. [`NodeRef::Deployment`] nodes)
/// - `tertiary`  — depth ≥ 3 (reserved; typically empty with the current model)
///
/// If `cred_id` is not present in the graph, returns an empty [`BlastRadius`]
/// (no panic, no `Option`).
///
/// The starting credential itself is **not** included in any bucket.
pub fn blast_radius(graph: &DependencyGraph, cred_id: CredentialId) -> BlastRadius {
    let start_index = match graph.node_index(NodeRef::Credential(cred_id)) {
        Some(idx) => idx,
        None => return BlastRadius::empty(),
    };

    let inner = graph.as_inner();

    let mut visited: HashSet<_> = HashSet::new();
    let mut queue: VecDeque<(_, u32)> = VecDeque::new();

    visited.insert(start_index);
    queue.push_back((start_index, 0));

    let mut primary: Vec<NodeRef> = Vec::new();
    let mut secondary: Vec<NodeRef> = Vec::new();
    let mut tertiary: Vec<NodeRef> = Vec::new();

    while let Some((current, depth)) = queue.pop_front() {
        for neighbor in inner.neighbors_directed(current, Direction::Outgoing) {
            if visited.insert(neighbor) {
                let next_depth = depth + 1;
                queue.push_back((neighbor, next_depth));

                let node_ref = *inner
                    .node_weight(neighbor)
                    .expect("petgraph node weight always valid");

                match next_depth {
                    1 => primary.push(node_ref),
                    2 => secondary.push(node_ref),
                    _ => tertiary.push(node_ref),
                }
            }
        }
    }

    primary.sort_by_key(node_sort_key);
    secondary.sort_by_key(node_sort_key);
    tertiary.sort_by_key(node_sort_key);

    BlastRadius {
        primary,
        secondary,
        tertiary,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::{DeploymentId, IssuerId, ProjectId, UsageId};
    use crate::models::credential::{CredentialStatus, Env};
    use crate::models::deployment::DeploymentPlatform;
    use crate::models::issuer::Issuer;
    use crate::models::usage::UsageWhereKind;
    use crate::models::{
        credential::Credential, deployment::Deployment, project::Project, usage::Usage,
    };
    use time::OffsetDateTime;

    // -----------------------------------------------------------------------
    // Minimal fixture helpers (mirrors graph.rs tests but private to this mod)
    // -----------------------------------------------------------------------

    fn make_issuer(id: IssuerId) -> Issuer {
        let now = OffsetDateTime::UNIX_EPOCH;
        Issuer {
            id,
            slug: id.to_string(),
            display_name: id.to_string(),
            docs_url: None,
            issue_url: None,
            status_url: None,
            security_feed_url: None,
            connector_id: None,
            icon_key: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn make_credential(id: CredentialId, issuer_id: IssuerId) -> Credential {
        Credential {
            id,
            issuer_id,
            name: id.to_string(),
            env: Env::Dev,
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
        }
    }

    fn make_project(id: ProjectId) -> Project {
        let now = OffsetDateTime::UNIX_EPOCH;
        Project {
            id,
            name: id.to_string(),
            repo_url: None,
            framework: None,
            runtime: None,
            local_path: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn make_deployment(id: DeploymentId, project_id: ProjectId) -> Deployment {
        Deployment {
            id,
            project_id,
            url: format!("https://{id}.example.com"),
            platform: DeploymentPlatform::Other,
            env: Env::Dev,
            created_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    fn make_usage(id: UsageId, credential_id: CredentialId, project_id: ProjectId) -> Usage {
        Usage {
            id,
            credential_id,
            project_id,
            deployment_id: None,
            where_kind: UsageWhereKind::EnvVar,
            where_value: "API_KEY".to_string(),
            verified_at: None,
            verified_by: None,
        }
    }

    // -----------------------------------------------------------------------
    // Test 1: unknown credential returns empty blast radius
    // -----------------------------------------------------------------------

    #[test]
    fn unknown_credential_returns_empty() {
        let g = DependencyGraph::build(&[], &[], &[], &[], &[]);
        let unknown = CredentialId::new();
        let br = blast_radius(&g, unknown);
        assert!(br.primary.is_empty(), "primary should be empty");
        assert!(br.secondary.is_empty(), "secondary should be empty");
        assert!(br.tertiary.is_empty(), "tertiary should be empty");
    }

    // -----------------------------------------------------------------------
    // Test 2: DoD scenario — Issuer→Cred→Usage→Project→Deployment
    // -----------------------------------------------------------------------

    #[test]
    fn single_chain_populates_primary_and_secondary() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj_id = ProjectId::new();
        let dep_id = DeploymentId::new();

        let issuers = vec![make_issuer(iss_id)];
        let credentials = vec![make_credential(cred_id, iss_id)];
        let projects = vec![make_project(proj_id)];
        let deployments = vec![make_deployment(dep_id, proj_id)];
        let usages = vec![make_usage(UsageId::new(), cred_id, proj_id)];

        let g = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);
        let br = blast_radius(&g, cred_id);

        // Primary: the project
        assert_eq!(
            br.primary,
            vec![NodeRef::Project(proj_id)],
            "primary must contain the project"
        );
        // Secondary: the deployment
        assert_eq!(
            br.secondary,
            vec![NodeRef::Deployment(dep_id)],
            "secondary must contain the deployment"
        );
        // Tertiary: nothing with current model
        assert!(br.tertiary.is_empty(), "tertiary should be empty");
    }

    // -----------------------------------------------------------------------
    // Test 3: issuer is upstream — must NOT appear in any bucket
    // -----------------------------------------------------------------------

    #[test]
    fn issuer_is_excluded_from_blast_radius() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj_id = ProjectId::new();

        let issuers = vec![make_issuer(iss_id)];
        let credentials = vec![make_credential(cred_id, iss_id)];
        let projects = vec![make_project(proj_id)];
        let usages = vec![make_usage(UsageId::new(), cred_id, proj_id)];

        let g = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &[]);
        let br = blast_radius(&g, cred_id);

        let issuer_ref = NodeRef::Issuer(iss_id);
        assert!(
            !br.primary.contains(&issuer_ref)
                && !br.secondary.contains(&issuer_ref)
                && !br.tertiary.contains(&issuer_ref),
            "issuer must not appear in any bucket"
        );
    }

    // -----------------------------------------------------------------------
    // Test 4: fan-out — 1 credential → 2 projects → 2 deployments each
    // -----------------------------------------------------------------------

    #[test]
    fn fan_out_multi_project_multi_deployment() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj1 = ProjectId::new();
        let proj2 = ProjectId::new();
        let dep1 = DeploymentId::new();
        let dep2 = DeploymentId::new();
        let dep3 = DeploymentId::new();
        let dep4 = DeploymentId::new();

        let issuers = vec![make_issuer(iss_id)];
        let credentials = vec![make_credential(cred_id, iss_id)];
        let projects = vec![make_project(proj1), make_project(proj2)];
        let deployments = vec![
            make_deployment(dep1, proj1),
            make_deployment(dep2, proj1),
            make_deployment(dep3, proj2),
            make_deployment(dep4, proj2),
        ];
        let usages = vec![
            make_usage(UsageId::new(), cred_id, proj1),
            make_usage(UsageId::new(), cred_id, proj2),
        ];

        let g = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);
        let br = blast_radius(&g, cred_id);

        // Primary: both projects
        assert_eq!(br.primary.len(), 2, "primary should have 2 projects");
        assert!(br.primary.contains(&NodeRef::Project(proj1)));
        assert!(br.primary.contains(&NodeRef::Project(proj2)));

        // Secondary: all 4 deployments
        assert_eq!(br.secondary.len(), 4, "secondary should have 4 deployments");
        assert!(br.secondary.contains(&NodeRef::Deployment(dep1)));
        assert!(br.secondary.contains(&NodeRef::Deployment(dep2)));
        assert!(br.secondary.contains(&NodeRef::Deployment(dep3)));
        assert!(br.secondary.contains(&NodeRef::Deployment(dep4)));

        // Tertiary: empty
        assert!(br.tertiary.is_empty());
    }

    // -----------------------------------------------------------------------
    // Test 5: deterministic ordering — multiple runs produce identical vecs
    // -----------------------------------------------------------------------

    #[test]
    fn deterministic_ordering() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj1 = ProjectId::new();
        let proj2 = ProjectId::new();
        let proj3 = ProjectId::new();
        let dep1 = DeploymentId::new();
        let dep2 = DeploymentId::new();
        let dep3 = DeploymentId::new();

        let issuers = vec![make_issuer(iss_id)];
        let credentials = vec![make_credential(cred_id, iss_id)];
        let projects = vec![
            make_project(proj1),
            make_project(proj2),
            make_project(proj3),
        ];
        let deployments = vec![
            make_deployment(dep1, proj1),
            make_deployment(dep2, proj2),
            make_deployment(dep3, proj3),
        ];
        let usages = vec![
            make_usage(UsageId::new(), cred_id, proj1),
            make_usage(UsageId::new(), cred_id, proj2),
            make_usage(UsageId::new(), cred_id, proj3),
        ];

        let g = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);

        let br1 = blast_radius(&g, cred_id);
        let br2 = blast_radius(&g, cred_id);

        assert_eq!(
            br1, br2,
            "blast_radius must return identical results on repeated calls"
        );
        assert_eq!(br1.primary.len(), 3);
        assert_eq!(br1.secondary.len(), 3);
    }
}
