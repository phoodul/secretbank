//! Dependency graph: Issuer → Credential → Project → Deployment.
//!
//! [`DependencyGraph`] wraps a petgraph [`DiGraph`] and provides O(1)
//! node lookup, edge iteration, and read-only access to the inner graph
//! for callers (e.g. blast-radius BFS in T042).

use std::collections::{HashMap, HashSet};

use petgraph::graph::{DiGraph, NodeIndex};
use serde::{Deserialize, Serialize};

use crate::id::{CredentialId, DeploymentId, IssuerId, ProjectId};
use crate::models::credential::Credential;
use crate::models::deployment::Deployment;
use crate::models::issuer::Issuer;
use crate::models::project::Project;
use crate::models::usage::Usage;

// ---------------------------------------------------------------------------
// Node reference
// ---------------------------------------------------------------------------

/// A typed reference to one node in the dependency graph.
///
/// Variants map to the four entity types that appear in the graph. Each
/// carries the entity's newtype ID so the variant is both discriminant and
/// payload in one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", content = "id", rename_all = "snake_case")]
pub enum NodeRef {
    Issuer(IssuerId),
    Credential(CredentialId),
    Project(ProjectId),
    Deployment(DeploymentId),
}

// ---------------------------------------------------------------------------
// Edge kind
// ---------------------------------------------------------------------------

/// The semantic relationship carried by a directed edge.
///
/// - `Issues`: `Issuer → Credential` — the issuer owns / provides the credential.
/// - `UsedBy`: `Credential → Project` — the credential is consumed by the project
///   (derived from [`Usage`] records; at most one edge per unique pair).
/// - `DeployedAs`: `Project → Deployment` — the project is deployed at this URL/platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeKind {
    Issues,
    UsedBy,
    DeployedAs,
}

// ---------------------------------------------------------------------------
// DependencyGraph
// ---------------------------------------------------------------------------

/// The full dependency graph for all entities in the vault.
///
/// Internally a petgraph [`DiGraph<NodeRef, EdgeKind>`] with an auxiliary
/// index table for O(1) lookup from a [`NodeRef`] to its [`NodeIndex`].
pub struct DependencyGraph {
    graph: DiGraph<NodeRef, EdgeKind>,
    index: HashMap<NodeRef, NodeIndex>,
}

impl DependencyGraph {
    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    /// Build the dependency graph from in-memory slices.
    ///
    /// This is the pure data-layer constructor. The caller (e.g. a Tauri
    /// command in T043) fetches all slices from storage and passes them in.
    /// `secretbank-core` does not depend on `secretbank-storage`.
    ///
    /// # Edge rules
    /// - `Issues`: for each `Credential`, add `Issuer(issuer_id) → Credential(id)`.
    /// - `UsedBy`: for each distinct `(credential_id, project_id)` pair in `usages`,
    ///   add `Credential(credential_id) → Project(project_id)`. Duplicate pairs are
    ///   silently deduplicated.
    /// - `DeployedAs`: for each `Deployment`, add `Project(project_id) → Deployment(id)`.
    pub fn build(
        issuers: &[Issuer],
        credentials: &[Credential],
        usages: &[Usage],
        projects: &[Project],
        deployments: &[Deployment],
    ) -> DependencyGraph {
        let mut graph: DiGraph<NodeRef, EdgeKind> = DiGraph::new();
        let mut index: HashMap<NodeRef, NodeIndex> = HashMap::new();

        // Helper: get-or-insert a node.
        let add_node = |g: &mut DiGraph<NodeRef, EdgeKind>,
                        idx: &mut HashMap<NodeRef, NodeIndex>,
                        nr: NodeRef|
         -> NodeIndex {
            if let Some(&ni) = idx.get(&nr) {
                ni
            } else {
                let ni = g.add_node(nr);
                idx.insert(nr, ni);
                ni
            }
        };

        // --- nodes ---
        for issuer in issuers {
            add_node(&mut graph, &mut index, NodeRef::Issuer(issuer.id));
        }
        for credential in credentials {
            add_node(&mut graph, &mut index, NodeRef::Credential(credential.id));
        }
        for project in projects {
            add_node(&mut graph, &mut index, NodeRef::Project(project.id));
        }
        for deployment in deployments {
            add_node(&mut graph, &mut index, NodeRef::Deployment(deployment.id));
        }

        // --- Issues: Issuer → Credential ---
        for credential in credentials {
            let issuer_nr = NodeRef::Issuer(credential.issuer_id);
            let cred_nr = NodeRef::Credential(credential.id);
            // Only add edge when the issuer node exists in the graph.
            if let (Some(&from), Some(&to)) = (index.get(&issuer_nr), index.get(&cred_nr)) {
                graph.add_edge(from, to, EdgeKind::Issues);
            }
        }

        // --- UsedBy: Credential → Project (deduplicated) ---
        let mut seen_used_by: HashSet<(CredentialId, ProjectId)> = HashSet::new();
        for usage in usages {
            let pair = (usage.credential_id, usage.project_id);
            if seen_used_by.insert(pair) {
                let cred_nr = NodeRef::Credential(usage.credential_id);
                let proj_nr = NodeRef::Project(usage.project_id);
                if let (Some(&from), Some(&to)) = (index.get(&cred_nr), index.get(&proj_nr)) {
                    graph.add_edge(from, to, EdgeKind::UsedBy);
                }
            }
        }

        // --- DeployedAs: Project → Deployment ---
        for deployment in deployments {
            let proj_nr = NodeRef::Project(deployment.project_id);
            let dep_nr = NodeRef::Deployment(deployment.id);
            if let (Some(&from), Some(&to)) = (index.get(&proj_nr), index.get(&dep_nr)) {
                graph.add_edge(from, to, EdgeKind::DeployedAs);
            }
        }

        DependencyGraph { graph, index }
    }

