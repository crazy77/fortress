import type Phaser from "phaser";
import { CONFIG } from "../config";

/**
 * 맵별 날씨/환경 파티클 시스템
 * 비, 눈, 모래폭풍, 화산재, 낙엽 등 분위기 연출
 */

export type WeatherType = "none" | "rain" | "snow" | "sandstorm" | "ash" | "leaves" | "fireflies";

interface WeatherParticle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	alpha: number;
	color: number;
	life: number;
	maxLife: number;
}

const WEATHER_CONFIGS: Record<WeatherType, {
	count: number;
	spawnRate: number;
	colors: number[];
	sizeRange: [number, number];
	speedY: [number, number];
	speedX: [number, number];
	alphaRange: [number, number];
	lifeRange: [number, number];
}> = {
	none: { count: 0, spawnRate: 0, colors: [], sizeRange: [0, 0], speedY: [0, 0], speedX: [0, 0], alphaRange: [0, 0], lifeRange: [0, 0] },
	rain: {
		count: 120,
		spawnRate: 8,
		colors: [0x6eb5ff, 0x87ceeb, 0x5dade2],
		sizeRange: [1, 2.5],
		speedY: [3, 6],
		speedX: [-0.5, 0.5],
		alphaRange: [0.3, 0.6],
		lifeRange: [60, 120],
	},
	snow: {
		count: 80,
		spawnRate: 4,
		colors: [0xffffff, 0xe8e8e8, 0xf0f0ff],
		sizeRange: [1.5, 4],
		speedY: [0.5, 1.5],
		speedX: [-0.8, 0.8],
		alphaRange: [0.5, 0.9],
		lifeRange: [200, 400],
	},
	sandstorm: {
		count: 100,
		spawnRate: 6,
		colors: [0xd4a574, 0xc19a6b, 0xe8c9a0, 0xb8860b],
		sizeRange: [1, 3],
		speedY: [0.3, 1],
		speedX: [2, 5],
		alphaRange: [0.2, 0.5],
		lifeRange: [80, 160],
	},
	ash: {
		count: 60,
		spawnRate: 3,
		colors: [0x555555, 0x777777, 0x999999, 0xff4400],
		sizeRange: [1, 3],
		speedY: [0.3, 1.2],
		speedX: [-0.3, 0.3],
		alphaRange: [0.3, 0.7],
		lifeRange: [120, 240],
	},
	leaves: {
		count: 30,
		spawnRate: 1,
		colors: [0x27ae60, 0x2ecc71, 0xf1c40f, 0xe67e22],
		sizeRange: [2, 4],
		speedY: [0.3, 0.8],
		speedX: [-1, 1],
		alphaRange: [0.5, 0.8],
		lifeRange: [200, 400],
	},
	fireflies: {
		count: 25,
		spawnRate: 1,
		colors: [0xf1c40f, 0xf9e784, 0x81d4fa],
		sizeRange: [1.5, 3],
		speedY: [-0.3, 0.3],
		speedX: [-0.3, 0.3],
		alphaRange: [0.3, 0.9],
		lifeRange: [200, 400],
	},
};

/** 맵 + 시간대별 날씨 결정 */
export function getWeatherForMap(mapId: string, timeOfDay: string): WeatherType {
	switch (mapId) {
		case "mountains": return timeOfDay === "night" ? "snow" : "rain";
		case "desert": return "sandstorm";
		case "volcano": return "ash";
		case "hills": return timeOfDay === "night" ? "fireflies" : "leaves";
		case "plains": return timeOfDay === "dusk" || timeOfDay === "dawn" ? "leaves" : "none";
		case "islands": return timeOfDay === "night" ? "fireflies" : "none";
		case "canyon": return "sandstorm";
		case "fortress": return timeOfDay === "night" ? "snow" : "none";
		default: return "none";
	}
}

export class WeatherSystem {
	private particles: WeatherParticle[] = [];
	private gfx: Phaser.GameObjects.Graphics;
	private type: WeatherType;
	private config: typeof WEATHER_CONFIGS.rain;
	private windInfluence = 0;
	private frameCount = 0;

