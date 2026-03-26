import Phaser from "phaser";
import { CONFIG } from "../config";
import type { Tank } from "../objects/Tank";

export interface AimData {
	angle: number;
	power: number;
}

const AIM_LINE_LENGTH = 60;
const POWER_BAR_WIDTH = 280;
const POWER_BAR_HEIGHT = 10;
const POWER_BAR_Y = 540;

const PANEL_BG = 0x0a0e17;
const PANEL_BG_ALPHA = 0.75;
const PANEL_BORDER = 0x2a3a5c;
const PANEL_BORDER_ALPHA = 0.6;

/** 조준 가능 반경 (탱크 중심 기준 월드 좌표) */
const AIM_RADIUS = 140;

export class InputHandler {
	blocked = false;
	private isDragging = false;
	private isPanning = false;
	private startPoint: Phaser.Math.Vector2 | null = null;
	private panStartScroll: Phaser.Math.Vector2 | null = null;
	private aimLine: Phaser.GameObjects.Graphics;
	private dragGfx: Phaser.GameObjects.Graphics;
	private aimZoneGfx: Phaser.GameObjects.Graphics;
	private angleText: Phaser.GameObjects.Text;
	private angleBg: Phaser.GameObjects.Graphics;
	private powerBarGfx: Phaser.GameObjects.Graphics;
	private powerLabel: Phaser.GameObjects.Text;
	private powerPercent: Phaser.GameObjects.Text;
	private currentAim: AimData = { angle: 45, power: 0 };
	private enabled = true;
	private scene: Phaser.Scene;
	/** 조준 안내 텍스트 (세션 내 최초 1회만 표시) */
	private hintText: Phaser.GameObjects.Text | null = null;
	private static hasAimedEver = false;

	activeTank: Tank | null = null;
	maxPower: number = CONFIG.MAX_POWER;
	currentWind = 0;
	/** 맵 중력/바람 배율 (궤적 미리보기용) */
	mapGravity = 1.0;
	mapWindMul = 1.0;

	onFire: ((aim: AimData) => void) | null = null;

