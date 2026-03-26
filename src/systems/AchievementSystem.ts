import Phaser from "phaser";
import { COLORS } from "../config";

// ═══ Achievement Definitions ═══

export interface AchievementDef {
	id: string;
	name: string;
	icon: string;
	description: string;
	/** 달성 조건 체크 (게임 종료 시 호출) */
	condition: (ctx: AchievementContext) => boolean;
	/** 희귀도 (색상 결정) */
	rarity: "common" | "rare" | "epic" | "legendary";
}

export interface AchievementContext {
	won: boolean;
	accuracy: number;
	totalDamage: number;
	maxSingleHit: number;
	turnsPlayed: number;
	shotsFired: number;
	shotsHit: number;
	selfDamage: number;
	opponentHpLeft: number;
	myHpLeft: number;
	mapId: string;
	tankId: string;
	aiEnabled: boolean;
	aiDifficulty: string;
	noSelfDamage: boolean;
	usedItems: number;
	perfectRound: boolean; // no damage taken
}

const RARITY_COLORS: Record<string, number> = {
	common: 0x95a5a6,
	rare: 0x3498db,
	epic: 0x9b59b6,
	legendary: 0xf1c40f,
};

export const ACHIEVEMENTS: AchievementDef[] = [
	{
		id: "first_blood",
		name: "첫 승리",
		icon: "⚔️",
		description: "첫 번째 매치에서 승리",
		condition: (ctx) => ctx.won,
		rarity: "common",
	},
	{
		id: "sharpshooter",
		name: "명사수",
		icon: "🎯",
		description: "명중률 80% 이상으로 승리",
		condition: (ctx) => ctx.won && ctx.accuracy >= 80,
		rarity: "rare",
	},
	{
		id: "perfectionist",
		name: "완벽주의자",
		icon: "💎",
		description: "데미지 없이 승리 (퍼펙트 라운드)",
		condition: (ctx) => ctx.won && ctx.perfectRound,
		rarity: "legendary",
	},
	{
		id: "blitz",
		name: "전격전",
		icon: "⚡",
		description: "3턴 이내에 승리",
		condition: (ctx) => ctx.won && ctx.turnsPlayed <= 3,
		rarity: "epic",
	},
	{
		id: "sniper",
		name: "스나이퍼",
		icon: "🔭",
		description: "100% 명중률로 승리",
		condition: (ctx) => ctx.won && ctx.accuracy === 100 && ctx.shotsFired >= 2,
		rarity: "legendary",
	},
	{
		id: "demolisher",
		name: "파괴왕",
		icon: "💥",
		description: "한 게임에서 총 200 이상 데미지",
		condition: (ctx) => ctx.totalDamage >= 200,
		rarity: "rare",
	},
	{
		id: "one_shot",
		name: "일격필살",
		icon: "☄️",
		description: "단일 타격으로 60 이상 데미지",
		condition: (ctx) => ctx.maxSingleHit >= 60,
		rarity: "rare",
	},
	{
		id: "no_self_harm",
		name: "안전제일",
		icon: "🛡️",
		description: "자해 없이 승리",
		condition: (ctx) => ctx.won && ctx.noSelfDamage,
		rarity: "common",
	},
	{
		id: "close_call",
		name: "아슬아슬",
		icon: "💓",
		description: "HP 10 이하에서 역전승",
		condition: (ctx) => ctx.won && ctx.myHpLeft <= 10 && ctx.myHpLeft > 0,
		rarity: "epic",
	},
	{
		id: "overkill",
		name: "오버킬",
		icon: "🔥",
		description: "한 타격으로 80 이상 데미지",
		condition: (ctx) => ctx.maxSingleHit >= 80,
		rarity: "epic",
	},
	{
		id: "ai_master",
		name: "AI 마스터",
		icon: "🤖",
		description: "Hard AI를 상대로 승리",
		condition: (ctx) => ctx.won && ctx.aiEnabled && ctx.aiDifficulty === "hard",
		rarity: "epic",
	},
	{
		id: "item_collector",
		name: "수집가",
		icon: "📦",
		description: "한 게임에서 아이템 3개 이상 사용",
		condition: (ctx) => ctx.usedItems >= 3,
		rarity: "common",
	},
	{
		id: "marathon",
		name: "마라톤",
		icon: "🏃",
		description: "10턴 이상 진행",
		condition: (ctx) => ctx.turnsPlayed >= 10,
		rarity: "common",
	},
	{
		id: "volcano_victor",
		name: "화산 정복자",
		icon: "🌋",
		description: "화산 맵에서 승리",
		condition: (ctx) => ctx.won && ctx.mapId === "volcano",
		rarity: "rare",
	},
	{
		id: "desert_fox",
		name: "사막의 여우",
		icon: "🦊",
		description: "사막 맵에서 승리",
		condition: (ctx) => ctx.won && ctx.mapId === "desert",
		rarity: "rare",
	},
	{
		id: "island_hopper",
		name: "섬 탐험가",
		icon: "🏝️",
		description: "섬 맵에서 승리",
		condition: (ctx) => ctx.won && ctx.mapId === "islands",
		rarity: "rare",
	},
	{
		id: "fortress_breaker",
		name: "요새 파괴자",
		icon: "🏰",
		description: "요새 맵에서 승리",
		condition: (ctx) => ctx.won && ctx.mapId === "fortress",
		rarity: "rare",
	},
	{
		id: "all_rounder",
		name: "올라운더",
		icon: "🌟",
		description: "6종 탱크를 모두 사용하여 승리",
		condition: () => false, // special: checked via career tank wins
		rarity: "legendary",
	},
];

