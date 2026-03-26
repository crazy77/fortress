import Phaser from "phaser";
import { CONFIG } from "../config";
import { TANK_DEFAULT, type TankTypeDef } from "./TankDefs";
import type { Terrain } from "./Terrain";

export class Tank {
	x: number;
	y: number;
	health: number = CONFIG.TANK_HP;
	/** 포대 앙각 (0=수평, 90=수직) */
	angle = 45;
	/** 탱크 방향 (1=오른쪽, -1=왼쪽) */
	facing: 1 | -1 = 1;
	/** 탱크 타입 정의 (충돌/렌더링 파라미터) */
	readonly typeDef: TankTypeDef;
	/** 지면 기울기 (라디안) */
	slopeRad = 0;
	private scene: Phaser.Scene;
	private body: Phaser.GameObjects.Graphics;
	private barrel: Phaser.GameObjects.Graphics;
	private hpBarGfx: Phaser.GameObjects.Graphics;
	private flashTimer: Phaser.Time.TimerEvent | null = null;
	private destroyed = false;
	/** 탱크 위 이름 라벨 */
	private nameLabel: Phaser.GameObjects.Text;
	/** 턴 표시 마커 (▼ 화살표) */
	private turnMarker: Phaser.GameObjects.Text;

	// ─── 애니메이션 상태 ───
	private idleTween: Phaser.Tweens.Tween | null = null;
	private isIdleAnimating = false;
	/** 머즐 플래시 그래픽 */
	private muzzleFlashGfx: Phaser.GameObjects.Graphics;
	/** 애니메이션용 컨테이너 — body/barrel의 부모 역할 (흔들림/반동 적용) */
	private animContainer: Phaser.GameObjects.Container;

	constructor(
		scene: Phaser.Scene,
		x: number,
		private terrain: Terrain,
		public readonly playerIndex: 0 | 1,
		typeDef: TankTypeDef = TANK_DEFAULT,
	) {
		this.scene = scene;
		this.typeDef = typeDef;
		this.x = x;
		this.y = terrain.getHeightAt(x);
		this.slopeRad = this.calcSlope();

		this.body = scene.add.graphics();
		this.body.setDepth(2);
		this.barrel = scene.add.graphics();
		this.barrel.setDepth(3);
		this.hpBarGfx = scene.add.graphics();
		this.hpBarGfx.setDepth(4);

		// 머즐 플래시
		this.muzzleFlashGfx = scene.add.graphics();
		this.muzzleFlashGfx.setDepth(5);
		this.muzzleFlashGfx.setVisible(false);

		// 애니메이션 컨테이너 (body/barrel 래핑하지 않고 오프셋으로 사용)
		this.animContainer = scene.add.container(0, 0);
		this.animContainer.setDepth(0);

		// 이름 라벨 (HP 바 위)
		const pLabel = playerIndex === 0 ? "P1" : "P2";
		const labelColor = playerIndex === 0 ? "#ff6b6b" : "#74b9ff";
		this.nameLabel = scene.add.text(0, 0, `${pLabel} ${typeDef.name}`, {
			fontSize: "11px",
			color: labelColor,
			fontStyle: "bold",
			stroke: "#000000",
			strokeThickness: 2,
		});
		this.nameLabel.setOrigin(0.5, 1);
		this.nameLabel.setDepth(4);

		// 턴 마커 (기본 숨김)
		this.turnMarker = scene.add.text(0, 0, "▼", {
			fontSize: "14px",
			color: labelColor,
			stroke: "#000000",
			strokeThickness: 2,
		});
		this.turnMarker.setOrigin(0.5, 1);
		this.turnMarker.setDepth(4);
		this.turnMarker.setVisible(false);

		this.angle = Math.round(
			(this.typeDef.angleMin + this.typeDef.angleMax) / 2,
		);
		this.drawBody();
		this.drawBarrel();
	}

	faceToward(targetX: number): void {
		this.facing = targetX > this.x ? 1 : -1;
		this.drawBody();
		this.drawBarrel();
	}

	// ─── 지형 상호작용 ───

	private calcSlope(): number {
		const hw = this.typeDef.width / 2;
		const limit = CONFIG.PLAY_HEIGHT - 1;
		const searchStart = this.y - 4;
		const lh = this.terrain.findSurfaceBelow(this.x - hw, searchStart);
		const rh = this.terrain.findSurfaceBelow(this.x + hw, searchStart);
		if (lh >= limit || rh >= limit) return 0;
		const heightDiff = Math.abs(lh - rh);
		if (heightDiff > hw * 2) return 0;
		const slope = Math.atan2(lh - rh, hw * 2);
		const maxSlope = Math.PI / 5;
		return Phaser.Math.Clamp(slope, -maxSlope, maxSlope);
	}

	getWorldAngle(): number {
		const baseAngle = this.facing === 1 ? this.angle : 180 - this.angle;
		return baseAngle + Phaser.Math.RadToDeg(this.slopeRad);
	}

	settleOnTerrain(): void {
		this.y = this.terrain.findSurfaceBelow(this.x, this.y - 4);
		this.slopeRad = this.calcSlope();
		this.drawBody();
		this.drawBarrel();
	}

	tryMove(direction: -1 | 1): boolean {
		const newX = this.x + direction * CONFIG.TANK_SPEED;
		const hw = this.typeDef.width / 2;
		if (newX - hw < 0 || newX + hw > CONFIG.WORLD_WIDTH) return false;
		const searchStart = this.y - CONFIG.TANK_MAX_CLIMB - 2;
		const newHeight = this.terrain.findSurfaceBelow(newX, searchStart);
		if (
			newHeight < CONFIG.PLAY_HEIGHT - 1 &&
			this.y - newHeight > CONFIG.TANK_MAX_CLIMB
		) {
			return false;
		}
		this.facing = direction as 1 | -1;
		this.x = newX;
		this.y = newHeight;
		this.slopeRad = this.calcSlope();
		this.drawBody();
		this.drawBarrel();
		return true;
	}

	/** 이동 없이 방향만 전환 (연료 소모 없음) */
	turnToFace(direction: -1 | 1): void {
		if (this.facing !== direction) {
			this.facing = direction;
			this.drawBody();
			this.drawBarrel();
		}
	}

	// ─── 전투 ───

	takeDamage(amount: number): void {
		if (amount <= 0) return;
		this.health = Math.max(0, this.health - amount);
		this.flashWhite();
		this.showDamagePopup(amount);
		this.playHitAnimation(amount);
		if (this.isDead() && !this.destroyed) {
			this.playDestroyAnimation();
		}
	}

	isDead(): boolean {
		return this.health <= 0;
	}

	heal(amount: number): void {
		this.health = Math.min(CONFIG.TANK_HP, this.health + amount);
		// 힐 이펙트
		const turret = this.getTurretPosition();
		const txt = this.scene.add.text(turret.x, turret.y - 20, `+${amount}`, {
			fontSize: "18px",
			color: "#2ecc71",
			stroke: "#000000",
			strokeThickness: 3,
			fontStyle: "bold",
		});
		txt.setOrigin(0.5);
		txt.setDepth(15);
		this.scene.tweens.add({
			targets: txt,
			y: txt.y - 40,
			alpha: 0,
			duration: 800,
			ease: "Power2",
			onComplete: () => txt.destroy(),
		});
	}

	setAngle(angle: number): void {
		this.angle = Phaser.Math.Clamp(
			angle,
			this.typeDef.angleMin,
			this.typeDef.angleMax,
		);
		this.drawBarrel();
	}

	// ─── 이펙트 ───

	private flashWhite(): void {
		if (this.flashTimer) this.flashTimer.destroy();
		this.drawTankBody(0xffffff, 0xdddddd);
		this.flashTimer = this.scene.time.delayedCall(100, () => {
			this.drawBody();
			this.flashTimer = null;
		});
	}

	private showDamagePopup(amount: number): void {
		const turret = this.getTurretPosition();
		const txt = this.scene.add.text(turret.x, turret.y - 20, `-${amount}`, {
			fontSize: "18px",
			color: "#ff4444",
			stroke: "#000000",
			strokeThickness: 3,
			fontStyle: "bold",
		});
		txt.setOrigin(0.5);
		txt.setDepth(15);
		this.scene.tweens.add({
			targets: txt,
			y: txt.y - 40,
			alpha: 0,
			duration: 800,
			ease: "Power2",
			onComplete: () => txt.destroy(),
		});
	}

	// ─── 캐릭터 애니메이션 ───

	/** 대기 애니메이션 — 활성 턴일 때 미세한 숨쉬기 + 탱크별 고유 동작 */
	startIdleAnimation(): void {
		if (this.isIdleAnimating || this.destroyed) return;
		this.isIdleAnimating = true;

		// 공통: 미세한 바운스 (숨쉬기)
		this.idleTween = this.scene.tweens.add({
			targets: this.body,
			y: -2,
			duration: 1200,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});

		// 포신도 같이 숨쉬기
		this.scene.tweens.add({
			targets: this.barrel,
			y: -2,
			duration: 1200,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});

		// 탱크별 고유 대기 동작
		switch (this.typeDef.style) {
			case "hover":
				// 호버: 좌우 미세 흔들림 (떠있는 느낌)
				this.scene.tweens.add({
					targets: this.body,
					x: 1.5,
					duration: 800,
					yoyo: true,
					repeat: -1,
					ease: "Sine.easeInOut",
				});
				break;
			case "heavy":
				// 중전차: 느린 엔진 진동
				this.scene.tweens.add({
					targets: this.body,
					x: 0.5,
					duration: 200,
					yoyo: true,
					repeat: -1,
					ease: "Sine.easeInOut",
				});
				break;
			case "laser":
				// 레이저: 포신 끝 글로우 맥동
				this.scene.tweens.add({
					targets: this.barrel,
					alpha: 0.85,
					duration: 1000,
					yoyo: true,
					repeat: -1,
					ease: "Sine.easeInOut",
				});
				break;
			case "catapult":
				// 카타펄트: 미세한 흔들림 (바람에 흔들리는 나무)
				this.scene.tweens.add({
					targets: this.barrel,
					x: 1,
					duration: 1500,
					yoyo: true,
					repeat: -1,
					ease: "Sine.easeInOut",
				});
				break;
		}
	}

