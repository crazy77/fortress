import Phaser from "phaser";
import { COLORS, CONFIG, drawPanel } from "../config";
import { getBGM } from "../systems/BGMSystem";
import type { GameStats } from "../systems/GameStats";
import { getItemDef, type ItemType } from "../systems/PowerUpSystem";
import type { WeaponDef } from "../systems/WeaponSystem";

interface UIData {
	currentPlayer: number;
	wind: number;
	hp: [number, number];
	fuel: number;
	maxFuel?: number;
	turnTimeLeft: number;
	weaponIndex: number;
	weapons: WeaponDef[];
	weaponAmmo: number[];
	weaponCanUse: boolean[];
	terrainType: string;
	roundInfo?: string;
	aiEnabled?: boolean;
	tankNames?: [string, string];
	tankEras?: [string, string];
	shields?: number[];
	activeBuffs?: { powerUp: boolean; damageUp: boolean; doubleShot: boolean; fireUp: boolean; doubleTurn: boolean };
	debuffs?: { angleLock: number; moveLock: number }[];
	inventory?: (string | null)[][];
	timeOfDay?: string;
}

interface GameOverData {
	winner: number;
	matchOver?: boolean;
	matchInfo?: string;
	stats?: [GameStats, GameStats];
	accuracy?: [number, number];
}

export class UIScene extends Phaser.Scene {
	private lastPlayer = -1;

	// Top bar
	private topBarGfx!: Phaser.GameObjects.Graphics;
	private p1HpValue!: Phaser.GameObjects.Text;
	private p1HpBarGfx!: Phaser.GameObjects.Graphics;
	private p1NameText!: Phaser.GameObjects.Text;
	private p1ShieldIcon!: Phaser.GameObjects.Text;
	private p2HpValue!: Phaser.GameObjects.Text;
	private p2HpBarGfx!: Phaser.GameObjects.Graphics;
	private p2NameText!: Phaser.GameObjects.Text;
	private p2ShieldIcon!: Phaser.GameObjects.Text;

	// Center panel
	private centerPanelGfx!: Phaser.GameObjects.Graphics;
	private playerDot!: Phaser.GameObjects.Graphics;
	private turnLabel!: Phaser.GameObjects.Text;
	private timerArcGfx!: Phaser.GameObjects.Graphics;
	private timerNumText!: Phaser.GameObjects.Text;
	// Wind 게이지
	private windGaugeGfx!: Phaser.GameObjects.Graphics;
	private windValueText!: Phaser.GameObjects.Text;
	private windLabelText!: Phaser.GameObjects.Text;

	// Round
	private roundText!: Phaser.GameObjects.Text;

	// Buff indicators
	private buffText!: Phaser.GameObjects.Text;

	// Bottom bar
	private bottomBarGfx!: Phaser.GameObjects.Graphics;
	private weaponBtns: Phaser.GameObjects.Container[] = [];
	private weaponBtnBgs: Phaser.GameObjects.Graphics[] = [];
	private weaponBtnIcons: Phaser.GameObjects.Text[] = [];
	private weaponBtnAmmos: Phaser.GameObjects.Text[] = [];
	private fuelBarGfx!: Phaser.GameObjects.Graphics;
	private soundBtn!: Phaser.GameObjects.Container;
	private soundIcon!: Phaser.GameObjects.Text;
	private terrainText!: Phaser.GameObjects.Text;

	// Inventory slots
	private invSlots: Phaser.GameObjects.Container[] = [];
	private invSlotBgs: Phaser.GameObjects.Graphics[] = [];
	private invSlotIcons: Phaser.GameObjects.Text[] = [];

	// Turn banner
	private turnBannerContainer!: Phaser.GameObjects.Container;
	private turnBannerGfx!: Phaser.GameObjects.Graphics;
	private turnBannerText!: Phaser.GameObjects.Text;

	// Overlay
	private overlayContainer!: Phaser.GameObjects.Container;

	constructor() {
		super("UIScene");
	}

