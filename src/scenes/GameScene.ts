import Phaser from "phaser";
import { CONFIG, drawPanel } from "../config";
import { Projectile } from "../objects/Projectile";
import { Tank } from "../objects/Tank";
import {
	ALL_TANKS,
	getEraMultiplier,
	TANK_CANNON,
	type TankTypeDef,
} from "../objects/TankDefs";
import { Terrain } from "../objects/Terrain";
import type { AIDifficulty } from "../systems/AIPlayer";
import { AIPlayer } from "../systems/AIPlayer";
import { type AchievementContext, getAchievementManager, showAchievementPopup } from "../systems/AchievementSystem";
import { AudioSystem, vibrate } from "../systems/AudioSystem";
import { getBGM } from "../systems/BGMSystem";
import { ConfettiEffect, WaterEffect, screenFlash, slowMotionKillCam } from "../systems/EffectsSystem";
import { StatsTracker } from "../systems/GameStats";
import { InputHandler } from "../systems/InputHandler";
import { MatchManager } from "../systems/MatchManager";
import { ItemManager, getItemDef } from "../systems/PowerUpSystem";
import { TurnManager, TurnState } from "../systems/TurnManager";
import { WeaponSystem } from "../systems/WeaponSystem";
import { WeatherSystem, getWeatherForMap } from "../systems/WeatherSystem";
import { WindSystem } from "../systems/WindSystem";

export class GameScene extends Phaser.Scene {
	private terrain!: Terrain;
	private tanks!: [Tank, Tank];
	private projectiles: Projectile[] = [];
	private turnManager!: TurnManager;
	private windSystem!: WindSystem;
	private inputHandler!: InputHandler;
	weaponSystem!: WeaponSystem;
	private explosionEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
	private moveLeftBtn!: Phaser.GameObjects.Container;
	private moveRightBtn!: Phaser.GameObjects.Container;
	private movingDirection: -1 | 0 | 1 = 0;
	audio!: AudioSystem;
	private clouds: Phaser.GameObjects.Graphics[] = [];
	private pendingImpacts = 0;
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: tracked for salvo stats
	private totalDamageThisSalvo = 0;

	/** 마지막으로 틱 사운드를 재생한 초 (중복 방지) */
	private lastTickSecond = -1;

	// AI
	private aiEnabled = false;
	private aiDifficulty: AIDifficulty = "normal";
	private aiPlayer: AIPlayer | null = null;
	private aiThinking = false;
	private aiThinkTimer: Phaser.Time.TimerEvent | null = null;

	// 매치
	private matchManager!: MatchManager;
	private statsTrackers!: [StatsTracker, StatsTracker];
	private tankTypes: [TankTypeDef, TankTypeDef] = [TANK_CANNON, TANK_CANNON];

	// 아이템
	private itemManager!: ItemManager;
	/** 턴별 활성 버프 (발사 전 아이템 사용으로 설정) */
	private activeBuffs: {
		powerUp: boolean;
		damageUp: boolean;
		doubleShot: boolean;
		fireUp: boolean;
		doubleTurn: boolean;
	} = { powerUp: false, damageUp: false, doubleShot: false, fireUp: false, doubleTurn: false };
	/** 쉴드 (플레이어별) */
	private shields: number[] = [0, 0];
	/** 디버프 (플레이어별, 남은 턴 수) */
	private debuffs: { angleLock: number; moveLock: number }[] = [
		{ angleLock: 0, moveLock: 0 },
		{ angleLock: 0, moveLock: 0 },
	];

	// 맵
	private selectedMapId?: string;
	/** 맵 중력 배율 */
	private mapGravity = 1.0;
	/** 맵 바람 배율 */
	private mapWindMul = 1.0;

	// 낮/밤 시스템
	private timeOfDay: "dawn" | "day" | "dusk" | "night" = "day";

	// 배경 별 (밤)
	private starsGfx: Phaser.GameObjects.Graphics | null = null;

	// 미니맵
	private minimapGfx!: Phaser.GameObjects.Graphics;
	private minimapBg!: Phaser.GameObjects.Graphics;

	// 새 시스템
	private weatherSystem: WeatherSystem | null = null;
	private waterEffect: WaterEffect | null = null;
	private confettiEffect: ConfettiEffect | null = null;
	private usedItemsCount = 0;
	private selfDamageDealt = false;
	private resolvedMapId = "";

	constructor() {
		super("GameScene");
	}

	init(data?: {
		aiEnabled?: boolean;
		aiDifficulty?: AIDifficulty;
		totalRounds?: 3 | 5;
		matchManager?: MatchManager;
		statsTrackers?: [StatsTracker, StatsTracker];
		p1TankId?: string;
		p2TankId?: string;
		mapId?: string;
	}): void {
		this.aiEnabled = data?.aiEnabled ?? false;
		this.aiDifficulty = data?.aiDifficulty ?? "normal";
		this.aiPlayer = this.aiEnabled ? new AIPlayer(this.aiDifficulty) : null;

		this.matchManager = data?.matchManager
			? data.matchManager
			: new MatchManager(data?.totalRounds ?? 3);

		this.statsTrackers = data?.statsTrackers
			? data.statsTrackers
			: [new StatsTracker(), new StatsTracker()];

		const findTank = (id?: string): TankTypeDef =>
			ALL_TANKS.find((t) => t.id === id) ?? TANK_CANNON;
		this.tankTypes = [findTank(data?.p1TankId), findTank(data?.p2TankId)];

		this.aiThinking = false;
		this.aiThinkTimer = null;
		this.activeBuffs = { powerUp: false, damageUp: false, doubleShot: false, fireUp: false, doubleTurn: false };
		this.shields = [0, 0];
		this.debuffs = [{ angleLock: 0, moveLock: 0 }, { angleLock: 0, moveLock: 0 }];
		this.selectedMapId = data?.mapId;

		// 라운드마다 시간대 변경
		const times: Array<"dawn" | "day" | "dusk" | "night"> = [
			"day",
			"dusk",
			"night",
			"dawn",
		];
		this.timeOfDay = times[(this.matchManager.currentRound - 1) % 4];
	}

