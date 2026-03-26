/**
 * 플레이어 계급 시스템 — 포트리스2 스타일
 *
 * 능력치 변화 없음. 순수하게 "많이 하고, 잘했다"는 증거.
 * 해골→별→훈장→메달→왕관, 각각 동/은/금 3단계 = 총 15등급
 *
 * XP 획득:
 *   게임 플레이: +10
 *   승리: +30
 *   명중률 보너스: 최대 +20
 *   업적 해금: +25
 *   일일 챌린지 완료: +50
 */

const STORAGE_KEY = "fortress_player_rank";

// ═══ 계급 정의 ═══

export interface RankDef {
	/** 계급 번호 (0~14) */
	tier: number;
	/** 계급 이름 */
	name: string;
	/** 아이콘 (이모지) */
	icon: string;
	/** 등급 (동/은/금) */
	grade: "동" | "은" | "금";
	/** 등급 색상 */
	color: number;
	/** 등급 색상 CSS */
	colorHex: string;
	/** 필요 누적 XP */
	xpRequired: number;
}

const RANK_ICONS = ["💀", "⭐", "🎖️", "🏅", "👑"];
const RANK_NAMES = ["해골", "별", "훈장", "메달", "왕관"];
const GRADES: Array<{ name: "동" | "은" | "금"; color: number; colorHex: string }> = [
	{ name: "동", color: 0xcd7f32, colorHex: "#cd7f32" },
	{ name: "은", color: 0xc0c0c0, colorHex: "#c0c0c0" },
	{ name: "금", color: 0xffd700, colorHex: "#ffd700" },
];

// XP 임계값: 15단계
const XP_THRESHOLDS = [
	0,      // 해골 동
	100,    // 해골 은
	250,    // 해골 금
	500,    // 별 동
	800,    // 별 은
	1200,   // 별 금
	1800,   // 훈장 동
	2500,   // 훈장 은
	3500,   // 훈장 금
	5000,   // 메달 동
	7000,   // 메달 은
	10000,  // 메달 금
	15000,  // 왕관 동
	22000,  // 왕관 은
	30000,  // 왕관 금
];

/** 모든 계급 정의 생성 */
function buildRankDefs(): RankDef[] {
	const ranks: RankDef[] = [];
	for (let i = 0; i < 5; i++) {
		for (let g = 0; g < 3; g++) {
			const tier = i * 3 + g;
			ranks.push({
				tier,
				name: `${GRADES[g].name} ${RANK_NAMES[i]}`,
				icon: RANK_ICONS[i],
				grade: GRADES[g].name,
				color: GRADES[g].color,
				colorHex: GRADES[g].colorHex,
				xpRequired: XP_THRESHOLDS[tier],
			});
		}
	}
	return ranks;
}

export const ALL_RANKS = buildRankDefs();

// ═══ XP 보상 상수 ═══

export const RANK_XP = {
	GAME_PLAYED: 10,
	WIN: 30,
	ACCURACY_BONUS_MAX: 20,  // 명중률 100%일 때 최대
	ACHIEVEMENT_UNLOCK: 25,
	DAILY_CHALLENGE: 50,
} as const;

// ═══ 저장 데이터 ═══

interface RankSaveData {
	totalXP: number;
	gamesPlayed: number;
	totalWins: number;
}

function loadRankData(): RankSaveData {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch { /* ignore */ }
	return { totalXP: 0, gamesPlayed: 0, totalWins: 0 };
}

function saveRankData(data: RankSaveData): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch { /* ignore */ }
}

// ═══ 계급 매니저 ═══

export class PlayerRankSystem {
	private data: RankSaveData;

	constructor() {
		this.data = loadRankData();
	}

	/** 현재 계급 */
	getCurrentRank(): RankDef {
		let rank = ALL_RANKS[0];
		for (const r of ALL_RANKS) {
			if (this.data.totalXP >= r.xpRequired) rank = r;
			else break;
		}
		return rank;
	}

	/** 다음 계급 (최대면 null) */
	getNextRank(): RankDef | null {
		const current = this.getCurrentRank();
		if (current.tier >= ALL_RANKS.length - 1) return null;
		return ALL_RANKS[current.tier + 1];
	}

	/** 다음 계급까지 진행률 (0~1) */
	getProgress(): number {
		const current = this.getCurrentRank();
		const next = this.getNextRank();
		if (!next) return 1;
		const range = next.xpRequired - current.xpRequired;
		if (range <= 0) return 1;
		return Math.min(1, (this.data.totalXP - current.xpRequired) / range);
	}

	getTotalXP(): number {
		return this.data.totalXP;
	}

	getGamesPlayed(): number {
		return this.data.gamesPlayed;
	}

	getTotalWins(): number {
		return this.data.totalWins;
	}

	/** XP 추가. 레벨업이 발생하면 새 계급 반환, 아니면 null */
	addXP(amount: number): RankDef | null {
		const oldRank = this.getCurrentRank();
		this.data.totalXP += amount;
		const newRank = this.getCurrentRank();
		this.save();
		return newRank.tier > oldRank.tier ? newRank : null;
	}

	/** 게임 결과 기록 + XP 자동 부여. 레벨업 시 새 계급 반환 */
	recordGameResult(won: boolean, accuracy: number): RankDef | null {
		this.data.gamesPlayed++;
		if (won) this.data.totalWins++;

		let xpGained = RANK_XP.GAME_PLAYED;
		if (won) xpGained += RANK_XP.WIN;
		xpGained += Math.round((accuracy / 100) * RANK_XP.ACCURACY_BONUS_MAX);

		return this.addXP(xpGained);
	}

	/** 계급 배지 문자열 (예: "💀동" or "👑금") */
	getBadgeText(): string {
		const rank = this.getCurrentRank();
		return `${rank.icon}${rank.grade}`;
	}

	/** 풀 계급 표시 문자열 (예: "💀 동 해골 [Lv.1]") */
	getFullDisplay(): string {
		const rank = this.getCurrentRank();
		return `${rank.icon} ${rank.name} [Lv.${rank.tier + 1}]`;
	}

	private save(): void {
		saveRankData(this.data);
	}
}

// ═══ 싱글톤 ═══

let _instance: PlayerRankSystem | null = null;
export function getPlayerRank(): PlayerRankSystem {
	if (!_instance) _instance = new PlayerRankSystem();
	return _instance;
}
