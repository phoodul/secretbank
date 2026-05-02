# LockScreen 디자인 노트 — Night mode (2026-04-30)

## 빠른 확인 가이드

```sh
pnpm tauri dev
```

`Lock Screen` 에 진입하시면 다음을 확인하실 수 있습니다.

### 1. 정적 화면 — 진입 직후 (idle)

- **미드나잇 lapis 배경** + 가장자리 페이드 청사진 그리드
- 화면 중앙에 **Vault 메커니즘** (140px):
  - 외곽 도수 게이지 (000~330) 천천히 회전
  - 12개 lapis arc 세그먼트가 반대 방향 회전
  - 황금 alignment 마커 (12시 위치 굵은 tick) — glow filter
  - Glyph 박스 8개 (A1F / 8C2 / 5E9 / B7D / 3K0 / F6N / Q9X / Z2P)
  - 4개 데이터 플로우 dot 이 외곽 ring 둘레 따라 무한 회전
  - 중앙 brass 디스크 + reactor core (펄스)
  - L 자 코너 brackets (4 코너)
  - SEC-A1 / ENC-OK / RDY-7F / VAU-00 시스템 라벨 4개
  - Hex 메시 16개 (희미)
- 카드 광택 효과:
  - **마우스 따라가는 gold/lapis 라디얼 highlight** (idle 상태에서만)
  - 5.5초 간격 대각선 light beam sweep (4.2s 통과)
  - 4코너 brass 장식 + 4.5초 호흡 펄스
- 카드 외곽 정돈된 황동 + lapis 베벨
- 하단 시스템 로그: `› vault sealed · awaiting authentication` + 깜빡이는 cursor
- 하단 상태 패널: 펄스하는 patina-green LED + `ARMED` + `VAULT/0.1.0` + ISO timestamp

### 2. 비번 입력 → Unlock 클릭 (verifying)

- 모든 ring 4배 가속 회전
- **3 sonar ping** 이 1.8초 간격으로 중앙→외곽 펄스
- **glyph 박스 8개** 가 70ms 간격으로 random 3-char 스크램블
- 시스템 로그: `establishing secure channel...` → `validating credentials...` → `decrypting master key...` → `scanning encrypted index...` (1.2초씩 cycle)
- LED 가 더 빠르게 펄스
- 파티클 dust 가 진해짐

### 3. 검증 성공 (unlocking) — 1.1초 시퀀스

- ring 들이 **0.0s / 0.18s / 0.36s 간격으로 차례로 spring 정렬** (딸깍 딸깍 딸깍)
- glyph 박스 들이 최종 코드로 잠김 (gold-bright)
- alignment 마커 들이 황금색으로 강조 + drop-shadow halo
- 외곽 brass corner brackets 가 0.1s 스태거로 1.15× pulse
- 중앙 brass 디스크 1.08x scale 펄스
- **카드 자체에 황금 box-shadow halo 점진 확장**
- 시스템 로그: `alignment confirmed · tumblers engaged`

### 4. 잠금 해제 완료 (unlocked) — 0.22초 페이드

- **16개 brass/lapis 파티클이 중앙에서 외곽으로 폭발** (1.4초 동안 사방으로 발사)
- 8 light ray 가 중앙에서 방사
- 카드 자체가 1 → 1.04 → 1.06 으로 살짝 expand
- opacity 1 → 0.85, blur(2px) 적용
- 황금 halo box-shadow 24px 80px 8px 까지 확장
- 시스템 로그: `ACCESS GRANTED` (대문자, 굵게, gold-bright)
- 다음 화면으로 부드럽게 fade out → onSuccess 호출

### 5. 잘못된 비번

- 카드가 좌우로 **5단계 흔들림** (0.5s)
- **빨간색 box-shadow halo 가 0→28px 4px 깜빡** (alarm)
- glyph 들이 idle 상태로 복귀
- 시스템 로그: idle 메시지로 복귀
- 메시지: `Incorrect passphrase`
- 3회 연속 실패 시: **10초 쿨다운** — 카운트다운 표시

### 6. 다크/라이트 모드

