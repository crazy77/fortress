import { CONFIG } from "../config";

export interface GameStats {
	shotsFired: number;
	shotsHit: number;
	totalDamageDealt: number;
	maxSingleHit: number;
	turnsPlayed: number;
}

export interface CareerStats {
	totalGames: number;
	wins: number;
	losses: number;
	bestAccuracy: number;
	maxDamageInGame: number;
}

const STORAGE_KEY = "fortress_career_stats";

export class StatsTracker {
	private stats: GameStats = {
		shotsFired: 0,
		shotsHit: 0,
		totalDamageDealt: 0,
		maxSingleHit: 0,
		turnsPlayed: 0,
	};

	recordShot(): void {
		this.stats.shotsFired++;
	}

	recordHit(
		impactX: number,
		impactY: number,
		targetX: number,
		targetY: number,
	): void {
		const dist = Math.sqrt((impactX - targetX) ** 2 + (impactY - targetY) ** 2);
		if (dist < CONFIG.SPLASH_RADIUS) {
			this.stats.shotsHit++;
		}
	}

	recordDamage(damage: number): void {
		this.stats.totalDamageDealt += damage;
		if (damage > this.stats.maxSingleHit) {
			this.stats.maxSingleHit = damage;
		}
	}

	recordTurn(): void {
		this.stats.turnsPlayed++;
	}

	getStats(): GameStats {
		return { ...this.stats };
	}

	getAccuracy(): number {
		if (this.stats.shotsFired === 0) return 0;
		return Math.round((this.stats.shotsHit / this.stats.shotsFired) * 100);
	}

	/** 게임 종료 시 커리어 통계 저장 */
	saveToCareer(won: boolean): void {
		const career = StatsTracker.loadCareer();
		career.totalGames++;
		if (won) {
			career.wins++;
		} else {
			career.losses++;
		}

		const accuracy = this.getAccuracy();
		if (accuracy > career.bestAccuracy) {
			career.bestAccuracy = accuracy;
		}
		if (this.stats.totalDamageDealt > career.maxDamageInGame) {
			career.maxDamageInGame = this.stats.totalDamageDealt;
		}

		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(career));
		} catch {
			// localStorage 사용 불가 시 무시
		}
	}

	static loadCareer(): CareerStats {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				return JSON.parse(raw) as CareerStats;
			}
		} catch {
			// 파싱 실패 시 기본값 반환
		}
		return {
			totalGames: 0,
			wins: 0,
			losses: 0,
			bestAccuracy: 0,
			maxDamageInGame: 0,
		};
	}
}
