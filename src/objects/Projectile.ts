import Phaser from "phaser";
import { CONFIG } from "../config";
import type { TankStyle } from "./TankDefs";
import type { WeaponDef } from "../systems/WeaponSystem";

export interface ProjectileOptions {
	radius?: number;
	/** 바람 저항도 (0=바람 100%, 1=바람 무시) */
	windResistance?: number;
	rangeMultiplier?: number;
	/** 맵 중력 배율 */
	gravityMul?: number;
	/** 맵 바람 배율 */
	windMul?: number;
	/** 탱크 스타일 (포탄 모양 결정) */
	tankStyle?: TankStyle;
	/** 탱크 메인 색상 */
	tankColor?: number;
	/** 발사 시점 확정 데미지 스탯 */
	resolvedDamage?: {
		explosionRadius: number;
		directDamage: number;
		splashDamage: number;
		splashRadius: number;
	};
}

/** 연기 꼬리 파티클 하나 */
interface SmokeParticle {
	x: number;
	y: number;
	alpha: number;
	size: number;
}

export class Projectile {
	x: number;
	y: number;
	vx: number;
	vy: number;
	alive: boolean = true;
	readonly gfx: Phaser.GameObjects.Graphics;
	readonly weapon: WeaponDef;
	private smokeGfx: Phaser.GameObjects.Graphics;
	private smokeTrail: SmokeParticle[] = [];
	private windResistance: number;
	private gravityMul: number;
	private windMul: number;
	private maxFlightFrames: number;
	private flightFrames = 0;
	private radius: number;
	private bouncesRemaining: number;
	private bounced = false;
	private tankStyle: TankStyle;
	private tankColor: number;
	/** 발사 시점에 확정된 데미지 스탯 */
	readonly resolvedDamage: {
		explosionRadius: number;
		directDamage: number;
		splashDamage: number;
		splashRadius: number;
	};

	constructor(
		private scene: Phaser.Scene,
		x: number,
		y: number,
		angle: number,
		power: number,
		weapon: WeaponDef,
		options?: ProjectileOptions,
	) {
		this.x = x;
		this.y = y;
		this.weapon = weapon;
		this.windResistance = options?.windResistance ?? 0;
		this.gravityMul = options?.gravityMul ?? 1.0;
		this.windMul = options?.windMul ?? 1.0;
		this.bouncesRemaining = weapon.bounceCount ?? 0;
		const rangeMultiplier = options?.rangeMultiplier ?? 1.0;
		this.maxFlightFrames = Math.round(450 * rangeMultiplier);
		this.radius = options?.radius ?? CONFIG.PROJECTILE_RADIUS;
		this.tankStyle = options?.tankStyle ?? "cannon";
		this.tankColor = options?.tankColor ?? 0x333333;
		this.resolvedDamage = options?.resolvedDamage ?? {
			explosionRadius: weapon.explosionRadius,
			directDamage: weapon.directDamage,
			splashDamage: weapon.splashDamage,
			splashRadius: weapon.splashRadius,
		};

		const rad = Phaser.Math.DegToRad(angle);
		this.vx = Math.cos(rad) * power;
		this.vy = -Math.sin(rad) * power;

		// 연기 꼬리 그래픽 (포탄 아래 렌더)
		this.smokeGfx = scene.add.graphics();
		this.smokeGfx.setDepth(4);

		// 포탄 그래픽
		this.gfx = scene.add.graphics();
		this.gfx.setDepth(5);
		this.drawProjectile();
		this.gfx.setPosition(x, y);
	}

