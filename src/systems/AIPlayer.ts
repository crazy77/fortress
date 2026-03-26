import { CONFIG } from "../config";
import type { Tank } from "../objects/Tank";
import type { Terrain } from "../objects/Terrain";

export type AIDifficulty = "easy" | "normal" | "hard";

function gaussianRandom(): number {
	const u1 = Math.random();
	const u2 = Math.random();
	return Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2);
}

export class AIPlayer {
	constructor(private difficulty: AIDifficulty) {}

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

		const windForce = this.difficulty === "hard" ? wind : 0;

		// 반복 탐색: 각도/파워 조합 중 착탄점이 상대에 가장 가까운 것
		let bestAngle = 45;
		let bestPower = 10;
		let bestDist = Number.POSITIVE_INFINITY;

		// 1차 탐색: 넓은 범위 (탱크 maxPower 기준)
		const tankMaxPower = myTank.typeDef.maxPower;
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
					dx < 0,
					gravityMul,
					windMul,
				);
				const dist = Math.hypot(landing.x - targetX, landing.y - targetY);
				if (dist < bestDist) {
					bestDist = dist;
					bestAngle = angleDeg;
					bestPower = power;
				}
			}
		}

		// 2차 정밀 탐색
		const savedAngle = bestAngle;
		const savedPower = bestPower;
		for (
			let angleDeg = savedAngle - 4;
			angleDeg <= savedAngle + 4;
			angleDeg += 0.5
		) {
			for (let power = savedPower - 2; power <= savedPower + 2; power += 0.3) {
				const p = Math.max(CONFIG.MIN_POWER, Math.min(tankMaxPower, power));
				const landing = this.simulateLanding(
					myTank,
					angleDeg,
					p,
					windForce,
					terrain,
					dx < 0,
					gravityMul,
					windMul,
				);
				const dist = Math.hypot(landing.x - targetX, landing.y - targetY);
				if (dist < bestDist) {
					bestDist = dist;
					bestAngle = angleDeg;
					bestPower = p;
				}
			}
		}

		// 난이도별 노이즈
		const noise = this.getDifficultyNoise();
		let finalAngle = bestAngle + gaussianRandom() * noise.angleSigma;
		let finalPower = bestPower + gaussianRandom() * noise.powerSigma;

		// 앙각 0~90도 (Tank.getWorldAngle()이 facing으로 변환)
		finalAngle = Math.max(5, Math.min(85, finalAngle));
		finalPower = Math.max(
			CONFIG.MIN_POWER,
			Math.min(tankMaxPower, finalPower),
		);

		return { angle: finalAngle, power: finalPower };
	}

	private getDifficultyNoise(): {
		angleSigma: number;
		powerSigma: number;
	} {
		switch (this.difficulty) {
			case "easy":
				return { angleSigma: 12, powerSigma: 3 };
			case "normal":
				return { angleSigma: 6, powerSigma: 1.5 };
			case "hard":
				return { angleSigma: 2, powerSigma: 0.5 };
		}
	}

	/** 시뮬레이션으로 착탄점 추정 (실제 지형 사용) */
	private simulateLanding(
		myTank: Tank,
		angleDeg: number,
		power: number,
		wind: number,
		terrain: Terrain,
		_flipAngle: boolean,
		gravityMul = 1.0,
		windMul = 1.0,
	): { x: number; y: number } {
		// Tank의 facing + 기울기를 반영한 월드 각도
		const baseAngle = myTank.facing === 1 ? angleDeg : 180 - angleDeg;
		const worldAngle = baseAngle + (myTank.slopeRad * 180) / Math.PI;
		const rad = (worldAngle * Math.PI) / 180;
		const muzzle = myTank.getMuzzlePosition();

		let px = muzzle.x;
		let py = muzzle.y;
		let vx = Math.cos(rad) * power;
		let vy = -Math.sin(rad) * power;

		const maxFrames = Math.round(450 * (myTank.typeDef.projectileRange ?? 1));
		const windFactor = (1 - (myTank.typeDef.windResistance ?? 0)) * windMul;
		const gravity = CONFIG.GRAVITY * gravityMul;
		for (let i = 0; i < maxFrames; i++) {
			vx += wind * 0.01 * windFactor;
			vy += gravity;
			px += vx;
			py += vy;

			// 화면 밖
			if (
				px < -50 ||
				px > CONFIG.WORLD_WIDTH + 50 ||
				py > CONFIG.PLAY_HEIGHT + 50 ||
				i > maxFrames
			) {
				return { x: px, y: py };
			}

			// 실제 지형 충돌 체크
			if (terrain.isSolid(px, py)) {
				return { x: px, y: py };
			}
		}

		return { x: px, y: py };
	}
}