	create(): void {
		// === TOP BAR ===
		this.topBarGfx = this.add.graphics();

		// P1 HP Panel
		drawPanel(this.topBarGfx, 12, 8, 260, 56, 12);
		this.p1NameText = this.add.text(24, 14, "P1", {
			fontSize: "13px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.P1_LIGHT).rgba,
			fontStyle: "bold",
		});
		this.p1HpValue = this.add.text(60, 12, "100", {
			fontSize: "20px",
			color: "#ffffff",
			fontStyle: "bold",
			shadow: { offsetX: 0, offsetY: 0, color: "#ffffff", blur: 6, fill: true, stroke: true },
		});
		this.p1HpBarGfx = this.add.graphics();
		this.p1ShieldIcon = this.add.text(240, 16, "", {
			fontSize: "16px",
		});

		// P2 HP Panel
		drawPanel(this.topBarGfx, 1008, 8, 260, 56, 12);
		this.p2NameText = this.add.text(1020, 14, "P2", {
			fontSize: "13px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.P2_LIGHT).rgba,
			fontStyle: "bold",
		});
		this.p2HpValue = this.add.text(1056, 12, "100", {
			fontSize: "20px",
			color: "#ffffff",
			fontStyle: "bold",
			shadow: { offsetX: 0, offsetY: 0, color: "#ffffff", blur: 6, fill: true, stroke: true },
		});
		this.p2HpBarGfx = this.add.graphics();
		this.p2ShieldIcon = this.add.text(1236, 16, "", {
			fontSize: "16px",
		});

		// Center Panel (턴 + 타이머 + 바람)
		const cx = CONFIG.VIEW_WIDTH / 2;
		this.centerPanelGfx = this.add.graphics();
		drawPanel(this.centerPanelGfx, cx - 220, 8, 440, 52, 12);

		this.playerDot = this.add.graphics();
		this.turnLabel = this.add.text(cx - 200, 24, "P1 차례", {
			fontSize: "16px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		this.turnLabel.setOrigin(0, 0.5);

		// Timer
		this.timerArcGfx = this.add.graphics();
		this.timerNumText = this.add.text(cx - 100, 34, "15", {
			fontSize: "14px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		this.timerNumText.setOrigin(0.5);

		// Wind 게이지 (센터 패널 오른쪽 영역)
		this.windLabelText = this.add.text(cx + 20, 16, "WIND", {
			fontSize: "9px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.TEXT_SECONDARY).rgba,
			fontStyle: "bold",
		});
		this.windLabelText.setOrigin(0, 0);
		this.windGaugeGfx = this.add.graphics();
		this.windValueText = this.add.text(cx + 200, 34, "0.0", {
			fontSize: "14px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		this.windValueText.setOrigin(1, 0.5);

		// Round
		this.roundText = this.add.text(cx, 66, "", {
			fontSize: "12px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.GOLD).rgba,
			fontStyle: "bold",
		});
		this.roundText.setOrigin(0.5, 0);

		// Buff indicators
		this.buffText = this.add.text(cx, 82, "", {
			fontSize: "13px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		this.buffText.setOrigin(0.5, 0);

		// === BOTTOM BAR (게임 영역 아래에 고정) ===
		const barY = CONFIG.PLAY_HEIGHT;
		this.bottomBarGfx = this.add.graphics();
		// 불투명 배경으로 게임 영역과 완전히 분리
		this.bottomBarGfx.fillStyle(COLORS.PANEL_BG, 1);
		this.bottomBarGfx.fillRect(0, barY, CONFIG.VIEW_WIDTH, CONFIG.UI_BAR_HEIGHT);
		this.bottomBarGfx.lineStyle(1.5, COLORS.PANEL_BORDER, 0.6);
		this.bottomBarGfx.lineBetween(0, barY, CONFIG.VIEW_WIDTH, barY);

		// Fuel
		this.add.text(180, barY + 12, "FUEL", {
			fontSize: "11px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.TEXT_SECONDARY).rgba,
			fontStyle: "bold",
		});
		this.fuelBarGfx = this.add.graphics();

		// Weapon buttons (4개)
		this.createWeaponButtons();

		// Sound toggle
		this.createSoundToggle();

		// Skip turn button
		this.createSkipButton();

		// Inventory slots (무기 버튼 오른쪽)
		this.createInventorySlots();

		// Terrain
		this.terrainText = this.add.text(1200, barY + CONFIG.UI_BAR_HEIGHT / 2, "", {
			fontSize: "12px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.TEXT_SECONDARY).rgba,
		});
		this.terrainText.setOrigin(0.5, 0.5);

		// === TURN BANNER ===
		this.turnBannerContainer = this.add.container(640, -60);
		this.turnBannerContainer.setDepth(30);
		this.turnBannerGfx = this.add.graphics();
		this.turnBannerText = this.add.text(0, 0, "", {
			fontSize: "28px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		this.turnBannerText.setOrigin(0.5);
		this.turnBannerContainer.add([this.turnBannerGfx, this.turnBannerText]);
		this.turnBannerContainer.setAlpha(0);

		// === OVERLAY ===
		this.overlayContainer = this.add.container(0, 0);
		this.overlayContainer.setDepth(50);
		this.overlayContainer.setVisible(false);

		// Events
		const gameScene = this.scene.get("GameScene");
		gameScene.events.on("update-ui", this.onUpdateUI, this);
		gameScene.events.on("game-over", this.onGameOver, this);

		this.events.once("shutdown", () => {
			gameScene.events.off("update-ui", this.onUpdateUI, this);
			gameScene.events.off("game-over", this.onGameOver, this);
		});
	}

	private createWeaponButtons(): void {
		const btnSize = 50;
		const gap = 5;
		const count = 8;
		const totalWidth = count * btnSize + (count - 1) * gap;
		const startX = (CONFIG.VIEW_WIDTH - totalWidth) / 2;
		const btnY = CONFIG.PLAY_HEIGHT + CONFIG.UI_BAR_HEIGHT / 2;

		this.weaponBtns = [];
		this.weaponBtnBgs = [];
		this.weaponBtnIcons = [];
		this.weaponBtnAmmos = [];

		for (let i = 0; i < count; i++) {
			const x = startX + i * (btnSize + gap) + btnSize / 2;

			const bg = this.add.graphics();
			this.weaponBtnBgs.push(bg);

			const icon = this.add.text(0, -6, "", { fontSize: "22px" });
			icon.setOrigin(0.5);
			this.weaponBtnIcons.push(icon);

			const ammoText = this.add.text(0, 14, "", {
				fontSize: "10px",
				color: "#ffffff",
				fontStyle: "bold",
			});
			ammoText.setOrigin(0.5);
			this.weaponBtnAmmos.push(ammoText);

			const shortcutLabel = this.add.text(0, 22, `${i + 1}`, {
				fontSize: "8px",
				color: Phaser.Display.Color.IntegerToColor(COLORS.TEXT_SECONDARY).rgba,
			});
			shortcutLabel.setOrigin(0.5);

			const container = this.add.container(x, btnY, [bg, icon, ammoText, shortcutLabel]);
			container.setSize(btnSize, btnSize);
			container.setInteractive();
			container.setDepth(20);

			const weaponIndex = i;
			container.on("pointerdown", () => {
				const gameScene = this.scene.get("GameScene");
				if (gameScene) {
					gameScene.events.emit("select-weapon",
						this.lastPlayer >= 0 ? this.lastPlayer : 0,
						weaponIndex,
					);
				}
			});

			this.weaponBtns.push(container);
		}
	}

	private createSoundToggle(): void {
		const btnSize = 44;
		const x = 1140;
		const y = CONFIG.PLAY_HEIGHT + CONFIG.UI_BAR_HEIGHT / 2;

		const bg = this.add.graphics();
		drawPanel(bg, -btnSize / 2, -btnSize / 2, btnSize, btnSize, 10);

		this.soundIcon = this.add.text(0, 0, "🔊", { fontSize: "20px" });
		this.soundIcon.setOrigin(0.5);

		this.soundBtn = this.add.container(x, y, [bg, this.soundIcon]);
		this.soundBtn.setSize(btnSize, btnSize);
		this.soundBtn.setInteractive({ useHandCursor: true });
		this.soundBtn.setDepth(20);

		this.soundBtn.on("pointerdown", () => {
			const gameScene = this.scene.get("GameScene");
			if (gameScene) {
				gameScene.events.emit("toggle-mute");
			}
		});
	}

	private createInventorySlots(): void {
		const slotSize = 40;
		const gap = 5;
		const count = 4;
		// 무기 버튼 오른쪽에 배치
		const startX = CONFIG.VIEW_WIDTH / 2 + 160;
		const slotY = CONFIG.PLAY_HEIGHT + CONFIG.UI_BAR_HEIGHT / 2;

		this.invSlots = [];
		this.invSlotBgs = [];
		this.invSlotIcons = [];

		for (let i = 0; i < count; i++) {
			const x = startX + i * (slotSize + gap);

			const bg = this.add.graphics();
			drawPanel(bg, -slotSize / 2, -slotSize / 2, slotSize, slotSize, 8);
			this.invSlotBgs.push(bg);

			const icon = this.add.text(0, 0, "", { fontSize: "18px" });
			icon.setOrigin(0.5);
			this.invSlotIcons.push(icon);

			const container = this.add.container(x, slotY, [bg, icon]);
			container.setSize(slotSize, slotSize);
			container.setInteractive({ useHandCursor: true });
			container.setDepth(20);

			const slotIdx = i;
			container.on("pointerdown", () => {
				const gameScene = this.scene.get("GameScene") as { events: Phaser.Events.EventEmitter };
				gameScene.events.emit("use-item", slotIdx);
			});

			this.invSlots.push(container);
		}
	}

	private updateInventorySlots(data: UIData): void {
		const p = data.currentPlayer;
		const inv = data.inventory?.[p];
		const slotSize = 40;

		for (let i = 0; i < 4; i++) {
			const itemType = inv?.[i] as ItemType | null | undefined;
			const bg = this.invSlotBgs[i];
			bg.clear();

			if (itemType) {
				const def = getItemDef(itemType);
				drawPanel(bg, -slotSize / 2, -slotSize / 2, slotSize, slotSize, 8);
				this.invSlotIcons[i].setText(def.icon);
				this.invSlotIcons[i].setAlpha(1);
			} else {
				// 빈 슬롯
				bg.fillStyle(0x111520, 0.5);
				bg.fillRoundedRect(-slotSize / 2, -slotSize / 2, slotSize, slotSize, 8);
				bg.lineStyle(1, 0x333a4c, 0.3);
				bg.strokeRoundedRect(-slotSize / 2, -slotSize / 2, slotSize, slotSize, 8);
				this.invSlotIcons[i].setText("");
			}
		}
	}

	private createSkipButton(): void {
		const btnW = 60;
		const btnH = 36;
		const x = 80;
		const y = CONFIG.PLAY_HEIGHT + CONFIG.UI_BAR_HEIGHT / 2;

		const bg = this.add.graphics();
		drawPanel(bg, -btnW / 2, -btnH / 2, btnW, btnH, 8);

		const label = this.add.text(0, 0, "SKIP", {
			fontSize: "12px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.TEXT_SECONDARY).rgba,
			fontStyle: "bold",
		});
		label.setOrigin(0.5);

		const container = this.add.container(x, y, [bg, label]);
		container.setSize(btnW, btnH);
		container.setInteractive({ useHandCursor: true });
		container.setDepth(20);

		container.on("pointerdown", () => {
			const gameScene = this.scene.get("GameScene") as {
				events: Phaser.Events.EventEmitter;
			};
			gameScene.events.emit("skip-turn");
		});
	}

	private updateWeaponButtons(data: UIData): void {
		const btnSize = 50;
		for (let i = 0; i < 8; i++) {
			if (i >= data.weapons.length) {
				this.weaponBtns[i].setVisible(false);
				continue;
			}

			this.weaponBtns[i].setVisible(true);
			const weapon = data.weapons[i];
			const isSelected = data.weaponIndex === i;
			const canUse = data.weaponCanUse[i];
			const ammo = data.weaponAmmo[i];

			const bg = this.weaponBtnBgs[i];
			bg.clear();

			if (!canUse) {
				bg.fillStyle(0x111520, 0.8);
				bg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 12);
				bg.lineStyle(1.5, 0x333a4c, 0.4);
				bg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 12);
			} else if (isSelected) {
				bg.fillStyle(COLORS.PANEL_BG, 0.9);
				bg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 12);
				bg.lineStyle(2.5, COLORS.GOLD, 0.9);
				bg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 12);
				bg.lineStyle(1, COLORS.GOLD, 0.25);
				bg.strokeRoundedRect(
					-btnSize / 2 - 2,
					-btnSize / 2 - 2,
					btnSize + 4,
					btnSize + 4,
					14,
				);
			} else {
				drawPanel(bg, -btnSize / 2, -btnSize / 2, btnSize, btnSize, 12);
			}

			this.weaponBtnIcons[i].setText(weapon.icon);
			this.weaponBtnIcons[i].setAlpha(canUse ? 1 : 0.3);

			const ammoLabel = ammo === -1 ? "∞" : `${ammo}`;
			this.weaponBtnAmmos[i].setText(ammoLabel);
			this.weaponBtnAmmos[i].setAlpha(canUse ? 1 : 0.4);
		}
	}

	private showTurnBanner(playerIndex: number): void {
		const colors = [COLORS.P1_COLOR, COLORS.P2_COLOR];
		const colorHex = [COLORS.P1_LIGHT, COLORS.P2_LIGHT];
		const emoji = playerIndex === 0 ? "\u2694\uFE0F" : "\uD83D\uDEE1\uFE0F";
		const label = `${emoji} P${playerIndex + 1} 차례!`;

		this.turnBannerText.setText(label);
		this.turnBannerText.setColor(
			Phaser.Display.Color.IntegerToColor(colorHex[playerIndex]).rgba,
		);

		this.turnBannerGfx.clear();
		const bw = 380;
		const bh = 60;

		// Drop shadow (darker rect offset by 2px)
		this.turnBannerGfx.fillStyle(0x000000, 0.35);
		this.turnBannerGfx.fillRoundedRect(-bw / 2 + 2, -bh / 2 + 2, bw, bh, 12);

		this.turnBannerGfx.fillStyle(colors[playerIndex], 0.3);
		this.turnBannerGfx.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
		this.turnBannerGfx.fillStyle(COLORS.PANEL_BG, 0.6);
		this.turnBannerGfx.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
		this.turnBannerGfx.lineStyle(
			1.5,
			COLORS.PANEL_BORDER,
			COLORS.PANEL_BORDER_ALPHA,
		);
		this.turnBannerGfx.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);

		this.turnBannerContainer.setY(-60);
		this.turnBannerContainer.setAlpha(1);

		this.tweens.killTweensOf(this.turnBannerContainer);
		this.tweens.add({
			targets: this.turnBannerContainer,
			y: 110,
			duration: 300,
			ease: "Back.easeOut",
			onComplete: () => {
				this.tweens.add({
					targets: this.turnBannerContainer,
					alpha: 0,
					delay: 800,
					duration: 300,
					ease: "Power2",
				});
			},
		});
	}

	private drawHpBar(
		gfx: Phaser.GameObjects.Graphics,
		x: number,
		hp: number,
	): void {
		const barW = 200;
		const barH = 14;
		const barY = 44;
		const radius = 7;

		gfx.clear();

		// Background
		gfx.fillStyle(0x1a1e2e, 1);
		gfx.fillRoundedRect(x, barY, barW, barH, radius);

		// Fill with gradient effect (darker base + lighter top half)
		const ratio = hp / CONFIG.TANK_HP;
		const color =
			ratio > 0.5
				? COLORS.HP_HIGH
				: ratio > 0.25
					? COLORS.HP_MID
					: COLORS.HP_LOW;
		const fillW = barW * ratio;
		if (fillW > 0) {
			// Base color
			gfx.fillStyle(color, 1);
			gfx.fillRoundedRect(x, barY, Math.max(fillW, barH), barH, radius);

			// Lighter gradient overlay on top half
			gfx.fillStyle(0xffffff, 0.25);
			gfx.fillRoundedRect(x + 1, barY + 1, Math.max(fillW - 2, 4), barH / 2, { tl: radius, tr: radius, bl: 0, br: 0 });

			// Subtle highlight line
			gfx.fillStyle(0xffffff, 0.1);
			gfx.fillRoundedRect(x + 2, barY + barH / 2, Math.max(fillW - 4, 4), barH / 2 - 1, { tl: 0, tr: 0, bl: radius, br: radius });
		}
	}

	private fuelNumText?: Phaser.GameObjects.Text;

	private drawFuelGauge(fuel: number, maxFuel?: number): void {
		const barX = 180;
		const barY = CONFIG.PLAY_HEIGHT + 28;
		const barW = 80;
		const barH = 10;
		const maxF = maxFuel ?? CONFIG.TANK_FUEL;
		const ratio = fuel / maxF;

		this.fuelBarGfx.clear();

		this.fuelBarGfx.fillStyle(0x1a1e2e, 1);
		this.fuelBarGfx.fillRoundedRect(barX, barY, barW, barH, 5);

		const color =
			ratio > 0.5
				? COLORS.FUEL_HIGH
				: ratio > 0.25
					? COLORS.FUEL_MID
					: COLORS.FUEL_LOW;
		const fillW = barW * ratio;
		if (fillW > 0) {
			this.fuelBarGfx.fillStyle(color, 1);
			this.fuelBarGfx.fillRoundedRect(
				barX,
				barY,
				Math.max(fillW, barH),
				barH,
				5,
			);
		}

		this.fuelBarGfx.lineStyle(1, COLORS.PANEL_BORDER, 0.5);
		this.fuelBarGfx.strokeRoundedRect(barX, barY, barW, barH, 5);

		// Numeric fuel text
		if (!this.fuelNumText) {
			this.fuelNumText = this.add.text(barX + barW + 6, barY - 1, "", {
				fontSize: "10px",
				color: "#ffffff",
				fontStyle: "bold",
			});
		}
		this.fuelNumText.setText(`${Math.round(fuel)}`);
	}

	private updateWindDisplay(wind: number): void {
		const cx = CONFIG.VIEW_WIDTH / 2;
		const absWind = Math.abs(wind);

		// 값 텍스트 (방향 포함)
		const dirLabel = wind > 0.05 ? "→" : wind < -0.05 ? "←" : "";
		this.windValueText.setText(`${dirLabel} ${absWind.toFixed(1)}`);

		// 강도별 색상
		const windColor = absWind > 3 ? 0xe74c3c : absWind > 1.5 ? 0xf1c40f : 0x2ecc71;
		this.windValueText.setColor(Phaser.Display.Color.IntegerToColor(windColor).rgba);

		// 게이지 바: 중앙 기준 좌우로 채워짐
		const g = this.windGaugeGfx;
		g.clear();

		const barX = cx + 20; // WIND 라벨 오른쪽
		const barY = 28;
		const barW = 160; // 전체 너비
		const barH = 12;
		const halfW = barW / 2;
		const barCx = barX + halfW; // 게이지 중앙

		// 배경
		g.fillStyle(0x1a1e2e, 1);
		g.fillRoundedRect(barX, barY, barW, barH, 4);

		// 채움: 바람 비율 (-WIND_RANGE ~ +WIND_RANGE → -halfW ~ +halfW)
		const ratio = wind / CONFIG.WIND_RANGE; // -1 ~ +1
		const fillW = Math.abs(ratio) * halfW;

		if (fillW > 1) {
			const fillX = wind > 0 ? barCx : barCx - fillW;
			g.fillStyle(windColor, 0.9);
			g.fillRoundedRect(fillX, barY + 1, fillW, barH - 2, 3);

			// 하이라이트
			g.fillStyle(0xffffff, 0.15);
			g.fillRoundedRect(fillX, barY + 1, fillW, (barH - 2) / 3, 2);
		}

		// 중앙 마커 (more prominent: 3px wide, white)
		g.fillStyle(0xffffff, 1);
		g.fillRect(barCx - 1.5, barY - 1, 3, barH + 2);

		// 외곽선
		g.lineStyle(1, COLORS.PANEL_BORDER, 0.5);
		g.strokeRoundedRect(barX, barY, barW, barH, 4);

		// 좌우 방향 표시 (◀ ▶)
		g.fillStyle(COLORS.TEXT_SECONDARY, 0.3);
		// 왼쪽 삼각형
		g.fillTriangle(barX + 5, barY + barH / 2, barX + 10, barY + 2, barX + 10, barY + barH - 2);
		// 오른쪽 삼각형
		g.fillTriangle(barX + barW - 5, barY + barH / 2, barX + barW - 10, barY + 2, barX + barW - 10, barY + barH - 2);

		// Pulsing arrow indicator on the wind direction side
		if (Math.abs(wind) > 0.05) {
			const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 300);
			g.fillStyle(windColor, 0.6 + 0.4 * pulse);
			if (wind > 0) {
				// Arrow on right side
				const ax = barX + barW + 4;
				const ay = barY + barH / 2;
				g.fillTriangle(ax + 8, ay, ax, ay - 5, ax, ay + 5);
			} else {
				// Arrow on left side
				const ax = barX - 4;
				const ay = barY + barH / 2;
				g.fillTriangle(ax - 8, ay, ax, ay - 5, ax, ay + 5);
			}
		}
	}

	private drawTimerArc(timeLeft: number): void {
		const cx = CONFIG.VIEW_WIDTH / 2 - 100;
		const cy = 34;
		const radius = 18;

		this.timerArcGfx.clear();

		// Pulsing glow effect when time < 5 seconds
		if (timeLeft < 5 && timeLeft > 0) {
			const pulse = 0.15 + 0.15 * Math.sin(this.time.now / 200);
			this.timerArcGfx.fillStyle(COLORS.DANGER, pulse);
			this.timerArcGfx.fillCircle(cx, cy, radius + 6);
		}

		this.timerArcGfx.fillStyle(0x0a0e17, 0.6);
		this.timerArcGfx.fillCircle(cx, cy, radius + 2);

		const ratio = timeLeft / CONFIG.TURN_TIME;
		const startAngle = -Math.PI / 2;
		const endAngle = startAngle + Math.PI * 2 * ratio;
		const timerColor =
			timeLeft > 10
				? COLORS.HP_HIGH
				: timeLeft > 5
					? COLORS.GOLD
					: COLORS.DANGER;

		this.timerArcGfx.fillStyle(timerColor, 0.8);
		this.timerArcGfx.beginPath();
		this.timerArcGfx.moveTo(cx, cy);
		this.timerArcGfx.arc(cx, cy, radius, startAngle, endAngle, false);
		this.timerArcGfx.closePath();
		this.timerArcGfx.fillPath();

		// Darker inner circle
		this.timerArcGfx.fillStyle(0x050810, 0.85);
		this.timerArcGfx.fillCircle(cx, cy, radius - 6);

		this.timerArcGfx.lineStyle(1, COLORS.PANEL_BORDER, 0.5);
		this.timerArcGfx.strokeCircle(cx, cy, radius);

		this.timerNumText.setText(`${Math.ceil(timeLeft)}`);
	}

	private onUpdateUI(data: UIData): void {
		if (!this.turnLabel?.active) return;

		if (this.lastPlayer !== data.currentPlayer) {
			this.lastPlayer = data.currentPlayer;
			this.showTurnBanner(data.currentPlayer);
		}

		// Player dot
		const dotColor =
			data.currentPlayer === 0 ? COLORS.P1_COLOR : COLORS.P2_COLOR;
		this.playerDot.clear();
		this.playerDot.fillStyle(dotColor, 1);
		const dotX = CONFIG.VIEW_WIDTH / 2 - 215;
		this.playerDot.fillCircle(dotX, 34, 5);
		this.playerDot.fillStyle(dotColor, 0.3);
		this.playerDot.fillCircle(dotX, 34, 9);

		// Turn label
		const names = data.aiEnabled
			? ["P1 차례", "AI 차례"]
			: ["P1 차례", "P2 차례"];
		this.turnLabel.setText(names[data.currentPlayer]);
		const labelColor =
			data.currentPlayer === 0
				? Phaser.Display.Color.IntegerToColor(COLORS.P1_LIGHT).rgba
				: Phaser.Display.Color.IntegerToColor(COLORS.P2_LIGHT).rgba;
		this.turnLabel.setColor(labelColor);

		// Tank names
		if (data.tankNames) {
			this.p1NameText.setText(`P1 ${data.tankNames[0]}`);
			this.p2NameText.setText(
				data.aiEnabled ? `AI ${data.tankNames[1]}` : `P2 ${data.tankNames[1]}`,
			);
		}

		// Shield icons
		if (data.shields) {
			this.p1ShieldIcon.setText(data.shields[0] > 0 ? "🛡️" : "");
			this.p2ShieldIcon.setText(data.shields[1] > 0 ? "🛡️" : "");
		}

		// Wind 패널 갱신
		this.updateWindDisplay(data.wind);

		// HP
		this.p1HpValue.setText(`${data.hp[0]}`);
		this.drawHpBar(this.p1HpBarGfx, 24, data.hp[0]);
		this.p2HpValue.setText(`${data.hp[1]}`);
		this.drawHpBar(this.p2HpBarGfx, 1020, data.hp[1]);

		// Timer
		if (data.turnTimeLeft !== undefined) {
			this.drawTimerArc(data.turnTimeLeft);
		}

		// Fuel
		if (data.fuel !== undefined) {
			this.drawFuelGauge(data.fuel, data.maxFuel);
		}

		// Weapons
		if (data.weapons) {
			this.updateWeaponButtons(data);
		}

		// Terrain
		if (data.terrainType) {
			this.terrainText.setText(data.terrainType);
		}

		// Round
		if (data.roundInfo) {
			this.roundText.setText(data.roundInfo);
		}

		// Buff / debuff indicators
		const p = data.currentPlayer;
		const buffs: string[] = [];
		if (data.activeBuffs?.powerUp) buffs.push("💪파워");
		if (data.activeBuffs?.damageUp) buffs.push("🔥데미지");
		if (data.activeBuffs?.doubleShot) buffs.push("🎯더블샷");
		if (data.activeBuffs?.fireUp) buffs.push("🔶화염");
		if (data.activeBuffs?.doubleTurn) buffs.push("⚡더블턴");
		if (data.shields && data.shields[p] > 0) buffs.push("🛡️보호막");
		const db = data.debuffs?.[p];
		if (db?.angleLock && db.angleLock > 0) buffs.push(`🔒각도${db.angleLock}`);
		if (db?.moveLock && db.moveLock > 0) buffs.push(`⛓️이동${db.moveLock}`);
		this.buffText.setText(buffs.join("  "));

		// Inventory slots
		this.updateInventorySlots(data);
	}

	private onGameOver(data: GameOverData): void {
		if (!this.turnLabel?.active) return;

		this.overlayContainer.removeAll(true);
		this.overlayContainer.setVisible(true);
		this.overlayContainer.setAlpha(0);

		const cx = CONFIG.VIEW_WIDTH / 2;
		const cy = CONFIG.PLAY_HEIGHT / 2;

		const dimBg = this.add.graphics();
		dimBg.fillStyle(0x000000, 0.65);
		dimBg.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT);
		this.overlayContainer.add(dimBg);

		if (data.matchOver) {
			this.showMatchOverCard(data, cx, cy);
		} else {
			this.showRoundWinCard(data, cx, cy);
		}

		this.overlayContainer.setScale(0.8);
		this.tweens.add({
			targets: this.overlayContainer,
			scaleX: 1,
			scaleY: 1,
			alpha: 1,
			duration: 400,
			ease: "Back.easeOut",
		});
	}

	private showMatchOverCard(data: GameOverData, cx: number, cy: number): void {
		const cardW = 850;
		const cardH = 480;
		const cardX = cx - cardW / 2;
		const cardY = cy - cardH / 2;

		const cardGfx = this.add.graphics();
		drawPanel(cardGfx, cardX, cardY, cardW, cardH, 20, {
			bgAlpha: 0.94,
			glowColor: COLORS.GOLD,
			glowAlpha: 0.3,
		});
		this.overlayContainer.add(cardGfx);

		const winnerColor =
			data.winner === 0
				? Phaser.Display.Color.IntegerToColor(COLORS.P1_LIGHT).rgba
				: Phaser.Display.Color.IntegerToColor(COLORS.P2_LIGHT).rgba;

		// Pulsing glow behind trophy
		const trophyGlow = this.add.graphics();
		trophyGlow.fillStyle(COLORS.GOLD, 0.2);
		trophyGlow.fillCircle(cx, cardY + 60, 40);
		this.overlayContainer.add(trophyGlow);
		this.tweens.add({
			targets: trophyGlow,
			scaleX: 1.3,
			scaleY: 1.3,
			alpha: 0.3,
			duration: 1000,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});

		const trophy = this.add.text(cx, cardY + 60, "\uD83C\uDFC6", {
			fontSize: "52px",
		});
		trophy.setOrigin(0.5);
		this.overlayContainer.add(trophy);

		const winnerText = this.add.text(
			cx,
			cardY + 125,
			`P${data.winner + 1} 최종 승리!`,
			{
				fontSize: "42px",
				color: winnerColor,
				fontStyle: "bold",
			},
		);
		winnerText.setOrigin(0.5);
		this.overlayContainer.add(winnerText);

		if (data.matchInfo) {
			const scoreText = this.add.text(cx, cardY + 180, data.matchInfo, {
				fontSize: "20px",
				color: Phaser.Display.Color.IntegerToColor(COLORS.GOLD).rgba,
				fontStyle: "bold",
			});
			scoreText.setOrigin(0.5);
			this.overlayContainer.add(scoreText);
		}

		// Divider
		const divider = this.add.graphics();
		divider.lineStyle(1, COLORS.PANEL_BORDER, 0.6);
		divider.beginPath();
		divider.moveTo(cardX + 60, cardY + 210);
		divider.lineTo(cardX + cardW - 60, cardY + 210);
		divider.strokePath();
		this.overlayContainer.add(divider);

		// Stats with enhanced display
		if (data.stats && data.accuracy) {
			const colLeft = cx - 200;
			const colRight = cx + 200;
			const statsY = cardY + 235;

			const h1 = this.add.text(colLeft, statsY, "P1", {
				fontSize: "20px",
				color: Phaser.Display.Color.IntegerToColor(COLORS.P1_LIGHT).rgba,
				fontStyle: "bold",
			});
			h1.setOrigin(0.5);
			this.overlayContainer.add(h1);

			const h2 = this.add.text(colRight, statsY, "P2", {
				fontSize: "20px",
				color: Phaser.Display.Color.IntegerToColor(COLORS.P2_LIGHT).rgba,
				fontStyle: "bold",
			});
			h2.setOrigin(0.5);
			this.overlayContainer.add(h2);

			const labels = ["명중률", "총 데미지", "최대 피해", "발사 횟수", "턴 수"];
			const vals = [
				[`${data.accuracy[0]}%`, `${data.accuracy[1]}%`],
				[`${data.stats[0].totalDamageDealt}`, `${data.stats[1].totalDamageDealt}`],
				[`${data.stats[0].maxSingleHit}`, `${data.stats[1].maxSingleHit}`],
				[`${data.stats[0].shotsFired}`, `${data.stats[1].shotsFired}`],
				[`${data.stats[0].turnsPlayed}`, `${data.stats[1].turnsPlayed}`],
			];

			for (let r = 0; r < labels.length; r++) {
				const rowY = statsY + 35 + r * 28;

				const lbl = this.add.text(cx, rowY, labels[r], {
					fontSize: "13px",
					color: Phaser.Display.Color.IntegerToColor(COLORS.TEXT_SECONDARY).rgba,
				});
				lbl.setOrigin(0.5);
				this.overlayContainer.add(lbl);

				// Highlight winner's stat in each row
				const v1Num = parseFloat(vals[r][0]);
				const v2Num = parseFloat(vals[r][1]);
				const v1Better = v1Num > v2Num;
				const v2Better = v2Num > v1Num;

				const v1 = this.add.text(colLeft, rowY, vals[r][0], {
					fontSize: "15px",
					color: v1Better ? Phaser.Display.Color.IntegerToColor(COLORS.GOLD).rgba : "#ffffff",
					fontStyle: "bold",
				});
				v1.setOrigin(0.5);
				this.overlayContainer.add(v1);

				const v2 = this.add.text(colRight, rowY, vals[r][1], {
					fontSize: "15px",
					color: v2Better ? Phaser.Display.Color.IntegerToColor(COLORS.GOLD).rgba : "#ffffff",
					fontStyle: "bold",
				});
				v2.setOrigin(0.5);
				this.overlayContainer.add(v2);
			}

			// MVP Award section
			const mvpY = statsY + 35 + labels.length * 28 + 15;
			const divider2 = this.add.graphics();
			divider2.lineStyle(1, COLORS.PANEL_BORDER, 0.4);
			divider2.beginPath();
			divider2.moveTo(cardX + 80, mvpY);
			divider2.lineTo(cardX + cardW - 80, mvpY);
			divider2.strokePath();
			this.overlayContainer.add(divider2);

			// Determine MVP based on accuracy + damage
			const p1Score = data.accuracy[0] + data.stats[0].totalDamageDealt * 0.5;
			const p2Score = data.accuracy[1] + data.stats[1].totalDamageDealt * 0.5;
			const mvp = p1Score >= p2Score ? 0 : 1;
			const mvpColor = mvp === 0
				? Phaser.Display.Color.IntegerToColor(COLORS.P1_LIGHT).rgba
				: Phaser.Display.Color.IntegerToColor(COLORS.P2_LIGHT).rgba;

			const mvpText = this.add.text(cx, mvpY + 18, `⭐ MVP: P${mvp + 1}`, {
				fontSize: "16px",
				color: mvpColor,
				fontStyle: "bold",
			});
			mvpText.setOrigin(0.5);
			this.overlayContainer.add(mvpText);

			this.tweens.add({
				targets: mvpText,
				scaleX: 1.05,
				scaleY: 1.05,
				duration: 800,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut",
			});
		}

		const tapText = this.add.text(cx, cardY + cardH - 45, "탭하여 타이틀로", {
			fontSize: "18px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.TEXT_SECONDARY).rgba,
		});
		tapText.setOrigin(0.5);
		this.overlayContainer.add(tapText);

		this.tweens.add({
			targets: tapText,
			alpha: 0.4,
			duration: 800,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});

		this.input.once("pointerdown", () => {
			getBGM().stop();
			this.scene.stop("GameScene");
			this.scene.stop("UIScene");
			this.scene.start("TitleScene");
		});
	}

	private showRoundWinCard(data: GameOverData, cx: number, cy: number): void {
		const cardW = 600;
		const cardH = 280;
		const cardX = cx - cardW / 2;
		const cardY = cy - cardH / 2;

		const cardGfx = this.add.graphics();
		const winColor = data.winner === 0 ? COLORS.P1_COLOR : COLORS.P2_COLOR;
		drawPanel(cardGfx, cardX, cardY, cardW, cardH, 20, {
			bgAlpha: 0.94,
			glowColor: winColor,
			glowAlpha: 0.25,
		});
		this.overlayContainer.add(cardGfx);

		const winnerColor =
			data.winner === 0
				? Phaser.Display.Color.IntegerToColor(COLORS.P1_LIGHT).rgba
				: Phaser.Display.Color.IntegerToColor(COLORS.P2_LIGHT).rgba;

		// Pulsing glow behind win text
		const roundGlow = this.add.graphics();
		roundGlow.fillStyle(winColor, 0.15);
		roundGlow.fillCircle(cx, cardY + 60, 36);
		this.overlayContainer.add(roundGlow);
		this.tweens.add({
			targets: roundGlow,
			scaleX: 1.3,
			scaleY: 1.3,
			alpha: 0.25,
			duration: 900,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});

		const winText = this.add.text(
			cx,
			cardY + 60,
			`\uD83C\uDFC6 P${data.winner + 1} 라운드 승리!`,
			{
				fontSize: "32px",
				color: winnerColor,
				fontStyle: "bold",
			},
		);
		winText.setOrigin(0.5);
		this.overlayContainer.add(winText);

		if (data.matchInfo) {
			const scoreText = this.add.text(cx, cardY + 120, data.matchInfo, {
				fontSize: "20px",
				color: Phaser.Display.Color.IntegerToColor(COLORS.GOLD).rgba,
				fontStyle: "bold",
			});
			scoreText.setOrigin(0.5);
			this.overlayContainer.add(scoreText);
		}

		const nextText = this.add.text(cx, cardY + 180, "다음 라운드 준비 중...", {
			fontSize: "18px",
			color: Phaser.Display.Color.IntegerToColor(COLORS.TEXT_SECONDARY).rgba,
		});
		nextText.setOrigin(0.5);
		this.overlayContainer.add(nextText);

		this.tweens.add({
			targets: nextText,
			alpha: 0.5,
			duration: 600,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});
	}
}