	private drawProjectile(): void {
		this.gfx.clear();
		const r = this.radius;

		if (this.bouncesRemaining > 0 || this.bounced) {
			// 바운스탄 — 빛나는 오렌지 구체 + 별 모양 스파크
			this.gfx.fillStyle(0xffaa00, 0.3);
			this.gfx.fillCircle(0, 0, r + 4);
			this.gfx.fillStyle(0xff8800, 1);
			this.gfx.fillCircle(0, 0, r + 1);
			this.gfx.fillStyle(0xffcc00, 0.9);
			this.gfx.fillCircle(0, 0, r - 1);
			this.gfx.fillStyle(0xffffff, 0.6);
			this.gfx.fillCircle(-1, -1, r * 0.3);
			return;
		}

		switch (this.tankStyle) {
			case "cannon":
				// 클래식 철 포탄 — 둥근 폭탄 + 도화선 불꽃
				this.gfx.fillStyle(0x1a1a1a);
				this.gfx.fillCircle(0, 0, r + 0.5);
				this.gfx.fillStyle(0x333333);
				this.gfx.fillCircle(0, 0, r);
				// 금속 광택 하이라이트
				this.gfx.fillStyle(0x666666, 0.6);
				this.gfx.fillCircle(-r * 0.3, -r * 0.3, r * 0.4);
				this.gfx.fillStyle(0x888888, 0.3);
				this.gfx.fillCircle(-r * 0.2, -r * 0.2, r * 0.2);
				// 도화선 불꽃 (위쪽)
				this.gfx.fillStyle(0xff6600, 0.9);
				this.gfx.fillCircle(0, -r - 1, 2);
				this.gfx.fillStyle(0xffcc00, 0.7);
				this.gfx.fillCircle(0.5, -r - 2, 1.5);
				break;

			case "heavy":
				// 거대한 철갑탄 — 두꺼운 포탄 + 구리 띠
				this.gfx.fillStyle(0x1a3a1a);
				this.gfx.fillRect(-r - 1, -r * 0.7, r * 2 + 2, r * 1.4);
				// 탄두 (앞쪽 둥근)
				this.gfx.fillStyle(0x2d5a2d);
				this.gfx.fillCircle(r, 0, r * 0.7);
				// 구리 띠 (구동 밴드)
				this.gfx.fillStyle(0xcd7f32, 0.8);
				this.gfx.fillRect(-r * 0.3, -r * 0.8, r * 0.4, r * 1.6);
				// 금속 광택
				this.gfx.fillStyle(0x4a8a4a, 0.5);
				this.gfx.fillRect(-r, -r * 0.3, r * 2, r * 0.3);
				break;

			case "missile":
				// 정밀 유도 미사일 — 날렵한 형태 + 추진 불꽃
				// 본체
				this.gfx.fillStyle(0x2c3e50);
				this.gfx.fillRect(-r * 2.5, -r * 0.4, r * 5, r * 0.8);
				// 탄두 (빨간 뾰족)
				this.gfx.fillStyle(0xe74c3c);
				this.gfx.fillTriangle(r * 2.5, 0, r * 1.5, -r * 0.5, r * 1.5, r * 0.5);
				// 날개
				this.gfx.fillStyle(0x34495e);
				this.gfx.fillTriangle(-r * 2, 0, -r * 2.5, -r, -r * 1.5, 0);
				this.gfx.fillTriangle(-r * 2, 0, -r * 2.5, r, -r * 1.5, 0);
				// 추진 불꽃 (뒤쪽)
				this.gfx.fillStyle(0xff6600, 0.8);
				this.gfx.fillTriangle(-r * 2.5, 0, -r * 3.5, -r * 0.3, -r * 3.5, r * 0.3);
				this.gfx.fillStyle(0xffcc00, 0.6);
				this.gfx.fillTriangle(-r * 2.5, 0, -r * 3, -r * 0.15, -r * 3, r * 0.15);
				break;

			case "laser":
				// 에너지 구체 — 다중 글로우 레이어 + 렌즈 플레어
				this.gfx.fillStyle(0x00e5ff, 0.12);
				this.gfx.fillCircle(0, 0, r + 8);
				this.gfx.fillStyle(0x00e5ff, 0.2);
				this.gfx.fillCircle(0, 0, r + 5);
				this.gfx.fillStyle(0x00bcd4, 0.5);
				this.gfx.fillCircle(0, 0, r + 2);
				this.gfx.fillStyle(0x26c6da, 0.9);
				this.gfx.fillCircle(0, 0, r);
				// 중심 백색 코어
				this.gfx.fillStyle(0xffffff, 0.8);
				this.gfx.fillCircle(0, 0, r * 0.4);
				// 렌즈 플레어 (십자)
				this.gfx.fillStyle(0xffffff, 0.3);
				this.gfx.fillRect(-r - 4, -0.5, r * 2 + 8, 1);
				this.gfx.fillRect(-0.5, -r - 4, 1, r * 2 + 8);
				break;

			case "hover":
				// 플라즈마 에너지볼 — 회전하는 삼각 + 글로우
				this.gfx.fillStyle(0x9b59b6, 0.2);
				this.gfx.fillCircle(0, 0, r + 4);
				this.gfx.fillStyle(0x9b59b6, 0.8);
				this.gfx.fillTriangle(r + 2, 0, -r, -r, -r, r);
				this.gfx.fillStyle(0xc39bd3, 0.7);
				this.gfx.fillTriangle(r, 0, -r + 2, -r + 2, -r + 2, r - 2);
				// 중심 핵
				this.gfx.fillStyle(0xe1bee7, 0.9);
				this.gfx.fillCircle(0, 0, r * 0.35);
				// 에너지 꼬리
				this.gfx.fillStyle(0xba68c8, 0.4);
				this.gfx.fillCircle(-r - 1, 0, r * 0.5);
				this.gfx.fillStyle(0xce93d8, 0.2);
				this.gfx.fillCircle(-r - 3, 0, r * 0.3);
				break;

			case "catapult":
				// 거대한 바위 — 울퉁불퉁한 표면 + 이끼
				this.gfx.fillStyle(0x5d4037);
				this.gfx.fillCircle(0, 0, r + 2);
				this.gfx.fillStyle(0x6d4c41);
				this.gfx.fillCircle(0, 0, r + 1);
				// 바위 표면 디테일
				this.gfx.fillStyle(0x8d6e63, 0.8);
				this.gfx.fillCircle(-1, -1, r - 1);
				// 울퉁불퉁 (작은 돌기)
				this.gfx.fillStyle(0x4e342e, 0.6);
				this.gfx.fillCircle(r * 0.5, r * 0.3, r * 0.3);
				this.gfx.fillCircle(-r * 0.4, r * 0.5, r * 0.25);
				// 이끼 (녹색 점)
				this.gfx.fillStyle(0x558b2f, 0.4);
				this.gfx.fillCircle(-r * 0.5, -r * 0.2, r * 0.2);
				// 하이라이트
				this.gfx.fillStyle(0xa1887f, 0.5);
				this.gfx.fillCircle(-r * 0.3, -r * 0.4, r * 0.25);
				break;
		}
	}