    // -----------------------------------------------------------------------
    // Accessors
    // -----------------------------------------------------------------------

    /// Borrow the raw petgraph [`DiGraph`] for callers that need to run
    /// graph algorithms (e.g. BFS for blast radius in T042).
    pub fn as_inner(&self) -> &DiGraph<NodeRef, EdgeKind> {
        &self.graph
    }

    /// Look up the petgraph [`NodeIndex`] for a given [`NodeRef`] in O(1).
    pub fn node_index(&self, node: NodeRef) -> Option<NodeIndex> {
        self.index.get(&node).copied()
    }

    /// Iterate over all node payloads in the graph.
    pub fn nodes(&self) -> impl Iterator<Item = NodeRef> + '_ {
        self.graph.node_weights().copied()
    }

    /// Iterate over all edges as `(source NodeRef, target NodeRef, EdgeKind)`.
    pub fn edges(&self) -> impl Iterator<Item = (NodeRef, NodeRef, EdgeKind)> + '_ {
        self.graph.edge_indices().map(move |ei| {
            let (from, to) = self
                .graph
                .edge_endpoints(ei)
                .expect("edge endpoints always valid");
            let kind = *self
                .graph
                .edge_weight(ei)
                .expect("edge weight always valid");
            (
                *self.graph.node_weight(from).expect("node weight valid"),
                *self.graph.node_weight(to).expect("node weight valid"),
                kind,
            )
        })
    }

    /// Total number of nodes.
    pub fn node_count(&self) -> usize {
        self.graph.node_count()
    }

    /// Total number of edges.
    pub fn edge_count(&self) -> usize {
        self.graph.edge_count()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::UsageId;
    use crate::models::credential::{CredentialStatus, Env};
    use crate::models::deployment::DeploymentPlatform;
    use crate::models::usage::UsageWhereKind;
    use time::OffsetDateTime;

    // -----------------------------------------------------------------------
    // Test helpers — minimal struct literals for each model
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
            kind: crate::CredentialKind::ApiKey,
            url: None,
            username: None,
            secondary_value_ref: None,
            primary_label: None,
            secondary_label: None,
            custom_kind_label: None,
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
    // Test 1: empty inputs
    // -----------------------------------------------------------------------

    #[test]
    fn empty_inputs_yields_empty_graph() {
        let g = DependencyGraph::build(&[], &[], &[], &[], &[]);
        assert_eq!(g.node_count(), 0, "no nodes expected");
        assert_eq!(g.edge_count(), 0, "no edges expected");
    }

    // -----------------------------------------------------------------------
    // Test 2: single full chain (1-1-1-1)
    // -----------------------------------------------------------------------

    #[test]
    fn single_chain_has_correct_node_and_edge_counts() {
        let issuer_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj_id = ProjectId::new();
        let dep_id = DeploymentId::new();
        let usage_id = UsageId::new();

        let issuers = vec![make_issuer(issuer_id)];
        let credentials = vec![make_credential(cred_id, issuer_id)];
        let projects = vec![make_project(proj_id)];
        let deployments = vec![make_deployment(dep_id, proj_id)];
        let usages = vec![make_usage(usage_id, cred_id, proj_id)];

        let g = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);

        // 4 distinct entity types × 1 each = 4 nodes
        assert_eq!(g.node_count(), 4, "expected 4 nodes");
        // Issues + UsedBy + DeployedAs = 3 edges
        assert_eq!(g.edge_count(), 3, "expected 3 edges");

        // Verify node_index returns Some for all nodes
        assert!(g.node_index(NodeRef::Issuer(issuer_id)).is_some());
        assert!(g.node_index(NodeRef::Credential(cred_id)).is_some());
        assert!(g.node_index(NodeRef::Project(proj_id)).is_some());
        assert!(g.node_index(NodeRef::Deployment(dep_id)).is_some());

        // Verify edge kinds are all present
        let edge_kinds: HashSet<EdgeKind> = g.edges().map(|(_, _, k)| k).collect();
        assert!(edge_kinds.contains(&EdgeKind::Issues));
        assert!(edge_kinds.contains(&EdgeKind::UsedBy));
        assert!(edge_kinds.contains(&EdgeKind::DeployedAs));
    }

    // -----------------------------------------------------------------------
    // Test 3: DoD fixtures — 2 issuers, 3 credentials, 2 projects,
    //         4 deployments, 5 usages
    // -----------------------------------------------------------------------

    #[test]
    fn dod_fixtures_have_expected_node_and_edge_counts() {
        // --- IDs ---
        let iss1 = IssuerId::new();
        let iss2 = IssuerId::new();

        let cred1 = CredentialId::new(); // → iss1
        let cred2 = CredentialId::new(); // → iss1
        let cred3 = CredentialId::new(); // → iss2

        let proj1 = ProjectId::new();
        let proj2 = ProjectId::new();

        let dep1 = DeploymentId::new(); // → proj1
        let dep2 = DeploymentId::new(); // → proj1
        let dep3 = DeploymentId::new(); // → proj2
        let dep4 = DeploymentId::new(); // → proj2

        // --- Usages: 5 records linking credentials to projects ---
        // Distinct (cred, proj) pairs:
        //   (cred1, proj1), (cred1, proj2), (cred2, proj1), (cred3, proj2), (cred3, proj1)
        // All five are distinct → 5 UsedBy edges.
        let usages = vec![
            make_usage(UsageId::new(), cred1, proj1),
            make_usage(UsageId::new(), cred1, proj2),
            make_usage(UsageId::new(), cred2, proj1),
            make_usage(UsageId::new(), cred3, proj2),
            make_usage(UsageId::new(), cred3, proj1),
        ];

        // --- Build ---
        let issuers = vec![make_issuer(iss1), make_issuer(iss2)];
        let credentials = vec![
            make_credential(cred1, iss1),
            make_credential(cred2, iss1),
            make_credential(cred3, iss2),
        ];
        let projects = vec![make_project(proj1), make_project(proj2)];
        let deployments = vec![
            make_deployment(dep1, proj1),
            make_deployment(dep2, proj1),
            make_deployment(dep3, proj2),
            make_deployment(dep4, proj2),
        ];

        let g = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &deployments);

        // Node count: 2 issuers + 3 credentials + 2 projects + 4 deployments = 11
        assert_eq!(g.node_count(), 11, "expected 11 nodes");

        // Edge count:
        //   Issues:     cred1→iss1, cred2→iss1, cred3→iss2  → 3
        //   UsedBy:     5 distinct (cred, proj) pairs         → 5
        //   DeployedAs: 4 deployments                         → 4
        //   Total: 3 + 5 + 4 = 12
        assert_eq!(g.edge_count(), 12, "expected 12 edges");

        // Count per edge kind
        let (mut issues, mut used_by, mut deployed_as) = (0usize, 0usize, 0usize);
        for (_, _, kind) in g.edges() {
            match kind {
                EdgeKind::Issues => issues += 1,
                EdgeKind::UsedBy => used_by += 1,
                EdgeKind::DeployedAs => deployed_as += 1,
            }
        }
        assert_eq!(issues, 3, "expected 3 Issues edges");
        assert_eq!(used_by, 5, "expected 5 UsedBy edges");
        assert_eq!(deployed_as, 4, "expected 4 DeployedAs edges");
    }

    // -----------------------------------------------------------------------
    // Test 4: duplicate usages are deduplicated
    // -----------------------------------------------------------------------

    #[test]
    fn duplicate_usages_produce_single_used_by_edge() {
        let iss_id = IssuerId::new();
        let cred_id = CredentialId::new();
        let proj_id = ProjectId::new();

        let issuers = vec![make_issuer(iss_id)];
        let credentials = vec![make_credential(cred_id, iss_id)];
        let projects = vec![make_project(proj_id)];
        // Three usage records all with the same (cred_id, proj_id)
        let usages = vec![
            make_usage(UsageId::new(), cred_id, proj_id),
            make_usage(UsageId::new(), cred_id, proj_id),
            make_usage(UsageId::new(), cred_id, proj_id),
        ];

        let g = DependencyGraph::build(&issuers, &credentials, &usages, &projects, &[]);

        // Nodes: 1 issuer + 1 credential + 1 project = 3 (no deployments)
        assert_eq!(g.node_count(), 3);
        // Edges: Issues(iss→cred) + UsedBy(cred→proj) = 2 (deduplicated)
        assert_eq!(g.edge_count(), 2);
    }
}
