import { CONFIG } from "../config";
import type { Tank } from "../objects/Tank";
import type { Terrain } from "../objects/Terrain";
import type { WeaponSystem } from "./WeaponSystem";
import type { ItemManager } from "./PowerUpSystem";

export type AIDifficulty = "easy" | "normal" | "hard";

function gaussianRandom(): number {
	const u1 = Math.random();
	const u2 = Math.random();
	return Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
}

export class AdvancedAI {
	constructor(private difficulty: AIDifficulty) {}

	// ═══════════════════════════════════════════
	//  Shot Calculation (improved 2-pass search)
	// ═══════════════════════════════════════════

	calculateShot(
		myTank: Tank,
		opponentTank: Tank,
		wind: number,
		terrain: Terrain,
		gravityMul = 1.0,
		windMul = 1.0,
	): { angle: number; power: number } {
		const dx = opponentTank.x - myTank.x;
		const targetX = opponentTank.x;
		const targetY = opponentTank.y;
		const tankMaxPower = myTank.typeDef.maxPower;

		// Hard mode accounts for wind; others ignore it
		const windForce = this.difficulty === "hard" ? wind : 0;

		// Determine if high-arc plunging fire is beneficial:
		// target is below and close horizontally
		const isCloseBelow =
			Math.abs(dx) < 300 && opponentTank.y > myTank.y + 30;
		const minAngle = isCloseBelow ? 60 : 25;
		const maxAngle = isCloseBelow ? 85 : 75;

		let bestAngle = 45;
		let bestPower = 10;
		let bestDist = Number.POSITIVE_INFINITY;

		// --- Pass 1: broad search ---
		for (let angleDeg = minAngle; angleDeg <= maxAngle; angleDeg += 3) {
			for (
				let power = CONFIG.MIN_POWER;
				power <= tankMaxPower;
				power += 2
			) {
				const landing = this.simulateLanding(
					myTank,
					angleDeg,
					power,
					windForce,
					terrain,
					gravityMul,
					windMul,
				);

				// Reject shots that land within 40px of self (self-damage)
				const selfDist = Math.hypot(
					landing.x - myTank.x,
					landing.y - myTank.y,
				);
				if (selfDist < 40) continue;

				const dist = Math.hypot(
					landing.x - targetX,
					landing.y - targetY,
				);
				if (dist < bestDist) {
					bestDist = dist;
					bestAngle = angleDeg;
					bestPower = power;
				}
			}
		}

		// If close-below search found nothing good, fall back to normal range
		if (isCloseBelow && bestDist > 200) {
			for (let angleDeg = 25; angleDeg <= 75; angleDeg += 3) {
				for (
					let power = CONFIG.MIN_POWER;
					power <= tankMaxPower;
					power += 2
				) {
					const landing = this.simulateLanding(
						myTank,
						angleDeg,
						power,
						windForce,
						terrain,
						gravityMul,
						windMul,
					);
					const selfDist = Math.hypot(
						landing.x - myTank.x,
						landing.y - myTank.y,
					);
					if (selfDist < 40) continue;
					const dist = Math.hypot(
						landing.x - targetX,
						landing.y - targetY,
					);
					if (dist < bestDist) {
						bestDist = dist;
						bestAngle = angleDeg;
						bestPower = power;
					}
				}
			}
		}

		// --- Pass 2: fine search around best result ---
		const savedAngle = bestAngle;
		const savedPower = bestPower;
		for (
			let angleDeg = savedAngle - 4;
			angleDeg <= savedAngle + 4;
			angleDeg += 0.5
		) {
			for (
				let power = savedPower - 2;
				power <= savedPower + 2;
				power += 0.3
			) {
				const p = Math.max(
					CONFIG.MIN_POWER,
					Math.min(tankMaxPower, power),
				);
				const landing = this.simulateLanding(
					myTank,
					angleDeg,
					p,
					windForce,
					terrain,
					gravityMul,
					windMul,
				);

				const selfDist = Math.hypot(
					landing.x - myTank.x,
					landing.y - myTank.y,
				);
				if (selfDist < 40) continue;

				const dist = Math.hypot(
					landing.x - targetX,
					landing.y - targetY,
				);
				if (dist < bestDist) {
					bestDist = dist;
					bestAngle = angleDeg;
					bestPower = p;
				}
			}
		}

		// Difficulty-based noise injection
		const noise = this.getDifficultyNoise();
		let finalAngle = bestAngle + gaussianRandom() * noise.angleSigma;
		let finalPower = bestPower + gaussianRandom() * noise.powerSigma;

		// Clamp angle to 5..85 and power to valid range
		finalAngle = Math.max(5, Math.min(85, finalAngle));
		finalPower = Math.max(
			CONFIG.MIN_POWER,
			Math.min(tankMaxPower, finalPower),
		);

		return { angle: finalAngle, power: finalPower };
	}

