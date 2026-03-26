import type Phaser from "phaser";
import { CONFIG } from "../config";

/**
 * 고급 이펙트 시스템
 * - 물 애니메이션 (섬/해변 맵)
 * - 승리 컨페티
 * - 슬로모션 킬캠
 * - 화면 전환 효과
 */

// ═══ Water Animation ═══

export class WaterEffect {
	private gfx: Phaser.GameObjects.Graphics;
	private waveOffset = 0;
	private waterLevel: number;
	private enabled: boolean;

	constructor(scene: Phaser.Scene, mapId: string) {
		this.gfx = scene.add.graphics();
		this.gfx.setDepth(0.5); // above terrain base, below tanks

		// Only show water on certain maps
		this.enabled = mapId === "islands";
		this.waterLevel = CONFIG.PLAY_HEIGHT * 0.88;
	}

	update(delta: number): void {
		if (!this.enabled) return;

		this.waveOffset += delta * 0.001;
		this.gfx.clear();

		const w = CONFIG.WORLD_WIDTH;

		// Deep water
		this.gfx.fillStyle(0x1565c0, 0.4);
		this.gfx.fillRect(0, this.waterLevel + 10, w, CONFIG.PLAY_HEIGHT - this.waterLevel);

		// Wave surface (multiple layers)
		for (let layer = 0; layer < 3; layer++) {
			const alpha = 0.15 - layer * 0.03;
			const yOffset = layer * 4;
			const speed = 1 + layer * 0.5;
			const amp = 3 + layer * 1.5;

			this.gfx.fillStyle(layer === 0 ? 0x42a5f5 : layer === 1 ? 0x64b5f6 : 0x90caf9, alpha);
			this.gfx.beginPath();
			this.gfx.moveTo(0, CONFIG.PLAY_HEIGHT);

			for (let x = 0; x <= w; x += 4) {
				const y = this.waterLevel + yOffset +
					Math.sin(x * 0.008 + this.waveOffset * speed) * amp +
					Math.sin(x * 0.003 + this.waveOffset * speed * 0.7) * (amp * 0.6);
				this.gfx.lineTo(x, y);
			}

			this.gfx.lineTo(w, CONFIG.PLAY_HEIGHT);
			this.gfx.closePath();
			this.gfx.fillPath();
		}

		// Foam/sparkle on wave crests
		this.gfx.fillStyle(0xffffff, 0.3);
		for (let x = 0; x < w; x += 60) {
			const phaseX = x + Math.sin(this.waveOffset * 2 + x * 0.01) * 10;
			const y = this.waterLevel + Math.sin(phaseX * 0.008 + this.waveOffset) * 3;
			const foamSize = 2 + Math.sin(this.waveOffset * 3 + x * 0.02) * 1;
			if (foamSize > 1.5) {
				this.gfx.fillCircle(phaseX, y, foamSize);
			}
		}
	}

	destroy(): void {
		this.gfx.destroy();
	}
}

// ═══ Confetti System ═══

interface ConfettiPiece {
	x: number;
	y: number;
	vx: number;
	vy: number;
	rotation: number;
	rotSpeed: number;
	color: number;
	size: number;
	alpha: number;
	shape: "rect" | "circle" | "triangle";
}

export class ConfettiEffect {
	private pieces: ConfettiPiece[] = [];
	private gfx: Phaser.GameObjects.Graphics;
	private active = false;

	constructor(scene: Phaser.Scene) {
		this.gfx = scene.add.graphics();
		this.gfx.setDepth(100);
		this.gfx.setScrollFactor(0);
	}

