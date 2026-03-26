import Phaser from "phaser";
import { COLORS, CONFIG, drawPanel } from "../config";
import { ALL_TANKS, type TankEra, type TankTypeDef } from "../objects/TankDefs";
import { MAP_DEFS, type MapDef } from "../objects/Terrain";
import { ACHIEVEMENTS, getAchievementManager } from "../systems/AchievementSystem";
import type { AIDifficulty } from "../systems/AIPlayer";
import { getBGM } from "../systems/BGMSystem";
import { StatsTracker } from "../systems/GameStats";

const ERA_COLORS: Record<TankEra, number> = { classic: 0x8d6e63, modern: 0x27ae60, future: 0x8e44ad };
const ERA_LABELS: Record<TankEra, string> = { classic: "고전", modern: "현대", future: "미래" };

export interface GameModeData {
	aiEnabled: boolean;
	aiDifficulty: AIDifficulty;
	totalRounds: 3 | 5;
	p1TankId: string;
	p2TankId: string;
	mapId?: string;
}

export class TitleScene extends Phaser.Scene {
	// 설정 값
	private selectedMode: "ai" | "pvp" = "ai";
	private selectedDifficulty: AIDifficulty = "normal";
	private selectedRounds: 3 | 5 = 3;
	private selectedP1Tank = 0;
	private selectedP2Tank = 1;
	private selectedMapId: string | undefined; // undefined = 랜덤

	// 메인 UI 요소
	private p1TankLabel!: Phaser.GameObjects.Text;
	private p2TankLabel!: Phaser.GameObjects.Text;
	private mapLabel!: Phaser.GameObjects.Text;
	private settingSummary!: Phaser.GameObjects.Text;

	// 모달
	private activeModal: Phaser.GameObjects.Container | null = null;

	constructor() {
		super("TitleScene");
	}

