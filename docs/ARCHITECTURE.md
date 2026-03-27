# Fortress 기술 아키텍처 문서

## 1. 기술 스택

| 기술 | 버전 | 용도 |
|------|------|------|
| Phaser | 4.0.0-rc.6 | 게임 엔진 (렌더링, 입력, 트윈, 씬 관리) |
| TypeScript | ^5.9.3 | 타입 안전 개발 |
| Vite | ^8.0.1 | 빌드 도구 (dev server, HMR, production build) |
| Biome | ^2.4.8 | 린터 + 포매터 (ESLint/Prettier 대체) |

### 빌드 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | Vite 개발 서버 (HMR) |
| `npm run build` | `tsc && vite build` (타입체크 + 프로덕션 빌드) |
| `npm run preview` | 빌드 결과물 미리보기 |
| `npm run check` | Biome 전체 검사 + 자동 수정 |
| `npm run lint` | Biome 린트만 |
| `npm run type-check` | `tsc -noEmit` (타입 체크만) |
| `npm run format` | Biome 포맷팅 |

---

## 2. 프로젝트 구조

```
fortress/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.ts                     # 엔트리포인트, Phaser.Game 초기화
    config.ts                   # 전역 상수 (CONFIG, COLORS, drawPanel)
    scenes/
      BootScene.ts              # 부트 씬 (리소스 로드)
      TitleScene.ts             # 타이틀 씬 (메뉴, 탱크 선택, 맵 선택)
      GameScene.ts              # 메인 게임 씬 (전투 로직)
      UIScene.ts                # UI 오버레이 씬 (HUD, 무기/아이템 UI)
    objects/
      Tank.ts                   # 탱크 엔티티 (렌더링, 이동, 피격, 애니메이션)
      TankDefs.ts               # 탱크 6종 타입 정의 + 시대 상성
      Terrain.ts                # 지형 (맵 10종 정의, 생성, 파괴, 렌더링)
      Projectile.ts             # 포탄 (6종 디자인, 물리, 연기 꼬리)
    systems/
      WeaponSystem.ts           # 무기 8종 정의 + 탄약 관리
      PowerUpSystem.ts          # 아이템 11종 + 드롭 + 인벤토리
      AudioSystem.ts            # 프로시저럴 SFX (Web Audio API)
      BGMSystem.ts              # 프로시저럴 BGM (5모드)
      AchievementSystem.ts      # 업적 18종 + 저장/로드
      PlayerRank.ts             # 계급 15단계 + XP
      WindSystem.ts             # 바람 시스템
      TurnManager.ts            # 턴 관리
      InputHandler.ts           # 입력 처리 (터치/마우스/키보드)
      KeyboardAimSystem.ts      # 키보드 조준 시스템
      AIPlayer.ts               # 기본 AI
      AdvancedAI.ts             # 고급 AI (Hard 난이도)
      EffectsSystem.ts          # 시각 이펙트 (폭발, 파티클)
      GameStats.ts              # 커리어 통계
      DailyChallenge.ts         # 일일 챌린지
      MatchManager.ts           # 매치 관리 (라운드)
      ShopSystem.ts             # 상점 시스템
      TankProgression.ts        # 탱크 성장
      WeatherSystem.ts          # 날씨 시스템
    utils/
      TerrainCollision.ts       # 지형 충돌 맵 (알파맵 기반)
  docs/
    ...                         # 문서
```

---

## 3. 씬 흐름도

```
BootScene ──→ TitleScene ──→ GameScene
                  ↑              │
                  │              │ (병렬 실행)
                  │              ├── UIScene
                  │              │
                  └──────────────┘ (게임 종료 → 타이틀 복귀)
```

### 씬 역할

| 씬 | 역할 | 생명주기 |
|----|------|----------|
| **BootScene** | 에셋 로딩 (현재 프로시저럴이므로 최소) | 1회 실행 후 전환 |
| **TitleScene** | 메인 메뉴, 탱크 선택, 맵 선택, 설정, 업적/계급 표시 | 게임 시작/종료 시 활성 |
| **GameScene** | 핵심 전투 루프 (턴 관리, 물리, 충돌, 데미지) | 전투 중 활성 |
| **UIScene** | HUD 오버레이 (HP바, 무기 선택, 아이템, 바람 표시) | GameScene과 병렬 실행 |

### Phaser Game 설정

```typescript
{
  type: Phaser.AUTO,          // WebGL 우선, Canvas 폴백
  width: 1280,                // VIEW_WIDTH
  height: 720,                // WORLD_HEIGHT
  scale: {
    mode: Phaser.Scale.FIT,   // 뷰포트에 맞춰 스케일링
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  backgroundColor: '#87CEEB'  // 하늘색
}
```

---

## 4. 의존성 그래프 요약

