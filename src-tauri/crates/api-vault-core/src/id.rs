use serde::{Deserialize, Serialize};
use ulid::Ulid;

macro_rules! id_newtype {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub Ulid);

        impl $name {
            pub fn new() -> Self {
                Self(Ulid::new())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl std::str::FromStr for $name {
            type Err = ulid::DecodeError;
            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Ok(Self(Ulid::from_string(s)?))
            }
        }
    };
}

id_newtype!(IssuerId);
id_newtype!(CredentialId);
id_newtype!(ProjectId);
id_newtype!(DeploymentId);
id_newtype!(UsageId);
id_newtype!(IncidentId);
id_newtype!(IncidentMatchId);
id_newtype!(AuditLogId);
id_newtype!(DeviceId);
