import { CONFIG } from "../config";

export class WindSystem {
	currentWind: number;

	constructor() {
		// 첫 바람을 랜덤으로 시작 (범위의 60% 이내)
		this.currentWind =
			Math.round((Math.random() - 0.5) * 2 * CONFIG.WIND_RANGE * 0.9 * 10) / 10;
	}
	/** 바람의 추세 방향 (-1 ~ +1, 점진적으로 변화) */
	private trend = 0;
	/** 추세 잔여 턴 (0이 되면 새 추세 결정) */
	private trendTurns = 0;

	/** 매 턴 호출 — 점진적으로 변화하며 방향성을 가짐 */
	randomize(): void {
		// 추세 갱신: 일정 턴마다 새로운 방향성 결정
		if (this.trendTurns <= 0) {
			// 새 추세: -1(역풍 강화) ~ +1(순풍 강화)
			this.trend = (Math.random() - 0.5) * 2;
			// 추세 지속 턴: 3~6턴
			this.trendTurns = 3 + Math.floor(Math.random() * 4);
		}
		this.trendTurns--;

		// 변화량 결정: 대부분 작게, 가끔 크게
		const isGust = Math.random() < 0.15; // 15% 확률로 돌풍
		const maxDelta = isGust ? 1.8 : 0.8;

		// 추세 방향으로 편향된 변화량
		const baseDelta = (Math.random() - 0.3) * maxDelta; // 약간 양수 편향
		const trendedDelta = baseDelta * Math.sign(this.trend) * (0.5 + Math.abs(this.trend) * 0.5);

		this.currentWind += trendedDelta;

		// 범위 제한 (-WIND_RANGE ~ +WIND_RANGE)
		this.currentWind = Math.max(
			-CONFIG.WIND_RANGE,
			Math.min(CONFIG.WIND_RANGE, this.currentWind),
		);

		// 소수점 1자리 반올림
		this.currentWind = Math.round(this.currentWind * 10) / 10;
	}

	getForce(): number {
		return this.currentWind;
	}
}
