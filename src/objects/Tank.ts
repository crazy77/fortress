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

	private getDamageState(): "normal" | "damaged" | "destroyed" {
		if (this.destroyed) return "destroyed";
		if (this.health <= CONFIG.TANK_HP * 0.5) return "damaged";
		return "normal";
	}

	private drawBody(): void {
		const state = this.getDamageState();
		if (state === "destroyed") {
			this.drawTankBody(0x444444, 0x333333);
			this.drawDestroyedOverlay();
		} else if (state === "damaged") {
			this.drawTankBody(this.typeDef.color, this.typeDef.colorDark);
			this.drawDamageMarks();
		} else {
			this.drawTankBody(this.typeDef.color, this.typeDef.colorDark);
		}
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

	// ─── 캐논 (기본) ───
	private drawCannonBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// 무한궤도
		const trackH = 8;
		const trackW = hw + 4;
		this.drawTrack(trackW, trackH);

		// 차체
		const bodyBottom = trackH;
		const bodyTop = hh - 4;
		const frontInset = f * 3;

		this.body.fillStyle(darkColor);
		this.body.beginPath();
		const bbl = this.t(-hw + 2, bodyBottom);
		const bbr = this.t(hw - 2, bodyBottom);
		const btr = this.t(hw - 4 + frontInset, bodyTop);
		const btl = this.t(-hw + 4 - frontInset, bodyTop);
		this.body.moveTo(bbl.x, bbl.y);
		this.body.lineTo(bbr.x, bbr.y);
		this.body.lineTo(btr.x, btr.y);
		this.body.lineTo(btl.x, btl.y);
		this.body.closePath();
		this.body.fillPath();

		// 본체 하이라이트
		this.body.fillStyle(mainColor);
		const hbl = this.t(-hw + 4, bodyBottom + 3);
		const hbr = this.t(hw - 4, bodyBottom + 3);
		const htr = this.t(hw - 6 + frontInset, bodyTop);
		const htl = this.t(-hw + 6 - frontInset, bodyTop);
		this.body.beginPath();
		this.body.moveTo(hbl.x, hbl.y);
		this.body.lineTo(hbr.x, hbr.y);
		this.body.lineTo(htr.x, htr.y);
		this.body.lineTo(htl.x, htl.y);
		this.body.closePath();
		this.body.fillPath();

		// 포탑 (둥근)
		const turretCenter = this.t(f * this.typeDef.turretOffset, hh);
		this.body.fillStyle(mainColor);
		this.body.fillCircle(
			turretCenter.x,
			turretCenter.y,
			this.typeDef.turretRadius,
		);
		const highlight = this.t(f * this.typeDef.turretOffset - f * 2, hh + 3);
		this.body.fillStyle(darkColor);
		this.body.fillCircle(highlight.x, highlight.y, 4);

		// 디테일
		const lightPos = this.t(f * (hw - 3), trackH + 5);
		this.body.fillStyle(0xf1c40f);
		this.body.fillCircle(lightPos.x, lightPos.y, 2.5);
		const exhaustPos = this.t(-f * (hw + 1), trackH + 4);
		this.body.fillStyle(0x555555);
		this.body.fillCircle(exhaustPos.x, exhaustPos.y, 2);
	}

	// ─── 호버 (미래) ───
	private drawHoverBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// 호버 패드 (바퀴 대신 빛나는 패드)
		const padH = 5;
		this.body.fillStyle(0x4fc3f7, 0.6);
		for (let i = -1; i <= 1; i++) {
			const padCenter = this.t(i * (hw * 0.6), padH * 0.5);
			this.body.fillEllipse(padCenter.x, padCenter.y, 10, 4);
		}
		// 패드 글로우
		this.body.fillStyle(0x81d4fa, 0.3);
		for (let i = -1; i <= 1; i++) {
			const padCenter = this.t(i * (hw * 0.6), 0);
			this.body.fillEllipse(padCenter.x, padCenter.y, 14, 6);
		}

		// 슬릭한 납작 차체
		const bodyBottom = padH;
		const bodyTop = hh - 6;
		this.body.fillStyle(darkColor);
		const bl = this.t(-hw, bodyBottom);
		const br = this.t(hw, bodyBottom);
		const tr = this.t(hw - 6 + f * 6, bodyTop);
		const tl = this.t(-hw + 6 - f * 6, bodyTop);
		this.body.beginPath();
		this.body.moveTo(bl.x, bl.y);
		this.body.lineTo(br.x, br.y);
		this.body.lineTo(tr.x, tr.y);
		this.body.lineTo(tl.x, tl.y);
		this.body.closePath();
		this.body.fillPath();

		// 차체 하이라이트 (더 날렵한 형태)
		this.body.fillStyle(mainColor);
		const hbl = this.t(-hw + 3, bodyBottom + 2);
		const hbr = this.t(hw - 3, bodyBottom + 2);
		const htr = this.t(hw - 8 + f * 6, bodyTop);
		const htl = this.t(-hw + 8 - f * 6, bodyTop);
		this.body.beginPath();
		this.body.moveTo(hbl.x, hbl.y);
		this.body.lineTo(hbr.x, hbr.y);
		this.body.lineTo(htr.x, htr.y);
		this.body.lineTo(htl.x, htl.y);
		this.body.closePath();
		this.body.fillPath();

		// 작은 뾰족한 포탑
		const tc = this.t(f * this.typeDef.turretOffset, hh);
		this.body.fillStyle(mainColor);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius);
		// 포탑 위 하이라이트 점
		const hl = this.t(f * this.typeDef.turretOffset, hh + 2);
		this.body.fillStyle(darkColor);
		this.body.fillCircle(hl.x, hl.y, 3);
	}

	// ─── 중전차 (현대) ───
	private drawHeavyBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// 두꺼운 무한궤도
		const trackH = 10;
		const trackW = hw + 6;
		this.drawTrack(trackW, trackH);

		// 두꺼운 차체 (장갑판 레이어)
		const bodyBottom = trackH;
		const bodyTop = hh - 2;

		// 외부 장갑판 (어두운)
		this.body.fillStyle(darkColor);
		const o1 = this.t(-hw - 2, bodyBottom);
		const o2 = this.t(hw + 2, bodyBottom);
		const o3 = this.t(hw, bodyTop);
		const o4 = this.t(-hw, bodyTop);
		this.body.beginPath();
		this.body.moveTo(o1.x, o1.y);
		this.body.lineTo(o2.x, o2.y);
		this.body.lineTo(o3.x, o3.y);
		this.body.lineTo(o4.x, o4.y);
		this.body.closePath();
		this.body.fillPath();

		// 내부 차체 (밝은)
		this.body.fillStyle(mainColor);
		const i1 = this.t(-hw + 3, bodyBottom + 2);
		const i2 = this.t(hw - 3, bodyBottom + 2);
		const i3 = this.t(hw - 4, bodyTop - 1);
		const i4 = this.t(-hw + 4, bodyTop - 1);
		this.body.beginPath();
		this.body.moveTo(i1.x, i1.y);
		this.body.lineTo(i2.x, i2.y);
		this.body.lineTo(i3.x, i3.y);
		this.body.lineTo(i4.x, i4.y);
		this.body.closePath();
		this.body.fillPath();

		// 장갑 리벳 (작은 점)
		this.body.fillStyle(0x555555);
		for (let ix = -1; ix <= 1; ix++) {
			const rivet = this.t(ix * (hw * 0.6), bodyBottom + 4);
			this.body.fillCircle(rivet.x, rivet.y, 1.5);
		}

		// 큰 사각형 포탑
		const tr = this.typeDef.turretRadius;
		const tc = this.t(f * this.typeDef.turretOffset, hh);
		this.body.fillStyle(mainColor);
		const t1 = this.t(f * this.typeDef.turretOffset - tr, hh - tr * 0.6);
		const t2 = this.t(f * this.typeDef.turretOffset + tr, hh - tr * 0.6);
		const t3 = this.t(f * this.typeDef.turretOffset + tr, hh + tr * 0.6);
		const t4 = this.t(f * this.typeDef.turretOffset - tr, hh + tr * 0.6);
		this.body.beginPath();
		this.body.moveTo(t1.x, t1.y);
		this.body.lineTo(t2.x, t2.y);
		this.body.lineTo(t3.x, t3.y);
		this.body.lineTo(t4.x, t4.y);
		this.body.closePath();
		this.body.fillPath();

		// 포탑 상면 하이라이트
		this.body.fillStyle(darkColor);
		this.body.fillCircle(tc.x, tc.y, 4);

		// 전면 장갑판 볼트
		const lightPos = this.t(f * (hw - 2), bodyBottom + 6);
		this.body.fillStyle(0xf1c40f);
		this.body.fillCircle(lightPos.x, lightPos.y, 3);
	}

	// ─── 미사일 (현대) ───
	private drawMissileBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// 무한궤도
		const trackH = 8;
		const trackW = hw + 3;
		this.drawTrack(trackW, trackH);

		// 각진 차체 (앞이 뾰족)
		const bodyBottom = trackH;
		const bodyTop = hh - 6;

		this.body.fillStyle(darkColor);
		const bl = this.t(-hw + 2, bodyBottom);
		const br = this.t(hw - 2, bodyBottom);
		const fr = this.t(hw + f * 4, bodyTop);
		const fl = this.t(-hw - f * 4, bodyTop);
		this.body.beginPath();
		this.body.moveTo(bl.x, bl.y);
		this.body.lineTo(br.x, br.y);
		this.body.lineTo(fr.x, fr.y);
		this.body.lineTo(fl.x, fl.y);
		this.body.closePath();
		this.body.fillPath();

		// 차체 하이라이트
		this.body.fillStyle(mainColor);
		const hbl = this.t(-hw + 5, bodyBottom + 2);
		const hbr = this.t(hw - 5, bodyBottom + 2);
		const hfr = this.t(hw - 2 + f * 4, bodyTop);
		const hfl = this.t(-hw + 2 - f * 4, bodyTop);
		this.body.beginPath();
		this.body.moveTo(hbl.x, hbl.y);
		this.body.lineTo(hbr.x, hbr.y);
		this.body.lineTo(hfr.x, hfr.y);
		this.body.lineTo(hfl.x, hfl.y);
		this.body.closePath();
		this.body.fillPath();

		// 박스 런처 (포탑 위치에 사각형 + 미사일 구멍)
		const launcherW = 14;
		const launcherH = 10;
		const lcx = f * this.typeDef.turretOffset;
		const lcy = hh;

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

		// 미사일 튜브 (작은 원)
		this.body.fillStyle(0x333333);
		for (let row = -1; row <= 1; row += 2) {
			for (let col = -1; col <= 1; col += 2) {
				const tube = this.t(lcx + col * 3, lcy + row * 2.5);
				this.body.fillCircle(tube.x, tube.y, 2);
			}
		}

		// 앞쪽 라이트
		const lightPos = this.t(f * (hw + 2), bodyBottom + 4);
		this.body.fillStyle(0xff4444);
		this.body.fillCircle(lightPos.x, lightPos.y, 2);
	}

	// ─── 레이저 (미래) ───
	private drawLaserBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// 슬릭한 스키드 (바퀴 대신)
		this.body.fillStyle(0x444444);
		const sl = this.t(-hw, 0);
		const sr = this.t(hw, 0);
		const slUp = this.t(-hw + 2, 4);
		const srUp = this.t(hw - 2, 4);
		this.body.beginPath();
		this.body.moveTo(sl.x, sl.y);
		this.body.lineTo(sr.x, sr.y);
		this.body.lineTo(srUp.x, srUp.y);
		this.body.lineTo(slUp.x, slUp.y);
		this.body.closePath();
		this.body.fillPath();

		// 슬릭 차체
		const bodyBottom = 4;
		const bodyTop = hh - 6;

		this.body.fillStyle(darkColor);
		const b1 = this.t(-hw + 4, bodyBottom);
		const b2 = this.t(hw - 4, bodyBottom);
		const b3 = this.t(hw - 8 + f * 4, bodyTop);
		const b4 = this.t(-hw + 8 - f * 4, bodyTop);
		this.body.beginPath();
		this.body.moveTo(b1.x, b1.y);
		this.body.lineTo(b2.x, b2.y);
		this.body.lineTo(b3.x, b3.y);
		this.body.lineTo(b4.x, b4.y);
		this.body.closePath();
		this.body.fillPath();

		// 차체 하이라이트
		this.body.fillStyle(mainColor);
		const h1 = this.t(-hw + 6, bodyBottom + 2);
		const h2 = this.t(hw - 6, bodyBottom + 2);
		const h3 = this.t(hw - 10 + f * 4, bodyTop);
		const h4 = this.t(-hw + 10 - f * 4, bodyTop);
		this.body.beginPath();
		this.body.moveTo(h1.x, h1.y);
		this.body.lineTo(h2.x, h2.y);
		this.body.lineTo(h3.x, h3.y);
		this.body.lineTo(h4.x, h4.y);
		this.body.closePath();
		this.body.fillPath();

		// 디시/안테나 포탑
		const tc = this.t(f * this.typeDef.turretOffset, hh);
		this.body.fillStyle(mainColor);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius);

		// 안테나 링
		this.body.lineStyle(1.5, darkColor);
		this.body.strokeCircle(tc.x, tc.y, this.typeDef.turretRadius + 3);

		// 에너지 글로우
		this.body.fillStyle(0x00ffff, 0.4);
		this.body.fillCircle(tc.x, tc.y, 4);
		this.body.fillStyle(0x00ffff, 0.2);
		this.body.fillCircle(tc.x, tc.y, 7);
	}

	// ─── 카타펄트 (고전) ───
	private drawCatapultBody(mainColor: number, darkColor: number): void {
		const hw = this.typeDef.width / 2;
		const hh = this.typeDef.height;
		const f = this.facing;

		// 큰 나무 바퀴
		this.body.fillStyle(0x5d4037);
		const wheelR = 8;
		for (const side of [-1, 1]) {
			const wc = this.t(side * (hw * 0.6), wheelR);
			this.body.fillCircle(wc.x, wc.y, wheelR);
			// 바퀴살
			this.body.lineStyle(1.5, 0x8d6e63);
			for (let a = 0; a < 4; a++) {
				const rad = (a / 4) * Math.PI;
				const sx = wc.x + Math.cos(rad) * wheelR;
				const sy = wc.y - Math.sin(rad) * wheelR;
				const ex = wc.x - Math.cos(rad) * wheelR;
				const ey = wc.y + Math.sin(rad) * wheelR;
				this.body.beginPath();
				this.body.moveTo(sx, sy);
				this.body.lineTo(ex, ey);
				this.body.strokePath();
			}
			// 바퀴 허브
			this.body.fillStyle(0x3e2723);
			this.body.fillCircle(wc.x, wc.y, 3);
			this.body.fillStyle(0x5d4037);
		}

		// 나무 베이스 (넓은 판)
		const baseBottom = wheelR - 2;
		const baseTop = hh - 8;

		this.body.fillStyle(darkColor);
		const bl = this.t(-hw, baseBottom);
		const br = this.t(hw, baseBottom);
		const tr = this.t(hw - 4, baseTop);
		const tl = this.t(-hw + 4, baseTop);
		this.body.beginPath();
		this.body.moveTo(bl.x, bl.y);
		this.body.lineTo(br.x, br.y);
		this.body.lineTo(tr.x, tr.y);
		this.body.lineTo(tl.x, tl.y);
		this.body.closePath();
		this.body.fillPath();

		// 나무 판자 무늬 (하이라이트)
		this.body.fillStyle(mainColor);
		const pl = this.t(-hw + 3, baseBottom + 2);
		const pr = this.t(hw - 3, baseBottom + 2);
		const ptr = this.t(hw - 6, baseTop - 1);
		const ptl = this.t(-hw + 6, baseTop - 1);
		this.body.beginPath();
		this.body.moveTo(pl.x, pl.y);
		this.body.lineTo(pr.x, pr.y);
		this.body.lineTo(ptr.x, ptr.y);
		this.body.lineTo(ptl.x, ptl.y);
		this.body.closePath();
		this.body.fillPath();

		// 포탑: 투석기 마운트 (작은 원형 피벗)
		const tc = this.t(f * this.typeDef.turretOffset, hh);
		this.body.fillStyle(0x3e2723);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius);
		this.body.fillStyle(mainColor);
		this.body.fillCircle(tc.x, tc.y, this.typeDef.turretRadius - 3);

		// 밧줄 디테일
		this.body.lineStyle(1, 0x8d6e63, 0.6);
		const rope1 = this.t(-f * 6, baseTop);
		const rope2 = this.t(f * this.typeDef.turretOffset, hh - 4);
		this.body.beginPath();
		this.body.moveTo(rope1.x, rope1.y);
		this.body.lineTo(rope2.x, rope2.y);
		this.body.strokePath();
	}

	/** 공통 무한궤도 그리기 */
	private drawTrack(trackW: number, trackH: number): void {
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

		// 바퀴 (3개)
		this.body.fillStyle(0x555555);
		for (let i = -1; i <= 1; i++) {
			const wheel = this.t(i * (trackW * 0.6), trackH * 0.5);
			this.body.fillCircle(wheel.x, wheel.y, 5);
		}
		this.body.fillStyle(0x3a3a3a);
		for (let i = -1; i <= 1; i++) {
			const wheel = this.t(i * (trackW * 0.6), trackH * 0.5);
			this.body.fillCircle(wheel.x, wheel.y, 3);
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
		} else {
			this.scene.tweens.killTweensOf(this.turnMarker);
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
		const barW = 30;
		const barH = 4;
		const bx = turretX - barW / 2;
		const by = turretY - 18;

		this.hpBarGfx.fillStyle(0x000000, 0.4);
		this.hpBarGfx.fillRoundedRect(bx - 1, by - 1, barW + 2, barH + 2, 2);

		this.hpBarGfx.fillStyle(0x1a1a2e);
		this.hpBarGfx.fillRect(bx, by, barW, barH);

		const ratio = this.health / CONFIG.TANK_HP;
		const color = ratio > 0.5 ? 0x2ecc71 : ratio > 0.25 ? 0xf39c12 : 0xe74c3c;
		this.hpBarGfx.fillStyle(color);
		this.hpBarGfx.fillRect(bx, by, barW * ratio, barH);
	}

	drawBarrel(): void {
		this.barrel.clear();
		const turretPos = this.getTurretPosition();
		const worldAngleRad = Phaser.Math.DegToRad(this.getWorldAngle());
		const len = this.typeDef.barrelLength;
		const endX = turretPos.x + Math.cos(worldAngleRad) * len;
		const endY = turretPos.y - Math.sin(worldAngleRad) * len;

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

		const thickness =
			this.typeDef.style === "heavy"
				? 8
				: this.typeDef.style === "laser"
					? 3
					: 6;
		const innerThickness =
			this.typeDef.style === "heavy"
				? 5
				: this.typeDef.style === "laser"
					? 1.5
					: 3;

		// 포신 외곽
		this.barrel.lineStyle(thickness, 0x2c2c2c);
		this.barrel.beginPath();
		this.barrel.moveTo(turretPos.x, turretPos.y);
		this.barrel.lineTo(endX, endY);
		this.barrel.strokePath();

		// 포신 내부
		this.barrel.lineStyle(innerThickness, 0x4a4a4a);
		this.barrel.beginPath();
		this.barrel.moveTo(turretPos.x, turretPos.y);
		this.barrel.lineTo(endX, endY);
		this.barrel.strokePath();

		// 포구
		this.barrel.fillStyle(0x222222);
		this.barrel.fillCircle(endX, endY, thickness / 2);

		// 레이저 글로우 팁
		if (this.typeDef.style === "laser") {
			this.barrel.fillStyle(0x00ffff, 0.8);
			this.barrel.fillCircle(endX, endY, 3);
			this.barrel.fillStyle(0x00ffff, 0.3);
			this.barrel.fillCircle(endX, endY, 6);
		}

		// 카타펄트: 포신 끝에 바구니
		if (this.typeDef.style === "catapult") {
			this.barrel.fillStyle(0x5d4037);
			this.barrel.fillCircle(endX, endY, 5);
			this.barrel.fillStyle(0x8d6e63);
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