// ═══ Storage ═══

const STORAGE_KEY = "fortress_achievements";
const TANK_WINS_KEY = "fortress_tank_wins";

export interface AchievementSaveData {
	unlocked: string[]; // achievement IDs
	unlockedAt: Record<string, number>; // timestamps
}

function loadData(): AchievementSaveData {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw);
	} catch { /* ignore */ }
	return { unlocked: [], unlockedAt: {} };
}

function saveData(data: AchievementSaveData): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch { /* ignore */ }
}

function loadTankWins(): Set<string> {
	try {
		const raw = localStorage.getItem(TANK_WINS_KEY);
		if (raw) return new Set(JSON.parse(raw));
	} catch { /* ignore */ }
	return new Set();
}

function saveTankWins(wins: Set<string>): void {
	try {
		localStorage.setItem(TANK_WINS_KEY, JSON.stringify([...wins]));
	} catch { /* ignore */ }
}

// ═══ Achievement Manager ═══

export class AchievementManager {
	private data: AchievementSaveData;
	private tankWins: Set<string>;
	/** 이번 세션에서 새로 해금된 업적 (팝업 표시용) */
	private pendingPopups: AchievementDef[] = [];

	constructor() {
		this.data = loadData();
		this.tankWins = loadTankWins();
	}

	isUnlocked(id: string): boolean {
		return this.data.unlocked.includes(id);
	}

	getUnlockedCount(): number {
		return this.data.unlocked.length;
	}

	getTotalCount(): number {
		return ACHIEVEMENTS.length;
	}

	getAll(): { def: AchievementDef; unlocked: boolean }[] {
		return ACHIEVEMENTS.map((def) => ({
			def,
			unlocked: this.isUnlocked(def.id),
		}));
	}

	/** 게임 종료 시 호출 — 새로 해금된 업적 반환 */
	checkAchievements(ctx: AchievementContext): AchievementDef[] {
		const newlyUnlocked: AchievementDef[] = [];

		// 탱크 승리 기록 업데이트
		if (ctx.won) {
			this.tankWins.add(ctx.tankId);
			saveTankWins(this.tankWins);
		}

		for (const ach of ACHIEVEMENTS) {
			if (this.isUnlocked(ach.id)) continue;

			// 특수: all_rounder
			if (ach.id === "all_rounder") {
				const allTankIds = ["cannon", "hover", "heavy", "missile", "laser", "catapult"];
				if (allTankIds.every((id) => this.tankWins.has(id))) {
					this.unlock(ach);
					newlyUnlocked.push(ach);
				}
				continue;
			}

			if (ach.condition(ctx)) {
				this.unlock(ach);
				newlyUnlocked.push(ach);
			}
		}

		this.pendingPopups.push(...newlyUnlocked);
		return newlyUnlocked;
	}

