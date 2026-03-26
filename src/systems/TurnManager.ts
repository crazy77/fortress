import { CONFIG } from "../config";

export enum TurnState {
	/** 인트로 카메라 시퀀스 중 (입력 차단) */
	INTRO,
	AIMING,
	FLIGHT,
	IMPACT,
	CLEANUP,
	GAME_OVER,
}

export class TurnManager {
	state: TurnState = TurnState.AIMING;
	fuel: number = CONFIG.TANK_FUEL;
	turnElapsed = 0;

	/** 턴 순서 (플레이어 인덱스 배열, 셔플됨) */
	private turnOrder: number[] = [];
	/** 현재 턴 순서 내 위치 */
	private turnIndex = 0;

	/** 플레이어 수에 맞춰 랜덤 턴 순서 생성 */
	initTurnOrder(playerCount: number): void {
		this.turnOrder = Array.from({ length: playerCount }, (_, i) => i);
		// Fisher-Yates 셔플
		for (let i = this.turnOrder.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this.turnOrder[i], this.turnOrder[j]] = [
				this.turnOrder[j],
				this.turnOrder[i],
			];
		}
		this.turnIndex = 0;
	}

	/** 현재 턴 플레이어 인덱스 */
	get currentPlayer(): number {
		return this.turnOrder[this.turnIndex] ?? 0;
	}

	/** 턴 순서 배열 (인트로 카메라 시퀀스 등에서 사용) */
	getTurnOrder(): readonly number[] {
		return this.turnOrder;
	}

	/** 다음 플레이어로 전환 (순환) */
	switchPlayer(): void {
		this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
	}

	setState(state: TurnState): void {
		this.state = state;
	}

	consumeFuel(): void {
		this.fuel = Math.max(0, this.fuel - CONFIG.TANK_SPEED);
	}

	resetTurn(): void {
		this.fuel = CONFIG.TANK_FUEL;
		this.turnElapsed = 0;
	}

	resetTurnWithFuel(fuel: number): void {
		this.fuel = fuel;
		this.turnElapsed = 0;
	}
}