```
main.ts
  └── config.ts (전역 상수)
  └── BootScene
  └── TitleScene
        └── AchievementSystem
        └── PlayerRank
        └── DailyChallenge
        └── TankDefs
  └── GameScene
        └── Tank ← TankDefs
        └── Terrain ← TerrainCollision (TerrainAlphaMap)
        └── Projectile ← WeaponSystem
        └── TurnManager
        └── WindSystem
        └── InputHandler / KeyboardAimSystem
        └── AIPlayer / AdvancedAI
        └── PowerUpSystem (ItemManager)
        └── EffectsSystem
        └── AudioSystem
        └── BGMSystem
        └── GameStats
        └── WeatherSystem
  └── UIScene
        └── WeaponSystem
        └── PowerUpSystem
        └── config (COLORS, drawPanel)
```

---

## 5. 충돌 시스템

### TerrainAlphaMap

지형 충돌은 **픽셀 단위 알파맵** 방식을 사용한다.

| 항목 | 설명 |
|------|------|
| 자료구조 | `Uint8Array` (WORLD_WIDTH x PLAY_HEIGHT) |
| 1 = 고체 | 지형이 존재하는 픽셀 |
| 0 = 공기 | 빈 공간 |
| 초기화 | `initFromHeights(heights[])` -- 높이 배열 아래를 고체로 채움 |
| 파괴 | `clearCircle(cx, cy, r)` -- 원형 영역을 0으로 |
| 추가 | `fillCircle(cx, cy, r)` -- 원형 영역을 1로 (흙덩이 무기) |

### 주요 메서드

| 메서드 | 용도 |
|--------|------|
| `isSolid(x, y)` | 해당 좌표가 고체인지 확인 |
| `getColumnHeight(x)` | x열에서 최상단 고체 y좌표 |
| `findSurfaceBelow(x, startY)` | startY 아래 첫 고체 표면 |

### HitCircles (탱크 피격 판정)

탱크는 사각형 대신 **원형 히트박스 목록**을 사용한다.

| 탱크 | 히트서클 구성 |
|------|---------------|
| 캐논 | 차체 (0,10,r20) + 포탑 (3,24,r12) |
| 호버 | 차체 (0,8,r16) + 포탑 (4,20,r9) |
| 중전차 | 차체 (0,14,r26) + 포탑 (2,28,r14) |
| 미사일 | 차체 (0,12,r20) + 포탑 (-2,24,r11) |
| 레이저 | 차체 (0,9,r16) + 포탑 (3,22,r10) |
| 카타펄트 | 차체 (0,13,r24) + 포탑 (-4,26,r10) |

- `lx`: 좌우 오프셋 (facing 방향으로 곱해짐)
- `ly`: 바닥 기준 높이 (위로 양수)
- `r`: 반경
- 실제 판정 시 기울기(slopeRad) + facing으로 좌표 변환

---

## 6. 영속 데이터 (localStorage)

| 키 | 시스템 | 저장 내용 |
|----|--------|-----------|
| `fortress_achievements` | AchievementSystem | 해금된 업적 ID 배열 + 타임스탬프 |
| `fortress_tank_wins` | AchievementSystem | 탱크별 승리 기록 (올라운더 업적용) |
| `fortress_player_rank` | PlayerRank | 누적 XP, 총 게임 수, 총 승리 수 |
| `fortress_career_stats` | GameStats | 커리어 통계 (전적, 데미지 등) |
| `fortress_daily_challenge` | DailyChallenge | 일일 챌린지 진행 상태 |
| `fortress_tank_progression` | TankProgression | 탱크별 성장 데이터 |

### 데이터 안전성

- 모든 `localStorage` 접근은 `try-catch`로 래핑
- 파싱 실패 시 기본값으로 폴백
- 직렬화: `JSON.stringify` / `JSON.parse`

---

## 7. 알려진 제한사항

| 항목 | 설명 |
|------|------|
| **오프라인 전용** | 서버 없음, 로컬 PvP + AI만 지원 |
| **에셋 없음** | 모든 그래픽이 프로시저럴 -- 스프라이트시트 없음 |
| **음향 프로시저럴** | Web Audio API 오실레이터 기반 -- 샘플 오디오 없음 |
| **저장 한계** | localStorage만 사용 (5~10MB 한계, 브라우저 의존) |
| **단일 화면** | 2400px 월드를 1280px 뷰포트로 카메라 스크롤 |
| **프레임 의존 물리** | 고정 프레임 기반 (deltaTime 미사용) |
| **모바일 최적화** | `Phaser.Scale.FIT`으로 대응하나 터치 UX는 제한적 |
| **멀티플레이어** | 네트워크 대전 미지원 (로컬만) |
| **접근성** | 색약/색맹 모드 미지원 |
| **Phaser RC** | 정식 릴리스 전 RC 버전 사용 -- API 변경 가능성 |
