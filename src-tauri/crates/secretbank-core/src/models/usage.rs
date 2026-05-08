use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::{CredentialId, DeploymentId, ProjectId, UsageId};

/// How the credential is referenced in the project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UsageWhereKind {
    EnvVar,
    FilePath,
    CodeRef,
}

/// How a usage was verified.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerifiedBy {
    Scan,
    Manual,
    Runtime,
}

/// A usage record linking a credential to a project (and optionally a deployment).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Usage {
    pub id: UsageId,
    pub credential_id: CredentialId,
    pub project_id: ProjectId,
    pub deployment_id: Option<DeploymentId>,
    pub where_kind: UsageWhereKind,
    /// e.g. `OPENAI_API_KEY` or `/apps/web/.env.local`
    pub where_value: String,
    #[serde(default, with = "time::serde::timestamp::milliseconds::option")]
    pub verified_at: Option<OffsetDateTime>,
    pub verified_by: Option<VerifiedBy>,
}

/// Input for creating a new usage record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UsageInput {
    pub credential_id: CredentialId,
    pub project_id: ProjectId,
    pub deployment_id: Option<DeploymentId>,
    pub where_kind: UsageWhereKind,
    pub where_value: String,
}
