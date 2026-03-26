/**
 * 탱크 타입 정의 — 6종 탱크, 3개 시대 상성 시스템
 * hitCircles: 로컬 좌표 기반 충돌 원 목록 (x: 좌우 오프셋, y: 바닥 기준 높이, r: 반경)
 *   - x,y는 탱크 중심(바닥 접지점) 기준 로컬 좌표
 *   - 실제 판정 시 기울기(slopeRad) + facing으로 자동 변환됨
 */
export interface HitCircleDef {
	/** 좌우 오프셋 (facing 방향으로 곱해짐) */
	lx: number;
	/** 바닥 기준 높이 (위로 양수) */
	ly: number;
	/** 반경 */
	r: number;
}

export type TankEra = "classic" | "modern" | "future";
export type TankStyle =
	| "cannon"
	| "hover"
	| "heavy"
	| "missile"
	| "laser"
	| "catapult";

export interface TankTypeDef {
	id: string;
	name: string;
	era: TankEra;
	description: string;
	color: number;
	colorDark: number;
	/** 차체 폭 */
	width: number;
	/** 차체 높이 */
	height: number;
	/** 포탑 반경 */
	turretRadius: number;
	/** 포탑 facing 오프셋 */
	turretOffset: number;
	/** 포신 길이 */
	barrelLength: number;
	/** 충돌 판정 원 목록 (로컬 좌표) */
	hitCircles: HitCircleDef[];
	// 전투 스탯
	/** 최대 파워 */
	maxPower: number;
	/** 기본 폭발 반경 */
	explosionRadius: number;
	/** 직격 데미지 */
	directDamage: number;
	/** 스플래시 데미지 */
	splashDamage: number;
	/** 스플래시 반경 */
	splashRadius: number;
	/** 포탄 크기 (피격 판정) */
	projectileRadius: number;
	/** 비행 거리 계수 (1.0 = normal) */
	projectileRange: number;
	/** 최소 앙각 */
	angleMin: number;
	/** 최대 앙각 */
	angleMax: number;
	/** 이동 연료 */
	fuel: number;
	/**
	 * 바람 저항도 (0 = 바람 100% 영향, 1 = 바람 완전 무시)
	 * 0.3이면 바람 영향 70%만 받음
	 */
	windResistance: number;
	/** 렌더링 스타일 */
	style: TankStyle;
}

/** 캐논 (고전) - 균형 잡힌 클래식 탱크 */
export const TANK_CANNON: TankTypeDef = {
	id: "cannon",
	name: "캐논",
	era: "classic",
	description: "균형 잡힌 클래식 전차. 모든 면에서 안정적입니다.",
	color: 0xc0392b,
	colorDark: 0x922b21,
	width: 40,
	height: 24,
	turretRadius: 10,
	turretOffset: 3,
	barrelLength: 26,
	hitCircles: [
		{ lx: 0, ly: 10, r: 20 },
		{ lx: 3, ly: 24, r: 12 },
	],
	maxPower: 24,
	explosionRadius: 40,
	directDamage: 50,
	splashDamage: 25,
	splashRadius: 80,
	projectileRadius: 4,
	projectileRange: 1.0,
	angleMin: 0,
	angleMax: 90,
	fuel: 150,
	windResistance: 0,
	style: "cannon",
};

/** 호버 (미래) - 빠르고 가벼운 미래형 탱크 */
export const TANK_HOVER: TankTypeDef = {
	id: "hover",
	name: "호버",
	era: "future",
	description: "빠른 이동과 고속 포탄. 기동력이 뛰어나고 연사력이 좋습니다.",
	color: 0x8e44ad,
	colorDark: 0x6c3483,
	width: 36,
	height: 20,
	turretRadius: 8,
	turretOffset: 4,
	barrelLength: 22,
	hitCircles: [
		{ lx: 0, ly: 8, r: 16 },
		{ lx: 4, ly: 20, r: 9 },
	],
	maxPower: 26,
	explosionRadius: 32,
	directDamage: 42,
	splashDamage: 18,
	splashRadius: 65,
	projectileRadius: 3,
	projectileRange: 1.3,
	angleMin: 10,
	angleMax: 70,
	fuel: 220,
	windResistance: 0.15,
	style: "hover",
};

