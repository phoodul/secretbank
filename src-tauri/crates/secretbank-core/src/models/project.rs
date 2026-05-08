use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::ProjectId;

/// A user-owned project or repository that consumes credentials.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    pub id: ProjectId,
    pub name: String,
    pub repo_url: Option<String>,
    pub framework: Option<String>,
    pub runtime: Option<String>,
    pub local_path: Option<String>,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub updated_at: OffsetDateTime,
}

/// Input for creating a new project.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectInput {
    pub name: String,
    pub repo_url: Option<String>,
    pub framework: Option<String>,
    pub runtime: Option<String>,
    pub local_path: Option<String>,
}

/// Partial update for a project.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub repo_url: Option<String>,
    pub framework: Option<String>,
    pub runtime: Option<String>,
    pub local_path: Option<String>,
}
