import Phaser from "phaser";

/**
 * Enhanced combat feedback system:
 * - Critical hit chance (10%) with 1.5x damage and special FX
 * - Floating damage numbers with size/color based on severity
 * - Hit markers at impact point
 * - Kill streak announcements
 */

/** Roll for critical hit. Returns true ~10% of the time. */
export function rollCriticalHit(): boolean {
	return Math.random() < 0.10;
}

/** Critical hit damage multiplier */
export const CRIT_MULTIPLIER = 1.5;

/**
 * Show floating damage number with visual emphasis based on severity.
 */
export function showDamageNumber(
	scene: Phaser.Scene,
	x: number,
	y: number,
	damage: number,
	options?: {
		isCritical?: boolean;
		isSelfDamage?: boolean;
		isHealing?: boolean;
	},
): void {
	const isCrit = options?.isCritical ?? false;
	const isSelf = options?.isSelfDamage ?? false;
	const isHeal = options?.isHealing ?? false;

	// Determine appearance based on damage type
	let text: string;
	let color: string;
	let fontSize: string;
	let strokeColor = "#000000";

	if (isHeal) {
		text = `+${damage}`;
		color = "#2ecc71";
		fontSize = "18px";
	} else if (isSelf) {
		text = `-${damage}`;
		color = "#ff9999";
		fontSize = "14px";
	} else if (isCrit) {
		text = `💥 ${damage}`;
		color = "#ff3300";
		fontSize = "28px";
		strokeColor = "#ffaa00";
	} else if (damage >= 50) {
		text = `${damage}`;
		color = "#ff4444";
		fontSize = "24px";
	} else if (damage >= 30) {
		text = `${damage}`;
		color = "#ff8844";
		fontSize = "20px";
	} else if (damage >= 15) {
		text = `${damage}`;
		color = "#ffcc44";
		fontSize = "16px";
	} else {
		text = `${damage}`;
		color = "#ffffff";
		fontSize = "14px";
	}

	// Random horizontal offset so stacked numbers don't overlap
	const offsetX = Phaser.Math.Between(-15, 15);

	const txt = scene.add.text(x + offsetX, y - 20, text, {
		fontSize,
		color,
		fontStyle: "bold",
		stroke: strokeColor,
		strokeThickness: isCrit ? 4 : 3,
	});
	txt.setOrigin(0.5);
	txt.setDepth(25);

	// Critical hit: scale bounce + longer duration
	if (isCrit) {
		txt.setScale(0.5);
		scene.tweens.add({
			targets: txt,
			scaleX: 1.2,
			scaleY: 1.2,
			duration: 150,
			ease: "Back.easeOut",
			onComplete: () => {
				scene.tweens.add({
					targets: txt,
					y: txt.y - 60,
					alpha: 0,
					scaleX: 0.8,
					scaleY: 0.8,
					duration: 1200,
					ease: "Power2",
					onComplete: () => txt.destroy(),
				});
			},
		});
	} else {
		scene.tweens.add({
			targets: txt,
			y: txt.y - 40 - Math.random() * 15,
			alpha: 0,
			duration: 900,
			ease: "Power2",
			onComplete: () => txt.destroy(),
		});
	}
}

/**
 * Show a hit marker (crosshair flash) at impact point.
 */
export function showHitMarker(scene: Phaser.Scene, x: number, y: number, isCrit: boolean): void {
	const gfx = scene.add.graphics();
	gfx.setDepth(20);

	const color = isCrit ? 0xff3300 : 0xffffff;
	const size = isCrit ? 18 : 12;
	const thickness = isCrit ? 3 : 2;

	gfx.lineStyle(thickness, color, 1);
	// X shape
	gfx.beginPath();
	gfx.moveTo(x - size, y - size);
	gfx.lineTo(x + size, y + size);
	gfx.moveTo(x + size, y - size);
	gfx.lineTo(x - size, y + size);
	gfx.strokePath();

	if (isCrit) {
		// Extra ring for critical hits
		gfx.lineStyle(2, 0xffaa00, 0.6);
		gfx.strokeCircle(x, y, size + 5);
	}

	scene.tweens.add({
		targets: gfx,
		alpha: 0,
		scaleX: isCrit ? 1.8 : 1.4,
		scaleY: isCrit ? 1.8 : 1.4,
		duration: isCrit ? 500 : 300,
		ease: "Power2",
		onComplete: () => gfx.destroy(),
	});
}

/**
 * Show critical hit announcement banner.
 */