	private unlock(ach: AchievementDef): void {
		this.data.unlocked.push(ach.id);
		this.data.unlockedAt[ach.id] = Date.now();
		saveData(this.data);
	}

	/** 팝업 대기 중인 업적 가져오기 (가져오면 큐에서 제거) */
	popPendingPopups(): AchievementDef[] {
		const result = [...this.pendingPopups];
		this.pendingPopups = [];
		return result;
	}
}

// ═══ Achievement Popup UI ═══

export function showAchievementPopup(
	scene: Phaser.Scene,
	achievement: AchievementDef,
	yOffset = 0,
): void {
	const cx = 640; // CONFIG.VIEW_WIDTH / 2
	const startY = -80;
	const targetY = 160 + yOffset;

	const container = scene.add.container(cx, startY);
	container.setDepth(200);

	const w = 320;
	const h = 72;

	const bg = scene.add.graphics();
	const rarityColor = RARITY_COLORS[achievement.rarity] ?? COLORS.PANEL_BORDER;
	bg.fillStyle(0x0a0e17, 0.95);
	bg.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
	bg.lineStyle(2, rarityColor, 0.9);
	bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
	// glow
	bg.lineStyle(4, rarityColor, 0.15);
	bg.strokeRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 16);
	container.add(bg);

	// Shimmer bar at top
	const shimmer = scene.add.graphics();
	shimmer.fillStyle(rarityColor, 0.3);
	shimmer.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, 3, 1);
	container.add(shimmer);

	const label = scene.add.text(-w / 2 + 16, -h / 2 + 10, "ACHIEVEMENT UNLOCKED", {
		fontSize: "9px",
		color: Phaser.Display.Color.IntegerToColor(rarityColor).rgba,
		fontStyle: "bold",
		letterSpacing: 2,
	});
	container.add(label);

	const icon = scene.add.text(-w / 2 + 20, 2, achievement.icon, {
		fontSize: "28px",
	});
	icon.setOrigin(0, 0.5);
	container.add(icon);

	const name = scene.add.text(-w / 2 + 58, -6, achievement.name, {
		fontSize: "16px",
		color: "#ffffff",
		fontStyle: "bold",
	});
	container.add(name);

	const desc = scene.add.text(-w / 2 + 58, 14, achievement.description, {
		fontSize: "11px",
		color: "#8899bb",
	});
	container.add(desc);

	// Rarity badge
	const rarityLabels: Record<string, string> = {
		common: "일반",
		rare: "희귀",
		epic: "영웅",
		legendary: "전설",
	};
	const badge = scene.add.text(w / 2 - 16, 2, rarityLabels[achievement.rarity] ?? "", {
		fontSize: "10px",
		color: Phaser.Display.Color.IntegerToColor(rarityColor).rgba,
		fontStyle: "bold",
	});
	badge.setOrigin(1, 0.5);
	container.add(badge);

	// Animate in
	scene.tweens.add({
		targets: container,
		y: targetY,
		duration: 600,
		ease: "Back.easeOut",
		onComplete: () => {
			// Hold then fade out
			scene.tweens.add({
				targets: container,
				alpha: 0,
				y: targetY - 30,
				delay: 3000,
				duration: 500,
				ease: "Power2",
				onComplete: () => container.destroy(),
			});
		},
	});

	// Sparkle effect
	const sparkles = scene.add.graphics();
	sparkles.setDepth(201);
	container.add(sparkles);

	for (let i = 0; i < 8; i++) {
		const sx = Phaser.Math.Between(-w / 2 + 10, w / 2 - 10);
		const sy = Phaser.Math.Between(-h / 2 + 5, h / 2 - 5);
		sparkles.fillStyle(rarityColor, 0.8);
		sparkles.fillCircle(sx, sy, 1.5);
	}
	scene.tweens.add({
		targets: sparkles,
		alpha: 0,
		duration: 1500,
		ease: "Power2",
	});
}

// ═══ Singleton ═══
let _instance: AchievementManager | null = null;
export function getAchievementManager(): AchievementManager {
	if (!_instance) _instance = new AchievementManager();
	return _instance;
}