	/** 대기 애니메이션 중지 */
	stopIdleAnimation(): void {
		if (!this.isIdleAnimating) return;
		this.isIdleAnimating = false;

		this.scene.tweens.killTweensOf(this.body);
		this.scene.tweens.killTweensOf(this.barrel);
		// 위치 리셋
		this.body.setPosition(0, 0);
		this.body.setAlpha(1);
		this.barrel.setPosition(0, 0);
		this.barrel.setAlpha(1);

		if (this.idleTween) {
			this.idleTween.destroy();
			this.idleTween = null;
		}
	}

	/** 발사 반동 애니메이션 — 포신 후퇴 + 차체 흔들림 + 머즐 플래시 */
	playFireAnimation(): void {
		if (this.destroyed) return;
		this.stopIdleAnimation();

		const muzzle = this.getMuzzlePosition();
		const worldAngleRad = Phaser.Math.DegToRad(this.getWorldAngle());

		// 1. 머즐 플래시 (포구 불꽃)
		this.muzzleFlashGfx.clear();
		this.muzzleFlashGfx.setVisible(true);
		this.muzzleFlashGfx.setPosition(muzzle.x, muzzle.y);

		// 스타일별 머즐 플래시
		switch (this.typeDef.style) {
			case "laser":
				// 레이저: 원형 에너지 버스트
				this.muzzleFlashGfx.fillStyle(0x00ffff, 0.6);
				this.muzzleFlashGfx.fillCircle(0, 0, 12);
				this.muzzleFlashGfx.fillStyle(0xffffff, 0.8);
				this.muzzleFlashGfx.fillCircle(0, 0, 5);
				break;
			case "hover":
				// 호버: 보라 에너지 링
				this.muzzleFlashGfx.fillStyle(0xce93d8, 0.5);
				this.muzzleFlashGfx.fillCircle(0, 0, 10);
				this.muzzleFlashGfx.lineStyle(2, 0xe1bee7, 0.7);
				this.muzzleFlashGfx.strokeCircle(0, 0, 8);
				break;
			case "heavy":
				// 중전차: 거대한 주황 폭발
				this.muzzleFlashGfx.fillStyle(0xff6600, 0.7);
				this.muzzleFlashGfx.fillCircle(0, 0, 16);
				this.muzzleFlashGfx.fillStyle(0xffcc00, 0.9);
				this.muzzleFlashGfx.fillCircle(0, 0, 8);
				this.muzzleFlashGfx.fillStyle(0xffffff, 0.6);
				this.muzzleFlashGfx.fillCircle(0, 0, 3);
				break;
			case "catapult":
				// 카타펄트: 먼지 구름
				this.muzzleFlashGfx.fillStyle(0x8d6e63, 0.5);
				this.muzzleFlashGfx.fillCircle(0, 0, 10);
				this.muzzleFlashGfx.fillCircle(3, -2, 6);
				this.muzzleFlashGfx.fillCircle(-4, 1, 5);
				break;
			default:
				// 캐논/미사일: 전통 주황 불꽃
				this.muzzleFlashGfx.fillStyle(0xff8800, 0.7);
				this.muzzleFlashGfx.fillCircle(0, 0, 10);
				this.muzzleFlashGfx.fillStyle(0xffdd44, 0.9);
				this.muzzleFlashGfx.fillCircle(0, 0, 5);
				break;
		}

		// 머즐 플래시 페이드아웃
		this.scene.tweens.add({
			targets: this.muzzleFlashGfx,
			alpha: 0,
			scaleX: 1.8,
			scaleY: 1.8,
			duration: 150,
			ease: "Power2",
			onComplete: () => {
				this.muzzleFlashGfx.setVisible(false);
				this.muzzleFlashGfx.setAlpha(1);
				this.muzzleFlashGfx.setScale(1);
			},
		});

		// 2. 포신 반동 (발사 방향 반대로 후퇴 → 복귀)
		const recoilDist = this.typeDef.style === "heavy" ? 6 : this.typeDef.style === "catapult" ? 8 : 4;
		const recoilX = -Math.cos(worldAngleRad) * recoilDist;
		const recoilY = Math.sin(worldAngleRad) * recoilDist;

		this.barrel.setPosition(recoilX, recoilY);
		this.scene.tweens.add({
			targets: this.barrel,
			x: 0,
			y: 0,
			duration: 250,
			ease: "Back.easeOut",
		});

		// 3. 차체 반동 (발사 방향 반대로 약간 밀림)
		const bodyRecoil = this.typeDef.style === "heavy" ? 3 : 2;
		this.body.setPosition(-Math.cos(worldAngleRad) * bodyRecoil, Math.sin(worldAngleRad) * bodyRecoil);
		this.scene.tweens.add({
			targets: this.body,
			x: 0,
			y: 0,
			duration: 300,
			ease: "Elastic.easeOut",
		});
	}

	/** 피격 반응 애니메이션 — 흔들림 + 스퀴시 + 흰색 플래시 */
	playHitAnimation(damage: number): void {
		if (this.destroyed) return;

		const intensity = Math.min(1, damage / 50); // 데미지에 비례한 강도

		// 1. 차체 흔들림 (피격 방향 → 반대 → 복귀)
		const shakeAmount = 3 + intensity * 5;
		this.scene.tweens.add({
			targets: this.body,
			x: { from: shakeAmount, to: 0 },
			duration: 80,
			yoyo: true,
			repeat: 1 + Math.floor(intensity * 2),
			ease: "Sine.easeInOut",
			onComplete: () => {
				this.body.setPosition(0, 0);
			},
		});

		// 2. 스퀴시 효과 (찌그러졌다 복귀 — 큰 데미지일수록 강함)
		if (intensity > 0.3) {
			const squish = 1 + intensity * 0.15;
			this.scene.tweens.add({
				targets: this.body,
				scaleX: squish,
				scaleY: 1 / squish,
				duration: 60,
				yoyo: true,
				ease: "Power2",
				onComplete: () => {
					this.body.setScale(1, 1);
				},
			});
		}

		// 3. 포신도 흔들림
		this.scene.tweens.add({
			targets: this.barrel,
			x: { from: shakeAmount * 0.7, to: 0 },
			duration: 80,
			yoyo: true,
			repeat: 1,
			ease: "Sine.easeInOut",
			onComplete: () => {
				this.barrel.setPosition(0, 0);
			},
		});

		// 4. 빨간 틴트 플래시 (피 느낌)
		if (intensity > 0.5) {
			const flashGfx = this.scene.add.graphics();
			flashGfx.setDepth(10);
			flashGfx.fillStyle(0xff0000, 0.3);
			flashGfx.fillCircle(this.x, this.y - this.typeDef.height / 2, this.typeDef.width);
			this.scene.tweens.add({
				targets: flashGfx,
				alpha: 0,
				scaleX: 1.3,
				scaleY: 1.3,
				duration: 200,
				ease: "Power2",
				onComplete: () => flashGfx.destroy(),
			});
		}

		// 5. 피격 파편 (작은 파티클)
		const sparks = this.scene.add.graphics();
		sparks.setDepth(8);
		for (let i = 0; i < 3 + Math.floor(intensity * 5); i++) {
			const angle = Math.random() * Math.PI * 2;
			const dist = 5 + Math.random() * 15;
			const px = this.x + Math.cos(angle) * dist;
			const py = this.y - this.typeDef.height / 2 + Math.sin(angle) * dist;
			sparks.fillStyle(Math.random() > 0.5 ? 0xffcc00 : 0xff8800, 0.8);
			sparks.fillCircle(px, py, 1 + Math.random() * 2);
		}
		this.scene.tweens.add({
			targets: sparks,
			alpha: 0,
			duration: 300,
			onComplete: () => sparks.destroy(),
		});
	}

	private playDestroyAnimation(): void {
		this.destroyed = true;
		const smokeEmitter = this.scene.add.particles(
			this.x,
			this.y - this.typeDef.height / 2,
			"__DEFAULT",
			{
				speed: { min: 15, max: 40 },
				scale: { start: 0.4, end: 0 },
				lifespan: 1200,
				tint: [0x222222, 0x444444, 0x555555],
				emitting: false,
				quantity: 12,
			},
		);
		smokeEmitter.setDepth(7);
		smokeEmitter.explode(12);
		this.scene.time.delayedCall(2000, () => smokeEmitter.destroy());
		this.drawBody();
		this.drawBarrel();
		this.scene.tweens.add({
			targets: this.hpBarGfx,
			alpha: 0,
			duration: 500,
		});
	}

	// ─── 렌더링 ───

	private getDamageState(): "normal" | "light" | "damaged" | "critical" | "destroyed" {
		if (this.destroyed) return "destroyed";
		if (this.health <= CONFIG.TANK_HP * 0.25) return "critical";
		if (this.health <= CONFIG.TANK_HP * 0.5) return "damaged";
		if (this.health <= CONFIG.TANK_HP * 0.75) return "light";
		return "normal";
	}

