//! Google Chrome / Edge / Brave 비밀번호 내보내기 CSV 파서.
//!
//! # 지원 포맷
//!
//! | 브라우저      | 헤더 컬럼                             |
//! |:------------|:-------------------------------------|
//! | Chrome/Brave | `name,url,username,password[,note]`  |
//! | Edge         | `url,username,password`              |
//!
//! 헤더 이름 대소문자 무관, 컬럼 순서 무관, UTF-8 BOM 자동 제거.
//! password 는 `secrecy::SecretBox<String>` 으로 즉시 래핑 — 평문 String 으로 들고 다니지 않는다.

use secrecy::SecretBox;
use thiserror::Error;

// ── 공개 타입 ─────────────────────────────────────────────────────────────────

/// 브라우저 CSV 포맷 종류.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CsvFormat {
    /// Chrome / Brave: 5 컬럼 (`name,url,username,password[,note]`)
    ChromeBrave,
    /// Edge: 3 컬럼 (`url,username,password`)
    Edge,
}

/// CSV 한 행에 대응하는 파싱 결과.
#[derive(Debug)]
pub struct ImportedRow {
    /// Edge 는 `name` 컬럼이 없어 `None`.
    pub name: Option<String>,
    /// 빈 문자열 가능 (Chrome 일부 행).
    pub url: String,
    /// 빈 값이면 `None`.
    pub username: Option<String>,
    /// 평문을 즉시 `SecretBox` 로 래핑.
    pub password: SecretBox<String>,
    /// Chrome only; feature flag off 이거나 Edge 포맷이면 `None`.
    pub note: Option<String>,
}

/// 파싱 중 치명적이지 않은 경고 통계.
#[derive(Debug, Default)]
pub struct ImportWarnings {
    /// `password` 가 빈 문자열이어서 건너뛴 행 수.
    pub empty_password: usize,
    /// `url` 이 빈 문자열인 행 수 (건너뛰지는 않음).
    pub empty_url: usize,
}

/// `parse_csv` 의 성공 반환값.
#[derive(Debug)]
pub struct ParseResult {
    pub format: CsvFormat,
    pub rows: Vec<ImportedRow>,
    pub warnings: ImportWarnings,
}