- 기본은 다크 (`defaultTheme="dark"` 설정됨)
- 헤더 우측 **Light/Dark 토글** 로 전환
- Light 모드 백그라운드는 거의 흰색 (`oklch(0.985)`)에 lapis ambient 약하게
- Lock 화면 카드 자체는 어떤 모드에서도 saturated lapis (의도적)

---

## 구현된 시각 레이어 총 개수

### LockScreen 레벨 (8 레이어)

1. Blueprint 청사진 그리드 (`-z-20`)
2. Ambient lapis radial gradient (`-z-10`)
3. ParticleField — 38 drifting particles
4. ScanlineOverlay — CRT scanlines
5. SuccessBloom — 잠금 해제 시에만
6. 카드 자체 (`.surface-vault` 6 layer + window-frame)
7. CornerOrnaments — 4 brass L 마커
8. LightBeamSweep + MouseGloss

### 카드 내부 (5 레이어)

9. VaultMechanism — 11 sub-layer (아래 참조)
10. CardHeader — 타이틀 + 설명 + AUTH·REQUIRED 라벨
11. Form — Label + Input + Error + Button + 보조 링크
12. SystemLog — typewriter line
13. StatusPanel — LED + state + version + timestamp

### VaultMechanism 내부 (11 sub-layer)

14. HexagonGrid (~16 cells, opacity 0.18)
15. CornerBrackets (4 L 마커)
16. CrosshairReticle (4 cardinal cross)
17. SystemLabels (4 monospace 코드 박스)
18. SonarPing (verifying 시 3 expanding rings)
19. OuterDegreeScale (72 ticks + 12 numeric labels)
20. ScanSweep (rotating brass arc + glow)
21. SegmentedArcRing (12 arcs, 1 alignment marker glow)
22. DataFlowParticles (4 ring-traversing dots)
23. GlyphRing (8 codes, scrambling)
24. DashRing (2 dashed circles, opposite rotation)
25. CenterCore (hexagon + brass disc + reactor core + 6 connectors)
26. UnlockBurst (16 radial particles, unlocked only)

**총 26개 시각 레이어** — 모두 prefers-reduced-motion 자동 무시

---

## 만약 마음에 안 드는 부분이 있다면

| 부분                 | 위치                                                       | 변경 방법                      |
| :------------------- | :--------------------------------------------------------- | :----------------------------- |
| Lapis 너무 진함/연함 | `globals.css` `--vault-lapis*`                             | chroma 값 (0.20~0.28 사이)     |
| 황동 너무 강함/약함  | `globals.css` `--vault-gold*`                              | chroma + lightness             |
| 메커니즘 크기        | `LockScreen.tsx` `<VaultMechanism size={140}>`             | 100~180                        |
| 회전 속도            | `VaultMechanism.tsx` `RING_TRANSFORM` 검색 → `idleSeconds` | 더 빠르게/느리게               |
| 스캔 속도            | `ScanSweep` 함수 `sweepDuration`                           | idle 4 / verify 1 / unlock 1.2 |
| Glyph 코드           | `VaultMechanism.tsx` `FINAL_CODES` 배열                    | 자유롭게                       |
| 시스템 로그 메시지   | `LockScreenAtmosphere.tsx` `VERIFYING_MESSAGES`            | 자유롭게                       |
| 파티클 개수          | `LockScreenAtmosphere.tsx` `makeParticles(38)`             | 줄이거나 늘림                  |
| 광선 sweep 빈도      | `LightBeamSweep` `repeatDelay: 5.5`                        | 작게=자주                      |
| Mouse gloss 비활성   | `LockScreen.tsx` `vaultState !== "idle"` 조건              | 항상 켜기/끄기                 |

---

## 다음 작업 후보 (M22.5 Phase 2 — 마음에 드시면)

1. **Inventory / Project / Graph** 페이지에 동일한 Lapis 분위기 적용
2. **CreateVaultDialog / PairJoinerDialog** 도 surface-vault 로 재단장
3. **Cmd+K 팔레트** — surface-glass + 검색 진행 시 typewriter 효과
4. **데모 영상 캡처** — Lock 화면 진입 → 비번 입력 → unlock 시퀀스 OBS 녹화

---

확인 후 어떤 부분을 더 손볼지, 다른 화면도 통일할지 알려주세요.
