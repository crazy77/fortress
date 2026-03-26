import type Phaser from "phaser";
import { CONFIG } from "../config";
import { TerrainAlphaMap } from "../utils/TerrainCollision";

/** 맵별 고유 특성 */
export interface MapTraits {
	/** 중력 배율 (1.0 = 기본, 0.6 = 저중력, 1.4 = 고중력) */
	gravity: number;
	/** 바람 배율 (1.0 = 기본, 0 = 무풍, 2.0 = 강풍) */
	windMultiplier: number;
	/** 지형 두께 — 얇으면 낙사 전략, 두꺼우면 화력전 ("thin" | "normal" | "thick") */
	thickness: "thin" | "normal" | "thick";
	/** 맵 설명 (전략 힌트) */
	hint: string;
}

export interface MapDef {
	id: string;
	name: string;
	icon: string;
	/** 지형 생성 함수 */
	generate: (W: number, H: number) => number[];
	/** 색상 테마 */
	theme: { surface: string; soil: string; rock: string; highlight: string };
	/** 맵 고유 특성 */
	traits: MapTraits;
}

export const MAP_DEFS: MapDef[] = [
	{
		id: "hills",
		name: "언덕",
		icon: "⛰️",
		generate: (W, H) => {
			const base = H * 0.45;
			const amp = 70;
			return genSine(W, base, amp, [0.003, 0.008, 0.02], [1, 0.5, 0.2]);
		},
		theme: { surface: "#6abf5e", soil: "#8b6914", rock: "#666666", highlight: "#8ed97e" },
		traits: { gravity: 1.0, windMultiplier: 1.0, thickness: "normal", hint: "균형 잡힌 기본 지형" },
	},
	{
		id: "canyon",
		name: "협곡",
		icon: "🏜️",
		generate: (W, H) => {
			const heights: number[] = [];
			// 양쪽 고지대(높음) + 중앙 골짜기(낮음)
			const plateauH = H * 0.35; // 양쪽 고지대 높이
			const valleyH = H * 0.7;   // 골짜기 바닥
			const center = W / 2;
			const valleyWidth = W * 0.15;
			const seed = Math.random() * 100;
			for (let x = 0; x < W; x++) {
				const distFromCenter = Math.abs(x - center);
				const normalized = distFromCenter / valleyWidth;
				const valleyFactor = Math.exp(-(normalized * normalized));
				let h = plateauH + valleyFactor * (valleyH - plateauH);
				// 고지대 미세 변화
				h += Math.sin(x * 0.005 + seed) * 20 + Math.sin(x * 0.015 + seed * 2) * 10;
				heights.push(Math.floor(Math.max(H * 0.15, Math.min(H * 0.85, h))));
			}
			return heights;
		},
		theme: { surface: "#d4a574", soil: "#a0522d", rock: "#8b4513", highlight: "#e8c9a0" },
		traits: { gravity: 1.0, windMultiplier: 1.5, thickness: "thin", hint: "얇은 지형 + 강풍 → 낙사 주의!" },
	},
	{
		id: "islands",
		name: "섬",
		icon: "🏝️",
		generate: (W, H) => {
			const heights: number[] = [];
			// 3개 섬
			const islands = [
				{ cx: W * 0.15, w: W * 0.18, peak: H * 0.45 },
				{ cx: W * 0.5, w: W * 0.22, peak: H * 0.38 },
				{ cx: W * 0.82, w: W * 0.16, peak: H * 0.48 },
			];
			for (let x = 0; x < W; x++) {
				let h = H * 0.92; // 바다 수면
				for (const isl of islands) {
					const t = (x - isl.cx) / (isl.w / 2);
					if (Math.abs(t) < 1.5) {
						const bell = Math.exp(-t * t * 2);
						h = Math.min(h, isl.peak + (1 - bell) * (H * 0.92 - isl.peak));
					}
				}
				// 약간의 노이즈
				h += Math.sin(x * 0.03) * 8 + Math.sin(x * 0.007) * 15;
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#4caf50", soil: "#795548", rock: "#5d4037", highlight: "#81c784" },
		traits: { gravity: 1.0, windMultiplier: 0.5, thickness: "thin", hint: "섬 사이 낙사 위험! 바람 약함" },
	},
	{
		id: "plains",
		name: "평지",
		icon: "🌾",
		generate: (W, H) => {
			const base = H * 0.48;
			return genSine(W, base, 20, [0.002, 0.008], [1, 0.3]);
		},
		theme: { surface: "#8bc34a", soil: "#795548", rock: "#616161", highlight: "#aed581" },
		traits: { gravity: 1.0, windMultiplier: 1.3, thickness: "thick", hint: "두꺼운 지형 + 강풍 → 정면 화력전" },
	},
	{
		id: "mountains",
		name: "산악",
		icon: "🗻",
		generate: (W, H) => {
			const base = H * 0.5;
			const amp = 120;
			const heights = genSine(W, base, amp, [0.002, 0.006, 0.015, 0.04], [1, 0.7, 0.3, 0.1]);
			// 뾰족한 봉우리 강조
			for (let x = 0; x < W; x++) {
				heights[x] = Math.max(H * 0.15, heights[x]);
			}
			return heights;
		},
		theme: { surface: "#78909c", soil: "#546e7a", rock: "#37474f", highlight: "#90a4ae" },
		traits: { gravity: 1.2, windMultiplier: 2.0, thickness: "normal", hint: "고중력 + 폭풍 → 짧은 사거리, 강한 바람" },
	},
	{
		id: "fortress",
		name: "요새",
		icon: "🏰",
		generate: (W, H) => {
			const heights: number[] = [];
			const base = H * 0.5;
			for (let x = 0; x < W; x++) {
				let h = base + Math.sin(x * 0.003) * 30;
				// 양쪽 끝에 높은 고지대 (요새)
				const leftDist = x / (W * 0.2);
				const rightDist = (W - x) / (W * 0.2);
				if (leftDist < 1) h -= (1 - leftDist) * 120;
				if (rightDist < 1) h -= (1 - rightDist) * 120;
				// 중앙 낮은 계곡
				const centerDist = Math.abs(x - W / 2) / (W * 0.15);
				if (centerDist < 1) h += (1 - centerDist) * 60;
				heights.push(Math.floor(Math.max(H * 0.15, h)));
			}
			return heights;
		},
		theme: { surface: "#a1887f", soil: "#6d4c41", rock: "#4e342e", highlight: "#bcaaa4" },
		traits: { gravity: 1.0, windMultiplier: 0.3, thickness: "thick", hint: "거의 무풍 + 두꺼운 요새 → 정밀 조준전" },
	},
	{
		id: "desert",
		name: "사막",
		icon: "🏜️",
		generate: (W, H) => {
			const base = H * 0.45;
			const heights = genSine(W, base, 40, [0.002, 0.005, 0.015], [1, 0.6, 0.2]);
			// 모래 언덕 (부드러운 곡선)
			for (let x = 0; x < W; x++) {
				heights[x] += Math.sin(x * 0.01 + 2) * 20 * Math.sin(x * 0.003);
			}
			return heights;
		},
		theme: { surface: "#f4d03f", soil: "#d4a017", rock: "#b8860b", highlight: "#f9e784" },
		traits: { gravity: 0.85, windMultiplier: 1.8, thickness: "normal", hint: "저중력 + 모래폭풍 → 포탄이 멀리, 바람에 크게 휘어짐" },
	},
	{
		id: "volcano",
		name: "화산",
		icon: "🌋",
		generate: (W, H) => {
			const heights: number[] = [];
			const base = H * 0.45;
			for (let x = 0; x < W; x++) {
				let h = base + Math.sin(x * 0.003) * 40 + Math.sin(x * 0.01) * 15;
				// 화산 봉우리 (중앙)
				const volcDist = Math.abs(x - W / 2) / (W * 0.08);
				if (volcDist < 2) {
					const peak = Math.exp(-volcDist * volcDist * 0.5) * 180;
					h -= peak;
					// 분화구 (정상 부분 오목)
					if (volcDist < 0.3) h += 30;
				}
				heights.push(Math.floor(Math.max(H * 0.1, h)));
			}
			return heights;
		},
		theme: { surface: "#424242", soil: "#5d4037", rock: "#3e2723", highlight: "#757575" },
		traits: { gravity: 1.3, windMultiplier: 0.7, thickness: "thin", hint: "고중력 + 얇은 지형 → 포탄이 빨리 떨어지고 낙사 위험" },
	},
];

/** 지형 높이 안전 범위 — 상단 여유 넓게, 하단은 UI와 절대 겹치지 않게 */
const TERRAIN_MIN_Y_RATIO = 0.1;  // 최소 높이 (PLAY_HEIGHT의 10% = 꼭대기 가능)
const TERRAIN_MAX_Y_RATIO = 0.75; // 최대 높이 (PLAY_HEIGHT의 75% = UI 위 여유)

/** 높이 배열을 안전 범위로 클램프 */
function clampHeights(heights: number[], H: number): number[] {
	const minY = Math.floor(H * TERRAIN_MIN_Y_RATIO);
	const maxY = Math.floor(H * TERRAIN_MAX_Y_RATIO);
	return heights.map((h) => Math.max(minY, Math.min(maxY, Math.floor(h))));
}

/** 사인파 합성 유틸 */
function genSine(W: number, base: number, amp: number, freqs: number[], weights: number[]): number[] {
	const seed = Math.random() * 100;
	const heights: number[] = [];
	for (let x = 0; x < W; x++) {
		let h = base;
		for (let i = 0; i < freqs.length; i++) {
			h += Math.sin(x * freqs[i] + seed + i * 1.7) * amp * (weights[i] ?? 0.2);
		}
		heights.push(Math.floor(h));
	}
	return heights;
}

export class Terrain {
	readonly alphaMap: TerrainAlphaMap;
	readonly typeName: string;
	readonly mapId: string;
	readonly traits: MapTraits;
	private canvasTexture: Phaser.Textures.CanvasTexture;
	private image: Phaser.GameObjects.Image;
	private ctx: CanvasRenderingContext2D;
	private heights: number[];
	private theme: MapDef["theme"];

	constructor(
		private scene: Phaser.Scene,
		mapId?: string,
	) {
		const { WORLD_WIDTH, PLAY_HEIGHT } = CONFIG;

		// 맵 선택
		const mapDef = mapId
			? MAP_DEFS.find((m) => m.id === mapId) ?? MAP_DEFS[0]
			: MAP_DEFS[Math.floor(Math.random() * MAP_DEFS.length)];

		this.typeName = mapDef.name;
		this.mapId = mapDef.id;
		this.traits = mapDef.traits;
		this.theme = mapDef.theme;

		this.alphaMap = new TerrainAlphaMap(WORLD_WIDTH, PLAY_HEIGHT);
		this.heights = clampHeights(mapDef.generate(WORLD_WIDTH, PLAY_HEIGHT), PLAY_HEIGHT);
		this.alphaMap.initFromHeights(this.heights);

		const key = `terrain_${Date.now()}`;
		this.canvasTexture = scene.textures.createCanvas(
			key,
			WORLD_WIDTH,
			PLAY_HEIGHT,
		) as Phaser.Textures.CanvasTexture;
		this.ctx = this.canvasTexture.getContext();

		this.drawTerrain();
		this.canvasTexture.refresh();

		this.image = scene.add.image(0, 0, key);
		this.image.setOrigin(0, 0);
		this.image.setDepth(0);
	}

	private drawTerrain(): void {
		const { WORLD_WIDTH, PLAY_HEIGHT } = CONFIG;
		const ctx = this.ctx;
		const { surface, soil, rock, highlight } = this.theme;

		ctx.clearRect(0, 0, WORLD_WIDTH, PLAY_HEIGHT);

		// 암석층
		ctx.fillStyle = rock;
		ctx.beginPath();
		ctx.moveTo(0, PLAY_HEIGHT);
		for (let x = 0; x < WORLD_WIDTH; x++) ctx.lineTo(x, this.heights[x]);
		ctx.lineTo(WORLD_WIDTH, PLAY_HEIGHT);
		ctx.closePath();
		ctx.fill();

		// 토양층
		ctx.fillStyle = soil;
		ctx.beginPath();
		ctx.moveTo(0, Math.min(PLAY_HEIGHT, this.heights[0] + 40));
		for (let x = 0; x < WORLD_WIDTH; x++) ctx.lineTo(x, this.heights[x]);
		ctx.lineTo(WORLD_WIDTH - 1, Math.min(PLAY_HEIGHT, this.heights[WORLD_WIDTH - 1] + 40));
		for (let x = WORLD_WIDTH - 1; x >= 0; x--) ctx.lineTo(x, Math.min(PLAY_HEIGHT, this.heights[x] + 40));
		ctx.closePath();
		ctx.fill();

		// 표면층
		ctx.fillStyle = surface;
		ctx.beginPath();
		ctx.moveTo(0, Math.min(PLAY_HEIGHT, this.heights[0] + 5));
		for (let x = 0; x < WORLD_WIDTH; x++) ctx.lineTo(x, this.heights[x]);
		ctx.lineTo(WORLD_WIDTH - 1, Math.min(PLAY_HEIGHT, this.heights[WORLD_WIDTH - 1] + 5));
		for (let x = WORLD_WIDTH - 1; x >= 0; x--) ctx.lineTo(x, Math.min(PLAY_HEIGHT, this.heights[x] + 5));
		ctx.closePath();
		ctx.fill();

		// 표면 하이라이트
		ctx.strokeStyle = highlight;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, this.heights[0]);
		for (let x = 1; x < WORLD_WIDTH; x++) ctx.lineTo(x, this.heights[x]);
		ctx.stroke();
	}

	explode(cx: number, cy: number, radius: number): void {
		this.alphaMap.clearCircle(cx, cy, radius);
		const ctx = this.ctx;
		ctx.save();
		ctx.globalCompositeOperation = "destination-out";
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
		ctx.save();
		ctx.globalCompositeOperation = "source-atop";
		ctx.strokeStyle = "rgba(68, 51, 34, 0.3)";
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
		ctx.stroke();
		ctx.restore();
		this.canvasTexture.refresh();
	}

	isSolid(x: number, y: number): boolean {
		return this.alphaMap.isSolid(x, y);
	}

	getHeightAt(x: number): number {
		return this.alphaMap.getColumnHeight(x);
	}

	findSurfaceBelow(x: number, startY: number): number {
		return this.alphaMap.findSurfaceBelow(x, startY);
	}
}