	// ═══════════════════════════════════════════
	//  Strategic Weapon Selection
	// ═══════════════════════════════════════════

	selectBestWeapon(
		myTank: Tank,
		opponentTank: Tank,
		weaponSystem: WeaponSystem,
		playerIndex: number,
		terrain: Terrain,
	): number {
		// Easy: pick random available weapon
		if (this.difficulty === "easy") {
			return this.pickRandomAvailableWeapon(weaponSystem, playerIndex);
		}

		const optimalIndex = this.evaluateOptimalWeapon(
			myTank,
			opponentTank,
			weaponSystem,
			playerIndex,
			terrain,
		);

		// Normal: 70% chance to pick optimal, 30% random
		if (this.difficulty === "normal" && Math.random() > 0.7) {
			return this.pickRandomAvailableWeapon(weaponSystem, playerIndex);
		}

		return optimalIndex;
	}

	private evaluateOptimalWeapon(
		myTank: Tank,
		opponentTank: Tank,
		weaponSystem: WeaponSystem,
		playerIndex: number,
		terrain: Terrain,
	): number {
		const dx = Math.abs(opponentTank.x - myTank.x);
		const opponentHP = opponentTank.health;
		const behindWall = this.isTargetBehindTerrain(
			myTank,
			opponentTank,
			terrain,
		);

		// Weapon indices (matching WeaponSystem WEAPON_DEFS order):
		// 0 = Standard, 1 = Missile (large), 2 = Shotgun, 3 = Bounce, 4 = Napalm, 5 = Drill
		const STANDARD = 0;
		const MISSILE = 1;
		const SHOTGUN = 2;
		const BOUNCE = 3;
		const _NAPALM = 4;
		const DRILL = 5;

		// If opponent HP is low, conserve special ammo - use standard
		if (opponentHP < 30 && weaponSystem.canUse(playerIndex, STANDARD)) {
			return STANDARD;
		}

		// If opponent is behind terrain wall, prefer Drill or Bounce
		if (behindWall) {
			if (weaponSystem.canUse(playerIndex, DRILL)) return DRILL;
			if (weaponSystem.canUse(playerIndex, BOUNCE)) return BOUNCE;
		}

		// If close range (< 300px), prefer Shotgun for guaranteed hits
		if (dx < 300) {
			if (weaponSystem.canUse(playerIndex, SHOTGUN)) return SHOTGUN;
		}

		// If far and exposed, prefer Missile or Standard
		if (dx >= 300) {
			if (weaponSystem.canUse(playerIndex, MISSILE)) return MISSILE;
		}

		// Fallback: standard
		return STANDARD;
	}

	private pickRandomAvailableWeapon(
		weaponSystem: WeaponSystem,
		playerIndex: number,
	): number {
		const available: number[] = [];
		for (let i = 0; i < weaponSystem.weapons.length; i++) {
			if (weaponSystem.canUse(playerIndex, i)) {
				available.push(i);
			}
		}
		if (available.length === 0) return 0;
		return available[Math.floor(Math.random() * available.length)];
	}

	/**
	 * Check if there is significant terrain between the two tanks
	 * by sampling terrain height along the horizontal line between them.
	 */
	private isTargetBehindTerrain(
		myTank: Tank,
		opponentTank: Tank,
		terrain: Terrain,
	): boolean {
		const startX = Math.min(myTank.x, opponentTank.x);
		const endX = Math.max(myTank.x, opponentTank.x);
		const highestTankY = Math.min(myTank.y, opponentTank.y);
		const samples = 10;
		const step = (endX - startX) / (samples + 1);

		let wallCount = 0;
		for (let i = 1; i <= samples; i++) {
			const sampleX = startX + step * i;
			// Check if terrain is solid at or above the higher tank's Y position
			if (terrain.isSolid(sampleX, highestTankY - 10)) {
				wallCount++;
			}
		}

		// Consider it "behind terrain" if more than 30% of samples are blocked
		return wallCount >= samples * 0.3;
	}

