export const CONFIG = {
	/** 게임 월드 전체 너비 (지형 생성 범위) */
	WORLD_WIDTH: 2400,
	/** 캔버스 높이 (뷰포트) */
	WORLD_HEIGHT: 720,
	/** 하단 UI 바 높이 */
	UI_BAR_HEIGHT: 80,
	/** 실제 게임 플레이 영역 높이 */
	PLAY_HEIGHT: 640,
	/** 화면 뷰포트 너비 (카메라가 보여주는 영역) */
	VIEW_WIDTH: 1280,
	/** 하늘 여유 높이 (카메라 위쪽 한계) */
	SKY_HEIGHT: 300,
	MAX_POWER: 24,
	MIN_POWER: 2,
	WIND_RANGE: 5,
	EXPLOSION_RADIUS: 40,
	TANK_HP: 100,
	DIRECT_HIT_DAMAGE: 50,
	SPLASH_DAMAGE: 25,
	SPLASH_RADIUS: 80,
	GRAVITY: 0.3,
	TANK_WIDTH: 40,
	TANK_HEIGHT: 24,
	PROJECTILE_RADIUS: 4,
	TANK_SPEED: 2,
	TANK_MAX_CLIMB: 3,
	TANK_FUEL: 150,
	TURN_TIME: 15,
	// 새 기능
	POWERUP_DROP_CHANCE: 0.2,
	ALTITUDE_BONUS_THRESHOLD: 60,
	ALTITUDE_BONUS_MULTIPLIER: 1.15,
	SCREEN_SHAKE_MULTIPLIER: 1.2,
	// 게임플레이 메카닉
	RAGE_HP_THRESHOLD: 0.3,
	RAGE_DAMAGE_MULTIPLIER: 1.3,
	AMBUSH_DAMAGE_MULTIPLIER: 1.1,
	ROUND_UPGRADE_PER_WIN: 0.05,
	ROUND_UPGRADE_CAP: 0.25,
	COMBO_DOUBLE_TURN_THRESHOLD: 3,
	HEAL_AMOUNT: 25,
	SHIELD_REDUCTION: 0.6,
	NAPALM_SPREAD: 80,
	NAPALM_FIRE_COUNT: 8,
	NAPALM_FIRE_DAMAGE: 8,
	NAPALM_PROXIMITY: 25,
	BOUNCE_DAMPING: 0.7,
	DOUBLE_SHOT_DELAY: 300,
	MAX_FLIGHT_FRAMES: 450,
} as const;

/** 디자인 시스템 색상 (전역 공유) */
export const COLORS = {
	// Panel system
	PANEL_BG: 0x0a0e17,
	PANEL_BG_ALPHA: 0.88,
	PANEL_BORDER: 0x2a3a5c,
	PANEL_BORDER_ALPHA: 0.5,
	PANEL_GLOW: 0x3d5a80,
	// Player identity
	P1_COLOR: 0xe74c3c,
	P1_LIGHT: 0xff6b6b,
	P2_COLOR: 0x3498db,
	P2_LIGHT: 0x74b9ff,
	// Accent
	GOLD: 0xf1c40f,
	ACCENT: 0x00b4d8,
	// Typography
	TEXT_PRIMARY: 0xffffff,
	TEXT_SECONDARY: 0xaab2c8,
	TEXT_MUTED: 0x556677,
	// Semantic
	HP_HIGH: 0x2ecc71,
	HP_MID: 0xf39c12,
	HP_LOW: 0xe74c3c,
	FUEL_HIGH: 0x2ecc71,
	FUEL_MID: 0xf1c40f,
	FUEL_LOW: 0xe74c3c,
	SUCCESS: 0x27ae60,
	DANGER: 0xe74c3c,
	WARNING: 0xf39c12,
	INFO: 0x3498db,
} as const;

/** 공통 패널 드로잉 유틸 */
export function drawPanel(
	gfx: Phaser.GameObjects.Graphics,
	x: number,
	y: number,
	w: number,
	h: number,
	radius = 10,
	options?: {
		bgAlpha?: number;
		borderColor?: number;
		borderAlpha?: number;
		glowColor?: number;
		glowAlpha?: number;
		shadow?: boolean;
	},
): void {
	const bgAlpha = options?.bgAlpha ?? COLORS.PANEL_BG_ALPHA;
	const borderColor = options?.borderColor ?? COLORS.PANEL_BORDER;
	const borderAlpha = options?.borderAlpha ?? COLORS.PANEL_BORDER_ALPHA;

	// 드롭 쉐도우
	if (options?.shadow !== false) {
		gfx.fillStyle(0x000000, 0.25);
		gfx.fillRoundedRect(x + 2, y + 2, w, h, radius);
	}

	// 선택적 외곽 글로우
	if (options?.glowColor) {
		gfx.lineStyle(4, options.glowColor, options.glowAlpha ?? 0.15);
		gfx.strokeRoundedRect(x - 1, y - 1, w + 2, h + 2, radius + 1);
	}

	// 배경
	gfx.fillStyle(COLORS.PANEL_BG, bgAlpha);
	gfx.fillRoundedRect(x, y, w, h, radius);

	// 상단 하이라이트 (유리 효과)
	gfx.fillStyle(0xffffff, 0.03);
	const hlR = Math.max(1, radius - 1);
	gfx.fillRoundedRect(x + 1, y + 1, w - 2, h * 0.4, { tl: hlR, tr: hlR, bl: 0, br: 0 });

	// 테두리
	gfx.lineStyle(1.5, borderColor, borderAlpha);
	gfx.strokeRoundedRect(x, y, w, h, radius);
}

import type Phaser from "phaser";