	private drawBody(): void {
		const state = this.getDamageState();
		switch (state) {
			case "destroyed":
				this.drawTankBody(0x444444, 0x333333);
				this.drawDestroyedOverlay();
				break;
			case "critical":
				// 검붉은 색조 + 심한 손상
				this.drawTankBody(
					this.blendColor(this.typeDef.color, 0x441111, 0.4),
					this.blendColor(this.typeDef.colorDark, 0x220000, 0.4),
				);
				this.drawDamageMarks();
				this.drawCriticalFire();
				break;
			case "damaged":
				// 약간 어두운 색조
				this.drawTankBody(
					this.blendColor(this.typeDef.color, 0x333333, 0.2),
					this.blendColor(this.typeDef.colorDark, 0x222222, 0.2),
				);
				this.drawDamageMarks();
				break;
			case "light":
				this.drawTankBody(this.typeDef.color, this.typeDef.colorDark);
				this.drawLightDamage();
				break;
			default:
				this.drawTankBody(this.typeDef.color, this.typeDef.colorDark);
		}
	}

	private blendColor(a: number, b: number, t: number): number {
		const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
		const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
		const r = Math.round(ar + (br - ar) * t);
		const g = Math.round(ag + (bg - ag) * t);
		const bl = Math.round(ab + (bb - ab) * t);
		return (r << 16) | (g << 8) | bl;
	}

	/** 경미한 손상 (75% HP 이하) — 작은 찰과상 */
	private drawLightDamage(): void {
		this.body.lineStyle(1, 0x555555, 0.5);
		const s1 = this.t(5, 12);
		const e1 = this.t(8, 15);
		this.body.beginPath();
		this.body.moveTo(s1.x, s1.y);
		this.body.lineTo(e1.x, e1.y);
		this.body.strokePath();
	}

	/** 심각한 손상 (25% HP 이하) — 불꽃/연기 이펙트 */
	private drawCriticalFire(): void {
		// 연기
		this.body.fillStyle(0x333333, 0.4);
		const smokePos = this.t(0, this.typeDef.height + 8);
		this.body.fillCircle(smokePos.x, smokePos.y, 5);
		this.body.fillCircle(smokePos.x - 3, smokePos.y - 6, 3);
		// 불꽃
		this.body.fillStyle(0xff6600, 0.5);
		const firePos = this.t(2, this.typeDef.height + 4);
		this.body.fillCircle(firePos.x, firePos.y, 3);
		this.body.fillStyle(0xffcc00, 0.4);
		this.body.fillCircle(firePos.x - 1, firePos.y - 2, 2);
	}

	private drawTankBody(mainColor: number, darkColor: number): void {
		this.body.clear();

		switch (this.typeDef.style) {
			case "cannon":
				this.drawCannonBody(mainColor, darkColor);
				break;
			case "hover":
				this.drawHoverBody(mainColor, darkColor);
				break;
			case "heavy":
				this.drawHeavyBody(mainColor, darkColor);
				break;
			case "missile":
				this.drawMissileBody(mainColor, darkColor);
				break;
			case "laser":
				this.drawLaserBody(mainColor, darkColor);
				break;
			case "catapult":
				this.drawCatapultBody(mainColor, darkColor);
				break;
		}

		// 플레이어 인디케이터 (작은 삼각형 깃발)
		this.drawPlayerIndicator();

		// HP 바
		const turretPos = this.getTurretPosition();
		this.drawHpBar(turretPos.x, turretPos.y);
	}

	/** 좌표 변환 헬퍼: 로컬 좌표 → 월드 좌표 (기울기 반영) */
	private t(lx: number, ly: number): { x: number; y: number } {
		const cosS = Math.cos(this.slopeRad);
		const sinS = Math.sin(this.slopeRad);
		return {
			x: this.x + lx * cosS - ly * sinS,
			y: this.y - (lx * sinS + ly * cosS),
		};
	}

	// ─── 캐논 (듬직한 병사 / Reliable Soldier) ───
	private drawCannonBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// Rounded track covers
		const trackH = 8;
		const trackW = hw + 4;
		this.drawTrack(trackW, trackH, mainColor);

		// Track fender (rounded top cover)
		this.body.fillStyle(darkColor);
		const fL = this.t(-trackW + 2, trackH + 1);
		const fR = this.t(trackW - 2, trackH + 1);
		const fRT = this.t(trackW - 4, trackH + 3);
		const fLT = this.t(-trackW + 4, trackH + 3);
		this.body.beginPath();
		this.body.moveTo(fL.x, fL.y);
		this.body.lineTo(fR.x, fR.y);
		this.body.lineTo(fRT.x, fRT.y);
		this.body.lineTo(fLT.x, fLT.y);
		this.body.closePath();
		this.body.fillPath();

		// Sturdy rounded body (warm red base)
		const bodyBottom = trackH + 2;
		const bodyTop = hh - 3;
		this.body.fillStyle(darkColor);
		const bbl = this.t(-hw + 1, bodyBottom);
		const bbr = this.t(hw - 1, bodyBottom);
		const btr = this.t(hw - 3 + f * 2, bodyTop);
		const btl = this.t(-hw + 3 - f * 2, bodyTop);
		this.body.beginPath();
		this.body.moveTo(bbl.x, bbl.y);
		this.body.lineTo(bbr.x, bbr.y);
		this.body.lineTo(btr.x, btr.y);
		this.body.lineTo(btl.x, btl.y);
		this.body.closePath();
		this.body.fillPath();

		// Body highlight panel
		this.body.fillStyle(mainColor);
		const hbl = this.t(-hw + 3, bodyBottom + 2);
		const hbr = this.t(hw - 3, bodyBottom + 2);
		const htr = this.t(hw - 5 + f * 2, bodyTop);
		const htl = this.t(-hw + 5 - f * 2, bodyTop);
		this.body.beginPath();
		this.body.moveTo(hbl.x, hbl.y);
		this.body.lineTo(hbr.x, hbr.y);
		this.body.lineTo(htr.x, htr.y);
		this.body.lineTo(htl.x, htl.y);
		this.body.closePath();
		this.body.fillPath();

		// Golden accent stripe along the side
		this.body.fillStyle(0xdaa520, 0.7);
		const sL = this.t(-hw + 4, bodyBottom + 5);
		const sR = this.t(hw - 4, bodyBottom + 5);
		const sRT = this.t(hw - 4, bodyBottom + 7);
		const sLT = this.t(-hw + 4, bodyBottom + 7);
		this.body.beginPath();
		this.body.moveTo(sL.x, sL.y);
		this.body.lineTo(sR.x, sR.y);
		this.body.lineTo(sRT.x, sRT.y);
		this.body.lineTo(sLT.x, sLT.y);
		this.body.closePath();
		this.body.fillPath();

		// Cute headlight "eyes" on front (one slightly larger for charm)
		const eye1 = this.t(f * (hw - 4), bodyBottom + 4);
		const eye2 = this.t(f * (hw - 4), bodyBottom + 9);
		this.body.fillStyle(0xf1c40f, 0.9);
		this.body.fillCircle(eye1.x, eye1.y, 3);
		this.body.fillCircle(eye2.x, eye2.y, 3.5);
		// Eye gleam (white dot)
		this.body.fillStyle(0xffffff, 0.8);
		this.body.fillCircle(eye1.x, eye1.y, 1.2);
		this.body.fillCircle(eye2.x, eye2.y, 1.4);