	private getSmokeColor(): number {
		switch (this.tankStyle) {
			case "laser": return 0x80deea;
			case "hover": return 0xce93d8;
			case "missile": return 0xff8a65;
			case "heavy": return 0x666666;
			case "catapult": return 0x8d6e63;
			default: return 0x888888;
		}
	}

	update(wind: number): void {
		if (!this.alive) return;

		// 연기 꼬리 파티클 추가 (스타일별 특성)
		const trailAlpha = this.tankStyle === "laser" ? 0.7 : this.tankStyle === "hover" ? 0.6 : 0.45;
		const trailSize = this.tankStyle === "laser" ? this.radius * 0.8 : this.radius * 0.6 + Math.random() * 1.5;
		this.smokeTrail.push({
			x: this.x + (Math.random() - 0.5) * 2,
			y: this.y + (Math.random() - 0.5) * 2,
			alpha: trailAlpha,
			size: trailSize,
		});

		// 파티클 감쇠 + 제거 (더 긴 꼬리)
		const maxParticles = 16;
		for (const p of this.smokeTrail) {
			p.alpha -= 0.06;
			p.size *= 1.03; // 점점 커지며 흩어짐
		}
		this.smokeTrail = this.smokeTrail.filter((p) => p.alpha > 0.02);
		if (this.smokeTrail.length > maxParticles) {
			this.smokeTrail.splice(0, this.smokeTrail.length - maxParticles);
		}

		// 연기 다시 그리기
		this.smokeGfx.clear();
		const smokeColor = this.getSmokeColor();
		for (const p of this.smokeTrail) {
			this.smokeGfx.fillStyle(smokeColor, p.alpha);
			this.smokeGfx.fillCircle(p.x, p.y, p.size);
		}

		// 물리 (맵 중력/바람 배율 적용)
		const windEffect = wind * 0.01 * (1 - this.windResistance) * this.windMul;
		this.vx += windEffect;
		this.vy += CONFIG.GRAVITY * this.gravityMul;
		this.x += this.vx;
		this.y += this.vy;

		this.gfx.setPosition(this.x, this.y);
		this.gfx.setRotation(Math.atan2(this.vy, this.vx));

		this.flightFrames++;

		if (
			this.x < -50 ||
			this.x > CONFIG.WORLD_WIDTH + 50 ||
			this.y > CONFIG.PLAY_HEIGHT + 50 ||
			this.flightFrames > this.maxFlightFrames
		) {
			this.alive = false;
		}
	}

	tryBounce(surfaceNormalX: number, surfaceNormalY: number): boolean {
		if (this.bouncesRemaining <= 0) return false;

		this.bouncesRemaining--;
		this.bounced = true;

		const dot = this.vx * surfaceNormalX + this.vy * surfaceNormalY;
		this.vx = (this.vx - 2 * dot * surfaceNormalX) * 0.7;
		this.vy = (this.vy - 2 * dot * surfaceNormalY) * 0.7;

		// 스파크 이펙트
		const sparkGfx = this.scene.add.graphics();
		sparkGfx.setDepth(6);
		for (let i = 0; i < 5; i++) {
			const angle = Math.random() * Math.PI * 2;
			const dist = 3 + Math.random() * 8;
			sparkGfx.fillStyle(0xffcc00, 0.8);
			sparkGfx.fillCircle(Math.cos(angle) * dist, Math.sin(angle) * dist, 1.5);
		}
		sparkGfx.setPosition(this.x, this.y);
		this.scene.tweens.add({
			targets: sparkGfx,
			alpha: 0,
			duration: 300,
			onComplete: () => sparkGfx.destroy(),
		});

		this.drawProjectile();
		return true;
	}

	destroy(): void {
		this.alive = false;
		this.gfx.destroy();
		// 연기가 자연스럽게 사라지도록 잠시 후 제거
		this.scene.tweens.add({
			targets: this.smokeGfx,
			alpha: 0,
			duration: 400,
			onComplete: () => this.smokeGfx.destroy(),
		});
	}
}