	create(): void {
		this.audio = new AudioSystem();
		this.weaponSystem = new WeaponSystem();
		this.itemManager = new ItemManager(2);
		this.usedItemsCount = 0;
		this.selfDamageDealt = false;

		this.drawSky();
		this.terrain = new Terrain(this, this.selectedMapId);
		this.resolvedMapId = this.terrain.mapId;
		this.mapGravity = this.terrain.traits.gravity;
		this.mapWindMul = this.terrain.traits.windMultiplier;

		// 탱크 배치 (넓은 맵에서 적절한 거리)
		const margin = CONFIG.TANK_WIDTH * 3;
		const minGap = CONFIG.WORLD_WIDTH * 0.25;
		let t1x: number;
		let t2x: number;
		do {
			t1x = margin + Math.random() * (CONFIG.WORLD_WIDTH - margin * 2);
			t2x = margin + Math.random() * (CONFIG.WORLD_WIDTH - margin * 2);
		} while (Math.abs(t1x - t2x) < minGap);

		this.tanks = [
			new Tank(this, t1x, this.terrain, 0, this.tankTypes[0]),
			new Tank(this, t2x, this.terrain, 1, this.tankTypes[1]),
		];
		this.tanks[0].faceToward(t2x);
		this.tanks[1].faceToward(t1x);

		// AI 대전 시 P2 이름을 "AI"로 변경
		if (this.aiEnabled) {
			this.tanks[1].setDisplayName(`AI ${this.tankTypes[1].name}`);
		}

		// 시스템
		this.turnManager = new TurnManager();
		this.turnManager.initTurnOrder(this.tanks.length);
		const first = this.turnManager.currentPlayer;
		this.turnManager.fuel = this.tankTypes[first].fuel;

		this.windSystem = new WindSystem();
		this.windSystem.randomize();

		// 턴 마커 갱신
		for (let i = 0; i < this.tanks.length; i++) {
			this.tanks[i].setTurnActive(i === first);
		}

		this.inputHandler = new InputHandler(this);
		this.inputHandler.activeTank = this.tanks[first];
		this.inputHandler.maxPower = this.tankTypes[first].maxPower;
		this.inputHandler.currentWind = this.windSystem.currentWind;
		this.inputHandler.mapGravity = this.mapGravity;
		this.inputHandler.mapWindMul = this.mapWindMul;
		this.inputHandler.onFire = (aim) => this.fire(aim.angle, aim.power);

		// 폭발 파티클 — 향상된 이펙트
		this.explosionEmitter = this.add.particles(0, 0, "__DEFAULT", {
			speed: { min: 60, max: 250 },
			scale: { start: 0.5, end: 0 },
			lifespan: 700,
			tint: [0xff4400, 0xff8800, 0xffcc00, 0xff6600, 0x444444],
			emitting: false,
			quantity: 25,
			alpha: { start: 1, end: 0 },
		});
		this.explosionEmitter.setDepth(6);

		// 카메라: 넓은 월드에 맞춤, 하늘 위로도 여유
		this.cameras.main.setBounds(
			0,
			-CONFIG.SKY_HEIGHT,
			CONFIG.WORLD_WIDTH,
			CONFIG.PLAY_HEIGHT + CONFIG.SKY_HEIGHT,
		);

		this.createMoveButtons();
		this.setupKeyboard();
		this.createMinimap();

		// 날씨 시스템
		const weatherType = getWeatherForMap(this.resolvedMapId, this.timeOfDay);
		if (weatherType !== "none") {
			this.weatherSystem = new WeatherSystem(this, weatherType);
		}

		// 물 애니메이션
		this.waterEffect = new WaterEffect(this, this.resolvedMapId);

		// 컨페티 이펙트
		this.confettiEffect = new ConfettiEffect(this);

		// BGM 시작
		getBGM().setMuted(this.audio.isMuted());
		getBGM().start("gameplay");

		// UI 씬
		this.scene.stop("UIScene");
		this.scene.launch("UIScene");
		this.time.delayedCall(0, () => this.emitUIUpdate());

		// UI에서 스킵 이벤트 수신
		this.events.on("skip-turn", () => this.skipTurn());
		this.events.on("use-item", (slotIndex: number) => this.useItem(slotIndex));

		// INTRO 상태로 시작 (AI/입력 모두 차단)
		this.turnManager.setState(TurnState.INTRO);
		this.playIntroCamera();
	}

	private playIntroCamera(): void {
		this.inputHandler.setEnabled(false);
		this.setMoveButtonsVisible(false);

		// 패닝 순서: 첫 턴 플레이어를 제외한 나머지를 턴 순서대로 → 마지막에 첫 턴 플레이어
		// 예: 턴 순서 [2,0,1], 첫 턴=2 → 패닝: 0→1→(최종)2
		const order = this.turnManager.getTurnOrder();
		const firstIdx = this.turnManager.currentPlayer;
		const panTargets: Tank[] = [];
		for (const idx of order) {
			if (idx !== firstIdx) panTargets.push(this.tanks[idx]);
		}

		// 시작: 첫 턴 플레이어 위치에서 출발
		const firstTank = this.tanks[firstIdx];
		this.cameras.main.centerOn(firstTank.x, firstTank.y - 40);

		let step = 0;
		const panNext = () => {
			if (step < panTargets.length) {
				const tank = panTargets[step];
				step++;
				this.cameras.main.pan(
					tank.x, tank.y - 30, 600, "Sine.easeInOut", false,
					(_c: Phaser.Cameras.Scene2D.Camera, p: number) => {
						if (p >= 1) this.time.delayedCall(350, panNext);
					},
				);
			} else {
				// 모든 상대 확인 후 → 첫 턴 플레이어에게 최종 복귀
				this.cameras.main.pan(
					firstTank.x, firstTank.y - 40, 500, "Sine.easeInOut",
				);
				this.time.delayedCall(600, () => {
					// INTRO 종료 → AIMING으로 전환 (이 시점부터 턴 시작)
					this.turnManager.setState(TurnState.AIMING);
					this.inputHandler.setEnabled(true);
					this.setMoveButtonsVisible(true);
				});
			}
		};

		// 첫 대기 후 시작
		this.time.delayedCall(300, panNext);
	}

	private createMoveButtons(): void {
		const btnSize = 56;

		const btnY = CONFIG.PLAY_HEIGHT - 52;
		this.moveLeftBtn = this.createArrowButton(36, btnY, btnSize, true);
		this.moveLeftBtn.on("pointerdown", () => {
			this.movingDirection = -1;
			this.inputHandler.blocked = true;
		});
		this.moveLeftBtn.on("pointerup", () => {
			if (this.movingDirection === -1) this.movingDirection = 0;
			this.inputHandler.blocked = false;
		});
		this.moveLeftBtn.on("pointerout", () => {
			if (this.movingDirection === -1) this.movingDirection = 0;
			this.inputHandler.blocked = false;
		});

		this.moveRightBtn = this.createArrowButton(104, btnY, btnSize, false);
		this.moveRightBtn.on("pointerdown", () => {
			this.movingDirection = 1;
			this.inputHandler.blocked = true;
		});
		this.moveRightBtn.on("pointerup", () => {
			if (this.movingDirection === 1) this.movingDirection = 0;
			this.inputHandler.blocked = false;
		});
		this.moveRightBtn.on("pointerout", () => {
			if (this.movingDirection === 1) this.movingDirection = 0;
			this.inputHandler.blocked = false;
		});
	}

