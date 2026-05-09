/**
 * @file credential.ts
 * @license AGPL-3.0-or-later
 *
 * 데스크톱 Rust CredentialKind enum 과 1:1 대응하는 TypeScript 타입.
 * Source of truth: src-tauri/crates/secretbank-core/src/models/credential.rs
 *
 * Rust enum (serde rename_all = "snake_case"):
 *   ApiKey    → "api_key"
 *   Password  → "password"
 *   CreditCard → "credit_card"
 */

/**
 * Credential 종류 — Rust `CredentialKind` 와 동일.
 *
 * - `api_key`: API 키 (기본값). name + opaque value.
 * - `password`: 일반 비밀번호 (M24). url + username + password.
 * - `credit_card`: 결제 카드 (M24 Phase 3-A). credit_card_meta 테이블 + age vault.
 */
export type CredentialKind = "api_key" | "password" | "credit_card";
