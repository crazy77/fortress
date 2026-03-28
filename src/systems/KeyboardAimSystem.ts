import Phaser from "phaser";
import { CONFIG, COLORS } from "../config";

/**
 * Tank interface for keyboard aim system.
 * Matches the subset of Tank properties needed for aiming.
 */
interface AimTank {
	x: number;
	y: number;
	typeDef: {
		angleMin: number;
		angleMax: number;
		maxPower: number;
	};
	setAngle(a: number): void;
	getWorldAngle(): number;
	getMuzzlePosition(): { x: number; y: number };
}

/** Charging speed: full power in ~2 seconds (units per ms) */
const CHARGE_SPEED =
	(CONFIG.MAX_POWER - CONFIG.MIN_POWER) / 2000;

/** Panel dimensions */
const PANEL_WIDTH = 220;
const PANEL_HEIGHT = 100;
const PANEL_RADIUS = 10;
const POWER_BAR_WIDTH = 180;
const POWER_BAR_HEIGHT = 10;

/**
 * Fortress 2-style keyboard controls for precise aiming.
 *
 * Works alongside the drag-based InputHandler without replacing it.
 * Provides numeric angle/power input, arrow-key fine-tuning,
 * space-bar power charging, and a fixed HUD overlay.
 */
export class KeyboardAimSystem {
	onFire: ((aim: { angle: number; power: number }) => void) | null = null;

	private scene: Phaser.Scene;
	private enabled = false;
	private activeTank: AimTank | null = null;

	// Current aiming state (game units)
	private angle = 45;
	private power: number = (CONFIG.MIN_POWER + CONFIG.MAX_POWER) / 2;

	// Space-bar charging
	private isCharging = false;
	private chargeDirection = 1; // 1 = up, -1 = down (ping-pong)

	// Wind/gravity for trajectory preview
	currentWind = 0;
	mapGravity = 1.0;
	mapWindMul = 1.0;

	// Numeric input buffer
	private angleBuffer = "";
	private inputMode: "none" | "angle" | "power" = "none";
	private inputTimeout: ReturnType<typeof setTimeout> | null = null;

	// HUD display objects (fixed to camera / scrollFactor 0)
	private panelGfx: Phaser.GameObjects.Graphics;
	private angleLabel: Phaser.GameObjects.Text;
	private angleValue: Phaser.GameObjects.Text;
	private powerLabel: Phaser.GameObjects.Text;
	private powerValue: Phaser.GameObjects.Text;
	private chargeBarGfx: Phaser.GameObjects.Graphics;
	private inputHint: Phaser.GameObjects.Text;
	/** Trajectory preview line (world-space, scrolls with camera) */
	private trajectoryGfx: Phaser.GameObjects.Graphics;

	// Keyboard objects
	private keys!: {
		up: Phaser.Input.Keyboard.Key;
		down: Phaser.Input.Keyboard.Key;
		left: Phaser.Input.Keyboard.Key;
		right: Phaser.Input.Keyboard.Key;
		shift: Phaser.Input.Keyboard.Key;
		space: Phaser.Input.Keyboard.Key;
		enter: Phaser.Input.Keyboard.Key;
		f: Phaser.Input.Keyboard.Key;
		w: Phaser.Input.Keyboard.Key;
		e: Phaser.Input.Keyboard.Key;
		num0: Phaser.Input.Keyboard.Key;
		num1: Phaser.Input.Keyboard.Key;
		num2: Phaser.Input.Keyboard.Key;
		num3: Phaser.Input.Keyboard.Key;
		num4: Phaser.Input.Keyboard.Key;
		num5: Phaser.Input.Keyboard.Key;
		num6: Phaser.Input.Keyboard.Key;
		num7: Phaser.Input.Keyboard.Key;
		num8: Phaser.Input.Keyboard.Key;
		num9: Phaser.Input.Keyboard.Key;
	};