	private createArrowButton(
		x: number,
		y: number,
		size: number,
		isLeft: boolean,
	): Phaser.GameObjects.Container {
		const gfx = this.add.graphics();
		drawPanel(gfx, -size / 2, -size / 2, size, size, 12);

		const dir = isLeft ? -1 : 1;
		const arrowSize = 14;
		gfx.fillStyle(0xaab2c8, 0.9);
		gfx.fillTriangle(
			dir * arrowSize,
			0,
			dir * -arrowSize,
			-arrowSize,
			dir * -arrowSize,
			arrowSize,
		);

		const container = this.add.container(x, y, [gfx]);
		container.setSize(size, size);
		container.setInteractive();
		container.setDepth(20);
		container.setScrollFactor(0);

		return container;
	}

	private setupKeyboard(): void {
		if (!this.input.keyboard) return;

		const left = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
		const right = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
		const a = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
		const d = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

		const onDown = (dir: -1 | 1) => {
			this.movingDirection = dir;
		};
		const onUp = (dir: -1 | 1) => {
			if (this.movingDirection === dir) this.movingDirection = 0;
		};

		left.on("down", () => onDown(-1));
		left.on("up", () => onUp(-1));
		a.on("down", () => onDown(-1));
		a.on("up", () => onUp(-1));

		right.on("down", () => onDown(1));
		right.on("up", () => onUp(1));
		d.on("down", () => onDown(1));
		d.on("up", () => onUp(1));

		// 턴 스킵 (S 키 또는 Space)
		const s = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
		const space = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
		s.on("down", () => this.skipTurn());
		space.on("down", () => this.skipTurn());
	}

	/** 현재 턴을 스킵 (발사하지 않고 넘김) */
	private skipTurn(): void {
		if (this.turnManager.state !== TurnState.AIMING) return;
		if (this.isCurrentPlayerAI()) return;
		this.audio.playSkip();
		this.cancelAIThink();
		this.endTurn();
	}

	private setMoveButtonsVisible(visible: boolean): void {
		this.moveLeftBtn.setVisible(visible);
		this.moveRightBtn.setVisible(visible);
		if (!visible) this.movingDirection = 0;
	}

	private setMoveButtonsEnabled(enabled: boolean): void {
		this.moveLeftBtn.setAlpha(enabled ? 1 : 0.5);
		this.moveRightBtn.setAlpha(enabled ? 1 : 0.5);
		// 연료 소진 시에도 방향 전환이 가능하므로 movingDirection을 리셋하지 않음
	}

	private createMinimap(): void {
		// 미니맵 배경 (화면 고정)
		this.minimapBg = this.add.graphics();
		this.minimapBg.setDepth(30);
		this.minimapBg.setScrollFactor(0);

		// 미니맵 내용 (화면 고정)
		this.minimapGfx = this.add.graphics();
		this.minimapGfx.setDepth(31);
		this.minimapGfx.setScrollFactor(0);
	}

