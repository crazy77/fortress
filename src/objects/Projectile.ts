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
			// 바운스탄
			this.gfx.fillStyle(0xff8800, 1);
			this.gfx.fillCircle(0, 0, r + 1);
			this.gfx.fillStyle(0xffcc00, 0.8);
			this.gfx.fillCircle(0, 0, r - 1);
			return;
		}

		switch (this.tankStyle) {
			case "cannon":
				// 클래식 원형 포탄 + 하이라이트
				this.gfx.fillStyle(0x222222);
				this.gfx.fillCircle(0, 0, r);
				this.gfx.fillStyle(0x555555, 0.5);
				this.gfx.fillCircle(-1, -1, r * 0.4);
				break;
			case "heavy":
				// 큰 사각 포탄
				this.gfx.fillStyle(0x1a3a1a);
				this.gfx.fillRect(-r - 1, -r + 1, r * 2 + 2, r * 2 - 2);
				this.gfx.fillStyle(0x2d6b2d, 0.7);
				this.gfx.fillRect(-r, -r + 2, r * 2, r);
				break;
			case "missile":
				// 가늘고 긴 미사일
				this.gfx.fillStyle(0x2c3e50);
				this.gfx.fillRect(-r * 2, -r / 2, r * 4, r);
				this.gfx.fillStyle(0xe74c3c);
				this.gfx.fillTriangle(r * 2, 0, r * 2 - 3, -r, r * 2 - 3, r);
				break;
			case "laser":
				// 빛나는 에너지 구체
				this.gfx.fillStyle(0x00e5ff, 0.4);
				this.gfx.fillCircle(0, 0, r + 3);
				this.gfx.fillStyle(0x00bcd4, 0.8);
				this.gfx.fillCircle(0, 0, r);
				this.gfx.fillStyle(0xffffff, 0.6);
				this.gfx.fillCircle(-1, -1, r * 0.4);
				break;
			case "hover":
				// 삼각 플라즈마 탄
				this.gfx.fillStyle(0x9b59b6);
				this.gfx.fillTriangle(r + 2, 0, -r, -r, -r, r);
				this.gfx.fillStyle(0xc39bd3, 0.6);
				this.gfx.fillTriangle(r, 0, -r + 2, -r + 2, -r + 2, r - 2);
				break;
			case "catapult":
				// 거대한 바위
				this.gfx.fillStyle(0x6d4c41);
				this.gfx.fillCircle(0, 0, r + 1);
				this.gfx.fillStyle(0x8d6e63, 0.7);
				this.gfx.fillCircle(-1, -1, r - 1);
				this.gfx.fillStyle(0x5d4037, 0.5);
				this.gfx.fillCircle(2, 1, r * 0.3);
				break;
		}
	}

	private getSmokeColor(): number {
		switch (this.tankStyle) {
			case "laser": return 0x80deea;
			case "hover": return 0xce93d8;
			case "missile": return 0xff8a65;
			default: return 0x999999;
		}
	}

	update(wind: number): void {
		if (!this.alive) return;

		// 연기 꼬리 파티클 추가 (현재 위치에 생성)
		this.smokeTrail.push({
			x: this.x,
			y: this.y,
			alpha: 0.5,
			size: this.radius * 0.6 + Math.random() * 1.5,
		});

		// 파티클 감쇠 + 제거 (최대 12개 유지)
		const maxParticles = 12;
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