export function showCriticalBanner(scene: Phaser.Scene): void {
	const txt = scene.add.text(
		scene.cameras.main.scrollX + scene.cameras.main.width / 2,
		scene.cameras.main.scrollY + scene.cameras.main.height / 2 - 80,
		"CRITICAL HIT!",
		{
			fontSize: "32px",
			color: "#ff3300",
			fontStyle: "bold",
			stroke: "#ffaa00",
			strokeThickness: 4,
		},
	);
	txt.setOrigin(0.5);
	txt.setDepth(30);
	txt.setScale(0.3);

	scene.tweens.add({
		targets: txt,
		scaleX: 1.1,
		scaleY: 1.1,
		duration: 200,
		ease: "Back.easeOut",
		onComplete: () => {
			scene.tweens.add({
				targets: txt,
				scaleX: 1,
				scaleY: 1,
				duration: 100,
				onComplete: () => {
					scene.tweens.add({
						targets: txt,
						alpha: 0,
						y: txt.y - 30,
						delay: 600,
						duration: 400,
						onComplete: () => txt.destroy(),
					});
				},
			});
		},
	});
}

/**
 * Show kill streak / combo announcements.
 */
export function showComboAnnouncement(
	scene: Phaser.Scene,
	x: number,
	y: number,
	combo: number,
): void {
	if (combo < 2) return;

	const announcements: Record<number, { text: string; color: string; size: string }> = {
		2: { text: "DOUBLE HIT!", color: "#f1c40f", size: "16px" },
		3: { text: "TRIPLE HIT!", color: "#ff6600", size: "20px" },
		4: { text: "MEGA COMBO!", color: "#ff3300", size: "24px" },
		5: { text: "ULTRA COMBO!!", color: "#ff00ff", size: "28px" },
	};

	const ann = announcements[Math.min(combo, 5)];
	const txt = scene.add.text(x, y - 55, ann.text, {
		fontSize: ann.size,
		color: ann.color,
		fontStyle: "bold",
		stroke: "#000000",
		strokeThickness: 3,
	});
	txt.setOrigin(0.5);
	txt.setDepth(25);
	txt.setScale(0.5);

	scene.tweens.add({
		targets: txt,
		scaleX: 1,
		scaleY: 1,
		duration: 200,
		ease: "Back.easeOut",
		onComplete: () => {
			scene.tweens.add({
				targets: txt,
				y: txt.y - 40,
				alpha: 0,
				duration: 1200,
				ease: "Power2",
				onComplete: () => txt.destroy(),
			});
		},
	});
}

/**
 * Wind particle visualization - floating particles showing wind direction.
 */
export class WindParticles {
	private gfx: Phaser.GameObjects.Graphics;
	private particles: { x: number; y: number; speed: number; alpha: number; size: number }[] = [];

	constructor(scene: Phaser.Scene) {
		this.gfx = scene.add.graphics();
		this.gfx.setDepth(0.2);

		// Create initial particles
		for (let i = 0; i < 30; i++) {
			this.particles.push({
				x: Math.random() * 2600 - 100,
				y: Math.random() * 700 - 100,
				speed: 0.3 + Math.random() * 0.7,
				alpha: 0.05 + Math.random() * 0.15,
				size: 1 + Math.random() * 2,
			});
		}
	}

	update(delta: number, wind: number): void {
		this.gfx.clear();

		const dt = delta / 16;
		const absWind = Math.abs(wind);
		if (absWind < 0.2) return; // No particles for very low wind

		for (const p of this.particles) {
			// Move in wind direction with slight vertical drift
			p.x += wind * p.speed * 0.5 * dt;
			p.y += Math.sin(p.x * 0.01) * 0.2 * dt;

			// Wrap around
			const worldW = 2600;
			if (wind > 0 && p.x > worldW) p.x = -20;
			else if (wind < 0 && p.x < -20) p.x = worldW;
			if (p.y > 700) p.y = -10;
			else if (p.y < -10) p.y = 700;

			// Draw as small streaks in wind direction
			const streakLen = absWind * p.speed * 3;
			const alpha = p.alpha * Math.min(absWind / 2, 1);

			this.gfx.fillStyle(0xffffff, alpha);
			if (streakLen > 2) {
				// Horizontal streak
				this.gfx.fillRect(
					p.x - (wind > 0 ? streakLen : 0),
					p.y,
					streakLen,
					p.size * 0.5,
				);
			} else {
				this.gfx.fillCircle(p.x, p.y, p.size * 0.5);
			}
		}
	}

	destroy(): void {
		this.gfx.destroy();
	}
}