/** 중전차 (현대) - 느리지만 강력한 현대 중전차 */
export const TANK_HEAVY: TankTypeDef = {
	id: "heavy",
	name: "중전차",
	era: "modern",
	description: "둔중하지만 막강한 화력. 큰 폭발 반경으로 제압합니다.",
	color: 0x27ae60,
	colorDark: 0x1e8449,
	width: 50,
	height: 28,
	turretRadius: 14,
	turretOffset: 2,
	barrelLength: 30,
	hitCircles: [
		{ lx: 0, ly: 14, r: 26 },
		{ lx: 2, ly: 28, r: 14 },
	],
	maxPower: 22,
	explosionRadius: 55,
	directDamage: 60,
	splashDamage: 28,
	splashRadius: 105,
	projectileRadius: 5,
	projectileRange: 0.85,
	angleMin: 0,
	angleMax: 75,
	fuel: 90,
	windResistance: 0.2,
	style: "heavy",
};

/** 미사일 (현대) - 장거리 정밀 타격 */
export const TANK_MISSILE: TankTypeDef = {
	id: "missile",
	name: "미사일",
	era: "modern",
	description: "장거리 정밀 타격. 직격 데미지가 높지만 폭발 범위는 좁습니다.",
	color: 0x2c3e50,
	colorDark: 0x1a252f,
	width: 42,
	height: 24,
	turretRadius: 10,
	turretOffset: -2,
	barrelLength: 28,
	hitCircles: [
		{ lx: 0, ly: 12, r: 20 },
		{ lx: -2, ly: 24, r: 11 },
	],
	maxPower: 28,
	explosionRadius: 25,
	directDamage: 70,
	splashDamage: 20,
	splashRadius: 55,
	projectileRadius: 3,
	projectileRange: 1.4,
	angleMin: 20,
	angleMax: 85,
	fuel: 130,
	windResistance: 0.1,
	style: "missile",
};

/** 레이저 (미래) - 바람 무시, 정밀 직격 */
export const TANK_LASER: TankTypeDef = {
	id: "laser",
	name: "레이저",
	era: "future",
	description: "바람을 무시하는 정밀 빔. 폭발은 작지만 직격이 치명적입니다.",
	color: 0x00bcd4,
	colorDark: 0x00838f,
	width: 34,
	height: 22,
	turretRadius: 9,
	turretOffset: 3,
	barrelLength: 28,
	hitCircles: [
		{ lx: 0, ly: 9, r: 16 },
		{ lx: 3, ly: 22, r: 10 },
	],
	maxPower: 26,
	explosionRadius: 15,
	directDamage: 65,
	splashDamage: 8,
	splashRadius: 30,
	projectileRadius: 2,
	projectileRange: 1.2,
	angleMin: 0,
	angleMax: 90,
	fuel: 100,
	windResistance: 0.9,
	style: "laser",
};

/** 카타펄트 (고전) - 넓은 범위 공격, 높은 포물선 */
export const TANK_CATAPULT: TankTypeDef = {
	id: "catapult",
	name: "카타펄트",
	era: "classic",
	description: "거대한 폭발 범위! 낮은 데미지지만 회피가 어렵습니다.",
	color: 0x8d6e63,
	colorDark: 0x5d4037,
	width: 48,
	height: 26,
	turretRadius: 8,
	turretOffset: -4,
	barrelLength: 24,
	hitCircles: [
		{ lx: 0, ly: 13, r: 24 },
		{ lx: -4, ly: 26, r: 10 },
	],
	maxPower: 25,
	explosionRadius: 65,
	directDamage: 32,
	splashDamage: 25,
	splashRadius: 130,
	projectileRadius: 6,
	projectileRange: 0.9,
	angleMin: 30,
	angleMax: 90,
	fuel: 80,
	windResistance: 0,
	style: "catapult",
};

/** 전체 탱크 목록 */
export const ALL_TANKS: TankTypeDef[] = [
	TANK_CANNON,
	TANK_HOVER,
	TANK_HEAVY,
	TANK_MISSILE,
	TANK_LASER,
	TANK_CATAPULT,
];

/** 시대별 상성 데미지 배율 */
export function getEraMultiplier(
	attackerEra: TankEra,
	defenderEra: TankEra,
): number {
	if (attackerEra === defenderEra) return 1.0;
	// classic → future에 강함
	if (attackerEra === "classic" && defenderEra === "future") return 1.2;
	// modern → classic에 강함
	if (attackerEra === "modern" && defenderEra === "classic") return 1.2;
	// future → modern에 강함
	if (attackerEra === "future" && defenderEra === "modern") return 1.2;
	// 역상성
	if (attackerEra === "future" && defenderEra === "classic") return 0.85;
	if (attackerEra === "classic" && defenderEra === "modern") return 0.85;
	if (attackerEra === "modern" && defenderEra === "future") return 0.85;
	return 1.0;
}

/** 기본 탱크 (하위 호환) */
export const TANK_DEFAULT: TankTypeDef = TANK_CANNON;
