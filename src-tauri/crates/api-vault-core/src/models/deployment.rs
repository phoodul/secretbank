use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

use crate::id::{DeploymentId, ProjectId};
use crate::models::credential::Env;

/// Deployment platform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeploymentPlatform {
    Vercel,
    Railway,
    Fly,
    Netlify,
    Other,
}

/// A specific deployed environment of a project.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Deployment {
    pub id: DeploymentId,
    pub project_id: ProjectId,
    pub url: String,
    pub platform: DeploymentPlatform,
    pub env: Env,
    #[serde(with = "time::serde::timestamp::milliseconds")]
    pub created_at: OffsetDateTime,
}

/// Input for creating a new deployment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeploymentInput {
    pub project_id: ProjectId,
    pub url: String,
    pub platform: DeploymentPlatform,
    pub env: Env,
}
