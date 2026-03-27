# Fortress Battle Arena - 사운드 디자인 문서

## 1. 사운드 철학
- Web Audio API 프로시저럴 생성 (에셋 불필요)
- 각 탱크 캐릭터에 맞는 고유 음색
- 즉각적 피드백 + 몰입감

## 2. 탱크별 발사음

| 탱크 | 컨셉 | 오실레이터 | 주파수 범위 | 레이어 |
|------|------|-----------|-----------|--------|
| 캐논 | 따뜻한 포격 | sawtooth 220→70Hz | 0.18s | + sine 서브베이스 80→30Hz + 노이즈 버스트 |
| 중전차 | 지축 진동 | sine 50→20Hz + saw 120→35Hz | 0.35s | + 필터드 노이즈 400→60Hz |
| 미사일 | 제트 점화 | square 클릭 1500Hz + sine 300→900→400Hz | 0.35s | + 고압 노이즈 2000→400Hz |
| 레이저 | 충전+방출 | sine 차지 200→1800Hz + square zap 1400→400Hz | 0.2s | + sine 하모닉 2800→800Hz |
| 호버 | 에너지 발사 | sine 축적 400→800Hz + triangle 700→180Hz | 0.13s | + sine 반짝 1200→2000Hz |
| 카타펄트 | 투석 삐걱 | saw 크릭 80→40Hz + triangle 휘슬 350→1200Hz | 0.25s | + 노이즈 투석 |

## 3. 비행음 (playWhistle)

| 스타일 | 파형 | 주파수 | 볼륨 |
|--------|------|--------|------|
| 캐논 | sine | 200 + speed×20 (max 600) | 0.06 |
| 중전차 | sawtooth | 80 + speed×8 | 0.05 |
| 미사일 | sawtooth | 300 + speed×15 | 0.04 |
| 레이저 | square | 800 + speed×30 | 0.03 |
| 호버 | triangle | 500 + speed×20 | 0.04 |
| 카타펄트 | noise(filtered) | lowpass 300Hz | 0.04 |

## 4. 폭발음 (playExplosion)
- 화이트 노이즈 → BiquadFilter(lowpass, 600+intensity×300 → 80Hz)
- 지속: 0.3 + intensity×0.2초
- 볼륨: 0.3 + intensity×0.15

## 5. 피격음 (탱크별)
- 캐논: square 500→150Hz (금속 클랭)
- 중전차: sine 80→30Hz + 노이즈 (둔탁)
- 미사일: square 800→200Hz (날카로운)
- 레이저: sine 1200→400Hz (에너지 방전)
- 호버: triangle 600→200Hz (플라즈마 퍼짐)
- 카타펄트: sine 200→60Hz + 노이즈 (나무 깨짐)

## 6. 특수 무기음
- 나팔름: 노이즈 → bandpass 400~1200Hz (불 타는 소리)
- 드릴: sawtooth 150Hz + LFO (그라인딩)
- 집속탄: 빠른 5회 연속 sine 팝
- 흙덩이: sine 120→40Hz (둔탁한 쿵)

## 7. UI 사운드
| 사운드 | 설명 | 주파수 |
|--------|------|--------|
| playPickup | 아이템 수집 (C5→E5 딩) | 523→659Hz |
| playTick | 타이머 틱 | 1000Hz |
| playTurnBeep | 턴 전환 | 880Hz |
| playSkip | 턴 스킵 | 440→220Hz |
| playBounce | 바운스 | 300→500Hz |

## 8. BGM 시스템 (5모드)

| 모드 | BPM | 분위기 | 트리거 |
|------|-----|--------|--------|
| title | 80 | 잔잔, 마이너 | 타이틀 화면 |
| gameplay | 100 | 적당한 긴장 | 게임 시작 |
| intense | 140 | 급박, 디미니시 | HP 30% 이하 |
| victory | 120 | 밝은 메이저 | 승리 |
| defeat | 60 | 우울, 마이너 | 패배 |

레이어: Pad(코드) + Bass(근음) + Melody(펜타토닉) + Percussion(킥+하이햇)

## 9. 진동 피드백 (Haptic)
- 발사: 30ms
- 명중: [50, 30, 80]ms
- 사망: [100, 50, 200]ms
- 아이템: 20~30ms
