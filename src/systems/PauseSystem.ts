import Phaser from "phaser";
import { COLORS, CONFIG, drawPanel } from "../config";
import { getBGM } from "./BGMSystem";

/**
 * Pause menu overlay - triggered by ESC key.
 * Shows Resume / Restart / Quit buttons with dimmed background.
 */
export class PauseSystem {
	private scene: Phaser.Scene;
	private container: Phaser.GameObjects.Container | null = null;
	private isPaused = false;
	private escKey: Phaser.Input.Keyboard.Key | null = null;
	private onResume: (() => void) | null = null;
	private onRestart: (() => void) | null = null;
	private onQuit: (() => void) | null = null;

	constructor(
		scene: Phaser.Scene,
		callbacks: {
			onResume?: () => void;
			onRestart?: () => void;
			onQuit?: () => void;
		},
	) {
		this.scene = scene;
		this.onResume = callbacks.onResume ?? null;
		this.onRestart = callbacks.onRestart ?? null;
		this.onQuit = callbacks.onQuit ?? null;

		if (scene.input.keyboard) {
			this.escKey = scene.input.keyboard.addKey(
				Phaser.Input.Keyboard.KeyCodes.ESC,
			);
			this.escKey.on("down", () => this.toggle());
		}
	}

	get paused(): boolean {
		return this.isPaused;
	}

	toggle(): void {
		if (this.isPaused) {
			this.resume();
		} else {
			this.pause();
		}
	}

	pause(): void {
		if (this.isPaused) return;
		this.isPaused = true;
		this.scene.time.paused = true;
		this.scene.physics?.pause?.();
		getBGM().setMuted(true);
		this.showMenu();
	}

	resume(): void {
		if (!this.isPaused) return;
		this.isPaused = false;
		this.scene.time.paused = false;
		this.scene.physics?.resume?.();
		// Restore BGM mute state based on audio system
		this.hideMenu();
		this.onResume?.();
	}

	private showMenu(): void {
		if (this.container) return;

		const cx = CONFIG.VIEW_WIDTH / 2;
		const cy = CONFIG.PLAY_HEIGHT / 2;

		this.container = this.scene.add.container(0, 0);
		this.container.setDepth(200);
		this.container.setScrollFactor(0);

		// Dimmed background
		const dim = this.scene.add.graphics();
		dim.fillStyle(0x000000, 0.7);
		dim.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT);
		dim.setInteractive(
			new Phaser.Geom.Rectangle(0, 0, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT),
			Phaser.Geom.Rectangle.Contains,
		);
		this.container.add(dim);

		// Panel
		const panelW = 320;
		const panelH = 340;
		const panelX = cx - panelW / 2;
		const panelY = cy - panelH / 2;

		const panel = this.scene.add.graphics();
		drawPanel(panel, panelX, panelY, panelW, panelH, 16, {
			bgAlpha: 0.96,
			glowColor: COLORS.ACCENT,
			glowAlpha: 0.2,
		});
		this.container.add(panel);

		// Title
		const title = this.scene.add
			.text(cx, panelY + 40, "PAUSED", {
				fontSize: "32px",
				color: "#ffffff",
				fontStyle: "bold",
				letterSpacing: 4,
			})
			.setOrigin(0.5);
		this.container.add(title);

		// Decorative line
		const line = this.scene.add.graphics();
		line.fillStyle(COLORS.ACCENT, 0.5);
		line.fillRoundedRect(cx - 60, panelY + 70, 120, 2, 1);
		this.container.add(line);

		// Buttons
		const btnW = 220;
		const btnH = 50;
		const gap = 16;
		let by = panelY + 100;

		// Resume
		this.container.add(
			this.createMenuButton(cx, by, btnW, btnH, "▶  계속하기", COLORS.SUCCESS, () =>
				this.resume(),
			),
		);
		by += btnH + gap;

		// Restart
		this.container.add(
			this.createMenuButton(cx, by, btnW, btnH, "🔄  재시작", COLORS.WARNING, () => {
				this.resume();
				this.onRestart?.();
			}),
		);
		by += btnH + gap;

		// Quit to title
		this.container.add(
			this.createMenuButton(cx, by, btnW, btnH, "🏠  타이틀로", COLORS.DANGER, () => {
				this.resume();
				this.onQuit?.();
			}),
		);

		// ESC hint
		const hint = this.scene.add
			.text(cx, panelY + panelH - 25, "ESC 키로 돌아가기", {
				fontSize: "11px",
				color: "#667799",
			})
			.setOrigin(0.5);
		this.container.add(hint);

		// Entrance animation
		this.container.setScale(0.85);
		this.container.setAlpha(0);
		this.scene.tweens.add({
			targets: this.container,
			scaleX: 1,
			scaleY: 1,
			alpha: 1,
			duration: 200,
			ease: "Power2",
		});
	}

	private hideMenu(): void {
		if (!this.container) return;
		const c = this.container;
		this.container = null;
		this.scene.tweens.add({
			targets: c,
			alpha: 0,
			scaleX: 0.9,
			scaleY: 0.9,
			duration: 150,
			ease: "Power2",
			onComplete: () => c.destroy(),
		});
	}

	private createMenuButton(
		cx: number,
		y: number,
		w: number,
		h: number,
		label: string,
		color: number,
		onClick: () => void,
	): Phaser.GameObjects.Container {
		const bg = this.scene.add.graphics();
		drawPanel(bg, -w / 2, -h / 2, w, h, 12, {
			borderColor: color,
			borderAlpha: 0.7,
		});

		const text = this.scene.add
			.text(0, 0, label, {
				fontSize: "16px",
				color: Phaser.Display.Color.IntegerToColor(color).rgba,
				fontStyle: "bold",
			})
			.setOrigin(0.5);

		const container = this.scene.add.container(cx, y + h / 2, [bg, text]);
		container.setSize(w, h);
		container.setInteractive({ useHandCursor: true });

		container.on("pointerover", () => {
			bg.clear();
			drawPanel(bg, -w / 2, -h / 2, w, h, 12, {
				bgAlpha: 0.95,
				borderColor: color,
				borderAlpha: 1,
				glowColor: color,
				glowAlpha: 0.3,
			});
		});

		container.on("pointerout", () => {
			bg.clear();
			drawPanel(bg, -w / 2, -h / 2, w, h, 12, {
				borderColor: color,
				borderAlpha: 0.7,
			});
		});

		container.on("pointerdown", onClick);
		return container;
	}

	destroy(): void {
		if (this.escKey) {
			this.escKey.removeAllListeners();
			this.scene.input.keyboard?.removeKey(this.escKey, true);
		}
		this.hideMenu();
	}
}
