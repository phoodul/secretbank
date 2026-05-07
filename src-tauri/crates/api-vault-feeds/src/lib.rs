pub mod ghsa;
pub mod hibp;
pub mod matcher;
pub mod nvd;
pub mod pwned_passwords;
pub mod rss;
pub mod sources;

pub use ghsa::{GhsaAdvisory, GhsaClient, GhsaError};
pub use hibp::{HibpBreach, HibpClient, HibpError};
pub use matcher::{match_incident, match_incident_at};
pub use nvd::{NvdClient, NvdCve, NvdError};
pub use pwned_passwords::{PwnedError, PwnedPasswordsClient};
pub use rss::{RssClient, RssEntry, RssError};
pub use sources::{default_presets, FeedFormat, RssSource};
