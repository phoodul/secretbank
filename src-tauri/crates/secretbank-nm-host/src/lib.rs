// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Secretbank contributors
//
// Native Messaging Host 라이브러리 진입점.
// Chrome/Firefox Native Messaging 프로토콜 (4-byte LE length header + UTF-8 JSON body)
// 구현체를 공개한다. 통합 테스트는 이 lib crate 를 직접 참조한다.

pub mod bridge_client;
pub mod installer;
pub mod pairing;
pub mod protocol;
pub mod session;
