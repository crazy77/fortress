export class MatchManager {
	totalRounds: number;
	wins: [number, number] = [0, 0];
	currentRound = 1;

	constructor(totalRounds: 3 | 5 = 3) {
		this.totalRounds = totalRounds;
	}

	recordWin(player: 0 | 1): void {
		this.wins[player]++;
		this.currentRound++;
	}

	/** 매치가 종료되었는지 (과반수 승리) */
	isMatchOver(): boolean {
		const needed = Math.ceil(this.totalRounds / 2);
		return this.wins[0] >= needed || this.wins[1] >= needed;
	}

	/** 매치 승자 반환 (아직 안 끝났으면 null) */
	getMatchWinner(): 0 | 1 | null {
		const needed = Math.ceil(this.totalRounds / 2);
		if (this.wins[0] >= needed) return 0;
		if (this.wins[1] >= needed) return 1;
		return null;
	}

	/** 현재 라운드 정보 문자열 */
	getRoundInfo(): string {
		return `Round ${this.currentRound}/${this.totalRounds} | P1: ${this.wins[0]} - P2: ${this.wins[1]}`;
	}
}