	constructor(scene: Phaser.Scene) {
		this.scene = scene;

		// --- HUD panel (fixed to screen) ---
		const panelX = (CONFIG.VIEW_WIDTH - PANEL_WIDTH) / 2;
		const panelY = CONFIG.PLAY_HEIGHT - PANEL_HEIGHT - 12;

		this.panelGfx = scene.add.graphics();
		this.panelGfx.setDepth(50);
		this.panelGfx.setScrollFactor(0);
		this.panelGfx.setVisible(false);

		this.angleLabel = scene.add.text(panelX + 12, panelY + 8, "ANGLE", {
			fontSize: "10px",
			color: "#aab2c8",
			fontStyle: "bold",
		});
		this.angleLabel.setDepth(51);
		this.angleLabel.setScrollFactor(0);
		this.angleLabel.setVisible(false);

		this.angleValue = scene.add.text(panelX + 12, panelY + 20, "45\u00B0", {
			fontSize: "28px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		this.angleValue.setDepth(51);
		this.angleValue.setScrollFactor(0);
		this.angleValue.setVisible(false);

		this.powerLabel = scene.add.text(
			panelX + PANEL_WIDTH / 2 + 8,
			panelY + 8,
			"POWER",
			{
				fontSize: "10px",
				color: "#aab2c8",
				fontStyle: "bold",
			},
		);
		this.powerLabel.setDepth(51);
		this.powerLabel.setScrollFactor(0);
		this.powerLabel.setVisible(false);

		this.powerValue = scene.add.text(
			panelX + PANEL_WIDTH / 2 + 8,
			panelY + 20,
			"50%",
			{
				fontSize: "28px",
				color: "#ffffff",
				fontStyle: "bold",
			},
		);
		this.powerValue.setDepth(51);
		this.powerValue.setScrollFactor(0);
		this.powerValue.setVisible(false);

		this.chargeBarGfx = scene.add.graphics();
		this.chargeBarGfx.setDepth(51);
		this.chargeBarGfx.setScrollFactor(0);
		this.chargeBarGfx.setVisible(false);

		this.inputHint = scene.add.text(
			panelX + PANEL_WIDTH / 2,
			panelY + PANEL_HEIGHT - 12,
			"[0-9] angle  |  SPACE charge  |  ENTER fire",
			{
				fontSize: "9px",
				color: "#667799",
				fontStyle: "bold",
			},
		);
		this.inputHint.setOrigin(0.5, 1);
		this.inputHint.setDepth(51);
		this.inputHint.setScrollFactor(0);
		this.inputHint.setVisible(false);

		// Trajectory preview (world-space)
		this.trajectoryGfx = scene.add.graphics();
		this.trajectoryGfx.setDepth(10);
		this.trajectoryGfx.setVisible(false);

		// --- Keyboard bindings ---
		if (!scene.input.keyboard) return; // 터치 전용 디바이스 안전 가드
		const kb = scene.input.keyboard;
		this.keys = {
			up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
			down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
			left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
			right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
			shift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
			space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
			enter: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
			f: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
			w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
			e: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
			num0: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO),
			num1: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
			num2: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
			num3: kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
			num4: kb.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
			num5: kb.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE),
			num6: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SIX),
			num7: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SEVEN),
			num8: kb.addKey(Phaser.Input.Keyboard.KeyCodes.EIGHT),
			num9: kb.addKey(Phaser.Input.Keyboard.KeyCodes.NINE),
		};

		// Arrow / adjust key listeners (JustDown for discrete steps)
		kb.on("keydown", this.onKeyDown, this);
	}

	// ─── Public API ───────────────────────────────────────────

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) {
			this.isCharging = false;
			this.chargeDirection = 1;
			this.clearInputBuffer();
			this.hideHUD();
		} else {
			this.drawHUD();
		}
	}

	setActiveTank(tank: AimTank | null): void {
		this.activeTank = tank;
		if (tank) {
			// Initialise angle to current tank angle, clamped
			this.angle = Phaser.Math.Clamp(
				this.angle,
				tank.typeDef.angleMin,
				tank.typeDef.angleMax,
			);
			tank.setAngle(this.angle);
		}
		if (this.enabled) {
			this.drawHUD();
		}
	}

	getCurrentAngle(): number {
		return this.angle;
	}

	getCurrentPower(): number {
		return this.power;
	}

	/**
	 * Call every frame. Handles space-bar power charging.
	 * @param delta Frame delta in milliseconds
	 */
	update(delta: number): void {
		if (!this.enabled || !this.activeTank) return;

		// Space-bar charging (ping-pong between MIN and MAX power)
		if (this.keys.space.isDown) {
			if (!this.isCharging) {
				this.isCharging = true;
				this.chargeDirection = 1;
			}
			this.power += CHARGE_SPEED * delta * this.chargeDirection;

			if (this.power >= CONFIG.MAX_POWER) {
				this.power = CONFIG.MAX_POWER;
				this.chargeDirection = -1;
			} else if (this.power <= CONFIG.MIN_POWER) {
				this.power = CONFIG.MIN_POWER;
				this.chargeDirection = 1;
			}

			this.drawHUD();
		} else if (this.isCharging) {
			// Released space bar — stop charging, keep current power
			this.isCharging = false;
		}
	}

	destroy(): void {
		this.clearInputBuffer();
		this.scene.input.keyboard?.off("keydown", this.onKeyDown, this);

		// Remove all added keys
		for (const key of Object.values(this.keys)) {
			this.scene.input.keyboard?.removeKey(key, true);
		}

		this.panelGfx.destroy();
		this.angleLabel.destroy();
		this.angleValue.destroy();
		this.powerLabel.destroy();
		this.powerValue.destroy();
		this.chargeBarGfx.destroy();
		this.inputHint.destroy();
		this.trajectoryGfx.destroy();
	}

	// ─── Keyboard handling ────────────────────────────────────

	private onKeyDown(event: KeyboardEvent): void {
		if (!this.enabled || !this.activeTank) return;

		const shift = event.shiftKey;
		const step = shift ? 5 : 1;

		// --- Numeric input (digits 0-9) ---
		if (event.key >= "0" && event.key <= "9") {
			this.handleDigitInput(event.key);
			return;
		}

		// --- Angle adjust: UP / DOWN ---
		if (event.code === "ArrowUp") {
			this.clearInputBuffer();
			this.adjustAngle(step);
			return;
		}
		if (event.code === "ArrowDown") {
			this.clearInputBuffer();
			this.adjustAngle(-step);
			return;
		}

		// --- Power adjust: LEFT / RIGHT or W / E ---
		if (event.code === "ArrowLeft") {
			this.clearInputBuffer();
			this.adjustPowerByPercent(-step);
			return;
		}
		if (event.code === "ArrowRight") {
			this.clearInputBuffer();
			this.adjustPowerByPercent(step);
			return;
		}
		if (event.code === "KeyW") {
			this.clearInputBuffer();
			this.adjustPowerByPercent(step);
			return;
		}
		if (event.code === "KeyE") {
			this.clearInputBuffer();
			this.adjustPowerByPercent(-step);
			return;
		}

		// --- Fire: ENTER or F ---
		if (event.code === "Enter" || event.code === "KeyF") {
			this.clearInputBuffer();
			this.fire();
			return;
		}
	}

	/**
	 * Handle a digit press for numeric angle/power input.
	 *
	 * Logic:
	 * - First digits go into angle buffer (up to 2 digits for 0-90).
	 * - If the user has typed a valid angle and types another digit within
	 *   the timeout, it is treated as a continuation; otherwise it starts fresh.
	 * - After the angle is accepted (timeout or 2 digits forming a valid angle),
	 *   the system applies it and resets.
	 */
	private handleDigitInput(digit: string): void {
		// Reset any pending timeout
		if (this.inputTimeout !== null) {
			clearTimeout(this.inputTimeout);
			this.inputTimeout = null;
		}

		if (this.inputMode === "none" || this.inputMode === "angle") {
			this.inputMode = "angle";
			this.angleBuffer += digit;

			const parsed = parseInt(this.angleBuffer, 10);

			// If 2 digits entered, or value already > 9 (can't add more),
			// or the value is such that no further digit could be valid (>9),
			// apply immediately.
			if (this.angleBuffer.length >= 2 || parsed > 9) {
				this.applyAngleBuffer();
				return;
			}

			// Single digit: wait briefly for a possible second digit
			this.inputTimeout = setTimeout(() => {
				this.applyAngleBuffer();
			}, 600);

			// Show intermediate angle in HUD
			this.updateAngleDisplay(`${this.angleBuffer}_`);
		}
	}

	private applyAngleBuffer(): void {
		if (this.inputTimeout !== null) {
			clearTimeout(this.inputTimeout);
			this.inputTimeout = null;
		}

		if (this.angleBuffer.length === 0) {
			this.inputMode = "none";
			return;
		}

		let parsed = parseInt(this.angleBuffer, 10);
		parsed = Phaser.Math.Clamp(parsed, 0, 90);

		if (this.activeTank) {
			parsed = Phaser.Math.Clamp(
				parsed,
				this.activeTank.typeDef.angleMin,
				this.activeTank.typeDef.angleMax,
			);
			this.activeTank.setAngle(parsed);
		}

		this.angle = parsed;
		this.angleBuffer = "";
		this.inputMode = "none";
		this.drawHUD();
	}

	private clearInputBuffer(): void {
		if (this.inputTimeout !== null) {
			clearTimeout(this.inputTimeout);
			this.inputTimeout = null;
		}
		if (this.angleBuffer.length > 0) {
			this.applyAngleBuffer();
		}
		this.angleBuffer = "";
		this.inputMode = "none";
	}

	// ─── Adjusters ────────────────────────────────────────────

	private adjustAngle(delta: number): void {
		if (!this.activeTank) return;

		const min = this.activeTank.typeDef.angleMin;
		const max = this.activeTank.typeDef.angleMax;
		this.angle = Phaser.Math.Clamp(this.angle + delta, min, max);
		this.activeTank.setAngle(this.angle);
		this.drawHUD();
	}

	/**
	 * Adjust power by a percentage step (1% or 5%).
	 * Percentage is relative to the MIN_POWER..MAX_POWER range.
	 */
	private adjustPowerByPercent(percentDelta: number): void {
		const range = CONFIG.MAX_POWER - CONFIG.MIN_POWER;
		const unitDelta = (percentDelta / 100) * range;
		this.power = Phaser.Math.Clamp(
			this.power + unitDelta,
			CONFIG.MIN_POWER,
			CONFIG.MAX_POWER,
		);
		this.drawHUD();
	}

	private fire(): void {
		if (!this.onFire || !this.activeTank) return;
		this.onFire({ angle: this.angle, power: this.power });
	}

	// ─── HUD Rendering ───────────────────────────────────────

	private hideHUD(): void {
		this.panelGfx.setVisible(false);
		this.panelGfx.clear();
		this.angleLabel.setVisible(false);
		this.angleValue.setVisible(false);
		this.powerLabel.setVisible(false);
		this.powerValue.setVisible(false);
		this.chargeBarGfx.setVisible(false);
		this.chargeBarGfx.clear();
		this.inputHint.setVisible(false);
		this.trajectoryGfx.setVisible(false);
		this.trajectoryGfx.clear();
	}

	private drawHUD(): void {
		if (!this.enabled) return;

		const panelX = (CONFIG.VIEW_WIDTH - PANEL_WIDTH) / 2;
		const panelY = CONFIG.PLAY_HEIGHT - PANEL_HEIGHT - 12;

		// --- Panel background ---
		this.panelGfx.clear();
		this.panelGfx.setVisible(true);
		this.panelGfx.fillStyle(COLORS.PANEL_BG, COLORS.PANEL_BG_ALPHA);
		this.panelGfx.fillRoundedRect(
			panelX,
			panelY,
			PANEL_WIDTH,
			PANEL_HEIGHT,
			PANEL_RADIUS,
		);
		this.panelGfx.lineStyle(1.5, COLORS.PANEL_BORDER, COLORS.PANEL_BORDER_ALPHA);
		this.panelGfx.strokeRoundedRect(
			panelX,
			panelY,
			PANEL_WIDTH,
			PANEL_HEIGHT,
			PANEL_RADIUS,
		);

		// Divider line between angle and power columns
		const midX = panelX + PANEL_WIDTH / 2;
		this.panelGfx.lineStyle(1, COLORS.PANEL_BORDER, 0.4);
		this.panelGfx.beginPath();
		this.panelGfx.moveTo(midX, panelY + 6);
		this.panelGfx.lineTo(midX, panelY + PANEL_HEIGHT - 22);
		this.panelGfx.strokePath();

		// --- Angle display ---
		this.angleLabel.setPosition(panelX + 12, panelY + 8);
		this.angleLabel.setVisible(true);

		this.updateAngleDisplay(`${Math.round(this.angle)}\u00B0`);

		// --- Power display (as percentage) ---
		this.powerLabel.setPosition(midX + 10, panelY + 8);
		this.powerLabel.setVisible(true);

		const powerRatio =
			(this.power - CONFIG.MIN_POWER) / (CONFIG.MAX_POWER - CONFIG.MIN_POWER);
		const powerPct = Math.round(powerRatio * 100);
		this.powerValue.setText(`${powerPct}%`);
		this.powerValue.setPosition(midX + 10, panelY + 20);
		this.powerValue.setVisible(true);

		// --- Power charge bar ---
		const barX = panelX + 16;
		const barY = panelY + PANEL_HEIGHT - 26;
		const barW = POWER_BAR_WIDTH;
		const barH = POWER_BAR_HEIGHT;

		this.chargeBarGfx.clear();
		this.chargeBarGfx.setVisible(true);

		// Track background
		this.chargeBarGfx.fillStyle(0x1a1e2e, 1);
		this.chargeBarGfx.fillRoundedRect(barX, barY, barW, barH, 5);

		// Fill
		const fillColor =
			powerRatio < 0.4
				? COLORS.HP_HIGH
				: powerRatio < 0.7
					? COLORS.HP_MID
					: COLORS.HP_LOW;
		const fillW = barW * powerRatio;
		if (fillW > 0) {
			this.chargeBarGfx.fillStyle(fillColor, 1);
			this.chargeBarGfx.fillRoundedRect(
				barX,
				barY,
				Math.max(fillW, barH),
				barH,
				5,
			);
		}

		// Charging indicator glow
		if (this.isCharging) {
			this.chargeBarGfx.lineStyle(2, 0xffffff, 0.5);
			this.chargeBarGfx.strokeRoundedRect(barX - 1, barY - 1, barW + 2, barH + 2, 6);
		}

		// --- Hint text ---
		this.inputHint.setPosition(panelX + PANEL_WIDTH / 2, panelY + PANEL_HEIGHT - 4);
		this.inputHint.setVisible(true);

		// --- Trajectory preview ---
		this.drawTrajectory();
	}

	private drawTrajectory(): void {
		this.trajectoryGfx.clear();
		this.trajectoryGfx.setVisible(true);

		if (!this.activeTank) return;

		const muzzle = this.activeTank.getMuzzlePosition();
		const worldAngle = this.activeTank.getWorldAngle();
		const rad = Phaser.Math.DegToRad(worldAngle);

		let vx = Math.cos(rad) * this.power;
		let vy = -Math.sin(rad) * this.power;
		let px = muzzle.x;
		let py = muzzle.y;

		// Draw aim line from muzzle
		const aimLen = 50;
		const endX = muzzle.x + Math.cos(rad) * aimLen;
		const endY = muzzle.y - Math.sin(rad) * aimLen;
		const segments = 6;
		for (let i = 0; i < segments; i++) {
			if (i % 2 === 0) {
				const t0 = i / segments;
				const t1 = (i + 1) / segments;
				this.trajectoryGfx.lineStyle(2, 0xffffff, 0.7);
				this.trajectoryGfx.beginPath();
				this.trajectoryGfx.moveTo(
					muzzle.x + (endX - muzzle.x) * t0,
					muzzle.y + (endY - muzzle.y) * t0,
				);
				this.trajectoryGfx.lineTo(
					muzzle.x + (endX - muzzle.x) * t1,
					muzzle.y + (endY - muzzle.y) * t1,
				);
				this.trajectoryGfx.strokePath();
			}
		}

		const windRes = this.activeTank ? 0 : 0; // Accessed via tank typeDef if available
		const totalSteps = 60;

		for (let i = 1; i <= totalSteps; i++) {
			vx += this.currentWind * 0.01 * (1 - windRes) * this.mapWindMul;
			vy += CONFIG.GRAVITY * this.mapGravity;
			px += vx;
			py += vy;

			if (px < -50 || px > CONFIG.WORLD_WIDTH + 50 || py > CONFIG.PLAY_HEIGHT + 50) break;

			const t = i / totalSteps;

			if (i % 3 === 0) {
				const alpha = 0.5 * (1 - t * 0.8);
				const size = 3 - t * 1.5;
				const colorT = Math.min(t * 2, 1);
				const r = 0xff;
				const g = Math.round(0xff - colorT * 0x66);
				const b = Math.round(0xff - colorT * 0xcc);
				const color = (r << 16) | (g << 8) | b;
				this.trajectoryGfx.fillStyle(color, alpha);
				this.trajectoryGfx.fillCircle(px, py, Math.max(size, 1.2));
			}
		}
	}

	private updateAngleDisplay(text: string): void {
		this.angleValue.setText(text);
		const panelX = (CONFIG.VIEW_WIDTH - PANEL_WIDTH) / 2;
		const panelY = CONFIG.PLAY_HEIGHT - PANEL_HEIGHT - 12;
		this.angleValue.setPosition(panelX + 12, panelY + 20);
		this.angleValue.setVisible(true);
	}
}