/// CSV 파싱 오류.
#[derive(Debug, Error)]
pub enum ImportError {
    #[error("invalid CSV header — required columns missing")]
    InvalidHeader,
    #[error("CSV parse error: {0}")]
    Csv(#[from] csv::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

// ── 내부 상수 ──────────────────────────────────────────────────────────────────

const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

// ── 공개 API ───────────────────────────────────────────────────────────────────

/// 바이트 슬라이스 (BOM 포함 가능) 를 받아 파싱한다.
///
/// # Errors
/// - 헤더에 `password` 컬럼이 없으면 [`ImportError::InvalidHeader`].
/// - CSV 구문 오류는 [`ImportError::Csv`].
pub fn parse_csv(input: &[u8]) -> Result<ParseResult, ImportError> {
    // BOM 제거
    let data = input.strip_prefix(UTF8_BOM).unwrap_or(input);

    let mut reader = csv::ReaderBuilder::new()
        .flexible(true) // 컬럼 수 다를 수 있음 (note 누락)
        .from_reader(data);

    // 헤더 읽기 및 컬럼 인덱스 매핑 (대소문자 무시)
    let headers = reader.headers()?.clone();
    let col = |name: &str| -> Option<usize> {
        headers
            .iter()
            .position(|h| h.trim().to_ascii_lowercase() == name)
    };

    let idx_password = col("password").ok_or(ImportError::InvalidHeader)?;
    let idx_url = col("url").ok_or(ImportError::InvalidHeader)?;
    let idx_name = col("name");
    let idx_username = col("username");
    let idx_note = col("note");

    // 포맷 감지
    let format = if idx_name.is_some() {
        CsvFormat::ChromeBrave
    } else {
        CsvFormat::Edge
    };

    let mut rows = Vec::new();
    let mut warnings = ImportWarnings::default();

    for result in reader.records() {
        let record = result?;

        let get = |idx: usize| -> String { record.get(idx).unwrap_or("").to_owned() };
        let get_opt = |idx: Option<usize>| -> Option<String> {
            idx.and_then(|i| record.get(i))
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
        };

        let password_str = get(idx_password);
        if password_str.is_empty() {
            warnings.empty_password += 1;
            continue;
        }

        let url = get(idx_url);
        if url.is_empty() {
            warnings.empty_url += 1;
        }

        rows.push(ImportedRow {
            name: get_opt(idx_name),
            url,
            username: get_opt(idx_username),
            password: SecretBox::new(Box::new(password_str)),
            note: get_opt(idx_note),
        });
    }

    Ok(ParseResult {
        format,
        rows,
        warnings,
    })
}

// ── 단위 테스트 ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use secrecy::ExposeSecret;

    // ── 헬퍼 ────────────────────────────────────────────────────────────────

    fn pw(row: &ImportedRow) -> &str {
        row.password.expose_secret()
    }

    // ── 테스트 1: Chrome 표준 5 컬럼 ────────────────────────────────────────

    #[test]
    fn parses_chrome_5_columns() {
        let csv = b"name,url,username,password,note\n\
                    GitHub,https://github.com,alice,secret1,dev note\n\
                    Stripe,https://stripe.com,bob,secret2,billing";

        let result = parse_csv(csv).unwrap();
        assert_eq!(result.format, CsvFormat::ChromeBrave);
        assert_eq!(result.rows.len(), 2);

        let r0 = &result.rows[0];
        assert_eq!(r0.name.as_deref(), Some("GitHub"));
        assert_eq!(r0.url, "https://github.com");
        assert_eq!(r0.username.as_deref(), Some("alice"));
        assert_eq!(pw(r0), "secret1");
        assert_eq!(r0.note.as_deref(), Some("dev note"));

        let r1 = &result.rows[1];
        assert_eq!(r1.name.as_deref(), Some("Stripe"));
        assert_eq!(pw(r1), "secret2");
    }

    // ── 테스트 2: Edge 3 컬럼 ──────────────────────────────────────────────

    #[test]
    fn parses_edge_3_columns() {
        let csv = b"url,username,password\n\
                    https://example.com,alice,pw1\n\
                    https://another.com,bob,pw2";

        let result = parse_csv(csv).unwrap();
        assert_eq!(result.format, CsvFormat::Edge);
        assert_eq!(result.rows.len(), 2);

        assert!(result.rows[0].name.is_none());
        assert_eq!(result.rows[0].url, "https://example.com");
        assert_eq!(pw(&result.rows[0]), "pw1");
        assert!(result.rows[1].name.is_none());
    }

    // ── 테스트 3: Chrome — note 컬럼 누락 (feature flag off) ───────────────

    #[test]
    fn parses_chrome_without_note_column() {
        let csv = b"name,url,username,password\n\
                    Site,https://site.com,user,pass123";

        let result = parse_csv(csv).unwrap();
        assert_eq!(result.format, CsvFormat::ChromeBrave);
        assert_eq!(result.rows.len(), 1);
        assert!(result.rows[0].note.is_none());
        assert_eq!(pw(&result.rows[0]), "pass123");
    }

    // ── 테스트 4: UTF-8 BOM 제거 ───────────────────────────────────────────

    #[test]
    fn strips_utf8_bom() {
        let header = b"name,url,username,password,note\n";
        let row = b"BOM site,https://bom.com,user,bom_pass,";
        let mut csv = Vec::new();
        csv.extend_from_slice(b"\xEF\xBB\xBF");
        csv.extend_from_slice(header);
        csv.extend_from_slice(row);

        let result = parse_csv(&csv).unwrap();
        assert_eq!(result.rows.len(), 1);
        assert_eq!(pw(&result.rows[0]), "bom_pass");
    }

    // ── 테스트 5: RFC 4180 escape (쉼표 / 따옴표 / 줄바꿈 포함 password) ───

    #[test]
    fn handles_rfc4180_escape() {
        // password = p,"a,b"\nc  (따옴표, 쉼표, 줄바꿈 포함)
        let csv = b"name,url,username,password,note\n\
                    Test,https://t.com,u,\"p,\"\"a,b\"\"\\nc\",";

        let result = parse_csv(csv).unwrap();
        assert_eq!(result.rows.len(), 1);
        // csv crate 는 "" → " 로 unescape 함
        assert_eq!(pw(&result.rows[0]), "p,\"a,b\"\\nc");
    }

    // ── 테스트 6: 빈 password 행 스킵 ─────────────────────────────────────

    #[test]
    fn skips_empty_password_rows() {
        let csv = b"name,url,username,password,note\n\
                    Site A,https://a.com,user1,real_pass,\n\
                    Site B,https://b.com,user2,,\n\
                    Site C,https://c.com,user3,another_pass,";

        let result = parse_csv(csv).unwrap();
        assert_eq!(result.rows.len(), 2, "빈 password 행은 제외되어야 함");
        assert_eq!(result.warnings.empty_password, 1);
        assert_eq!(pw(&result.rows[0]), "real_pass");
        assert_eq!(pw(&result.rows[1]), "another_pass");
    }

    // ── 테스트 7: 잘못된 헤더 → InvalidHeader ────────────────────────────

    #[test]
    fn rejects_invalid_header() {
        let csv = b"foo,bar,baz\n1,2,3";
        let err = parse_csv(csv).unwrap_err();
        assert!(
            matches!(err, ImportError::InvalidHeader),
            "expected InvalidHeader, got {err:?}"
        );
    }

    // ── 테스트 8: 대소문자 혼합 헤더 ──────────────────────────────────────

    #[test]
    fn case_insensitive_headers() {
        let csv = b"Name,URL,Username,Password,Note\n\
                    MyBank,https://bank.com,alice,bank_secret,savings";

        let result = parse_csv(csv).unwrap();
        assert_eq!(result.format, CsvFormat::ChromeBrave);
        assert_eq!(result.rows.len(), 1);
        assert_eq!(result.rows[0].name.as_deref(), Some("MyBank"));
        assert_eq!(pw(&result.rows[0]), "bank_secret");
    }

    // ── 테스트 9 (선택): CRLF + LF 혼용 ──────────────────────────────────

    #[test]
    fn handles_crlf_and_lf() {
        // Windows CRLF line endings
        let csv_crlf = b"name,url,username,password,note\r\n\
                         SiteA,https://a.com,userA,passA,\r\n\
                         SiteB,https://b.com,userB,passB,";

        let result_crlf = parse_csv(csv_crlf).unwrap();
        assert_eq!(result_crlf.rows.len(), 2);

        // Unix LF line endings
        let csv_lf = b"name,url,username,password,note\n\
                       SiteA,https://a.com,userA,passA,\n\
                       SiteB,https://b.com,userB,passB,";

        let result_lf = parse_csv(csv_lf).unwrap();
        assert_eq!(result_lf.rows.len(), 2);
    }
}
