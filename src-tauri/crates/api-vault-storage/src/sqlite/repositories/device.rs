use api_vault_core::{Device, DeviceId, DeviceInput, DevicePlatform, DeviceStatus};
use sqlx::{Row, SqlitePool};
use time::OffsetDateTime;

use crate::sqlite::{dt_to_ms, ms_to_dt, ms_to_dt_opt, StorageError};

pub struct DeviceRepo<'a> {
    pool: &'a SqlitePool,
}

impl<'a> DeviceRepo<'a> {
    pub fn new(pool: &'a SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, input: &DeviceInput) -> Result<DeviceId, StorageError> {
        let id = DeviceId::new();
        let id_str = id.to_string();
        let platform_str = platform_to_str(input.platform);
        let now = dt_to_ms(OffsetDateTime::now_utc());

        sqlx::query(
            r#"INSERT INTO device (id, name, platform, public_key, paired_at, status)
               VALUES (?, ?, ?, ?, ?, 'active')"#,
        )
        .bind(&id_str)
        .bind(&input.name)
        .bind(platform_str)
        .bind(&input.public_key)
        .bind(now)
        .execute(self.pool)
        .await?;

        Ok(id)
    }

    pub async fn get_by_id(&self, id: DeviceId) -> Result<Option<Device>, StorageError> {
        let id_str = id.to_string();
        let row = sqlx::query(
            r#"SELECT id, name, platform, public_key, paired_at, last_seen_at, status
               FROM device WHERE id = ?"#,
        )
        .bind(&id_str)
        .fetch_optional(self.pool)
        .await?;

        row.map(|r| row_to_device(&r)).transpose()
    }

    pub async fn revoke(&self, id: DeviceId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        sqlx::query("UPDATE device SET status = 'revoked' WHERE id = ?")
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_last_seen(&self, id: DeviceId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        let now = dt_to_ms(OffsetDateTime::now_utc());
        sqlx::query("UPDATE device SET last_seen_at = ? WHERE id = ?")
            .bind(now)
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete(&self, id: DeviceId) -> Result<(), StorageError> {
        let id_str = id.to_string();
        sqlx::query("DELETE FROM device WHERE id = ?")
            .bind(&id_str)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_device(r: &sqlx::sqlite::SqliteRow) -> Result<Device, StorageError> {
    let id_str: String = r.try_get("id")?;
    let platform_str: String = r.try_get("platform")?;
    let status_str: String = r.try_get("status")?;
    let paired_ms: i64 = r.try_get("paired_at")?;
    let last_seen_ms: Option<i64> = r.try_get("last_seen_at")?;

    Ok(Device {
        id: id_str
            .parse()
            .map_err(|e: ulid::DecodeError| StorageError::Parse(e.to_string()))?,
        name: r.try_get("name")?,
        platform: str_to_platform(&platform_str)?,
        public_key: r.try_get("public_key")?,
        paired_at: ms_to_dt(paired_ms)?,
        last_seen_at: ms_to_dt_opt(last_seen_ms)?,
        status: str_to_status(&status_str)?,
    })
}

fn platform_to_str(p: DevicePlatform) -> &'static str {
    match p {
        DevicePlatform::DesktopWin => "desktop-win",
        DevicePlatform::Mac => "mac",
        DevicePlatform::Linux => "linux",
        DevicePlatform::Ios => "ios",
        DevicePlatform::Android => "android",
        DevicePlatform::Web => "web",
    }
}

fn str_to_platform(s: &str) -> Result<DevicePlatform, StorageError> {
    match s {
        "desktop-win" => Ok(DevicePlatform::DesktopWin),
        "mac" => Ok(DevicePlatform::Mac),
        "linux" => Ok(DevicePlatform::Linux),
        "ios" => Ok(DevicePlatform::Ios),
        "android" => Ok(DevicePlatform::Android),
        "web" => Ok(DevicePlatform::Web),
        other => Err(StorageError::Parse(format!("unknown platform: {other}"))),
    }
}

fn str_to_status(s: &str) -> Result<DeviceStatus, StorageError> {
    match s {
        "active" => Ok(DeviceStatus::Active),
        "revoked" => Ok(DeviceStatus::Revoked),
        other => Err(StorageError::Parse(format!("unknown device status: {other}"))),
    }
}
