import Phaser from "phaser";
import { COLORS, CONFIG, drawPanel } from "../config";

const STORAGE_KEY = "fortress_tutorial_seen";

/**
 * First-time player tutorial overlay.
 * Shows controls and basic game mechanics, then dismisses.
 */
export class TutorialSystem {
	private scene: Phaser.Scene;
	private container: Phaser.GameObjects.Container | null = null;
	private onComplete: (() => void) | null;

	constructor(scene: Phaser.Scene, onComplete?: () => void) {
		this.scene = scene;
		this.onComplete = onComplete ?? null;
	}

	/** Returns true if tutorial should be shown */
	static shouldShow(): boolean {
		try {
			return !localStorage.getItem(STORAGE_KEY);
		} catch {
			return false;
		}
	}

	/** Mark tutorial as seen */
	static markSeen(): void {
		try {
			localStorage.setItem(STORAGE_KEY, "1");
		} catch {
			// ignore storage errors
		}
	}

	show(): void {
		if (this.container) return;

		const cx = CONFIG.VIEW_WIDTH / 2;
		const cy = CONFIG.PLAY_HEIGHT / 2;

		this.container = this.scene.add.container(0, 0);
		this.container.setDepth(250);
		this.container.setScrollFactor(0);

		// Dimmed backdrop
		const dim = this.scene.add.graphics();
		dim.fillStyle(0x000000, 0.8);
		dim.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT);
		this.container.add(dim);

		// Main card
		const cardW = 620;
		const cardH = 480;
		const cardX = cx - cardW / 2;
		const cardY = cy - cardH / 2;

		const card = this.scene.add.graphics();
		drawPanel(card, cardX, cardY, cardW, cardH, 20, {
			bgAlpha: 0.96,
			glowColor: COLORS.GOLD,
			glowAlpha: 0.25,
		});
		this.container.add(card);

		// Title
		this.container.add(
			this.scene.add
				.text(cx, cardY + 35, "FORTRESS BATTLE ARENA", {
					fontSize: "24px",
					color: "#ffffff",
					fontStyle: "bold",
					letterSpacing: 2,
				})
				.setOrigin(0.5),
		);
		this.container.add(
			this.scene.add
				.text(cx, cardY + 60, "조작 가이드", {
					fontSize: "13px",
					color: Phaser.Display.Color.IntegerToColor(COLORS.GOLD).rgba,
					fontStyle: "bold",
				})
				.setOrigin(0.5),
		);

		// Controls section
		const controls = [
			{ key: "드래그", desc: "탱크 주변 원 안에서 드래그하여 조준 + 발사", icon: "🎯" },
			{ key: "A / D", desc: "탱크 좌우 이동 (연료 소모)", icon: "🚗" },
			{ key: "↑ / ↓", desc: "포신 각도 미세 조정", icon: "📐" },
			{ key: "← / →", desc: "파워 미세 조정", icon: "💪" },
			{ key: "SPACE", desc: "파워 차지 (누르고 있으면 자동 충전)", icon: "⚡" },
			{ key: "ENTER / F", desc: "발사!", icon: "🔥" },
			{ key: "1~8", desc: "무기 선택", icon: "💣" },
			{ key: "S", desc: "턴 스킵", icon: "⏭️" },
			{ key: "ESC", desc: "일시정지 메뉴", icon: "⏸️" },
		];

		let y = cardY + 90;
		const colLeft = cardX + 30;

		for (const ctrl of controls) {
			// Icon
			this.container.add(
				this.scene.add
					.text(colLeft, y + 2, ctrl.icon, { fontSize: "14px" })
					.setOrigin(0, 0.5),
			);
			// Key
			const keyBg = this.scene.add.graphics();
			const keyText = this.scene.add
				.text(colLeft + 28, y + 2, ctrl.key, {
					fontSize: "12px",
					color: "#ffffff",
					fontStyle: "bold",
				})
				.setOrigin(0, 0.5);
			const tw = keyText.width + 14;
			keyBg.fillStyle(0x1a2a4a, 0.9);
			keyBg.fillRoundedRect(colLeft + 22, y - 8, tw, 20, 4);
			keyBg.lineStyle(1, 0x3a5a8c, 0.6);
			keyBg.strokeRoundedRect(colLeft + 22, y - 8, tw, 20, 4);
			this.container.add(keyBg);
			this.container.add(keyText);

			// Description
			this.container.add(
				this.scene.add
					.text(colLeft + 28 + tw + 12, y + 2, ctrl.desc, {
						fontSize: "12px",
						color: "#aab2c8",
					})
					.setOrigin(0, 0.5),
			);

			y += 30;
		}

		// Tips section
		y += 10;
		const divider = this.scene.add.graphics();
		divider.fillStyle(COLORS.PANEL_BORDER, 0.5);
		divider.fillRect(cardX + 40, y, cardW - 80, 1);
		this.container.add(divider);

		y += 15;
		const tips = [
			"상성: 고전→미래  현대→고전  미래→현대 (1.2배 데미지)",
			"HP 30% 이하에서 분노 모드 발동! (데미지 1.3배)",
			"이동하지 않으면 매복 보너스 (데미지 +10%)",
			"3연속 명중 시 추가 턴 보너스!",
		];

		for (const tip of tips) {
			this.container.add(
				this.scene.add
					.text(cx, y, `💡 ${tip}`, {
						fontSize: "11px",
						color: "#8899bb",
					})
					.setOrigin(0.5),
			);
			y += 18;
		}

		// Start button
		const btnW = 200;
		const btnH = 46;
		const btnY = cardY + cardH - 55;

		const btnBg = this.scene.add.graphics();
		drawPanel(btnBg, cx - btnW / 2, btnY, btnW, btnH, 12, {
			borderColor: COLORS.SUCCESS,
			borderAlpha: 0.9,
			glowColor: COLORS.SUCCESS,
			glowAlpha: 0.3,
		});
		this.container.add(btnBg);

		const btnText = this.scene.add
			.text(cx, btnY + btnH / 2, "게임 시작!", {
				fontSize: "18px",
				color: Phaser.Display.Color.IntegerToColor(COLORS.SUCCESS).rgba,
				fontStyle: "bold",
			})
			.setOrigin(0.5);
		this.container.add(btnText);

		// Button hitarea
		const hitArea = this.scene.add
			.zone(cx, btnY + btnH / 2, btnW, btnH)
			.setInteractive({ useHandCursor: true });
		hitArea.setScrollFactor(0);
		hitArea.setDepth(251);

		hitArea.on("pointerdown", () => this.dismiss());

		// Pulsing button
		this.scene.tweens.add({
			targets: btnText,
			alpha: 0.7,
			duration: 800,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});

		// Entrance animation
		this.container.setScale(0.9);
		this.container.setAlpha(0);
		this.scene.tweens.add({
			targets: this.container,
			scaleX: 1,
			scaleY: 1,
			alpha: 1,
			duration: 300,
			ease: "Back.easeOut",
		});
	}

	private dismiss(): void {
		TutorialSystem.markSeen();
		if (!this.container) return;
		const c = this.container;
		this.container = null;
		this.scene.tweens.add({
			targets: c,
			alpha: 0,
			scaleX: 1.02,
			scaleY: 1.02,
			duration: 250,
			ease: "Power2",
			onComplete: () => {
				c.destroy();
				this.onComplete?.();
			},
		});
	}

	destroy(): void {
		if (this.container) {
			this.container.destroy();
			this.container = null;
		}
	}
}