	constructor(scene: Phaser.Scene) {
		this.scene = scene;

		this.dragGfx = scene.add.graphics();
		this.dragGfx.setDepth(9);

		this.aimLine = scene.add.graphics();
		this.aimLine.setDepth(10);

		// 조준 영역 표시 (탱크 주변 원)
		this.aimZoneGfx = scene.add.graphics();
		this.aimZoneGfx.setDepth(1);

		this.angleBg = scene.add.graphics();
		this.angleBg.setDepth(10);
		this.angleBg.setVisible(false);

		this.angleText = scene.add.text(0, 0, "", {
			fontSize: "15px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		this.angleText.setDepth(10);
		this.angleText.setVisible(false);

		this.powerBarGfx = scene.add.graphics();
		this.powerBarGfx.setDepth(10);
		this.powerBarGfx.setScrollFactor(0);
		this.powerBarGfx.setVisible(false);

		this.powerLabel = scene.add.text(0, 0, "POWER", {
			fontSize: "11px",
			color: "#aab2c8",
			fontStyle: "bold",
		});
		this.powerLabel.setDepth(10);
		this.powerLabel.setScrollFactor(0);
		this.powerLabel.setVisible(false);

		this.powerPercent = scene.add.text(0, 0, "0%", {
			fontSize: "16px",
			color: "#ffffff",
			fontStyle: "bold",
		});
		this.powerPercent.setDepth(10);
		this.powerPercent.setScrollFactor(0);
		this.powerPercent.setVisible(false);

		scene.input.on("pointerdown", this.onPointerDown, this);
		scene.input.on("pointermove", this.onPointerMove, this);
		scene.input.on("pointerup", this.onPointerUp, this);
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) {
			this.isDragging = false;
			this.isPanning = false;
			this.hideUI();
			this.aimZoneGfx.clear();
			// 힌트 텍스트 숨기기 (다음 활성화 시 재표시)
			if (this.hintText) {
				this.hintText.setVisible(false);
			}
		} else {
			this.drawAimZone();
		}
	}

	/** 조준 영역 원 표시 */
	private drawAimZone(): void {
		this.aimZoneGfx.clear();
		if (!this.activeTank) return;
		const zx = this.activeTank.x;
		const zy = this.activeTank.y - 10;
		this.aimZoneGfx.lineStyle(1.5, 0xffffff, 0.15);
		this.aimZoneGfx.strokeCircle(zx, zy, AIM_RADIUS);
		this.aimZoneGfx.fillStyle(0xffffff, 0.03);
		this.aimZoneGfx.fillCircle(zx, zy, AIM_RADIUS);

		// 최초 안내 텍스트
		if (!InputHandler.hasAimedEver) {
			if (!this.hintText) {
				this.hintText = this.scene.add.text(zx, zy - AIM_RADIUS + 20, "여기서 드래그하여 조준", {
					fontSize: "13px",
					color: "#ffffff",
					stroke: "#000000",
					strokeThickness: 2,
				});
				this.hintText.setOrigin(0.5);
				this.hintText.setDepth(11);
				this.hintText.setAlpha(0.7);
				this.scene.tweens.add({
					targets: this.hintText,
					alpha: 0.3,
					duration: 1000,
					yoyo: true,
					repeat: -1,
					ease: "Sine.easeInOut",
				});
			} else {
				this.hintText.setPosition(zx, zy - AIM_RADIUS + 20);
				this.hintText.setVisible(true);
			}
		}
	}

	private dismissHint(): void {
		if (this.hintText) {
			this.scene.tweens.killTweensOf(this.hintText);
			this.scene.tweens.add({
				targets: this.hintText,
				alpha: 0,
				duration: 300,
				onComplete: () => {
					this.hintText?.destroy();
					this.hintText = null;
				},
			});
		}
		InputHandler.hasAimedEver = true;
	}

	private hideUI(): void {
		this.aimLine.clear();
		this.dragGfx.clear();
		this.angleText.setVisible(false);
		this.angleBg.setVisible(false);
		this.angleBg.clear();
		this.powerBarGfx.setVisible(false);
		this.powerBarGfx.clear();
		this.powerLabel.setVisible(false);
		this.powerPercent.setVisible(false);
	}

	/** 포인터가 조준 영역 안인지 확인 */
	private isInAimZone(worldX: number, worldY: number): boolean {
		if (!this.activeTank) return false;
		const dx = worldX - this.activeTank.x;
		const dy = worldY - (this.activeTank.y - 10);
		return dx * dx + dy * dy <= AIM_RADIUS * AIM_RADIUS;
	}

	private onPointerDown(pointer: Phaser.Input.Pointer): void {
		if (!this.enabled || this.blocked) return;

		if (this.isInAimZone(pointer.worldX, pointer.worldY)) {
			// 조준 모드
			this.isDragging = true;
			this.isPanning = false;
			this.startPoint = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
			this.dismissHint();
		} else {
			// 패닝 모드
			this.isPanning = true;
			this.isDragging = false;
			this.startPoint = new Phaser.Math.Vector2(pointer.x, pointer.y);
			this.panStartScroll = new Phaser.Math.Vector2(
				this.scene.cameras.main.scrollX,
				this.scene.cameras.main.scrollY,
			);
		}
	}

	private onPointerMove(pointer: Phaser.Input.Pointer): void {
		if (!this.enabled) return;

		// 패닝
		if (this.isPanning && this.startPoint && this.panStartScroll) {
			const dx = this.startPoint.x - pointer.x;
			const dy = this.startPoint.y - pointer.y;
			this.scene.cameras.main.scrollX = this.panStartScroll.x + dx;
			this.scene.cameras.main.scrollY = this.panStartScroll.y + dy;
			return;
		}

		// 조준
		if (!this.isDragging || !this.startPoint || !this.activeTank) return;

		const dx = this.startPoint.x - pointer.worldX;
		const dy = this.startPoint.y - pointer.worldY;

		const distance = Math.sqrt(dx * dx + dy * dy);
		const power = Phaser.Math.Clamp(
			distance / 7,
			CONFIG.MIN_POWER,
			this.maxPower,
		);

		const angleMin = this.activeTank?.typeDef.angleMin ?? 0;
		const angleMax = this.activeTank?.typeDef.angleMax ?? 90;
		const upward = Math.max(0, -dy);
		const horizontal = Math.abs(dx);
		const clampedAngle = Phaser.Math.Clamp(
			Phaser.Math.RadToDeg(Math.atan2(upward, horizontal)),
			angleMin,
			angleMax,
		);

		this.currentAim = { angle: clampedAngle, power };

		this.activeTank.setAngle(clampedAngle);

		const muzzle = this.activeTank.getMuzzlePosition();
		const worldAngle = this.activeTank.getWorldAngle();
		const rad = Phaser.Math.DegToRad(worldAngle);
		const endX = muzzle.x + Math.cos(rad) * AIM_LINE_LENGTH;
		const endY = muzzle.y - Math.sin(rad) * AIM_LINE_LENGTH;

		this.aimLine.clear();
		const segments = 8;
		for (let i = 0; i < segments; i++) {
			if (i % 2 === 0) {
				const t0 = i / segments;
				const t1 = (i + 1) / segments;
				this.aimLine.lineStyle(2, 0xffffff, 0.8);
				this.aimLine.beginPath();
				this.aimLine.moveTo(
					muzzle.x + (endX - muzzle.x) * t0,
					muzzle.y + (endY - muzzle.y) * t0,
				);
				this.aimLine.lineTo(
					muzzle.x + (endX - muzzle.x) * t1,
					muzzle.y + (endY - muzzle.y) * t1,
				);
				this.aimLine.strokePath();
			}
		}
		this.drawArrowHead(endX, endY, rad);
		this.drawTrajectoryDots(muzzle, worldAngle, power);
		this.drawAnglePill(endX + 12, endY - 8, clampedAngle);
		this.drawDragIndicator(pointer.worldX, pointer.worldY);
		this.drawPowerBar(power);
	}

	private drawTrajectoryDots(
		muzzle: { x: number; y: number },
		worldAngle: number,
		power: number,
	): void {
		const rad = Phaser.Math.DegToRad(worldAngle);
		let vx = Math.cos(rad) * power;
		let vy = -Math.sin(rad) * power;
		let px = muzzle.x;
		let py = muzzle.y;
		const wind = this.currentWind;
		const windRes = this.activeTank?.typeDef.windResistance ?? 0;

		const steps = 22;
		const dotCount = 8;
		const interval = Math.floor(steps / dotCount);

		for (let i = 1; i <= steps; i++) {
			vx += wind * 0.01 * (1 - windRes) * this.mapWindMul;
			vy += CONFIG.GRAVITY * this.mapGravity;
			px += vx;
			py += vy;

			if (i % interval === 0) {
				const alpha = 0.6 - (i / steps) * 0.4;
				this.aimLine.fillStyle(0xffffff, alpha);
				this.aimLine.fillCircle(px, py, 3);
			}
		}
	}

	private drawDragIndicator(curX: number, curY: number): void {
		if (!this.startPoint) return;
		const sx = this.startPoint.x;
		const sy = this.startPoint.y;

		this.dragGfx.clear();

		this.dragGfx.lineStyle(1.5, 0xffffff, 0.25);
		this.dragGfx.beginPath();
		this.dragGfx.moveTo(sx, sy);
		this.dragGfx.lineTo(curX, curY);
		this.dragGfx.strokePath();

		this.dragGfx.lineStyle(1.5, 0xffffff, 0.5);
		this.dragGfx.strokeCircle(sx, sy, 10);
		this.dragGfx.beginPath();
		this.dragGfx.moveTo(sx - 5, sy);
		this.dragGfx.lineTo(sx + 5, sy);
		this.dragGfx.moveTo(sx, sy - 5);
		this.dragGfx.lineTo(sx, sy + 5);
		this.dragGfx.strokePath();

		this.dragGfx.fillStyle(0xffffff, 0.4);
		this.dragGfx.fillCircle(curX, curY, 6);
		this.dragGfx.lineStyle(1.5, 0xffffff, 0.6);
		this.dragGfx.strokeCircle(curX, curY, 6);
	}

	private drawArrowHead(x: number, y: number, rad: number): void {
		const size = 8;
		const a1 = rad + Math.PI * 0.8;
		const a2 = rad - Math.PI * 0.8;
		this.aimLine.fillStyle(0xffffff, 0.8);
		this.aimLine.fillTriangle(
			x, y,
			x + Math.cos(a1) * size, y - Math.sin(a1) * size,
			x + Math.cos(a2) * size, y - Math.sin(a2) * size,
		);
	}

	private drawAnglePill(x: number, y: number, angle: number): void {
		const text = `${Math.round(angle)}°`;
		this.angleText.setText(text);
		this.angleText.setPosition(x + 10, y);
		this.angleText.setVisible(true);

		const textWidth = this.angleText.width;
		const pillW = textWidth + 16;
		const pillH = 24;
		const pillX = x + 10 - 8;
		const pillY = y - 4;

		this.angleBg.clear();
		this.angleBg.setVisible(true);
		this.angleBg.fillStyle(PANEL_BG, PANEL_BG_ALPHA);
		this.angleBg.fillRoundedRect(pillX, pillY, pillW, pillH, 12);
		this.angleBg.lineStyle(1, PANEL_BORDER, PANEL_BORDER_ALPHA);
		this.angleBg.strokeRoundedRect(pillX, pillY, pillW, pillH, 12);
	}

	private drawPowerBar(power: number): void {
		const panelW = POWER_BAR_WIDTH + 16;
		const panelH = 40;
		const panelX = (CONFIG.VIEW_WIDTH - panelW) / 2;
		const panelY = POWER_BAR_Y - 8;
		const barX = panelX + 8;
		const barY = POWER_BAR_Y + 16;
		const ratio =
			(power - CONFIG.MIN_POWER) / (this.maxPower - CONFIG.MIN_POWER);

		this.powerBarGfx.setVisible(true);
		this.powerBarGfx.clear();

		this.powerBarGfx.fillStyle(PANEL_BG, PANEL_BG_ALPHA);
		this.powerBarGfx.fillRoundedRect(panelX, panelY, panelW, panelH, 8);
		this.powerBarGfx.lineStyle(1, PANEL_BORDER, PANEL_BORDER_ALPHA);
		this.powerBarGfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 8);

		this.powerBarGfx.fillStyle(0x1a1e2e, 1);
		this.powerBarGfx.fillRoundedRect(barX, barY, POWER_BAR_WIDTH, POWER_BAR_HEIGHT, 5);

		const color = ratio < 0.4 ? 0x2ecc71 : ratio < 0.7 ? 0xf1c40f : 0xe74c3c;
		const fillWidth = POWER_BAR_WIDTH * ratio;
		if (fillWidth > 0) {
			this.powerBarGfx.fillStyle(color, 1);
			this.powerBarGfx.fillRoundedRect(barX, barY, Math.max(fillWidth, POWER_BAR_HEIGHT), POWER_BAR_HEIGHT, 5);
		}

		this.powerLabel.setVisible(true);
		this.powerLabel.setPosition(barX, panelY + 4);

		const pct = `${Math.round(ratio * 100)}%`;
		this.powerPercent.setVisible(true);
		this.powerPercent.setText(pct);
		this.powerPercent.setPosition(barX + POWER_BAR_WIDTH, panelY + 2);
		this.powerPercent.setOrigin(1, 0);
	}

	private onPointerUp(): void {
		if (this.isPanning) {
			this.isPanning = false;
			this.startPoint = null;
			this.panStartScroll = null;
			return;
		}

		if (!this.enabled || !this.isDragging) return;

		this.isDragging = false;
		this.hideUI();

		if (this.currentAim.power >= CONFIG.MIN_POWER && this.onFire) {
			this.onFire(this.currentAim);
		}

		this.startPoint = null;
	}
}