	create(): void {
		const cx = CONFIG.VIEW_WIDTH / 2;

		// BGM 시작
		getBGM().start("title");

		// 배경
		const bg = this.add.graphics();
		for (let i = 0; i < 40; i++) {
			const t = i / 40;
			const r = Phaser.Math.Linear(0x08, 0x12, t);
			const g = Phaser.Math.Linear(0x0e, 0x28, t);
			const b = Phaser.Math.Linear(0x1a, 0x45, t);
			bg.fillStyle((r << 16) | (g << 8) | b);
			bg.fillRect(0, (i / 40) * CONFIG.WORLD_HEIGHT, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT / 40 + 1);
		}

		// 배경 별 파티클 (부유하는 빛 입자)
		const starGfx = this.add.graphics();
		starGfx.setDepth(0);
		for (let i = 0; i < 60; i++) {
			const sx = Math.random() * CONFIG.VIEW_WIDTH;
			const sy = Math.random() * CONFIG.WORLD_HEIGHT;
			const size = 0.5 + Math.random() * 1.5;
			const alpha = 0.1 + Math.random() * 0.4;
			starGfx.fillStyle(0xffffff, alpha);
			starGfx.fillCircle(sx, sy, size);
		}
		// 반짝임 애니메이션
		this.tweens.add({
			targets: starGfx,
			alpha: 0.5,
			duration: 2000,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});

		// 부유하는 장식 파티클
		for (let i = 0; i < 8; i++) {
			const particle = this.add.graphics();
			particle.setDepth(0);
			const colors = [0x3d5a80, 0x2a3a5c, 0x4a6fa5, 0x6b8cbe];
			particle.fillStyle(colors[i % colors.length], 0.15);
			const size = 20 + Math.random() * 40;
			particle.fillCircle(0, 0, size);
			const startX = Math.random() * CONFIG.VIEW_WIDTH;
			const startY = Math.random() * CONFIG.WORLD_HEIGHT;
			particle.setPosition(startX, startY);
			this.tweens.add({
				targets: particle,
				x: startX + Phaser.Math.Between(-50, 50),
				y: startY + Phaser.Math.Between(-30, 30),
				alpha: 0.05 + Math.random() * 0.1,
				duration: 3000 + Math.random() * 3000,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut",
			});
		}

		// 타이틀
		const title = this.add.text(cx, 50, "FORTRESS", { fontSize: "68px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);
		this.add.text(cx, 96, "BATTLE ARENA", { fontSize: "13px", color: "#8899bb", fontStyle: "bold", letterSpacing: 8 }).setOrigin(0.5);
		const ul = this.add.graphics();
		ul.fillStyle(COLORS.GOLD, 0.7);
		ul.fillRoundedRect(cx - 130, 113, 260, 2, 1);
		this.tweens.add({ targets: [title, ul], y: "+=3", duration: 2200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

		let y = 135;

		// 전적
		const career = StatsTracker.loadCareer();
		if (career.totalGames > 0) {
			this.add.text(cx, y, `전적 ${career.wins}승 ${career.losses}패 | 최고 명중률 ${career.bestAccuracy}%`, {
				fontSize: "12px", color: Phaser.Display.Color.IntegerToColor(COLORS.GOLD).rgba,
			}).setOrigin(0.5);
			y += 24;
		}

		// 상성 힌트
		this.add.text(cx, y, "상성: 고전→미래  현대→고전  미래→현대", {
			fontSize: "11px", color: "#667799",
		}).setOrigin(0.5);
		y += 30;

		// ═══ 선택 버튼 3개 ═══
		const btnW = 340;
		const btnH = 52;
		const gap = 14;

		// P1 탱크
		this.p1TankLabel = this.createSelectionRow(cx, y, btnW, btnH, "P1 탱크", this.getTankLabel(this.selectedP1Tank), 0xff6b6b, () => this.openTankModal(0));
		y += btnH + gap;

		// P2/AI 탱크
		this.p2TankLabel = this.createSelectionRow(cx, y, btnW, btnH, this.selectedMode === "ai" ? "AI 탱크" : "P2 탱크", this.getTankLabel(this.selectedP2Tank), 0x74b9ff, () => this.openTankModal(1));
		y += btnH + gap;

		// 맵
		this.mapLabel = this.createSelectionRow(cx, y, btnW, btnH, "맵", this.getMapLabel(), 0x81c784, () => this.openMapModal());
		y += btnH + gap + 5;

		// 설정 요약
		this.settingSummary = this.add.text(cx, y, this.getSettingSummary(), {
			fontSize: "13px", color: "#667799",
		}).setOrigin(0.5);
		y += 28;

		// ═══ 하단 버튼: ⚙️설정 + 게임 시작 ═══
		this.createBtn(cx - 145, y, 115, 46, "⚙️ 설정", COLORS.PANEL_BORDER, () => this.openSettingsModal());
		const startBtn = this.createBtn(cx + 45, y, 190, 46, "⚔️ 게임 시작", COLORS.SUCCESS, () => this.startGame());
		this.tweens.add({ targets: startBtn, alpha: 0.85, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

		y += 54;
		this.add.text(cx, y, "드래그: 조준 | A/D: 이동 | S: 스킵", { fontSize: "12px", color: "#556677" }).setOrigin(0.5);

		// 업적 버튼
		const achMgr = getAchievementManager();
		const achCount = achMgr.getUnlockedCount();
		const achTotal = achMgr.getTotalCount();
		y += 30;
		const achBtn = this.createBtn(cx, y, 220, 38, `🏆 업적 ${achCount}/${achTotal}`, 0x6c3483, () => this.openAchievementModal());
		if (achCount > 0) {
			this.tweens.add({
				targets: achBtn,
				scaleX: 1.02,
				scaleY: 1.02,
				duration: 1200,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut",
			});
		}
	}

	// ═══ 선택 행 UI ═══

	private createSelectionRow(cx: number, y: number, w: number, h: number, label: string, value: string, labelColor: number, onClick: () => void): Phaser.GameObjects.Text {
		const container = this.add.container(cx, y);

		const bg = this.add.graphics();
		drawPanel(bg, -w / 2, -h / 2, w, h, 10);
		container.add(bg);

		const lbl = this.add.text(-w / 2 + 16, 0, label, {
			fontSize: "14px", color: Phaser.Display.Color.IntegerToColor(labelColor).rgba, fontStyle: "bold",
		}).setOrigin(0, 0.5);
		container.add(lbl);

		const val = this.add.text(w / 2 - 16, 0, value, {
			fontSize: "15px", color: "#ffffff", fontStyle: "bold",
		}).setOrigin(1, 0.5);
		container.add(val);

		// 클릭 영역
		container.setSize(w, h);
		container.setInteractive({ useHandCursor: true });
		container.on("pointerdown", onClick);

		return val;
	}

	private getTankLabel(idx: number): string {
		const t = ALL_TANKS[idx];
		return `${ERA_LABELS[t.era]} ${t.name}`;
	}

	private getMapLabel(): string {
		if (!this.selectedMapId) return "🎲 랜덤";
		const m = MAP_DEFS.find((d) => d.id === this.selectedMapId);
		return m ? `${m.icon} ${m.name}` : "🎲 랜덤";
	}

	private getSettingSummary(): string {
		const mode = this.selectedMode === "ai" ? "AI 대전" : "2P 대전";
		const diff = this.selectedMode === "ai" ? ` | ${this.selectedDifficulty}` : "";
		return `${mode}${diff} | ${this.selectedRounds}판`;
	}

	// ═══ 모달 시스템 ═══

	private openModal(buildFn: (modal: Phaser.GameObjects.Container, cx: number, cardX: number, cardY: number, cardW: number, cardH: number) => void): void {
		this.closeModal();
		const modal = this.add.container(0, 0).setDepth(100);
		this.activeModal = modal;

		const dim = this.add.graphics();
		dim.fillStyle(0x000000, 0.7);
		dim.fillRect(0, 0, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT);
		dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, CONFIG.VIEW_WIDTH, CONFIG.WORLD_HEIGHT), Phaser.Geom.Rectangle.Contains);
		dim.on("pointerdown", (p: Phaser.Input.Pointer) => { p.event.stopPropagation(); this.closeModal(); });
		modal.add(dim);

		const cx = CONFIG.VIEW_WIDTH / 2;
		const cardW = 560;
		const cardH = 440;
		const cardX = cx - cardW / 2;
		const cardY = (CONFIG.WORLD_HEIGHT - cardH) / 2;

		const card = this.add.graphics();
		drawPanel(card, cardX, cardY, cardW, cardH, 16, { bgAlpha: 0.96 });
		modal.add(card);

		buildFn(modal, cx, cardX, cardY, cardW, cardH);

		modal.setScale(0.9);
		modal.setAlpha(0);
		this.tweens.add({ targets: modal, scaleX: 1, scaleY: 1, alpha: 1, duration: 200, ease: "Power2" });
	}

	private closeModal(): void {
		if (this.activeModal) {
			this.activeModal.destroy();
			this.activeModal = null;
		}
	}

	// ═══ 탱크 선택 모달 ═══

	private openTankModal(player: 0 | 1): void {
		this.openModal((modal, cx, _cardX, cardY) => {
			const title = player === 0 ? "P1 탱크 선택" : (this.selectedMode === "ai" ? "AI 탱크 선택" : "P2 탱크 선택");
			const titleColor = player === 0 ? "#ff6b6b" : "#74b9ff";
			modal.add(this.add.text(cx, cardY + 30, title, { fontSize: "20px", color: titleColor, fontStyle: "bold" }).setOrigin(0.5));
			modal.add(this.add.text(cx, cardY + 55, "상성: 고전→미래  현대→고전  미래→현대", { fontSize: "11px", color: "#667799" }).setOrigin(0.5));

			// 랜덤 버튼
			const randomBtn = this.createBtn(cx, cardY + 85, 140, 34, "🎲 랜덤 선택", 0x2980b9, () => {
				const idx = Math.floor(Math.random() * ALL_TANKS.length);
				this.selectTank(player, idx);
				this.closeModal();
			});
			modal.add(randomBtn);

			// 탱크 카드 그리드 (2행 3열)
			const cardW = 150;
			const cardH = 100;
			const gap = 10;
			const cols = 3;
			const totalW = cols * cardW + (cols - 1) * gap;
			const startX = cx - totalW / 2 + cardW / 2;
			let row = 0;
			let col = 0;

			for (let i = 0; i < ALL_TANKS.length; i++) {
				const def = ALL_TANKS[i];
				const selected = player === 0 ? i === this.selectedP1Tank : i === this.selectedP2Tank;
				const tx = startX + col * (cardW + gap);
				const ty = cardY + 125 + row * (cardH + gap);

				const card = this.createTankCard(tx, ty, cardW, cardH, def, selected, () => {
					this.selectTank(player, i);
					this.closeModal();
				});
				modal.add(card);

				col++;
				if (col >= cols) { col = 0; row++; }
			}
		});
	}

	private selectTank(player: 0 | 1, idx: number): void {
		if (player === 0) {
			this.selectedP1Tank = idx;
			this.p1TankLabel.setText(this.getTankLabel(idx));
		} else {
			this.selectedP2Tank = idx;
			this.p2TankLabel.setText(this.getTankLabel(idx));
		}
	}

	private createTankCard(x: number, y: number, w: number, h: number, def: TankTypeDef, selected: boolean, onClick: () => void): Phaser.GameObjects.Container {
		const bg = this.add.graphics();
		if (selected) {
			bg.fillStyle(COLORS.PANEL_BG, 0.9);
			bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
			bg.lineStyle(2, COLORS.GOLD, 0.9);
			bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
		} else {
			drawPanel(bg, -w / 2, -h / 2, w, h, 10);
		}

		// 시대 뱃지
		const badge = this.add.graphics();
		badge.fillStyle(ERA_COLORS[def.era], 0.8);
		badge.fillRoundedRect(-w / 2 + 6, -h / 2 + 6, 32, 16, 4);
		const badgeText = this.add.text(-w / 2 + 22, -h / 2 + 14, ERA_LABELS[def.era], { fontSize: "10px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);

		// 미니 탱크
		const preview = this.add.graphics();
		this.drawMiniTank(preview, 0, -8, def);

		// 이름 + 설명
		const nameText = this.add.text(0, h / 2 - 28, def.name, { fontSize: "14px", color: selected ? "#ffffff" : "#aab2c8", fontStyle: "bold" }).setOrigin(0.5);
		const descText = this.add.text(0, h / 2 - 12, def.description.substring(0, 18), { fontSize: "10px", color: "#667799" }).setOrigin(0.5);

		// 스탯 바
		const statGfx = this.add.graphics();
		const barY = h / 2 - 4;
		const barW = w - 20;
		const stats = [
			{ ratio: def.directDamage / 75, color: 0xe74c3c },
			{ ratio: def.fuel / 90, color: 0x3498db },
			{ ratio: def.splashRadius / 130, color: 0xf1c40f },
		];
		for (let s = 0; s < stats.length; s++) {
			const sy = barY + s * 3;
			statGfx.fillStyle(0x1a1e2e);
			statGfx.fillRect(-barW / 2, sy, barW, 2);
			statGfx.fillStyle(stats[s].color, 0.8);
			statGfx.fillRect(-barW / 2, sy, Math.max(2, barW * Math.min(1, stats[s].ratio)), 2);
		}

		const container = this.add.container(x, y, [bg, badge, badgeText, preview, nameText, descText, statGfx]);
		container.setSize(w, h);
		container.setInteractive({ useHandCursor: true });
		container.on("pointerdown", (p: Phaser.Input.Pointer) => { p.event.stopPropagation(); onClick(); });

		return container;
	}

	// ═══ 맵 선택 모달 ═══

	private openMapModal(): void {
		this.openModal((modal, cx, _cardX, cardY) => {
			modal.add(this.add.text(cx, cardY + 30, "🗺️ 맵 선택", { fontSize: "20px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5));

			// 랜덤 버튼
			const randomBtn = this.createBtn(cx, cardY + 70, 140, 34, "🎲 랜덤 선택", 0x2980b9, () => {
				this.selectedMapId = undefined;
				this.mapLabel.setText("🎲 랜덤");
				this.closeModal();
			});
			modal.add(randomBtn);

			// 맵 그리드 (2행 5열)
			const cardW = 95;
			const cardH = 65;
			const gap = 6;
			const cols = 5;
			const totalW = cols * cardW + (cols - 1) * gap;
			const startX = cx - totalW / 2 + cardW / 2;
			let row = 0;
			let col = 0;

			for (const mapDef of MAP_DEFS) {
				const tx = startX + col * (cardW + gap);
				const ty = cardY + 115 + row * (cardH + gap);
				const selected = this.selectedMapId === mapDef.id;

				const card = this.createMapCard(tx, ty, cardW, cardH, mapDef, selected, () => {
					this.selectedMapId = mapDef.id;
					this.mapLabel.setText(`${mapDef.icon} ${mapDef.name}`);
					this.closeModal();
				});
				modal.add(card);

				col++;
				if (col >= cols) { col = 0; row++; }
			}
		});
	}

	private createMapCard(x: number, y: number, w: number, h: number, def: MapDef, selected: boolean, onClick: () => void): Phaser.GameObjects.Container {
		const bg = this.add.graphics();
		if (selected) {
			bg.fillStyle(COLORS.PANEL_BG, 0.9);
			bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
			bg.lineStyle(2, COLORS.GOLD, 0.9);
			bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
		} else {
			drawPanel(bg, -w / 2, -h / 2, w, h, 8);
		}

		// 미니 지형 미리보기
		const preview = this.add.graphics();
		const previewW = w - 16;
		const previewH = h - 30;
		const heights = def.generate(previewW, previewH);
		preview.lineStyle(1.5, Phaser.Display.Color.ValueToColor(def.theme.surface).color, 0.8);
		preview.beginPath();
		for (let px = 0; px < previewW; px++) {
			const py = -h / 2 + 8 + (heights[Math.floor(px * CONFIG.WORLD_WIDTH / previewW)] / CONFIG.PLAY_HEIGHT) * previewH;
			if (px === 0) preview.moveTo(-previewW / 2 + px, py);
			else preview.lineTo(-previewW / 2 + px, py);
		}
		preview.strokePath();

		const icon = this.add.text(0, h / 2 - 14, `${def.icon} ${def.name}`, {
			fontSize: "12px", color: selected ? "#ffffff" : "#aab2c8", fontStyle: "bold",
		}).setOrigin(0.5);

		const container = this.add.container(x, y, [bg, preview, icon]);
		container.setSize(w, h);
		container.setInteractive({ useHandCursor: true });
		container.on("pointerdown", (p: Phaser.Input.Pointer) => { p.event.stopPropagation(); onClick(); });

		return container;
	}

	// ═══ 설정 모달 ═══

	private openSettingsModal(): void {
		this.openModal((modal, cx, _cardX, cardY, _cardW, cardH) => {
			modal.add(this.add.text(cx, cardY + 30, "⚙️ 게임 설정", { fontSize: "20px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5));

			let my = cardY + 75;

			// 게임 모드
			modal.add(this.createLabel(cx, my, "게임 모드"));
			my += 32;
			const modeGroup = this.createOptionGroup(cx, my, ["1P vs AI", "2P 대전"], this.selectedMode === "ai" ? 0 : 1, (idx) => {
				this.selectedMode = idx === 0 ? "ai" : "pvp";
				this.p2TankLabel.setText(this.getTankLabel(this.selectedP2Tank));
			});
			for (const btn of modeGroup) modal.add(btn);
			my += 50;

			// AI 난이도
			modal.add(this.createLabel(cx, my, "AI 난이도"));
			my += 32;
			const diffs: AIDifficulty[] = ["easy", "normal", "hard"];
			const diffIdx = diffs.indexOf(this.selectedDifficulty);
			const diffGroup = this.createOptionGroup(cx, my, ["Easy", "Normal", "Hard"], diffIdx, (idx) => {
				this.selectedDifficulty = diffs[idx];
			});
			for (const btn of diffGroup) modal.add(btn);
			my += 50;

			// 라운드
			modal.add(this.createLabel(cx, my, "라운드"));
			my += 32;
			const roundGroup = this.createOptionGroup(cx, my, ["3판", "5판"], this.selectedRounds === 3 ? 0 : 1, (idx) => {
				this.selectedRounds = idx === 0 ? 3 : 5;
			});
			for (const btn of roundGroup) modal.add(btn);
			my += 55;

			// 확인
			const closeBtn = this.createBtn(cx, my, 120, 40, "확인", 0x2980b9, () => {
				this.settingSummary.setText(this.getSettingSummary());
				this.closeModal();
			});
			modal.add(closeBtn);
		});
	}

	// ═══ 공용 헬퍼 ═══

	private createLabel(x: number, y: number, text: string): Phaser.GameObjects.Text {
		return this.add.text(x, y, text, { fontSize: "14px", color: "#8899bb", fontStyle: "bold" }).setOrigin(0.5);
	}

	private createOptionGroup(cx: number, y: number, labels: string[], selectedIdx: number, onChange: (idx: number) => void): Phaser.GameObjects.Container[] {
		const w = 110;
		const h = 36;
		const gap = 8;
		const total = labels.length * w + (labels.length - 1) * gap;
		const startX = cx - total / 2 + w / 2;
		const containers: Phaser.GameObjects.Container[] = [];
		const bgs: Phaser.GameObjects.Graphics[] = [];
		const texts: Phaser.GameObjects.Text[] = [];

		for (let i = 0; i < labels.length; i++) {
			const bg = this.add.graphics();
			const sel = i === selectedIdx;
			this.drawOptBg(bg, w, h, sel);
			bgs.push(bg);

			const txt = this.add.text(0, 0, labels[i], { fontSize: "13px", color: sel ? "#ffffff" : "#667799", fontStyle: "bold" }).setOrigin(0.5);
			texts.push(txt);

			const cont = this.add.container(startX + i * (w + gap), y, [bg, txt]);
			cont.setSize(w, h);
			cont.setInteractive({ useHandCursor: true });
			cont.on("pointerdown", (p: Phaser.Input.Pointer) => {
				p.event.stopPropagation();
				for (let j = 0; j < labels.length; j++) {
					const s = j === i;
					this.drawOptBg(bgs[j], w, h, s);
					texts[j].setColor(s ? "#ffffff" : "#667799");
				}
				onChange(i);
			});
			containers.push(cont);
		}
		return containers;
	}

	private drawOptBg(gfx: Phaser.GameObjects.Graphics, w: number, h: number, selected: boolean): void {
		gfx.clear();
		if (selected) {
			gfx.fillStyle(0x2980b9, 0.9);
			gfx.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
			gfx.lineStyle(1.5, 0x3498db, 0.8);
			gfx.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
		} else {
			drawPanel(gfx, -w / 2, -h / 2, w, h, 8);
		}
	}

	private createBtn(x: number, y: number, w: number, h: number, label: string, color: number, onClick: () => void): Phaser.GameObjects.Container {
		const bg = this.add.graphics();
		bg.fillStyle(color, 1);
		bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
		bg.lineStyle(1.5, Phaser.Display.Color.ValueToColor(color).lighten(20).color, 0.6);
		bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
		const txt = this.add.text(0, 0, label, { fontSize: "16px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5);
		const container = this.add.container(x, y, [bg, txt]);
		container.setSize(w, h);
		container.setInteractive({ useHandCursor: true });
		container.on("pointerdown", (p: Phaser.Input.Pointer) => { p.event.stopPropagation(); onClick(); });
		return container;
	}

	private drawMiniTank(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, def: TankTypeDef): void {
		const s = 0.7;
		const bw = def.width * s;
		const bh = def.height * s * 0.6;
		gfx.fillStyle(def.colorDark);
		gfx.fillRoundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 3);
		gfx.fillStyle(def.color);
		gfx.fillRoundedRect(cx - bw / 2 + 2, cy - bh / 2 + 1, bw - 4, bh - 2, 2);
		const tr = def.turretRadius * s;
		gfx.fillStyle(def.color);
		gfx.fillCircle(cx + 1, cy - bh / 2 - tr * 0.4, tr);
		gfx.lineStyle(2, 0x444444);
		const bl = def.barrelLength * s * 0.6;
		gfx.beginPath();
		gfx.moveTo(cx + 1, cy - bh / 2 - tr * 0.4);
		gfx.lineTo(cx + 1 + bl * 0.7, cy - bh / 2 - tr * 0.4 - bl * 0.7);
		gfx.strokePath();
	}

	// ═══ 업적 모달 ═══

	private openAchievementModal(): void {
		this.openModal((modal, cx, cardX, cardY, cardW, cardH) => {
			modal.add(this.add.text(cx, cardY + 30, "🏆 업적", { fontSize: "20px", color: "#ffffff", fontStyle: "bold" }).setOrigin(0.5));

			const achMgr = getAchievementManager();
			const all = achMgr.getAll();

			const rarityColors: Record<string, number> = {
				common: 0x95a5a6,
				rare: 0x3498db,
				epic: 0x9b59b6,
				legendary: 0xf1c40f,
			};

			const cols = 3;
			const itemW = 160;
			const itemH = 54;
			const gap = 8;
			const totalW = cols * itemW + (cols - 1) * gap;
			const startX = cx - totalW / 2 + itemW / 2;
			let row = 0;
			let col = 0;

			for (const { def, unlocked } of all) {
				const tx = startX + col * (itemW + gap);
				const ty = cardY + 70 + row * (itemH + gap);

				const itemBg = this.add.graphics();
				if (unlocked) {
					const rc = rarityColors[def.rarity] ?? COLORS.PANEL_BORDER;
					itemBg.fillStyle(0x0a0e17, 0.9);
					itemBg.fillRoundedRect(-itemW / 2, -itemH / 2, itemW, itemH, 8);
					itemBg.lineStyle(1.5, rc, 0.7);
					itemBg.strokeRoundedRect(-itemW / 2, -itemH / 2, itemW, itemH, 8);
				} else {
					itemBg.fillStyle(0x111520, 0.7);
					itemBg.fillRoundedRect(-itemW / 2, -itemH / 2, itemW, itemH, 8);
					itemBg.lineStyle(1, 0x333a4c, 0.3);
					itemBg.strokeRoundedRect(-itemW / 2, -itemH / 2, itemW, itemH, 8);
				}

				const icon = this.add.text(-itemW / 2 + 10, 0, unlocked ? def.icon : "🔒", {
					fontSize: "20px",
				}).setOrigin(0, 0.5);

				const name = this.add.text(-itemW / 2 + 38, -8, unlocked ? def.name : "???", {
					fontSize: "12px",
					color: unlocked ? "#ffffff" : "#555555",
					fontStyle: "bold",
				});

				const desc = this.add.text(-itemW / 2 + 38, 8, unlocked ? def.description : "미해금", {
					fontSize: "9px",
					color: unlocked ? "#8899bb" : "#444444",
				});

				const container = this.add.container(tx, ty, [itemBg, icon, name, desc]);
				modal.add(container);

				col++;
				if (col >= cols) { col = 0; row++; }
			}
		});
	}

	// ═══ 게임 시작 ═══

	private startGame(): void {
		getBGM().stop();
		const data: GameModeData = {
			aiEnabled: this.selectedMode === "ai",
			aiDifficulty: this.selectedDifficulty,
			totalRounds: this.selectedRounds,
			p1TankId: ALL_TANKS[this.selectedP1Tank].id,
			p2TankId: ALL_TANKS[this.selectedP2Tank].id,
			mapId: this.selectedMapId,
		};
		this.scene.start("GameScene", data);
	}
}