		// Round friendly turret
		const tc = this.t(f * this.typeDef.turretOffset, hh);
		this.body.fillStyle(darkColor);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius + 1);
		this.body.fillStyle(mainColor);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius);
		// Gleam highlight on turret
		const gleam = this.t(f * this.typeDef.turretOffset - f * 2, hh + 2);
		this.body.fillStyle(0xffffff, 0.35);
		this.body.fillCircle(gleam.x, gleam.y, 3);
		this.body.fillStyle(0xffffff, 0.6);
		this.body.fillCircle(gleam.x, gleam.y, 1.5);

		// Small antenna/flag on top of turret
		const antBase = this.t(f * this.typeDef.turretOffset, hh + this.typeDef.turretRadius);
		const antTip = this.t(f * this.typeDef.turretOffset, hh + this.typeDef.turretRadius + 7);
		this.body.lineStyle(1, 0x555555);
		this.body.beginPath();
		this.body.moveTo(antBase.x, antBase.y);
		this.body.lineTo(antTip.x, antTip.y);
		this.body.strokePath();
		// Tiny flag
		const flagP1 = this.t(f * this.typeDef.turretOffset, hh + this.typeDef.turretRadius + 7);
		const flagP2 = this.t(f * this.typeDef.turretOffset + f * 4, hh + this.typeDef.turretRadius + 5);
		const flagP3 = this.t(f * this.typeDef.turretOffset, hh + this.typeDef.turretRadius + 4);
		this.body.fillStyle(0xe74c3c);
		this.body.beginPath();
		this.body.moveTo(flagP1.x, flagP1.y);
		this.body.lineTo(flagP2.x, flagP2.y);
		this.body.lineTo(flagP3.x, flagP3.y);
		this.body.closePath();
		this.body.fillPath();

		// Exhaust pipe on back
		const exhaustPos = this.t(-f * (hw + 1), trackH + 4);
		this.body.fillStyle(0x555555);
		this.body.fillCircle(exhaustPos.x, exhaustPos.y, 2.5);
		this.body.fillStyle(0x333333);
		this.body.fillCircle(exhaustPos.x, exhaustPos.y, 1.5);
	}

	// ─── 호버 (날렵한 요정 / Swift Fairy) ───
	private drawHoverBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// Prominent hover glow: Multiple layers underneath (4+ ellipses, decreasing alpha)
		const glowY = 1;
		this.body.fillStyle(0x00bcd4, 0.08);
		const g0 = this.t(0, glowY - 3);
		this.body.fillEllipse(g0.x, g0.y, hw * 2.6, 12);
		this.body.fillStyle(0x00e5ff, 0.12);
		const g1 = this.t(0, glowY - 1);
		this.body.fillEllipse(g1.x, g1.y, hw * 2.2, 9);
		this.body.fillStyle(0x4fc3f7, 0.2);
		const g2 = this.t(0, glowY);
		this.body.fillEllipse(g2.x, g2.y, hw * 1.8, 7);
		this.body.fillStyle(0x81d4fa, 0.35);
		const g3 = this.t(0, glowY + 1);
		this.body.fillEllipse(g3.x, g3.y, hw * 1.4, 5);
		this.body.fillStyle(0xb3e5fc, 0.5);
		const g4 = this.t(0, glowY + 1.5);
		this.body.fillEllipse(g4.x, g4.y, hw * 0.9, 3);

		// Sleek curved aerodynamic body (purple)
		const bodyBottom = 4;
		const bodyTop = hh - 5;
		const bodyMid = (bodyBottom + bodyTop) / 2;

		// Outer body - swept shape
		this.body.fillStyle(darkColor);
		const bl = this.t(-hw + 2, bodyBottom);
		const bml = this.t(-hw - 1, bodyMid);
		const tl = this.t(-hw + 6 - f * 5, bodyTop);
		const tr = this.t(hw - 6 + f * 5, bodyTop);
		const bmr = this.t(hw + 1, bodyMid);
		const br = this.t(hw - 2, bodyBottom);
		this.body.beginPath();
		this.body.moveTo(bl.x, bl.y);
		this.body.lineTo(bml.x, bml.y);
		this.body.lineTo(tl.x, tl.y);
		this.body.lineTo(tr.x, tr.y);
		this.body.lineTo(bmr.x, bmr.y);
		this.body.lineTo(br.x, br.y);
		this.body.closePath();
		this.body.fillPath();

		// Inner body highlight
		this.body.fillStyle(mainColor);
		const hbl = this.t(-hw + 4, bodyBottom + 2);
		const hbml = this.t(-hw + 1, bodyMid);
		const htl = this.t(-hw + 8 - f * 5, bodyTop);
		const htr = this.t(hw - 8 + f * 5, bodyTop);
		const hbmr = this.t(hw - 1, bodyMid);
		const hbr = this.t(hw - 4, bodyBottom + 2);
		this.body.beginPath();
		this.body.moveTo(hbl.x, hbl.y);
		this.body.lineTo(hbml.x, hbml.y);
		this.body.lineTo(htl.x, htl.y);
		this.body.lineTo(htr.x, htr.y);
		this.body.lineTo(hbmr.x, hbmr.y);
		this.body.lineTo(hbr.x, hbr.y);
		this.body.closePath();
		this.body.fillPath();

		// Pink energy accent lines
		this.body.lineStyle(1, 0xff69b4, 0.6);
		const aL = this.t(-hw + 5, bodyBottom + 4);
		const aR = this.t(hw - 5, bodyBottom + 4);
		this.body.beginPath();
		this.body.moveTo(aL.x, aL.y);
		this.body.lineTo(aR.x, aR.y);
		this.body.strokePath();

		// Front visor line (thin cyan stripe like a visor/eye)
		this.body.lineStyle(1.5, 0x00ffff, 0.8);
		const vL = this.t(f * (hw - 8), bodyMid + 1);
		const vR = this.t(f * (hw + 0), bodyMid + 1);
		this.body.beginPath();
		this.body.moveTo(vL.x, vL.y);
		this.body.lineTo(vR.x, vR.y);
		this.body.strokePath();
		// Visor glow
		this.body.fillStyle(0x00ffff, 0.2);
		const visorC = this.t(f * (hw - 4), bodyMid + 1);
		this.body.fillEllipse(visorC.x, visorC.y, 10, 4);

		// Tiny wing-like fins on the sides
		for (const side of [-1, 1]) {
			const finBase = this.t(side * (hw + 1), bodyMid + 2);
			const finTip = this.t(side * (hw + 5), bodyMid + 5);
			const finBack = this.t(side * (hw + 1), bodyMid - 1);
			this.body.fillStyle(darkColor, 0.8);
			this.body.beginPath();
			this.body.moveTo(finBase.x, finBase.y);
			this.body.lineTo(finTip.x, finTip.y);
			this.body.lineTo(finBack.x, finBack.y);
			this.body.closePath();
			this.body.fillPath();
		}

		// Sleek turret
		const tc = this.t(f * this.typeDef.turretOffset, hh);
		this.body.fillStyle(darkColor);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius + 1);
		this.body.fillStyle(mainColor);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius);

		// Energy antenna on turret with glow dot
		const antBase = this.t(f * this.typeDef.turretOffset, hh + this.typeDef.turretRadius - 1);
		const antTip = this.t(f * this.typeDef.turretOffset, hh + this.typeDef.turretRadius + 5);
		this.body.lineStyle(1, 0xce93d8);
		this.body.beginPath();
		this.body.moveTo(antBase.x, antBase.y);
		this.body.lineTo(antTip.x, antTip.y);
		this.body.strokePath();
		this.body.fillStyle(0x00ffff, 0.8);
		this.body.fillCircle(antTip.x, antTip.y, 2);
		this.body.fillStyle(0x00ffff, 0.3);
		this.body.fillCircle(antTip.x, antTip.y, 4);

		// Turret highlight
		const hl = this.t(f * this.typeDef.turretOffset - f * 1, hh + 2);
		this.body.fillStyle(0xffffff, 0.25);
		this.body.fillCircle(hl.x, hl.y, 2.5);
	}

	// ─── 중전차 (무뚝뚝한 거인 / Grumpy Giant) ───
	private drawHeavyBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// Extra thick track with 5 wheels
		const trackH = 11;
		const trackW = hw + 7;
		this.drawTrack(trackW, trackH, mainColor, 5);

		// Double-layer outer armor (extra wide, imposing)
		const bodyBottom = trackH;
		const bodyTop = hh - 1;

		// Outer armor plate (thick dark shell)
		this.body.fillStyle(darkColor);
		const o1 = this.t(-hw - 4, bodyBottom - 1);
		const o2 = this.t(hw + 4, bodyBottom - 1);
		const o3 = this.t(hw + 2, bodyTop + 1);
		const o4 = this.t(-hw - 2, bodyTop + 1);
		this.body.beginPath();
		this.body.moveTo(o1.x, o1.y);
		this.body.lineTo(o2.x, o2.y);
		this.body.lineTo(o3.x, o3.y);
		this.body.lineTo(o4.x, o4.y);
		this.body.closePath();
		this.body.fillPath();

		// Inner armor plate (visible double-layer effect)
		this.body.fillStyle(mainColor);
		const i1 = this.t(-hw - 1, bodyBottom + 1);
		const i2 = this.t(hw + 1, bodyBottom + 1);
		const i3 = this.t(hw - 1, bodyTop);
		const i4 = this.t(-hw + 1, bodyTop);
		this.body.beginPath();
		this.body.moveTo(i1.x, i1.y);
		this.body.lineTo(i2.x, i2.y);
		this.body.lineTo(i3.x, i3.y);
		this.body.lineTo(i4.x, i4.y);
		this.body.closePath();
		this.body.fillPath();

		// Yellow/black warning stripes on front armor
		const stripeCount = 4;
		for (let s = 0; s < stripeCount; s++) {
			const sy = bodyBottom + 2 + s * 3;
			if (sy > bodyTop - 1) break;
			const color = s % 2 === 0 ? 0xf1c40f : 0x222222;
			this.body.fillStyle(color, 0.7);
			const sL = this.t(f * (hw - 6), sy);
			const sR = this.t(f * (hw + 2), sy);
			const sRT = this.t(f * (hw + 2), sy + 2);
			const sLT = this.t(f * (hw - 6), sy + 2);
			this.body.beginPath();
			this.body.moveTo(sL.x, sL.y);
			this.body.lineTo(sR.x, sR.y);
			this.body.lineTo(sRT.x, sRT.y);
			this.body.lineTo(sLT.x, sLT.y);
			this.body.closePath();
			this.body.fillPath();
		}

		// Angry headlight "eyes" (rectangular, angled inward)
		const eyeY1 = bodyBottom + 3;
		const eyeY2 = bodyBottom + 7;
		for (const [ey, sz] of [[eyeY1, 3], [eyeY2, 2.5]] as [number, number][]) {
			const eL = this.t(f * (hw - 1), ey);
			const eR = this.t(f * (hw + 3), ey);
			const eRT = this.t(f * (hw + 2), ey + sz);
			const eLT = this.t(f * (hw - 1), ey + sz);
			this.body.fillStyle(0xf1c40f, 0.9);
			this.body.beginPath();
			this.body.moveTo(eL.x, eL.y);
			this.body.lineTo(eR.x, eR.y);
			this.body.lineTo(eRT.x, eRT.y);
			this.body.lineTo(eLT.x, eLT.y);
			this.body.closePath();
			this.body.fillPath();
		}

		// Exhaust pipes on back (2 dark circles with smoke color)
		const ex1 = this.t(-f * (hw + 2), bodyBottom + 4);
		const ex2 = this.t(-f * (hw + 2), bodyBottom + 8);
		this.body.fillStyle(0x333333);
		this.body.fillCircle(ex1.x, ex1.y, 3);
		this.body.fillCircle(ex2.x, ex2.y, 3);
		this.body.fillStyle(0x1a1a1a);
		this.body.fillCircle(ex1.x, ex1.y, 1.5);
		this.body.fillCircle(ex2.x, ex2.y, 1.5);
		// Smoke wisps
		this.body.fillStyle(0x444444, 0.3);
		const sm1 = this.t(-f * (hw + 5), bodyBottom + 3);
		const sm2 = this.t(-f * (hw + 6), bodyBottom + 7);
		this.body.fillCircle(sm1.x, sm1.y, 2);
		this.body.fillCircle(sm2.x, sm2.y, 2.5);

		// Massive square turret
		const tr = this.typeDef.turretRadius;
		const tox = f * this.typeDef.turretOffset;
		// Turret base (dark outline)
		this.body.fillStyle(darkColor);
		const tb1 = this.t(tox - tr - 1, hh - tr * 0.7);
		const tb2 = this.t(tox + tr + 1, hh - tr * 0.7);
		const tb3 = this.t(tox + tr + 1, hh + tr * 0.7);
		const tb4 = this.t(tox - tr - 1, hh + tr * 0.7);
		this.body.beginPath();
		this.body.moveTo(tb1.x, tb1.y);
		this.body.lineTo(tb2.x, tb2.y);
		this.body.lineTo(tb3.x, tb3.y);
		this.body.lineTo(tb4.x, tb4.y);
		this.body.closePath();
		this.body.fillPath();
		// Turret inner
		this.body.fillStyle(mainColor);
		const ti1 = this.t(tox - tr + 1, hh - tr * 0.5);
		const ti2 = this.t(tox + tr - 1, hh - tr * 0.5);
		const ti3 = this.t(tox + tr - 1, hh + tr * 0.5);
		const ti4 = this.t(tox - tr + 1, hh + tr * 0.5);
		this.body.beginPath();
		this.body.moveTo(ti1.x, ti1.y);
		this.body.lineTo(ti2.x, ti2.y);
		this.body.lineTo(ti3.x, ti3.y);
		this.body.lineTo(ti4.x, ti4.y);
		this.body.closePath();
		this.body.fillPath();

		// Bolts/rivets on turret corners (4 dots)
		this.body.fillStyle(0x888888, 0.9);
		for (const [rx, ry] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
			const rivet = this.t(tox + rx * (tr - 2), hh + ry * (tr * 0.4));
			this.body.fillCircle(rivet.x, rivet.y, 1.5);
		}

		// Body rivets along armor
		this.body.fillStyle(0x666666);
		for (let ix = -2; ix <= 2; ix++) {
			const rivet = this.t(ix * (hw * 0.4), bodyBottom + 3);
			this.body.fillCircle(rivet.x, rivet.y, 1);
		}
	}

	// ─── 미사일 (냉정한 저격수 / Cold Sniper) ───
	private drawMissileBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// Sleek narrow track
		const trackH = 7;
		const trackW = hw + 2;
		this.drawTrack(trackW, trackH, mainColor);

		// Angular, sharp wedge shape pointing forward
		const bodyBottom = trackH;
		const bodyTop = hh - 5;

		// Dark navy outer body (sharp wedge)
		this.body.fillStyle(darkColor);
		const bl = this.t(-hw + 1 - f * 3, bodyBottom);
		const br = this.t(hw - 1 + f * 3, bodyBottom);
		const fr = this.t(hw + f * 6, bodyTop);
		const fl = this.t(-hw - f * 6, bodyTop);
		this.body.beginPath();
		this.body.moveTo(bl.x, bl.y);
		this.body.lineTo(br.x, br.y);
		this.body.lineTo(fr.x, fr.y);
		this.body.lineTo(fl.x, fl.y);
		this.body.closePath();
		this.body.fillPath();

		// Inner body highlight
		this.body.fillStyle(mainColor);
		const hbl = this.t(-hw + 4 - f * 3, bodyBottom + 2);
		const hbr = this.t(hw - 4 + f * 3, bodyBottom + 2);
		const hfr = this.t(hw - 1 + f * 6, bodyTop);
		const hfl = this.t(-hw + 1 - f * 6, bodyTop);
		this.body.beginPath();
		this.body.moveTo(hbl.x, hbl.y);
		this.body.lineTo(hbr.x, hbr.y);
		this.body.lineTo(hfr.x, hfr.y);
		this.body.lineTo(hfl.x, hfl.y);
		this.body.closePath();
		this.body.fillPath();

		// Red stripe accent along body center
		this.body.fillStyle(0xcc3333, 0.6);
		const sL = this.t(-hw + 6 - f * 2, bodyBottom + 5);
		const sR = this.t(hw - 6 + f * 2, bodyBottom + 5);
		const sRT = this.t(hw - 6 + f * 2, bodyBottom + 7);
		const sLT = this.t(-hw + 6 - f * 2, bodyBottom + 7);
		this.body.beginPath();
		this.body.moveTo(sL.x, sL.y);
		this.body.lineTo(sR.x, sR.y);
		this.body.lineTo(sRT.x, sRT.y);
		this.body.lineTo(sLT.x, sLT.y);
		this.body.closePath();
		this.body.fillPath();

		// Targeting sensor: one red dot "eye" on front (laser sight)
		const sensorPos = this.t(f * (hw + 3), bodyBottom + 5);
		this.body.fillStyle(0xff0000, 0.3);
		this.body.fillCircle(sensorPos.x, sensorPos.y, 5);
		this.body.fillStyle(0xff0000, 0.6);
		this.body.fillCircle(sensorPos.x, sensorPos.y, 3);
		this.body.fillStyle(0xff4444, 1.0);
		this.body.fillCircle(sensorPos.x, sensorPos.y, 1.5);

		// Box launcher (turret position)
		const launcherW = 15;
		const launcherH = 11;
		const lcx = f * this.typeDef.turretOffset;
		const lcy = hh;

		// Launcher outer shell
		this.body.fillStyle(darkColor);
		const l1 = this.t(lcx - launcherW / 2, lcy - launcherH / 2);
		const l2 = this.t(lcx + launcherW / 2, lcy - launcherH / 2);
		const l3 = this.t(lcx + launcherW / 2, lcy + launcherH / 2);
		const l4 = this.t(lcx - launcherW / 2, lcy + launcherH / 2);
		this.body.beginPath();
		this.body.moveTo(l1.x, l1.y);
		this.body.lineTo(l2.x, l2.y);
		this.body.lineTo(l3.x, l3.y);
		this.body.lineTo(l4.x, l4.y);
		this.body.closePath();
		this.body.fillPath();

		// 4 missile tubes (dark holes clearly visible)
		this.body.fillStyle(0x1a1a1a);
		for (let row = -1; row <= 1; row += 2) {
			for (let col = -1; col <= 1; col += 2) {
				const tube = this.t(lcx + col * 3.5, lcy + row * 2.8);
				this.body.fillCircle(tube.x, tube.y, 2.5);
			}
		}
		// Missile tips visible inside tubes
		this.body.fillStyle(0x555555, 0.5);
		for (let row = -1; row <= 1; row += 2) {
			for (let col = -1; col <= 1; col += 2) {
				const tube = this.t(lcx + col * 3.5, lcy + row * 2.8);
				this.body.fillCircle(tube.x, tube.y, 1);
			}
		}

		// Precision crosshair mark on launcher
		this.body.lineStyle(0.8, 0xff4444, 0.5);
		const chC = this.t(lcx, lcy);
		this.body.strokeCircle(chC.x, chC.y, 3);
		const chL = this.t(lcx - 5, lcy);
		const chR = this.t(lcx + 5, lcy);
		this.body.beginPath();
		this.body.moveTo(chL.x, chL.y);
		this.body.lineTo(chR.x, chR.y);
		this.body.strokePath();
		const chB = this.t(lcx, lcy - 5);
		const chT = this.t(lcx, lcy + 5);
		this.body.beginPath();
		this.body.moveTo(chB.x, chB.y);
		this.body.lineTo(chT.x, chT.y);
		this.body.strokePath();

		// Small radar dish on top
		const radarBase = this.t(lcx - f * 4, lcy + launcherH / 2);
		const radarTip = this.t(lcx - f * 4, lcy + launcherH / 2 + 6);
		this.body.lineStyle(1, 0x666666);
		this.body.beginPath();
		this.body.moveTo(radarBase.x, radarBase.y);
		this.body.lineTo(radarTip.x, radarTip.y);
		this.body.strokePath();
		const radarDish = this.t(lcx - f * 4, lcy + launcherH / 2 + 6);
		this.body.fillStyle(0x888888);
		this.body.fillCircle(radarDish.x, radarDish.y, 2.5);
		this.body.fillStyle(0xaaaaaa);
		this.body.fillCircle(radarDish.x, radarDish.y, 1);
	}

	// ─── 레이저 (신비한 마법사 / Mystic Mage) ───
	private drawLaserBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// Anti-gravity skids with glow underneath (instead of tracks)
		// Glow under skids
		this.body.fillStyle(0x00ffff, 0.1);
		const gL = this.t(-hw + 2, -2);
		this.body.fillEllipse(gL.x, gL.y, 16, 6);
		const gR = this.t(hw - 2, -2);
		this.body.fillEllipse(gR.x, gR.y, 16, 6);
		this.body.fillStyle(0x00ffff, 0.2);
		const gL2 = this.t(-hw + 2, 0);
		this.body.fillEllipse(gL2.x, gL2.y, 12, 4);
		const gR2 = this.t(hw - 2, 0);
		this.body.fillEllipse(gR2.x, gR2.y, 12, 4);
		this.body.fillStyle(0x00ffff, 0.35);
		const gL3 = this.t(-hw + 2, 1);
		this.body.fillEllipse(gL3.x, gL3.y, 8, 3);
		const gR3 = this.t(hw - 2, 1);
		this.body.fillEllipse(gR3.x, gR3.y, 8, 3);

		// Smooth anti-gravity skid pads
		this.body.fillStyle(0x556666);
		const skL1 = this.t(-hw - 1, 0);
		const skL2 = this.t(-hw + 5, 0);
		const skL3 = this.t(-hw + 4, 4);
		const skL4 = this.t(-hw, 4);
		this.body.beginPath();
		this.body.moveTo(skL1.x, skL1.y);
		this.body.lineTo(skL2.x, skL2.y);
		this.body.lineTo(skL3.x, skL3.y);
		this.body.lineTo(skL4.x, skL4.y);
		this.body.closePath();
		this.body.fillPath();
		const skR1 = this.t(hw + 1, 0);
		const skR2 = this.t(hw - 5, 0);
		const skR3 = this.t(hw - 4, 4);
		const skR4 = this.t(hw, 4);
		this.body.beginPath();
		this.body.moveTo(skR1.x, skR1.y);
		this.body.lineTo(skR2.x, skR2.y);
		this.body.lineTo(skR3.x, skR3.y);
		this.body.lineTo(skR4.x, skR4.y);
		this.body.closePath();
		this.body.fillPath();

		// Elegant curved body (organic teal feel)
		const bodyBottom = 4;
		const bodyTop = hh - 5;
		const bodyMid = (bodyBottom + bodyTop) / 2;

		this.body.fillStyle(darkColor);
		const b1 = this.t(-hw + 3, bodyBottom);
		const bm1 = this.t(-hw + 1, bodyMid);
		const b4 = this.t(-hw + 6 - f * 3, bodyTop);
		const b3 = this.t(hw - 6 + f * 3, bodyTop);
		const bm2 = this.t(hw - 1, bodyMid);
		const b2 = this.t(hw - 3, bodyBottom);
		this.body.beginPath();
		this.body.moveTo(b1.x, b1.y);
		this.body.lineTo(bm1.x, bm1.y);
		this.body.lineTo(b4.x, b4.y);
		this.body.lineTo(b3.x, b3.y);
		this.body.lineTo(bm2.x, bm2.y);
		this.body.lineTo(b2.x, b2.y);
		this.body.closePath();
		this.body.fillPath();

		// Body highlight (teal inner)
		this.body.fillStyle(mainColor);
		const h1 = this.t(-hw + 5, bodyBottom + 2);
		const hm1 = this.t(-hw + 3, bodyMid);
		const h4 = this.t(-hw + 8 - f * 3, bodyTop);
		const h3 = this.t(hw - 8 + f * 3, bodyTop);
		const hm2 = this.t(hw - 3, bodyMid);
		const h2 = this.t(hw - 5, bodyBottom + 2);
		this.body.beginPath();
		this.body.moveTo(h1.x, h1.y);
		this.body.lineTo(hm1.x, hm1.y);
		this.body.lineTo(h4.x, h4.y);
		this.body.lineTo(h3.x, h3.y);
		this.body.lineTo(hm2.x, hm2.y);
		this.body.lineTo(h2.x, h2.y);
		this.body.closePath();
		this.body.fillPath();

		// White/cyan energy accent lines on body
		this.body.lineStyle(0.8, 0x00ffff, 0.4);
		const acL = this.t(-hw + 6, bodyBottom + 4);
		const acR = this.t(hw - 6, bodyBottom + 4);
		this.body.beginPath();
		this.body.moveTo(acL.x, acL.y);
		this.body.lineTo(acR.x, acR.y);
		this.body.strokePath();

		// Crystal-like turret center (diamond shape + glow)
		const tox = f * this.typeDef.turretOffset;
		const tc = this.t(tox, hh);
		const tr = this.typeDef.turretRadius;

		// Outer energy ring 1
		this.body.lineStyle(1.5, 0x00ffff, 0.25);
		this.body.strokeCircle(tc.x, tc.y, tr + 5);
		// Outer energy ring 2
		this.body.lineStyle(1, 0x00ffff, 0.4);
		this.body.strokeCircle(tc.x, tc.y, tr + 3);

		// Turret base circle
		this.body.fillStyle(darkColor);
		this.body.fillCircle(tc.x, tc.y, tr + 1);
		this.body.fillStyle(mainColor);
		this.body.fillCircle(tc.x, tc.y, tr);

		// Crystal diamond shape in center
		const dTop = this.t(tox, hh + tr * 0.7);
		const dRight = this.t(tox + tr * 0.5, hh);
		const dBot = this.t(tox, hh - tr * 0.7);
		const dLeft = this.t(tox - tr * 0.5, hh);
		this.body.fillStyle(0x00ffff, 0.5);
		this.body.beginPath();
		this.body.moveTo(dTop.x, dTop.y);
		this.body.lineTo(dRight.x, dRight.y);
		this.body.lineTo(dBot.x, dBot.y);
		this.body.lineTo(dLeft.x, dLeft.y);
		this.body.closePath();
		this.body.fillPath();
		// Crystal inner glow
		this.body.fillStyle(0xffffff, 0.4);
		this.body.fillCircle(tc.x, tc.y, 2);
		this.body.fillStyle(0x00ffff, 0.6);
		this.body.fillCircle(tc.x, tc.y, 3.5);

		// Floating particles around turret (3-4 tiny cyan dots)
		const particleOffsets = [
			[tr + 4, 3], [-tr - 3, 5], [tr + 2, -4], [-tr - 5, -2],
		];
		for (let i = 0; i < particleOffsets.length; i++) {
			const px = tox + particleOffsets[i][0];
			const py = hh + particleOffsets[i][1];
			const pp = this.t(px, py);
			this.body.fillStyle(0x00ffff, 0.5 + i * 0.1);
			this.body.fillCircle(pp.x, pp.y, 1.2);
			this.body.fillStyle(0x00ffff, 0.15);
			this.body.fillCircle(pp.x, pp.y, 3);
		}
	}

	// ─── 카타펄트 (장난꾸러기 투석기 / Playful Catapult) ───
	private drawCatapultBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// Big wooden wheels with detailed spokes (6 spokes per wheel)
		const wheelR = 9;
		for (const side of [-1, 1]) {
			const wc = this.t(side * (hw * 0.6), wheelR);
			// Wheel outer rim
			this.body.fillStyle(0x5d4037);
			this.body.fillCircle(wc.x, wc.y, wheelR);
			// Lighter wood ring
			this.body.lineStyle(2, 0x795548);
			this.body.strokeCircle(wc.x, wc.y, wheelR - 1);
			// 6 spokes
			this.body.lineStyle(1.5, 0x8d6e63);
			for (let a = 0; a < 6; a++) {
				const rad = (a / 6) * Math.PI;
				const sx = wc.x + Math.cos(rad) * (wheelR - 2);
				const sy = wc.y - Math.sin(rad) * (wheelR - 2);
				const ex = wc.x - Math.cos(rad) * (wheelR - 2);
				const ey = wc.y + Math.sin(rad) * (wheelR - 2);
				this.body.beginPath();
				this.body.moveTo(sx, sy);
				this.body.lineTo(ex, ey);
				this.body.strokePath();
			}
			// Wheel hub (iron center)
			this.body.fillStyle(0x3e2723);
			this.body.fillCircle(wc.x, wc.y, 3.5);
			this.body.fillStyle(0x8d6e63);
			this.body.fillCircle(wc.x, wc.y, 1.5);
		}

		// Rustic wooden base platform
		const baseBottom = wheelR - 2;
		const baseTop = hh - 7;

		// Dark wood base
		this.body.fillStyle(darkColor);
		const bl = this.t(-hw - 1, baseBottom);
		const br = this.t(hw + 1, baseBottom);
		const btr = this.t(hw - 3, baseTop);
		const btl = this.t(-hw + 3, baseTop);
		this.body.beginPath();
		this.body.moveTo(bl.x, bl.y);
		this.body.lineTo(br.x, br.y);
		this.body.lineTo(btr.x, btr.y);
		this.body.lineTo(btl.x, btl.y);
		this.body.closePath();
		this.body.fillPath();

		// Lighter wood planks highlight
		this.body.fillStyle(mainColor);
		const pl = this.t(-hw + 2, baseBottom + 2);
		const pr = this.t(hw - 2, baseBottom + 2);
		const ptr = this.t(hw - 5, baseTop - 1);
		const ptl = this.t(-hw + 5, baseTop - 1);
		this.body.beginPath();
		this.body.moveTo(pl.x, pl.y);
		this.body.lineTo(pr.x, pr.y);
		this.body.lineTo(ptr.x, ptr.y);
		this.body.lineTo(ptl.x, ptl.y);
		this.body.closePath();
		this.body.fillPath();

		// Wood grain texture (horizontal lines)
		this.body.lineStyle(0.5, 0x6d4c41, 0.3);
		for (let g = 0; g < 3; g++) {
			const gy = baseBottom + 4 + g * 3;
			const grL = this.t(-hw + 4, gy);
			const grR = this.t(hw - 4, gy);
			this.body.beginPath();
			this.body.moveTo(grL.x, grL.y);
			this.body.lineTo(grR.x, grR.y);
			this.body.strokePath();
		}

		// Cute face on front wooden panel: two dark circle "eyes" + small smile
		const faceX = f * (hw - 3);
		const eye1Pos = this.t(faceX, baseBottom + 4);
		const eye2Pos = this.t(faceX, baseBottom + 8);
		this.body.fillStyle(0x3e2723);
		this.body.fillCircle(eye1Pos.x, eye1Pos.y, 2);
		this.body.fillCircle(eye2Pos.x, eye2Pos.y, 2);
		// Eye gleam
		this.body.fillStyle(0xffffff, 0.6);
		this.body.fillCircle(eye1Pos.x, eye1Pos.y, 0.8);
		this.body.fillCircle(eye2Pos.x, eye2Pos.y, 0.8);
		// Small smile curve (arc approximated with line)
		const smL = this.t(faceX, baseBottom + 3);
		const smM = this.t(faceX + f * 2, baseBottom + 6);
		const smR = this.t(faceX, baseBottom + 9);
		this.body.lineStyle(1, 0x3e2723, 0.7);
		this.body.beginPath();
		this.body.moveTo(smL.x, smL.y);
		this.body.lineTo(smM.x, smM.y);
		this.body.lineTo(smR.x, smR.y);
		this.body.strokePath();

		// Thick rope details wrapping around body
		this.body.lineStyle(1.5, 0xbcaaa4, 0.6);
		const rp1s = this.t(-hw + 6, baseBottom + 1);
		const rp1e = this.t(-hw + 6, baseTop);
		this.body.beginPath();
		this.body.moveTo(rp1s.x, rp1s.y);
		this.body.lineTo(rp1e.x, rp1e.y);
		this.body.strokePath();
		const rp2s = this.t(hw - 6, baseBottom + 1);
		const rp2e = this.t(hw - 6, baseTop);
		this.body.beginPath();
		this.body.moveTo(rp2s.x, rp2s.y);
		this.body.lineTo(rp2e.x, rp2e.y);
		this.body.strokePath();

		// Catapult mount pivot (turret)
		const tc = this.t(f * this.typeDef.turretOffset, hh);
		this.body.fillStyle(0x3e2723);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius + 1);
		this.body.fillStyle(mainColor);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius - 1);
		this.body.fillStyle(0x5d4037);
		this.body.fillCircle(tc.x, tc.y, 2);

		// Rope from body to pivot
		this.body.lineStyle(1, 0x8d6e63, 0.7);
		const rope1 = this.t(-f * 5, baseTop);
		const rope2 = this.t(f * this.typeDef.turretOffset, hh - 3);
		this.body.beginPath();
		this.body.moveTo(rope1.x, rope1.y);
		this.body.lineTo(rope2.x, rope2.y);
		this.body.strokePath();
		const rope3 = this.t(f * 5, baseTop);
		this.body.beginPath();
		this.body.moveTo(rope3.x, rope3.y);
		this.body.lineTo(rope2.x, rope2.y);
		this.body.strokePath();

		// Small flag/pennant on a stick
		const flagBase = this.t(-f * (hw - 4), baseTop);
		const flagTip = this.t(-f * (hw - 4), baseTop + 10);
		this.body.lineStyle(1, 0x5d4037);
		this.body.beginPath();
		this.body.moveTo(flagBase.x, flagBase.y);
		this.body.lineTo(flagTip.x, flagTip.y);
		this.body.strokePath();
		const fp1 = this.t(-f * (hw - 4), baseTop + 10);
		const fp2 = this.t(-f * (hw - 4) - f * 5, baseTop + 8);
		const fp3 = this.t(-f * (hw - 4), baseTop + 6);
		this.body.fillStyle(0xffab40);
		this.body.beginPath();
		this.body.moveTo(fp1.x, fp1.y);
		this.body.lineTo(fp2.x, fp2.y);
		this.body.lineTo(fp3.x, fp3.y);
		this.body.closePath();
		this.body.fillPath();
	}

	/** 공통 무한궤도 그리기 */
	private drawTrack(trackW: number, trackH: number, tankColor?: number, wheelCount = 3): void {
		// Track body
		const tbl = this.t(-trackW, 0);
		const tbr = this.t(trackW, 0);
		const ttr = this.t(trackW, trackH);
		const ttl = this.t(-trackW, trackH);

		this.body.fillStyle(0x2c2c2c);
		this.body.beginPath();
		this.body.moveTo(tbl.x, tbl.y);
		this.body.lineTo(tbr.x, tbr.y);
		this.body.lineTo(ttr.x, ttr.y);
		this.body.lineTo(ttl.x, ttl.y);
		this.body.closePath();
		this.body.fillPath();

		// Track tread marks (small vertical lines along the track)
		this.body.lineStyle(0.8, 0x3a3a3a, 0.6);
		const treadCount = Math.floor(trackW * 2 / 4);
		for (let i = 0; i < treadCount; i++) {
			const tx = -trackW + 2 + i * 4;
			const tBot = this.t(tx, 0.5);
			const tTop = this.t(tx, trackH - 0.5);
			this.body.beginPath();
			this.body.moveTo(tBot.x, tBot.y);
			this.body.lineTo(tTop.x, tTop.y);
			this.body.strokePath();
		}

		// Wheels (configurable count: 3 default, 5 for heavy)
		const wheelR = wheelCount >= 5 ? 4.5 : 5;
		const innerR = wheelCount >= 5 ? 2.5 : 3;
		this.body.fillStyle(0x555555);
		for (let i = 0; i < wheelCount; i++) {
			const ratio = wheelCount === 1 ? 0 : (i / (wheelCount - 1)) * 2 - 1;
			const wx = ratio * (trackW * 0.7);
			const wheel = this.t(wx, trackH * 0.5);
			this.body.fillCircle(wheel.x, wheel.y, wheelR);
		}
		this.body.fillStyle(0x3a3a3a);
		for (let i = 0; i < wheelCount; i++) {
			const ratio = wheelCount === 1 ? 0 : (i / (wheelCount - 1)) * 2 - 1;
			const wx = ratio * (trackW * 0.7);
			const wheel = this.t(wx, trackH * 0.5);
			this.body.fillCircle(wheel.x, wheel.y, innerR);
		}
		// Wheel axle dots
		this.body.fillStyle(0x666666);
		for (let i = 0; i < wheelCount; i++) {
			const ratio = wheelCount === 1 ? 0 : (i / (wheelCount - 1)) * 2 - 1;
			const wx = ratio * (trackW * 0.7);
			const wheel = this.t(wx, trackH * 0.5);
			this.body.fillCircle(wheel.x, wheel.y, 1);
		}

		// Track guard/fender on top (thin colored line matching tank)
		if (tankColor !== undefined) {
			this.body.lineStyle(1.5, tankColor, 0.5);
			const fL = this.t(-trackW + 1, trackH + 0.5);
			const fR = this.t(trackW - 1, trackH + 0.5);
			this.body.beginPath();
			this.body.moveTo(fL.x, fL.y);
			this.body.lineTo(fR.x, fR.y);
			this.body.strokePath();
		}
	}

	/** 플레이어 인디케이터 (탱크 위 삼각 깃발) */
	private drawPlayerIndicator(): void {
		if (this.destroyed) {
			this.nameLabel.setVisible(false);
			this.turnMarker.setVisible(false);
			return;
		}
		// 이름 라벨: HP 바 위에 위치
		const turretPos = this.getTurretPosition();
		this.nameLabel.setPosition(turretPos.x, turretPos.y - 24);
		// 턴 마커: 이름 위에 위치
		this.turnMarker.setPosition(turretPos.x, turretPos.y - 38);
	}

	/** 턴 표시 마커 On/Off */
	setTurnActive(active: boolean): void {
		this.turnMarker.setVisible(active);
		if (active) {
			// 바운스 애니메이션
			this.scene.tweens.killTweensOf(this.turnMarker);
			this.turnMarker.setAlpha(1);
			this.scene.tweens.add({
				targets: this.turnMarker,
				y: this.turnMarker.y - 6,
				duration: 600,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut",
			});
			// 대기 애니메이션 시작
			this.startIdleAnimation();
		} else {
			this.scene.tweens.killTweensOf(this.turnMarker);
			// 대기 애니메이션 중지
			this.stopIdleAnimation();
		}
	}

	/** AI 대전 시 이름 변경 */
	setDisplayName(name: string): void {
		this.nameLabel.setText(name);
	}

	private drawDamageMarks(): void {
		this.body.lineStyle(1.5, 0x333333, 0.6);
		const crack1Start = this.t(-8, 14);
		const crack1End = this.t(-3, 20);
		this.body.beginPath();
		this.body.moveTo(crack1Start.x, crack1Start.y);
		this.body.lineTo(crack1End.x, crack1End.y);
		this.body.strokePath();

		const crack2Start = this.t(6, 12);
		const crack2End = this.t(10, 18);
		this.body.beginPath();
		this.body.moveTo(crack2Start.x, crack2Start.y);
		this.body.lineTo(crack2End.x, crack2End.y);
		this.body.strokePath();

		this.body.fillStyle(0x222222, 0.3);
		const scorch = this.t(5, 16);
		this.body.fillCircle(scorch.x, scorch.y, 4);
	}

	private drawDestroyedOverlay(): void {
		this.body.lineStyle(2, 0x111111, 0.7);
		const cracks = [
			[this.t(-12, 10), this.t(0, 22)],
			[this.t(5, 8), this.t(12, 20)],
			[this.t(-5, 18), this.t(8, 14)],
		];
		for (const [start, end] of cracks) {
			this.body.beginPath();
			this.body.moveTo(start.x, start.y);
			this.body.lineTo(end.x, end.y);
			this.body.strokePath();
		}

		this.body.fillStyle(0x111111, 0.4);
		const s1 = this.t(-6, 16);
		const s2 = this.t(8, 14);
		this.body.fillCircle(s1.x, s1.y, 6);
		this.body.fillCircle(s2.x, s2.y, 5);

		this.body.fillStyle(0x444444, 0.3);
		const smoke = this.t(0, this.typeDef.height + 6);
		this.body.fillCircle(smoke.x, smoke.y, 4);
		const smoke2 = this.t(-3, this.typeDef.height + 12);
		this.body.fillCircle(smoke2.x, smoke2.y, 3);
	}

	private drawHpBar(turretX: number, turretY: number): void {
		this.hpBarGfx.clear();
		if (this.destroyed) return;
		const barW = 40;
		const barH = 6;
		const bx = turretX - barW / 2;
		const by = turretY - 22;

		// 배경 (그림자)
		this.hpBarGfx.fillStyle(0x000000, 0.5);
		this.hpBarGfx.fillRoundedRect(bx - 1, by - 1, barW + 2, barH + 2, 3);

		// 어두운 배경
		this.hpBarGfx.fillStyle(0x1a1a2e, 0.9);
		this.hpBarGfx.fillRoundedRect(bx, by, barW, barH, 3);

		// HP 채움
		const ratio = this.health / CONFIG.TANK_HP;
		const color = ratio > 0.5 ? 0x2ecc71 : ratio > 0.25 ? 0xf39c12 : 0xe74c3c;
		const fillW = Math.max(barW * ratio, ratio > 0 ? barH : 0);
		if (fillW > 0) {
			this.hpBarGfx.fillStyle(color, 1);
			this.hpBarGfx.fillRoundedRect(bx, by, fillW, barH, 3);
			// 하이라이트
			this.hpBarGfx.fillStyle(0xffffff, 0.2);
			this.hpBarGfx.fillRoundedRect(bx + 1, by + 1, fillW - 2, barH / 2, 2);
		}

		// 테두리
		this.hpBarGfx.lineStyle(1, 0xffffff, 0.15);
		this.hpBarGfx.strokeRoundedRect(bx, by, barW, barH, 3);
	}

	drawBarrel(): void {
		this.barrel.clear();
		const turretPos = this.getTurretPosition();
		const worldAngleRad = Phaser.Math.DegToRad(this.getWorldAngle());
		const len = this.typeDef.barrelLength;
		const cosA = Math.cos(worldAngleRad);
		const sinA = Math.sin(worldAngleRad);
		const endX = turretPos.x + cosA * len;
		const endY = turretPos.y - sinA * len;

		if (this.destroyed) {
			const brokenLen = len * 0.5;
			const brokenAngle = worldAngleRad - 0.3;
			const bx = turretPos.x + Math.cos(brokenAngle) * brokenLen;
			const by = turretPos.y - Math.sin(brokenAngle) * brokenLen;
			this.barrel.lineStyle(4, 0x333333);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(bx, by);
			this.barrel.strokePath();
			return;
		}

		const style = this.typeDef.style;

		if (style === "cannon") {
			// Classic round barrel with muzzle brake (wider tip)
			this.barrel.lineStyle(6, 0x2c2c2c);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			this.barrel.lineStyle(3, 0x4a4a4a);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			// Muzzle brake (wider tip ring)
			const brakeX = endX - cosA * 3;
			const brakeY = endY + sinA * 3;
			this.barrel.lineStyle(8, 0x2c2c2c);
			this.barrel.beginPath();
			this.barrel.moveTo(brakeX, brakeY);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			this.barrel.fillStyle(0x222222);
			this.barrel.fillCircle(endX, endY, 4.5);
			this.barrel.fillStyle(0x333333);
			this.barrel.fillCircle(endX, endY, 2);
		} else if (style === "heavy") {
			// Extra thick barrel with muzzle brake (3 rings at tip)
			this.barrel.lineStyle(9, 0x2c2c2c);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			this.barrel.lineStyle(5, 0x4a4a4a);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			// 3 muzzle brake rings near tip
			for (let r = 0; r < 3; r++) {
				const dist = 3 + r * 4;
				const rx = endX - cosA * dist;
				const ry = endY + sinA * dist;
				this.barrel.lineStyle(1.5, 0x555555);
				this.barrel.strokeCircle(rx, ry, 5);
			}
			this.barrel.fillStyle(0x222222);
			this.barrel.fillCircle(endX, endY, 5);
			this.barrel.fillStyle(0x333333);
			this.barrel.fillCircle(endX, endY, 2.5);
		} else if (style === "missile") {
			// Thin barrel with red tip
			this.barrel.lineStyle(5, 0x2c2c2c);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			this.barrel.lineStyle(2.5, 0x4a4a4a);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			// Red tip
			this.barrel.fillStyle(0xcc3333);
			this.barrel.fillCircle(endX, endY, 3);
			this.barrel.fillStyle(0xff4444, 0.6);
			this.barrel.fillCircle(endX, endY, 1.5);
		} else if (style === "laser") {
			// Thin glowing barrel with energy pulse at tip
			this.barrel.lineStyle(3.5, 0x2c2c2c);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			this.barrel.lineStyle(1.5, 0x4a6a6a);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			// Energy pulse glow at tip (2-ring effect, larger glow)
			this.barrel.fillStyle(0x00ffff, 0.15);
			this.barrel.fillCircle(endX, endY, 10);
			this.barrel.fillStyle(0x00ffff, 0.3);
			this.barrel.fillCircle(endX, endY, 6);
			this.barrel.lineStyle(1, 0x00ffff, 0.5);
			this.barrel.strokeCircle(endX, endY, 8);
			this.barrel.lineStyle(0.8, 0x00ffff, 0.7);
			this.barrel.strokeCircle(endX, endY, 5);
			this.barrel.fillStyle(0x00ffff, 0.9);
			this.barrel.fillCircle(endX, endY, 2.5);
			this.barrel.fillStyle(0xffffff, 0.6);
			this.barrel.fillCircle(endX, endY, 1);
		} else if (style === "hover") {
			// Medium barrel with purple energy tip
			this.barrel.lineStyle(5.5, 0x2c2c2c);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			this.barrel.lineStyle(2.5, 0x4a4a4a);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			// Purple energy tip
			this.barrel.fillStyle(0x9c27b0, 0.3);
			this.barrel.fillCircle(endX, endY, 6);
			this.barrel.fillStyle(0xce93d8, 0.7);
			this.barrel.fillCircle(endX, endY, 3);
			this.barrel.fillStyle(0xffffff, 0.4);
			this.barrel.fillCircle(endX, endY, 1.5);
		} else if (style === "catapult") {
			// Wooden arm with rope wrapping + basket at end
			this.barrel.lineStyle(6, 0x5d4037);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			// Lighter wood highlight
			this.barrel.lineStyle(2.5, 0x8d6e63);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			// Rope wrapping marks along the arm
			this.barrel.lineStyle(1, 0xbcaaa4, 0.5);
			for (let r = 0; r < 4; r++) {
				const t = 0.2 + r * 0.2;
				const rx = turretPos.x + cosA * len * t;
				const ry = turretPos.y - sinA * len * t;
				// Perpendicular short line for rope wrap
				const px = -sinA * 4;
				const py = -cosA * 4;
				this.barrel.beginPath();
				this.barrel.moveTo(rx - px, ry - py);
				this.barrel.lineTo(rx + px, ry + py);
				this.barrel.strokePath();
			}
			// Basket at end (larger circle)
			this.barrel.fillStyle(0x5d4037);
			this.barrel.fillCircle(endX, endY, 7);
			this.barrel.fillStyle(0x8d6e63);
			this.barrel.fillCircle(endX, endY, 5);
			this.barrel.fillStyle(0xa1887f);
			this.barrel.fillCircle(endX, endY, 2.5);
		} else {
			// Fallback generic barrel
			this.barrel.lineStyle(6, 0x2c2c2c);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			this.barrel.lineStyle(3, 0x4a4a4a);
			this.barrel.beginPath();
			this.barrel.moveTo(turretPos.x, turretPos.y);
			this.barrel.lineTo(endX, endY);
			this.barrel.strokePath();
			this.barrel.fillStyle(0x222222);
			this.barrel.fillCircle(endX, endY, 3);
		}
	}

	private getTurretPosition(): { x: number; y: number } {
		const cosS = Math.cos(this.slopeRad);
		const sinS = Math.sin(this.slopeRad);
		const hh = this.typeDef.height;
		const turretOffset = this.facing * this.typeDef.turretOffset;
		return {
			x: this.x + turretOffset * cosS - hh * sinS,
			y: this.y - (turretOffset * sinS + hh * cosS),
		};
	}

	/** 충돌 판정용 원 목록 반환 */
	getHitCircles(): { x: number; y: number; r: number }[] {
		const cosS = Math.cos(this.slopeRad);
		const sinS = Math.sin(this.slopeRad);
		const f = this.facing;

		return this.typeDef.hitCircles.map((c) => {
			const lx = c.lx * f;
			const ly = c.ly;
			return {
				x: this.x + lx * cosS - ly * sinS,
				y: this.y - (lx * sinS + ly * cosS),
				r: c.r,
			};
		});
	}

	getMuzzlePosition(): { x: number; y: number } {
		const turret = this.getTurretPosition();
		const worldAngleRad = Phaser.Math.DegToRad(this.getWorldAngle());
		const len = this.typeDef.barrelLength + 4;
		return {
			x: turret.x + Math.cos(worldAngleRad) * len,
			y: turret.y - Math.sin(worldAngleRad) * len,
		};
	}
}