	// ═══════════════════════════════════════════
	//  Strategic Item Usage
	// ═══════════════════════════════════════════

	shouldUseItem(
		myTank: Tank,
		opponentTank: Tank,
		inventory: (string | null)[],
		myHp: number,
		opponentHp: number,
		shields: number[],
		playerIndex: number,
	): number {
		// Difficulty gate: Easy 20%, Normal 60%, Hard 100%
		const useChance =
			this.difficulty === "hard"
				? 1.0
				: this.difficulty === "normal"
					? 0.6
					: 0.2;

		if (Math.random() > useChance) return -1;

		// Priority 1: Heal if HP is critically low
		if (myHp < 30) {
			const healSlot = this.findItemSlot(inventory, "heal");
			if (healSlot !== -1) return healSlot;
		}

		// Priority 2: DamageUp if opponent is about to die
		if (opponentHp < 30) {
			const dmgSlot = this.findItemSlot(inventory, "damageUp");
			if (dmgSlot !== -1) return dmgSlot;
		}

		// Priority 3: Shield when HP is below 60 and no active shield
		if (myHp < 60 && shields[playerIndex] <= 0) {
			const shieldSlot = this.findItemSlot(inventory, "shield");
			if (shieldSlot !== -1) return shieldSlot;
		}

		// Priority 4: PowerUp when opponent is far away
		const dx = Math.abs(opponentTank.x - myTank.x);
		if (dx > 400) {
			const powerSlot = this.findItemSlot(inventory, "powerUp");
			if (powerSlot !== -1) return powerSlot;
		}

		return -1;
	}

	private findItemSlot(
		inventory: (string | null)[],
		itemType: string,
	): number {
		for (let i = 0; i < inventory.length; i++) {
			if (inventory[i] === itemType) return i;
		}
		return -1;
	}

	// ═══════════════════════════════════════════
	//  Difficulty Noise Parameters
	// ═══════════════════════════════════════════

	private getDifficultyNoise(): {
		angleSigma: number;
		powerSigma: number;
	} {
		switch (this.difficulty) {
			case "easy":
				return { angleSigma: 10, powerSigma: 2.5 };
			case "normal":
				return { angleSigma: 5, powerSigma: 1.2 };
			case "hard":
				return { angleSigma: 1, powerSigma: 0.3 };
		}
	}

	// ═══════════════════════════════════════════
	//  Projectile Landing Simulation
	// ═══════════════════════════════════════════

	private simulateLanding(
		myTank: Tank,
		angleDeg: number,
		power: number,
		wind: number,
		terrain: Terrain,
		gravityMul = 1.0,
		windMul = 1.0,
	): { x: number; y: number } {
		// World angle accounts for tank facing direction and slope
		const baseAngle =
			myTank.facing === 1 ? angleDeg : 180 - angleDeg;
		const worldAngle =
			baseAngle + (myTank.slopeRad * 180) / Math.PI;
		const rad = (worldAngle * Math.PI) / 180;

		const muzzle = myTank.getMuzzlePosition();

		let px = muzzle.x;
		let py = muzzle.y;
		let vx = Math.cos(rad) * power;
		let vy = -Math.sin(rad) * power;

		const maxFrames = Math.round(
			450 * (myTank.typeDef.projectileRange ?? 1),
		);
		const windResistance = myTank.typeDef.windResistance ?? 0;
		const windFactor = (1 - windResistance) * windMul;
		const gravity = CONFIG.GRAVITY * gravityMul;

		for (let i = 0; i < maxFrames; i++) {
			vx += wind * 0.01 * windFactor;
			vy += gravity;
			px += vx;
			py += vy;

			// Out of bounds
			if (
				px < -50 ||
				px > CONFIG.WORLD_WIDTH + 50 ||
				py > CONFIG.PLAY_HEIGHT + 50
			) {
				return { x: px, y: py };
			}

			// Terrain collision
			if (terrain.isSolid(px, py)) {
				return { x: px, y: py };
			}
		}

		return { x: px, y: py };
	}
}