	explode(x: number, y: number, count = 80): void {
		this.active = true;
		const colors = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22, 0xff6b9d, 0x00d2d3];
		const shapes: ConfettiPiece["shape"][] = ["rect", "circle", "triangle"];

		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 2 + Math.random() * 8;
			this.pieces.push({
				x,
				y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed - 5, // upward bias
				rotation: Math.random() * Math.PI * 2,
				rotSpeed: (Math.random() - 0.5) * 0.3,
				color: colors[Math.floor(Math.random() * colors.length)],
				size: 3 + Math.random() * 5,
				alpha: 1,
				shape: shapes[Math.floor(Math.random() * shapes.length)],
			});
		}
	}

	/** 화면 상단에서 넓게 쏟아지는 컨페티 */
	shower(count = 120): void {
		this.active = true;
		const colors = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0xe67e22, 0xff6b9d, 0x00d2d3];
		const shapes: ConfettiPiece["shape"][] = ["rect", "circle", "triangle"];

		for (let i = 0; i < count; i++) {
			this.pieces.push({
				x: Math.random() * CONFIG.VIEW_WIDTH,
				y: -20 - Math.random() * 100,
				vx: (Math.random() - 0.5) * 3,
				vy: 1 + Math.random() * 3,
				rotation: Math.random() * Math.PI * 2,
				rotSpeed: (Math.random() - 0.5) * 0.2,
				color: colors[Math.floor(Math.random() * colors.length)],
				size: 3 + Math.random() * 6,
				alpha: 0.9,
				shape: shapes[Math.floor(Math.random() * shapes.length)],
			});
		}
	}

	update(delta: number): void {
		if (!this.active || this.pieces.length === 0) return;

		const dt = delta / 16;
		this.gfx.clear();

		for (const p of this.pieces) {
			p.vy += 0.08 * dt; // gravity
			p.vx *= 0.99; // air resistance
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.rotation += p.rotSpeed * dt;
			p.alpha -= 0.003 * dt;

			// Sway
			p.x += Math.sin(p.y * 0.02 + p.rotation) * 0.3;

			if (p.alpha <= 0) continue;

			this.gfx.fillStyle(p.color, p.alpha);
			switch (p.shape) {
				case "rect":
					this.gfx.save();
					this.gfx.fillRect(
						p.x - p.size / 2,
						p.y - p.size / 4,
						p.size,
						p.size / 2,
					);
					break;
				case "circle":
					this.gfx.fillCircle(p.x, p.y, p.size / 2);
					break;
				case "triangle":
					this.gfx.fillTriangle(
						p.x, p.y - p.size / 2,
						p.x - p.size / 2, p.y + p.size / 2,
						p.x + p.size / 2, p.y + p.size / 2,
					);
					break;
			}
		}

		this.pieces = this.pieces.filter((p) => p.alpha > 0 && p.y < CONFIG.PLAY_HEIGHT + 50);

		if (this.pieces.length === 0) {
			this.active = false;
		}
	}

	destroy(): void {
		this.gfx.destroy();
		this.pieces = [];
	}
}

// ═══ Screen Flash ═══

export function screenFlash(scene: Phaser.Scene, color = 0xffffff, duration = 150, alpha = 0.3): void {
	const flash = scene.add.graphics();
	flash.setDepth(150);
	flash.setScrollFactor(0);
	flash.fillStyle(color, alpha);
	flash.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT);
	scene.tweens.add({
		targets: flash,
		alpha: 0,
		duration,
		ease: "Power2",
		onComplete: () => flash.destroy(),
	});
}

// ═══ Slow Motion ═══

export function slowMotionKillCam(scene: Phaser.Scene, x: number, y: number, callback: () => void): void {
	// Zoom to impact point
	scene.cameras.main.stopFollow();

	// Slow down time
	scene.time.timeScale = 0.3;

	// Zoom in
	scene.cameras.main.zoomTo(1.5, 800, "Sine.easeInOut");
	scene.cameras.main.pan(x, y - 30, 800, "Sine.easeInOut");

	// Screen flash
	screenFlash(scene, 0xffffff, 300, 0.5);

	// Restore after delay
	scene.time.delayedCall(1500 / 0.3, () => {
		scene.time.timeScale = 1;
		scene.cameras.main.zoomTo(1, 600, "Sine.easeInOut");
		scene.time.delayedCall(600, callback);
	});
}

// ═══ Scene Transition ═══

export function fadeTransition(scene: Phaser.Scene, duration = 500): Promise<void> {
	return new Promise((resolve) => {
		const overlay = scene.add.graphics();
		overlay.setDepth(999);
		overlay.setScrollFactor(0);
		overlay.fillStyle(0x000000, 1);
		overlay.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT);
		overlay.setAlpha(0);

		scene.tweens.add({
			targets: overlay,
			alpha: 1,
			duration,
			ease: "Power2",
			onComplete: () => {
				resolve();
				// Fade back in
				scene.tweens.add({
					targets: overlay,
					alpha: 0,
					duration,
					delay: 100,
					ease: "Power2",
					onComplete: () => overlay.destroy(),
				});
			},
		});
	});
}

// ═══ Damage Number with Style ═══

export function showStyledDamageNumber(
	scene: Phaser.Scene,
	x: number,
	y: number,
	damage: number,
	isCritical: boolean,
): void {
	const fontSize = isCritical ? "28px" : "20px";
	const color = isCritical ? "#ff0000" : "#ff4444";
	const prefix = isCritical ? "💥 " : "";

	const txt = scene.add.text(x, y - 25, `${prefix}-${damage}`, {
		fontSize,
		color,
		stroke: "#000000",
		strokeThickness: isCritical ? 4 : 3,
		fontStyle: "bold",
	});
	txt.setOrigin(0.5);
	txt.setDepth(15);

	if (isCritical) {
		txt.setScale(1.5);
		scene.tweens.add({
			targets: txt,
			scaleX: 1,
			scaleY: 1,
			duration: 200,
			ease: "Back.easeOut",
		});
	}

	scene.tweens.add({
		targets: txt,
		y: txt.y - 50,
		alpha: 0,
		duration: isCritical ? 1200 : 800,
		ease: "Power2",
		onComplete: () => txt.destroy(),
	});
}
