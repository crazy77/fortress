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
	special?: "none" | "napalm" | "drill";
}

const WEAPON_DEFS: WeaponDef[] = [
	{
		name: "일반탄",
		icon: "💣",
		explosionRadius: 40,
		directDamage: 50,
		splashDamage: 25,
		splashRadius: 80,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: -1,
		bounceCount: 0,
	},
	{
		name: "대형탄",
		icon: "🔥",
		explosionRadius: 60,
		directDamage: 60,
		splashDamage: 35,
		splashRadius: 120,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 3,
		bounceCount: 0,
	},
	{
		name: "산탄",
		icon: "🎯",
		explosionRadius: 20,
		directDamage: 25,
		splashDamage: 10,
		splashRadius: 40,
		projectileCount: 3,
		spreadAngle: 15,
		ammo: 3,
		bounceCount: 0,
	},
	{
		name: "바운스",
		icon: "🏀",
		explosionRadius: 35,
		directDamage: 45,
		splashDamage: 20,
		splashRadius: 70,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 2,
		bounceCount: 2,
	},
	{
		name: "나팔름",
		icon: "🔶",
		explosionRadius: 20,
		directDamage: 15,
		splashDamage: 8,
		splashRadius: 40,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 2,
		bounceCount: 0,
		special: "napalm",
	},
	{
		name: "드릴",
		icon: "⛏️",
		explosionRadius: 50,
		directDamage: 55,
		splashDamage: 20,
		splashRadius: 60,
		projectileCount: 1,
		spreadAngle: 0,
		ammo: 2,
		bounceCount: 0,
		special: "drill",
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