	private updateMinimap(): void {
		const mmW = 180;
		const mmH = 40;
		const mmX = CONFIG.VIEW_WIDTH - mmW - 12;
		const mmY = CONFIG.PLAY_HEIGHT - mmH - 12;
		const scaleX = mmW / CONFIG.WORLD_WIDTH;
		const scaleY = mmH / CONFIG.PLAY_HEIGHT;

		// 배경
		this.minimapBg.clear();
		this.minimapBg.fillStyle(0x0a0e17, 0.7);
		this.minimapBg.fillRoundedRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4, 4);
		this.minimapBg.lineStyle(1, 0x2a3a5c, 0.5);
		this.minimapBg.strokeRoundedRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4, 4);

		this.minimapGfx.clear();

		// 지형 실루엣 (간략 — 10px 간격 샘플링)
		this.minimapGfx.lineStyle(1.5, 0x6abf5e, 0.7);
		this.minimapGfx.beginPath();
		for (let wx = 0; wx < CONFIG.WORLD_WIDTH; wx += 10) {
			const wy = this.terrain.getHeightAt(wx);
			const mx = mmX + wx * scaleX;
			const my = mmY + wy * scaleY;
			if (wx === 0) this.minimapGfx.moveTo(mx, my);
			else this.minimapGfx.lineTo(mx, my);
		}
		this.minimapGfx.strokePath();

		// 탱크 위치
		for (const tank of this.tanks) {
			const color = tank.playerIndex === 0 ? 0xe74c3c : 0x3498db;
			const tx = mmX + tank.x * scaleX;
			const ty = mmY + tank.y * scaleY;
			this.minimapGfx.fillStyle(color, 1);
			this.minimapGfx.fillCircle(tx, ty, 3);

			// 현재 턴 탱크 강조
			if (tank.playerIndex === this.turnManager.currentPlayer) {
				this.minimapGfx.lineStyle(1, color, 0.6);
				this.minimapGfx.strokeCircle(tx, ty, 5);
			}
		}

		// 카메라 뷰 영역 표시
		const cam = this.cameras.main;
		const vx = mmX + cam.scrollX * scaleX;
		const vy = mmY + Math.max(0, cam.scrollY) * scaleY;
		const vw = CONFIG.VIEW_WIDTH * scaleX;
		const vh = CONFIG.PLAY_HEIGHT * scaleY;
		this.minimapGfx.lineStyle(1, 0xffffff, 0.4);
		this.minimapGfx.strokeRect(vx, vy, vw, Math.min(vh, mmH - (vy - mmY)));
	}

	private drawSky(): void {
		const gfx = this.add.graphics();
		gfx.setDepth(-2);

		const palettes: Record<
			string,
			{ top: [number, number, number]; bottom: [number, number, number] }
		> = {
			dawn: { top: [0x2d, 0x1b, 0x69], bottom: [0xff, 0x8c, 0x69] },
			day: { top: [0x40, 0x80, 0xf0], bottom: [0x87, 0xce, 0xeb] },
			dusk: { top: [0x1a, 0x0a, 0x3e], bottom: [0xd4, 0x5d, 0x34] },
			night: { top: [0x0a, 0x0a, 0x1e], bottom: [0x15, 0x1e, 0x3a] },
		};

		const pal = palettes[this.timeOfDay];
		const skyTop = -CONFIG.SKY_HEIGHT;
		const skyTotal = CONFIG.PLAY_HEIGHT + CONFIG.SKY_HEIGHT;
		const steps = 30;
		for (let i = 0; i < steps; i++) {
			const t = i / steps;
			const r = Phaser.Math.Linear(pal.top[0], pal.bottom[0], t);
			const g = Phaser.Math.Linear(pal.top[1], pal.bottom[1], t);
			const b = Phaser.Math.Linear(pal.top[2], pal.bottom[2], t);
			const color = (r << 16) | (g << 8) | b;
			gfx.fillStyle(color);
			gfx.fillRect(
				-50,
				skyTop + (i / steps) * skyTotal,
				CONFIG.WORLD_WIDTH + 100,
				skyTotal / steps + 1,
			);
		}

		// 밤: 별 추가
		if (this.timeOfDay === "night") {
			this.starsGfx = this.add.graphics();
			this.starsGfx.setDepth(-1.5);
			for (let i = 0; i < 100; i++) {
				const sx = Math.random() * CONFIG.WORLD_WIDTH;
				const sy = -CONFIG.SKY_HEIGHT + Math.random() * (CONFIG.PLAY_HEIGHT * 0.5 + CONFIG.SKY_HEIGHT);
				const size = 0.5 + Math.random() * 1.5;
				const alpha = 0.3 + Math.random() * 0.7;
				this.starsGfx.fillStyle(0xffffff, alpha);
				this.starsGfx.fillCircle(sx, sy, size);
			}
		}

		// 구름 (밤에는 덜 보이게)
		this.clouds = [];
		const cloudAlphaBase = this.timeOfDay === "night" ? 0.1 : 0.3;
		for (let i = 0; i < 10; i++) {
			const cloud = this.add.graphics();
			cloud.setDepth(-1);
			const alpha = cloudAlphaBase + Math.random() * 0.15;
			const cloudColor =
				this.timeOfDay === "dusk"
					? 0xffccaa
					: this.timeOfDay === "dawn"
						? 0xffeedd
						: 0xffffff;
			cloud.fillStyle(cloudColor, alpha);
			const w = 60 + Math.random() * 100;
			const h = 20 + Math.random() * 15;
			cloud.fillEllipse(0, 0, w, h);
			cloud.fillEllipse(w * 0.3, -h * 0.2, w * 0.6, h * 0.8);
			cloud.fillEllipse(-w * 0.25, -h * 0.1, w * 0.5, h * 0.7);

			const cx = Math.random() * CONFIG.WORLD_WIDTH;
			const cy = -CONFIG.SKY_HEIGHT * 0.5 + Math.random() * (CONFIG.PLAY_HEIGHT * 0.3 + CONFIG.SKY_HEIGHT * 0.5);
			cloud.setPosition(cx, cy);
			this.clouds.push(cloud);
		}
	}

	private isCurrentPlayerAI(): boolean {
		return this.aiEnabled && this.turnManager.currentPlayer === 1;
	}

	update(_time: number, delta: number): void {
		// 구름 이동
		const windDir = this.windSystem.currentWind;
		for (const cloud of this.clouds) {
			cloud.x += windDir * 0.05 * (delta / 16);
			if (cloud.x > CONFIG.WORLD_WIDTH + 100) cloud.x = -100;
			if (cloud.x < -100) cloud.x = CONFIG.WORLD_WIDTH + 100;
		}

		// 파워업 낙하 업데이트 (상태 무관하게 항상)
		this.itemManager.updateFalling(this.terrain);

		// 날씨/물/컨페티 업데이트
		if (this.weatherSystem) {
			this.weatherSystem.setWind(this.windSystem.currentWind);
			this.weatherSystem.update(delta);
		}
		if (this.waterEffect) this.waterEffect.update(delta);
		if (this.confettiEffect) this.confettiEffect.update(delta);

		// 미니맵 갱신
		this.updateMinimap();

		switch (this.turnManager.state) {
			case TurnState.INTRO:
				// 카메라 시퀀스 중 — 입력/AI 모두 차단
				break;

			case TurnState.AIMING: {
				if (this.isCurrentPlayerAI()) {
					this.inputHandler.setEnabled(false);
					this.setMoveButtonsVisible(false);

					if (!this.aiThinking) {
						this.aiThinking = true;
						this.aiThinkTimer = this.time.delayedCall(1000, () => {
							this.executeAIShot();
						});
					}
				} else {
					this.inputHandler.setEnabled(true);
					this.setMoveButtonsVisible(true);
					const cp = this.turnManager.currentPlayer;
				if (this.movingDirection !== 0 && this.debuffs[cp].moveLock <= 0) {
						const tank = this.tanks[cp];
						if (this.turnManager.fuel > 0) {
							if (tank.tryMove(this.movingDirection)) {
								this.turnManager.consumeFuel();
								this.audio.playMove(this.tankTypes[this.turnManager.currentPlayer].style);

								// 이동 시 파워업 수집 체크
								this.checkItemCollection(this.turnManager.currentPlayer);

								this.emitUIUpdate();
							}
						} else {
							// 연료 없어도 방향 전환은 허용
							tank.turnToFace(this.movingDirection);
						}
						if (this.turnManager.fuel <= 0) {
							// 연료 소진 시 반투명 표시하되 방향 전환용으로 버튼은 유지
							this.setMoveButtonsEnabled(false);
							// 방향 전환은 가능하므로 버튼 자체는 숨기지 않음
						}
					}
				}
				this.turnManager.turnElapsed += delta / 1000;
				const timeLeft = CONFIG.TURN_TIME - this.turnManager.turnElapsed;
				if (timeLeft <= 0) {
					this.cancelAIThink();
					this.lastTickSecond = -1;
					this.endTurn();
					return;
				}
				// 5초 이하부터 매 초 틱 사운드
				if (timeLeft <= 5) {
					const sec = Math.ceil(timeLeft);
					if (sec !== this.lastTickSecond) {
						this.lastTickSecond = sec;
						this.audio.playTick();
					}
				}
				this.emitUIUpdate();
				break;
			}

			case TurnState.FLIGHT:
				this.inputHandler.setEnabled(false);
				this.setMoveButtonsVisible(false);
				this.updateProjectiles();
				break;

			case TurnState.IMPACT:
				break;

			case TurnState.CLEANUP:
				this.doCleanup();
				break;

			case TurnState.GAME_OVER:
				this.inputHandler.setEnabled(false);
				this.setMoveButtonsVisible(false);
				break;
		}
	}

	private checkItemCollection(player: number): void {
		const tank = this.tanks[player];
		const collected = this.itemManager.checkCollection(player, tank.x, tank.y);
		if (collected) {
			this.audio.playPickup();
			vibrate(30);
			this.emitUIUpdate();
		}
	}

	/** 인벤토리 슬롯의 아이템 사용 (UI에서 호출) */
	useItem(slotIndex: number): void {
		if (this.turnManager.state !== TurnState.AIMING) return;
		const player = this.turnManager.currentPlayer;
		const inv = this.itemManager.inventories[player];
		const itemType = inv.use(slotIndex);
		if (!itemType) return;

		this.audio.playPickup();
		vibrate(20);
		this.usedItemsCount++;
		const def = getItemDef(itemType);

		switch (itemType) {
			// 공격 버프 (다음 발사에 적용)
			case "powerUp":
				this.activeBuffs.powerUp = true;
				break;
			case "damageUp":
				this.activeBuffs.damageUp = true;
				break;
			case "doubleShot":
				this.activeBuffs.doubleShot = true;
				break;
			case "fireUp":
				this.activeBuffs.fireUp = true;
				break;
			// 방어/회복
			case "heal":
				this.tanks[player].heal(25);
				break;
			case "shield":
				this.shields[player] = 0.6;
				break;
			// 유틸리티
			case "moveUp":
				this.turnManager.fuel = Math.min(
					this.turnManager.fuel * 2,
					this.tankTypes[player].fuel * 2,
				);
				break;
			case "windReverse":
				this.windSystem.currentWind *= -1;
				this.inputHandler.currentWind = this.windSystem.currentWind;
				break;
			// 디버프 (턴 소모 — 상대에게 적용)
			case "angleLock": {
				const opponent = player === 0 ? 1 : 0;
				this.debuffs[opponent].angleLock = 3;
				break;
			}
			case "moveLock": {
				const opponent = player === 0 ? 1 : 0;
				this.debuffs[opponent].moveLock = 3;
				break;
			}
		}

		// 사용 알림
		const tank = this.tanks[player];
		const txt = this.add.text(tank.x, tank.y - 50, `${def.icon} ${def.name}`, {
			fontSize: "16px", color: "#ffffff", stroke: "#000000", strokeThickness: 3, fontStyle: "bold",
		});
		txt.setOrigin(0.5);
		txt.setDepth(20);
		this.tweens.add({
			targets: txt, y: txt.y - 40, alpha: 0, duration: 1000, ease: "Power2",
			onComplete: () => txt.destroy(),
		});

		this.emitUIUpdate();

		// 턴 소모 아이템이면 턴 종료
		if (!def.canAttackAfter) {
			this.endTurn();
		}
	}

	private executeAIShot(): void {
		if (!this.aiPlayer || this.turnManager.state !== TurnState.AIMING) {
			this.aiThinking = false;
			return;
		}

		const myTank = this.tanks[1];
		const opponentTank = this.tanks[0];
		const shot = this.aiPlayer.calculateShot(
			myTank,
			opponentTank,
			this.windSystem.currentWind,
			this.terrain,
			this.mapGravity,
			this.mapWindMul,
		);

		this.aiThinking = false;
		this.fire(shot.angle, shot.power);
	}

	private cancelAIThink(): void {
		if (this.aiThinkTimer) {
			this.aiThinkTimer.destroy();
			this.aiThinkTimer = null;
		}
		this.aiThinking = false;
	}

	private updateProjectiles(): void {
		const aliveProjectiles: Projectile[] = [];

		for (const proj of this.projectiles) {
			if (!proj.alive) continue;

			proj.update(this.windSystem.getForce());

			const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
			this.audio.playWhistle(speed, this.tankTypes[this.turnManager.currentPlayer].style);

			// 지형 충돌
			if (this.terrain.isSolid(proj.x, proj.y)) {
				// 지형 표면 법선 벡터 계산 (주변 지형 샘플링)
				const sampleR = 4;
				const solidL = this.terrain.isSolid(proj.x - sampleR, proj.y) ? 1 : 0;
				const solidR = this.terrain.isSolid(proj.x + sampleR, proj.y) ? 1 : 0;
				const solidU = this.terrain.isSolid(proj.x, proj.y - sampleR) ? 1 : 0;
				const solidD = this.terrain.isSolid(proj.x, proj.y + sampleR) ? 1 : 0;
				let nx = solidL - solidR;
				let ny = solidU - solidD;
				const len = Math.sqrt(nx * nx + ny * ny) || 1;
				nx /= len;
				ny /= len;

				if (proj.tryBounce(nx, ny)) {
					this.audio.playBounce();
					// 바운스 성공 — 지형 밖으로 밀어내기
					for (let step = 0; step < 20; step++) {
						if (!this.terrain.isSolid(proj.x, proj.y)) break;
						proj.x += nx;
						proj.y += ny;
					}
					aliveProjectiles.push(proj);
					continue;
				}
				this.impactSingle(proj);
				continue;
			}

			// 탱크 충돌
			const opponent = this.tanks[this.turnManager.currentPlayer === 0 ? 1 : 0];
			if (this.hitTestTank(proj, opponent)) {
				this.impactSingle(proj);
				continue;
			}

			const self = this.tanks[this.turnManager.currentPlayer];
			if (this.hitTestTank(proj, self)) {
				this.impactSingle(proj);
				continue;
			}

			if (!proj.alive) {
				proj.destroy();
				this.pendingImpacts--;
				continue;
			}

			aliveProjectiles.push(proj);
		}

		this.projectiles = aliveProjectiles;

		if (this.pendingImpacts <= 0 && this.projectiles.length === 0) {
			if (this.turnManager.state === TurnState.FLIGHT) {
				this.endTurn();
			}
		}
	}

	private fire(angle: number, power: number): void {
		if (this.turnManager.state !== TurnState.AIMING) return;

		const player = this.turnManager.currentPlayer;
		const weapon = this.weaponSystem.getCurrentWeapon(player);
		const tankType = this.tankTypes[player];

		const tank = this.tanks[player];
		tank.setAngle(angle);
		const muzzle = tank.getMuzzlePosition();
		const worldAngle = tank.getWorldAngle();

		// 파워UP 버프 적용
		let effectivePower = Phaser.Math.Clamp(
			power,
			CONFIG.MIN_POWER,
			tankType.maxPower,
		);
		// 활성 버프 적용 후 리셋
		if (this.activeBuffs.powerUp) {
			effectivePower = Math.min(effectivePower * 2, tankType.maxPower * 2);
			this.activeBuffs.powerUp = false;
		}
		const isDoubleShot = this.activeBuffs.doubleShot;
		if (isDoubleShot) this.activeBuffs.doubleShot = false;
		const isFireUp = this.activeBuffs.fireUp;
		if (isFireUp) this.activeBuffs.fireUp = false;

		this.projectiles = [];
		this.totalDamageThisSalvo = 0;

		// 발사 시점에 데미지 확정
		const weaponIdx = this.weaponSystem.getCurrentWeaponIndex(player);
		const usesTankStats = weaponIdx === 0;
		const dmgMul = this.activeBuffs.damageUp ? 2 : 1;
		if (this.activeBuffs.damageUp) this.activeBuffs.damageUp = false;

		const resolvedDamage = {
			explosionRadius: usesTankStats ? tankType.explosionRadius : weapon.explosionRadius,
			directDamage: (usesTankStats ? tankType.directDamage : weapon.directDamage) * dmgMul,
			splashDamage: (usesTankStats ? tankType.splashDamage : weapon.splashDamage) * dmgMul,
			splashRadius: usesTankStats ? tankType.splashRadius : weapon.splashRadius,
		};

		const projOptions = {
			radius: tankType.projectileRadius,
			windResistance: tankType.windResistance,
			rangeMultiplier: tankType.projectileRange,
			gravityMul: this.mapGravity,
			windMul: this.mapWindMul,
			tankStyle: tankType.style,
			tankColor: tankType.color,
			resolvedDamage,
		};

		// 포탄 생성 헬퍼
		const spawnProjectile = (angle: number, pw: number) => {
			return new Projectile(this, muzzle.x, muzzle.y, angle, pw, weapon, projOptions);
		};

		if (weapon.projectileCount > 1) {
			const count = weapon.projectileCount;
			const halfSpread = weapon.spreadAngle / 2;
			for (let i = 0; i < count; i++) {
				const offset =
					count === 1
						? 0
						: -halfSpread + (weapon.spreadAngle * i) / (count - 1);
				this.projectiles.push(spawnProjectile(worldAngle + offset, effectivePower));
			}
		} else {
			this.projectiles.push(spawnProjectile(worldAngle, effectivePower));
		}

		// 더블샷: 같은 궤도로 시차를 두고 2번째 발사
		if (isDoubleShot) {
			const delay = 300; // ms
			this.time.delayedCall(delay, () => {
				const muzzle2 = tank.getMuzzlePosition();
				if (weapon.projectileCount > 1) {
					const count = weapon.projectileCount;
					const halfSpread = weapon.spreadAngle / 2;
					for (let i = 0; i < count; i++) {
						const offset =
							count === 1
								? 0
								: -halfSpread + (weapon.spreadAngle * i) / (count - 1);
						const p = new Projectile(
							this, muzzle2.x, muzzle2.y,
							worldAngle + offset, effectivePower, weapon, projOptions,
						);
						this.projectiles.push(p);
						this.pendingImpacts++;
					}
				} else {
					const p = new Projectile(
						this, muzzle2.x, muzzle2.y,
						worldAngle, effectivePower, weapon, projOptions,
					);
					this.projectiles.push(p);
					this.pendingImpacts++;
				}
				this.audio.playFire(tankType.style);
			});
		}

		this.pendingImpacts = this.projectiles.length;
		this.weaponSystem.consumeAmmo(player);
		this.turnManager.setState(TurnState.FLIGHT);
		this.audio.playFire(tankType.style);
		vibrate(30);

		this.statsTrackers[player].recordShot();
		this.statsTrackers[player].recordTurn();

		if (this.projectiles.length > 0) {
			this.cameras.main.startFollow(this.projectiles[0].gfx, true, 0.08, 0.08);
		}

		this.emitUIUpdate();
	}

	private impactSingle(proj: Projectile): void {
		const x = proj.x;
		const y = proj.y;
		const currentPlayer = this.turnManager.currentPlayer;
		const opponentIdx: 0 | 1 = currentPlayer === 0 ? 1 : 0;
		const attackerType = this.tankTypes[currentPlayer];

		// 발사 시점에 확정된 데미지 사용
		const { explosionRadius, directDamage, splashDamage, splashRadius } =
			proj.resolvedDamage;

		this.statsTrackers[currentPlayer].recordHit(
			x,
			y,
			this.tanks[opponentIdx].x,
			this.tanks[opponentIdx].y,
		);

		this.terrain.explode(x, y, explosionRadius);

		// 특수 무기 효과
		if (proj.weapon.special === "napalm") {
			this.handleNapalmEffect(x, y, currentPlayer);
		} else if (proj.weapon.special === "drill") {
			// 드릴: 지형 관통 후 추가 폭발
			this.terrain.explode(x, y + 25, explosionRadius * 0.7);
			this.terrain.explode(x, y + 50, explosionRadius * 0.5);
		}

		// 향상된 폭발 이펙트 — 2단계 파티클
		this.explosionEmitter.explode(25, x, y);
		// 추가 잔해 파티클
		this.time.delayedCall(50, () => {
			this.explosionEmitter.explode(
				10,
				x + Phaser.Math.Between(-10, 10),
				y + Phaser.Math.Between(-10, 10),
			);
		});

		this.audio.playExplosion();

		// 파워업 드롭 시도
		this.itemManager.trySpawnAt(this, x, this.terrain);
		// 기존 파워업 낙하 체크 (지형 파괴로 발판 사라짐)
		this.itemManager.checkFallingAfterExplosion(this.terrain);

		let totalDamage = 0;
		for (const tank of this.tanks) {
			const dist = Phaser.Math.Distance.Between(x, y, tank.x, tank.y);
			let dmg = 0;
			if (dist < explosionRadius) {
				dmg = directDamage;
			} else if (dist < splashRadius) {
				const ratio =
					1 - (dist - explosionRadius) / (splashRadius - explosionRadius);
				dmg = Math.round(splashDamage * ratio);
			}

			// 시대 상성
			if (dmg > 0 && tank.playerIndex !== currentPlayer) {
				const defenderType = this.tankTypes[tank.playerIndex];
				const eraMultiplier = getEraMultiplier(
					attackerType.era,
					defenderType.era,
				);
				dmg = Math.round(dmg * eraMultiplier);
			}

			// 고도 보너스
			if (dmg > 0 && tank.playerIndex !== currentPlayer) {
				const attacker = this.tanks[currentPlayer];
				const heightDiff = tank.y - attacker.y;
				if (heightDiff > CONFIG.ALTITUDE_BONUS_THRESHOLD) {
					dmg = Math.round(dmg * CONFIG.ALTITUDE_BONUS_MULTIPLIER);
				}
			}

			// 쉴드 적용
			if (dmg > 0 && this.shields[tank.playerIndex] > 0) {
				dmg = Math.round(dmg * (1 - this.shields[tank.playerIndex]));
				this.shields[tank.playerIndex] = 0;
				// 쉴드 파괴 이펙트
				this.showShieldBreak(tank.x, tank.y);
			}

			if (dmg > 0) {
				tank.takeDamage(dmg);
				this.audio.playHit();
				totalDamage += dmg;

				if (tank.playerIndex !== currentPlayer) {
					this.statsTrackers[currentPlayer].recordDamage(dmg);
				} else {
					this.selfDamageDealt = true;
				}
			}
		}

		this.totalDamageThisSalvo += totalDamage;

		// BGM 긴장도 업데이트 (양 탱크 중 하나라도 HP 30% 이하면 intense)
		const anyLowHp = this.tanks.some((t) => t.health > 0 && t.health <= CONFIG.TANK_HP * 0.3);
		if (anyLowHp) {
			getBGM().start("intense");
		}

		const shakeIntensity =
			(0.005 + (totalDamage / CONFIG.TANK_HP) * 0.02) *
			CONFIG.SCREEN_SHAKE_MULTIPLIER;
		this.cameras.main.shake(200 + totalDamage * 2, shakeIntensity);
		vibrate(totalDamage > 0 ? [50, 30, 80] : 20);

		proj.destroy();
		this.pendingImpacts--;

		this.emitUIUpdate();

		if (this.pendingImpacts <= 0) {
			this.cameras.main.stopFollow();
			this.turnManager.setState(TurnState.IMPACT);
			this.time.delayedCall(500, () => {
				this.turnManager.setState(TurnState.CLEANUP);
			});
		}
	}

	/** 나팔름 효과: 수평 160px 범위 화염 확산 */
	private handleNapalmEffect(cx: number, cy: number, attacker: number): void {
		const spread = 80; // 좌우 80px씩 (총 160px)
		const fireCount = 8;
		const step = (spread * 2) / fireCount;

		for (let i = 0; i < fireCount; i++) {
			const fx = cx - spread + i * step;
			const fy = this.terrain.getHeightAt(fx);

			// 작은 폭발
			this.terrain.explode(fx, fy, 10);

			// 화염 파티클
			const delay = i * 60;
			this.time.delayedCall(delay, () => {
				this.explosionEmitter.explode(5, fx, fy);

				// 화염 데미지 (범위 내 탱크에 소량 데미지)
				for (const tank of this.tanks) {
					const dist = Math.abs(tank.x - fx);
					if (dist < 25) {
						const fireDmg = Math.round(8 * (1 - dist / 25));
						if (fireDmg > 0) {
							tank.takeDamage(fireDmg);
							this.audio.playHit();
							if (tank.playerIndex === attacker) {
								this.selfDamageDealt = true;
							} else {
								this.statsTrackers[attacker].recordDamage(fireDmg);
							}
						}
					}
				}
			});
		}

		// 화염 이펙트 시각화
		const fireGfx = this.add.graphics();
		fireGfx.setDepth(6);
		for (let i = 0; i < fireCount * 2; i++) {
			const fx = cx - spread + Math.random() * spread * 2;
			const fy = this.terrain.getHeightAt(fx);
			fireGfx.fillStyle(Phaser.Math.Between(0, 1) ? 0xff4400 : 0xff8800, 0.7);
			fireGfx.fillCircle(fx, fy - 3, 4 + Math.random() * 6);
		}
		this.tweens.add({
			targets: fireGfx,
			alpha: 0,
			duration: 1500,
			ease: "Power2",
			onComplete: () => fireGfx.destroy(),
		});
	}

	private showShieldBreak(x: number, y: number): void {
		const shieldGfx = this.add.graphics();
		shieldGfx.setDepth(15);
		shieldGfx.lineStyle(3, 0x3498db, 0.8);
		shieldGfx.strokeCircle(0, 0, 25);
		shieldGfx.setPosition(x, y - 10);
		this.tweens.add({
			targets: shieldGfx,
			scaleX: 2,
			scaleY: 2,
			alpha: 0,
			duration: 400,
			ease: "Power2",
			onComplete: () => shieldGfx.destroy(),
		});
	}

	private doCleanup(): void {
		this.turnManager.setState(TurnState.AIMING);

		for (const tank of this.tanks) {
			tank.settleOnTerrain();
			if (tank.y >= CONFIG.PLAY_HEIGHT - 1) {
				tank.takeDamage(CONFIG.TANK_HP);
			}
		}

		// 파워업 수집 체크
		for (let i = 0; i < 2; i++) {
			this.checkItemCollection(i as 0 | 1);
		}
		this.itemManager.cleanup();

		this.emitUIUpdate();

		for (let i = 0; i < 2; i++) {
			if (this.tanks[i].isDead()) {
				this.turnManager.setState(TurnState.GAME_OVER);
				this.inputHandler.setEnabled(false);
				this.cancelAIThink();
				const winner: 0 | 1 = i === 0 ? 1 : 0;
				vibrate([100, 50, 200]);

				// 슬로모션 킬캠
				const deadTank = this.tanks[i];
				slowMotionKillCam(this, deadTank.x, deadTank.y, () => {
					this.handleRoundOver(winner);
				});
				return;
			}
		}

		this.endTurn();
	}

	private handleRoundOver(winner: 0 | 1): void {
		for (const tank of this.tanks) tank.setTurnActive(false);
		this.matchManager.recordWin(winner);

		// BGM 전환
		getBGM().start(winner === 0 ? "victory" : "defeat");

		// 컨페티 효과
		if (this.confettiEffect) {
			this.confettiEffect.shower(150);
		}
		screenFlash(this, winner === 0 ? 0x3498db : 0xe74c3c, 300, 0.2);

		// 업적 체크
		const achCtx: AchievementContext = {
			won: winner === 0,
			accuracy: this.statsTrackers[0].getAccuracy(),
			totalDamage: this.statsTrackers[0].getStats().totalDamageDealt,
			maxSingleHit: this.statsTrackers[0].getStats().maxSingleHit,
			turnsPlayed: this.statsTrackers[0].getStats().turnsPlayed,
			shotsFired: this.statsTrackers[0].getStats().shotsFired,
			shotsHit: this.statsTrackers[0].getStats().shotsHit,
			selfDamage: 0,
			opponentHpLeft: this.tanks[1].health,
			myHpLeft: this.tanks[0].health,
			mapId: this.resolvedMapId,
			tankId: this.tankTypes[0].id,
			aiEnabled: this.aiEnabled,
			aiDifficulty: this.aiDifficulty,
			noSelfDamage: !this.selfDamageDealt,
			usedItems: this.usedItemsCount,
			perfectRound: winner === 0 && this.tanks[0].health >= CONFIG.TANK_HP,
		};
		const achievements = getAchievementManager().checkAchievements(achCtx);

		// 업적 팝업 표시 (UIScene에서)
		const uiScene = this.scene.get("UIScene");
		if (uiScene) {
			for (let i = 0; i < achievements.length; i++) {
				this.time.delayedCall(500 + i * 800, () => {
					showAchievementPopup(uiScene, achievements[i], i * 90);
				});
			}
		}

		if (this.matchManager.isMatchOver()) {
			const matchWinner = this.matchManager.getMatchWinner() ?? 0;
			this.statsTrackers[0].saveToCareer(matchWinner === 0);

			this.events.emit("game-over", {
				winner: matchWinner,
				matchOver: true,
				matchInfo: this.matchManager.getRoundInfo(),
				stats: [
					this.statsTrackers[0].getStats(),
					this.statsTrackers[1].getStats(),
				],
				accuracy: [
					this.statsTrackers[0].getAccuracy(),
					this.statsTrackers[1].getAccuracy(),
				],
			});
		} else {
			this.events.emit("game-over", {
				winner,
				matchOver: false,
				matchInfo: this.matchManager.getRoundInfo(),
				stats: [
					this.statsTrackers[0].getStats(),
					this.statsTrackers[1].getStats(),
				],
				accuracy: [
					this.statsTrackers[0].getAccuracy(),
					this.statsTrackers[1].getAccuracy(),
				],
			});

			this.time.delayedCall(2500, () => {
				this.itemManager.destroyAll();
				if (this.weatherSystem) this.weatherSystem.destroy();
				if (this.waterEffect) this.waterEffect.destroy();
				if (this.confettiEffect) this.confettiEffect.destroy();
				this.scene.restart({
					aiEnabled: this.aiEnabled,
					aiDifficulty: this.aiDifficulty,
					matchManager: this.matchManager,
					statsTrackers: this.statsTrackers,
					p1TankId: this.tankTypes[0].id,
					p2TankId: this.tankTypes[1].id,
					mapId: this.selectedMapId,
				});
			});
		}
	}

	private endTurn(): void {
		this.cancelAIThink();
		this.lastTickSecond = -1;

		// 더블 턴 체크
		const currentPlayer = this.turnManager.currentPlayer;
		if (this.activeBuffs.doubleTurn) {
			this.activeBuffs.doubleTurn = false;
			// 같은 플레이어가 다시 플레이 (턴 스위치 건너뛰기)
			this.turnManager.setState(TurnState.AIMING);
			const currentType = this.tankTypes[currentPlayer];
			this.turnManager.resetTurnWithFuel(currentType.fuel);
			this.setMoveButtonsEnabled(true);
			this.windSystem.randomize();
			this.emitUIUpdate();

			// 더블 턴 알림
			const tank = this.tanks[currentPlayer];
			const txt = this.add.text(tank.x, tank.y - 60, "⚡ 더블 턴!", {
				fontSize: "18px",
				color: "#9b59b6",
				stroke: "#000000",
				strokeThickness: 3,
				fontStyle: "bold",
			});
			txt.setOrigin(0.5);
			txt.setDepth(20);
			this.tweens.add({
				targets: txt,
				y: txt.y - 30,
				alpha: 0,
				duration: 1000,
				ease: "Power2",
				onComplete: () => txt.destroy(),
			});

			return;
		}

		this.turnManager.switchPlayer();
		this.turnManager.setState(TurnState.AIMING);

		const nextPlayer = this.turnManager.currentPlayer;
		const currentType = this.tankTypes[nextPlayer];
		this.turnManager.resetTurnWithFuel(currentType.fuel);
		this.setMoveButtonsEnabled(true);
		this.windSystem.randomize();

		// 디버프 카운트 감소
		for (const d of this.debuffs) {
			if (d.angleLock > 0) d.angleLock--;
			if (d.moveLock > 0) d.moveLock--;
		}
		// 버프 리셋 (미사용 버프는 사라짐)
		this.activeBuffs = { powerUp: false, damageUp: false, doubleShot: false, fireUp: false, doubleTurn: false };

		const tank = this.tanks[nextPlayer];
		this.inputHandler.activeTank = tank;
		this.inputHandler.maxPower = currentType.maxPower;
		this.inputHandler.currentWind = this.windSystem.currentWind;

		// 턴 마커 전환
		for (let i = 0; i < this.tanks.length; i++) {
			this.tanks[i].setTurnActive(i === nextPlayer);
		}

		this.cameras.main.stopFollow();
		// 현재 턴 탱크 위치로 부드럽게 이동
		this.cameras.main.pan(tank.x, tank.y - 40, 600, "Sine.easeInOut");

		this.emitUIUpdate();
		this.audio.playTurnBeep();
	}

	private hitTestTank(proj: Projectile, tank: Tank): boolean {
		for (const circle of tank.getHitCircles()) {
			const dx = proj.x - circle.x;
			const dy = proj.y - circle.y;
			if (dx * dx + dy * dy <= circle.r * circle.r) {
				return true;
			}
		}
		return false;
	}

	private emitUIUpdate(): void {
		const player = this.turnManager.currentPlayer;
		const currentType = this.tankTypes[player];
		this.events.emit("update-ui", {
			currentPlayer: player,
			wind: this.windSystem.currentWind,
			hp: [this.tanks[0].health, this.tanks[1].health],
			fuel: this.turnManager.fuel,
			maxFuel: currentType.fuel,
			turnTimeLeft: Math.max(
				0,
				CONFIG.TURN_TIME - this.turnManager.turnElapsed,
			),
			weaponIndex: this.weaponSystem.getCurrentWeaponIndex(player),
			weapons: this.weaponSystem.weapons,
			weaponAmmo: this.weaponSystem.weapons.map((_, i) =>
				this.weaponSystem.getAmmo(player, i),
			),
			weaponCanUse: this.weaponSystem.weapons.map((_, i) =>
				this.weaponSystem.canUse(player, i),
			),
			terrainType: `${this.terrain.typeName} — ${this.terrain.traits.hint}`,
			roundInfo: this.matchManager.getRoundInfo(),
			aiEnabled: this.aiEnabled,
			tankNames: [this.tankTypes[0].name, this.tankTypes[1].name],
			tankEras: [this.tankTypes[0].era, this.tankTypes[1].era],
			shields: this.shields,
			activeBuffs: this.activeBuffs,
			debuffs: this.debuffs,
			inventory: this.itemManager.inventories.map((inv) => [...inv.items]),
			timeOfDay: this.timeOfDay,
		});
	}
}
