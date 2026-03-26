/**
 * ═══ 무기 밸런싱 철학 ═══
 *
 * 일반탄: 기본. 탱크 스탯 그대로 적용. 무제한.
 * 대형탄: 1.5배 폭발 반경. 지형 파괴에 탁월. 3발.
 * 산탄: 3발 분산. 가까울수록 강력. 원거리에선 약함. 3발.
 * 바운스: 지형 반사 2회. 벽 뒤 적 타격. 2발.
 * 나팔름: 수평 160px 화염. 지형 위 적에게 확실한 데미지. 2발.
 * 드릴: 지형 관통 후 폭발. 성벽/언덕 뒤 적 타격. 1발 (강력).
 * 집속탄: 상공에서 5발 분산 낙하. 넓은 범위. 1발.
 * 흙덩이: 지형 추가! 적을 묻거나 방어벽 생성. 2발.
 *
 * 전체적으로: 일반탄 대비 특수탄은 상황별 강점이 있지만 탄약 제한.
 * 핵심 트레이드오프: 범용성(일반탄) vs 상황 최적화(특수탄)
 */

export interface WeaponDef {
	name: string;
	icon: string;
	explosionRadius: number;
	directDamage: number;
	splashDamage: number;
	splashRadius: number;
	projectileCount: number;
	spreadAngle: number; // degrees
	ammo: number; // -1 = unlimited
	/** 바운스 횟수 (0 = 바운스 없음) */
	bounceCount: number;
	/** 특수 효과 타입 */
	special?: "none" | "napalm" | "drill" | "cluster" | "dirtball";
	/** 무기 설명 (UI 툴팁) */
	desc: string;
}

const WEAPON_DEFS: WeaponDef[] = [
	{
		name: "일반탄",
		icon: "💣",
		explosionRadius: 35,
		directDamage: 40,
		splashDamage: 18,
		splashRadius: 70,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: -1,
		bounceCount: 0,
		desc: "기본 포탄. 탱크 스탯에 따라 성능 변동.",
	},
	{
		name: "대형탄",
		icon: "🔥",
		explosionRadius: 55,
		directDamage: 45,
		splashDamage: 25,
		splashRadius: 100,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 3,
		bounceCount: 0,
		desc: "큰 폭발! 지형 파괴에 탁월.",
	},
	{
		name: "산탄",
		icon: "🎯",
		explosionRadius: 15,
		directDamage: 18,
		splashDamage: 8,
		splashRadius: 30,
		projectileCount: 3,
		spreadAngle: 12,
		ammo: 3,
		bounceCount: 0,
		desc: "3발 분산! 가까울수록 강력.",
	},
	{
		name: "바운스",
		icon: "🏀",
		explosionRadius: 30,
		directDamage: 35,
		splashDamage: 15,
		splashRadius: 60,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 2,
		bounceCount: 2,
		desc: "지형 2회 반사. 벽 뒤 적 타격!",
	},
	{
		name: "나팔름",
		icon: "🔶",
		explosionRadius: 15,
		directDamage: 12,
		splashDamage: 6,
		splashRadius: 30,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 2,
		bounceCount: 0,
		special: "napalm",
		desc: "착탄 시 160px 화염 확산!",
	},
	{
		name: "드릴",
		icon: "⛏️",
		explosionRadius: 45,
		directDamage: 50,
		splashDamage: 20,
		splashRadius: 55,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 1,
		bounceCount: 0,
		special: "drill",
		desc: "지형 관통 후 내부 폭발! (1발)",
	},
	{
		name: "집속탄",
		icon: "🎆",
		explosionRadius: 20,
		directDamage: 15,
		splashDamage: 12,
		splashRadius: 40,
		projectileCount: 5,
		spreadAngle: 25,
		ammo: 1,
		bounceCount: 0,
		special: "cluster",
		desc: "5발 분산 폭격! 넓은 범위 제압. (1발)",
	},
	{
		name: "흙덩이",
		icon: "🟤",
		explosionRadius: 40,
		directDamage: 5,
		splashDamage: 0,
		splashRadius: 0,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 2,
		bounceCount: 0,
		special: "dirtball",
		desc: "적을 흙으로 묻거나 방어벽 생성!",
	},
];

export class WeaponSystem {
	readonly weapons: WeaponDef[] = WEAPON_DEFS;
	private currentWeaponIndex: [number, number] = [0, 0];
	private ammo: [number[], number[]] = [[], []];

	constructor() {
		this.reset();
	}

	reset(): void {
		for (let p = 0; p < 2; p++) {
			this.currentWeaponIndex[p] = 0;
			this.ammo[p] = this.weapons.map((w) => w.ammo);
		}
	}

	selectWeapon(player: number, index: number): void {
		if (
			index >= 0 &&
			index < this.weapons.length &&
			this.canUse(player, index)
		) {
			this.currentWeaponIndex[player] = index;
		}
	}

	getCurrentWeapon(player: number): WeaponDef {
		return this.weapons[this.currentWeaponIndex[player]];
	}

	getCurrentWeaponIndex(player: number): number {
		return this.currentWeaponIndex[player];
	}

	consumeAmmo(player: number): void {
		const idx = this.currentWeaponIndex[player];
		if (this.ammo[player][idx] > 0) {
			this.ammo[player][idx]--;
		}
		if (!this.canUse(player, idx)) {
			this.currentWeaponIndex[player] = 0;
		}
	}

	canUse(player: number, index: number): boolean {
		const remaining = this.ammo[player][index];
		return remaining === -1 || remaining > 0;
	}

	getAmmo(player: number, index: number): number {
		return this.ammo[player][index];
	}

	/** 특정 무기에 탄약 추가 (파워업) */
	addAmmo(player: number, weaponIndex: number, amount: number): void {
		if (weaponIndex >= 0 && weaponIndex < this.weapons.length) {
			if (this.ammo[player][weaponIndex] !== -1) {
				this.ammo[player][weaponIndex] += amount;
			}
		}
	}
}
