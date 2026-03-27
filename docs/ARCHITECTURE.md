# Fortress Battle Arena - 기술 아키텍처 문서

## 1. 기술 스택
- **엔진**: Phaser 4.0.0-rc.6
- **언어**: TypeScript 5.9 (strict mode)
- **빌드**: Vite 8.0
- **린트**: Biome 2.4
- **에셋**: 제로 (프로시저럴 렌더링 + Web Audio API)

## 2. 프로젝트 구조
```
src/
├── main.ts                 # 진입점 (Phaser.Game 생성)
├── config.ts               # 게임 상수 + 컬러 + drawPanel 유틸
├── scenes/
│   ├── BootScene.ts        # 로딩 → TitleScene 전환
│   ├── TitleScene.ts       # 메인 메뉴, 탱크/맵 선택, 계급/업적/챌린지 표시
│   ├── GameScene.ts        # 핵심 게임 루프 (1,769줄)
│   └── UIScene.ts          # HUD 오버레이 (병렬 씬)
├── objects/
│   ├── Tank.ts             # 탱크 엔티티 + 렌더링 + 애니메이션 (1,935줄)
│   ├── TankDefs.ts         # 6종 탱크 데이터 정의 (순수 데이터)
│   ├── Projectile.ts       # 포탄 물리 + 렌더링
│   └── Terrain.ts          # 10종 맵 생성 + 지형 렌더링 + 파괴
├── systems/
│   ├── TurnManager.ts      # 턴 상태머신 (INTRO→AIMING→FLIGHT→IMPACT→CLEANUP→GAME_OVER)
│   ├── WindSystem.ts       # 바람 (추세 + 돌풍)
│   ├── WeaponSystem.ts     # 8종 무기 + 탄약 관리
│   ├── InputHandler.ts     # 드래그 조준 + 카메라 패닝
│   ├── KeyboardAimSystem.ts# 키보드 조준 (포트리스2 스타일)
│   ├── AdvancedAI.ts       # 전략적 AI (무기/아이템 판단)
│   ├── AudioSystem.ts      # 프로시저럴 효과음 (Web Audio API)
│   ├── BGMSystem.ts        # 프로시저럴 배경음악
│   ├── PowerUpSystem.ts    # 11종 아이템 + 인벤토리 + 월드 드롭
│   ├── ShopSystem.ts       # 코인 경제 시스템
│   ├── WeatherSystem.ts    # 7종 날씨 파티클
│   ├── EffectsSystem.ts    # 물/컨페티/플래시/슬로모/킬캠
│   ├── AchievementSystem.ts# 18종 업적
│   ├── PlayerRank.ts       # 15단계 계급 (해골~왕관)
│   ├── TankProgression.ts  # 탱크별 XP/레벨
│   ├── DailyChallenge.ts   # 일일 챌린지
│   ├── GameStats.ts        # 전적 기록
│   └── MatchManager.ts     # Bo3/Bo5 매치 관리
└── utils/
    └── TerrainCollision.ts # AlphaMap 충돌 (Uint8Array)
```

## 3. 씬 흐름
```
BootScene → TitleScene → GameScene ←→ UIScene (병렬)
                ↑              ↓
                └── game-over ──┘
```

## 4. 데이터 흐름
- TitleScene → GameScene: `scene.start("GameScene", GameModeData)`
- GameScene → UIScene: `events.emit("update-ui", data)`, `events.emit("game-over", data)`
- UIScene → GameScene: `events.emit("skip-turn")`, `events.emit("use-item")`, `events.emit("select-weapon")`, `events.emit("toggle-mute")`

## 5. 충돌 시스템
- **지형**: `TerrainAlphaMap` (Uint8Array, O(1) 조회, 원형 파괴/추가)
- **탱크**: `HitCircles` (로컬좌표 원 목록, 기울기+방향 변환)
- **포탄**: 프레임별 위치 vs 지형/탱크 충돌 체크

## 6. 영속 데이터 (localStorage)
| 키 | 내용 |
|----|------|
| fortress_career_stats | 전적 (승/패/명중률) |
| fortress_achievements | 해금된 업적 목록 |
| fortress_player_rank | 총 XP, 플레이 수, 승수 |
| fortress_tank_progression | 탱크별 XP/레벨 |
| fortress_daily_challenge | 오늘 챌린지 완료 여부 |
| fortress_tank_wins | 탱크별 승리 기록 (올라운더 업적) |

## 7. 알려진 제한사항
- Phaser 4.0.0-rc.6 (프리릴리스) 의존
- GameScene 갓오브젝트 (1,769줄)
- 테스트/CI 부재
- 2인 하드코딩 (N인 확장 불가)
- 온라인 멀티플레이어 미구현