	constructor(scene: Phaser.Scene, type: WeatherType) {
		this.type = type;
		this.config = WEATHER_CONFIGS[type];
		this.gfx = scene.add.graphics();
		this.gfx.setDepth(-0.5); // above sky, below terrain
		this.gfx.setScrollFactor(0.5); // parallax effect
	}

	setWind(wind: number): void {
		this.windInfluence = wind * 0.15;
	}

	update(delta: number): void {
		if (this.type === "none") return;

		this.frameCount++;
		const dt = delta / 16;

		// Spawn new particles
		if (this.particles.length < this.config.count && this.frameCount % Math.max(1, Math.round(4 / this.config.spawnRate)) === 0) {
			this.spawnParticle();
		}

		// Update particles
		for (const p of this.particles) {
			p.x += (p.vx + this.windInfluence) * dt;
			p.y += p.vy * dt;
			p.life--;

			// Fireflies wobble
			if (this.type === "fireflies") {
				p.x += Math.sin(this.frameCount * 0.05 + p.y * 0.01) * 0.3;
				p.y += Math.cos(this.frameCount * 0.03 + p.x * 0.01) * 0.2;
				p.alpha = 0.3 + Math.sin(this.frameCount * 0.08 + p.x * 0.02) * 0.4;
			}

			// Snow drifts
			if (this.type === "snow") {
				p.x += Math.sin(this.frameCount * 0.02 + p.y * 0.005) * 0.3;
			}

			// Leaves tumble
			if (this.type === "leaves") {
				p.x += Math.sin(this.frameCount * 0.03 + p.y * 0.01) * 0.5;
				p.size = this.config.sizeRange[0] + Math.sin(this.frameCount * 0.05 + p.x * 0.01) * 1;
			}

			// Fade near end of life
			if (p.life < 20) {
				p.alpha *= 0.95;
			}
		}

		// Remove dead particles
		this.particles = this.particles.filter(
			(p) => p.life > 0 && p.y < CONFIG.PLAY_HEIGHT + 20 && p.x > -50 && p.x < CONFIG.VIEW_WIDTH + 50,
		);

		// Render
		this.render();
	}

	private spawnParticle(): void {
		const cfg = this.config;
		const p: WeatherParticle = {
			x: Math.random() * (CONFIG.VIEW_WIDTH + 100) - 50,
			y: this.type === "fireflies" ? Math.random() * CONFIG.PLAY_HEIGHT * 0.6 : -10 - Math.random() * 30,
			vx: cfg.speedX[0] + Math.random() * (cfg.speedX[1] - cfg.speedX[0]),
			vy: cfg.speedY[0] + Math.random() * (cfg.speedY[1] - cfg.speedY[0]),
			size: cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]),
			alpha: cfg.alphaRange[0] + Math.random() * (cfg.alphaRange[1] - cfg.alphaRange[0]),
			color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
			life: cfg.lifeRange[0] + Math.floor(Math.random() * (cfg.lifeRange[1] - cfg.lifeRange[0])),
			maxLife: 0,
		};
		p.maxLife = p.life;
		this.particles.push(p);
	}

	private render(): void {
		this.gfx.clear();

		for (const p of this.particles) {
			if (this.type === "rain") {
				// Rain drops as short lines
				this.gfx.lineStyle(p.size * 0.5, p.color, p.alpha);
				this.gfx.beginPath();
				this.gfx.moveTo(p.x, p.y);
				this.gfx.lineTo(p.x + p.vx * 2, p.y + p.vy * 3);
				this.gfx.strokePath();
			} else if (this.type === "fireflies") {
				// Glow effect
				this.gfx.fillStyle(p.color, p.alpha * 0.3);
				this.gfx.fillCircle(p.x, p.y, p.size * 3);
				this.gfx.fillStyle(p.color, p.alpha);
				this.gfx.fillCircle(p.x, p.y, p.size);
			} else {
				this.gfx.fillStyle(p.color, p.alpha);
				this.gfx.fillCircle(p.x, p.y, p.size);
			}
		}
	}

	destroy(): void {
		this.gfx.destroy();
		this.particles = [];
	}
}
