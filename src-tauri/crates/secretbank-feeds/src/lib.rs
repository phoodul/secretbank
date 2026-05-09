pub mod ghsa;
pub mod hibp;
pub mod matcher;
pub mod nvd;
pub mod pwned_passwords;
pub mod rss;
pub mod security_check;
pub mod sources;
pub mod twofa_directory;

pub use ghsa::{GhsaAdvisory, GhsaClient, GhsaError};
pub use hibp::{HibpBreach, HibpClient, HibpError};
pub use matcher::{
    match_incident, match_incident_at, match_incidents_by_host, normalize_host, HostIncidentMatch,
};
pub use nvd::{NvdClient, NvdCve, NvdError};
pub use pwned_passwords::{PwnedError, PwnedPasswordsClient};
pub use rss::{RssClient, RssEntry, RssError};
pub use security_check::{
    check_missing_2fa, check_unsecured_url, detect_reused_passwords, is_weak_password,
    CredentialFor2FaCheck, CredentialPasswordRef, ReuseGroup, SecurityAlert, SecurityCheckResult,
};
pub use sources::{default_presets, FeedFormat, RssSource};
pub use twofa_directory::{TwoFaDirectoryClient, TwoFaError};
