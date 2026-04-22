use keyring::Entry;
use secrecy::SecretBox;

use crate::KeyringError;

const SERVICE: &str = "com.phoodul.apivault";

fn account_key(user_id: &str) -> String {
    format!("master:{}", user_id)
}

/// OS Keyring 에 마스터 키 바이트를 저장한다.
/// Windows: Credential Manager, macOS: Keychain, Linux: Secret Service.
pub fn store_master(user_id: &str, bytes: &[u8]) -> Result<(), KeyringError> {
    let account = account_key(user_id);
    let entry = Entry::new(SERVICE, &account).map_err(map_error)?;
    // keyring 3.x 는 바이트를 base64로 인코딩하여 저장하는 방식을 지원하지 않으므로
    // hex 인코딩하여 문자열로 저장한다.
    let encoded = hex::encode(bytes);
    entry.set_password(&encoded).map_err(map_error)
}

/// OS Keyring 에서 마스터 키 바이트를 불러온다.
pub fn load_master(user_id: &str) -> Result<SecretBox<Vec<u8>>, KeyringError> {
    let account = account_key(user_id);
    let entry = Entry::new(SERVICE, &account).map_err(map_error)?;
    let encoded = entry.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => KeyringError::NotFound,
        other => map_error(other),
    })?;
    let bytes = hex::decode(&encoded).map_err(|e| KeyringError::Backend(e.to_string()))?;
    Ok(SecretBox::new(Box::new(bytes)))
}

/// OS Keyring 에서 마스터 키 항목을 삭제한다.
pub fn delete_master(user_id: &str) -> Result<(), KeyringError> {
    let account = account_key(user_id);
    let entry = Entry::new(SERVICE, &account).map_err(map_error)?;
    entry.delete_credential().map_err(|e| match e {
        keyring::Error::NoEntry => KeyringError::NotFound,
        other => map_error(other),
    })
}

fn map_error(e: keyring::Error) -> KeyringError {
    match e {
        keyring::Error::NoEntry => KeyringError::NotFound,
        keyring::Error::NoStorageAccess(_) => {
            KeyringError::Unavailable(format!("storage access denied: {e}"))
        }
        other => KeyringError::Backend(other.to_string()),
    }
}
