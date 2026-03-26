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
	// ═══ 1. 초원 — 부드러운 언덕, 정면 대결 ═══
	{
		id: "hills",
		name: "초원",
		icon: "⛰️",
		generate: (W, H) => {
			const seed = Math.random() * 100;
			const heights: number[] = [];
			for (let x = 0; x < W; x++) {
				// 3~4개 부드러운 둥근 언덕 (각기 다른 높이)
				let h = H * 0.55;
				const hillCount = 3 + Math.floor(seed % 2);
				for (let i = 0; i < hillCount; i++) {
					const cx = W * (0.15 + (i / hillCount) * 0.7) + Math.sin(seed + i) * W * 0.05;
					const width = W * (0.12 + Math.sin(seed * 2 + i) * 0.04);
					const peak = 60 + Math.sin(seed + i * 3) * 40;
					const t = (x - cx) / width;
					h -= peak * Math.exp(-t * t * 2);
				}
				// 미세 잔디 울퉁불퉁
				h += Math.sin(x * 0.05 + seed) * 3;
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#6abf5e", soil: "#8b6914", rock: "#666666", highlight: "#8ed97e" },
		traits: { gravity: 1.0, windMultiplier: 1.0, thickness: "normal", hint: "균형 잡힌 기본 지형. 실력으로 승부!" },
	},
	// ═══ 2. 협곡 — 깊은 V자 절벽, 수직 벽면 ═══
	{
		id: "canyon",
		name: "협곡",
		icon: "🏜️",
		generate: (W, H) => {
			const heights: number[] = [];
			const seed = Math.random() * 100;
			// 양쪽 높은 절벽 (거의 수직) + 좁은 바닥
			for (let x = 0; x < W; x++) {
				const leftEdge = W * 0.35;
				const rightEdge = W * 0.65;
				const plateauH = H * 0.25; // 절벽 위 높이
				const floorH = H * 0.7;    // 바닥 높이

				let h: number;
				if (x < leftEdge - 40 || x > rightEdge + 40) {
					// 절벽 위 고지대 — 거의 평탄
					h = plateauH + Math.sin(x * 0.008 + seed) * 12;
				} else if (x >= leftEdge - 40 && x < leftEdge + 20) {
					// 왼쪽 절벽 — 급경사 낙하
					const t = (x - (leftEdge - 40)) / 60;
					h = plateauH + (floorH - plateauH) * (t * t * t); // cubic ease-in
				} else if (x > rightEdge - 20 && x <= rightEdge + 40) {
					// 오른쪽 절벽 — 급경사 낙하
					const t = ((rightEdge + 40) - x) / 60;
					h = plateauH + (floorH - plateauH) * (t * t * t);
				} else {
					// 협곡 바닥 — 좁고 울퉁불퉁
					h = floorH + Math.sin(x * 0.02 + seed) * 15 + Math.sin(x * 0.07 + seed * 2) * 5;
				}
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#d4a574", soil: "#a0522d", rock: "#8b4513", highlight: "#e8c9a0" },
		traits: { gravity: 1.0, windMultiplier: 1.5, thickness: "thin", hint: "깊은 절벽! 바운스/드릴탄이 유효" },
	},
	// ═══ 3. 섬 — 분리된 3개 섬, 사이에 낭떠러지 ═══
	{
		id: "islands",
		name: "군도",
		icon: "🏝️",
		generate: (W, H) => {
			const heights: number[] = [];
			const waterLevel = H * 0.75;
			// 3개 완전 분리된 섬 (사이에 빈 공간)
			const islands = [
				{ cx: W * 0.14, halfW: W * 0.09, peak: H * 0.35, flat: 0.4 },
				{ cx: W * 0.50, halfW: W * 0.12, peak: H * 0.30, flat: 0.5 },
				{ cx: W * 0.86, halfW: W * 0.09, peak: H * 0.38, flat: 0.35 },
			];
			for (let x = 0; x < W; x++) {
				let h = waterLevel;
				for (const isl of islands) {
					const dist = Math.abs(x - isl.cx);
					if (dist < isl.halfW) {
						const t = dist / isl.halfW;
						// 평탄 구간 + 급경사 가장자리
						const flatZone = isl.flat;
						let elevation: number;
						if (t < flatZone) {
							elevation = 1; // 평탄한 상단
						} else {
							const edgeT = (t - flatZone) / (1 - flatZone);
							elevation = 1 - edgeT * edgeT; // quadratic drop
						}
						const islandH = isl.peak + (waterLevel - isl.peak) * (1 - elevation);
						h = Math.min(h, islandH);
					}
				}
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#4caf50", soil: "#795548", rock: "#5d4037", highlight: "#81c784" },
		traits: { gravity: 1.0, windMultiplier: 0.6, thickness: "thin", hint: "분리된 섬! 이동 불가, 정확한 조준만이 살길" },
	},
	// ═══ 4. 계단 — 계단식 단차 지형 ═══
	{
		id: "stairs",
		name: "계단",
		icon: "🪜",
		generate: (W, H) => {
			const heights: number[] = [];
			const stepCount = 6 + Math.floor(Math.random() * 3);
			const stepW = W / stepCount;
			const minH = H * 0.2;
			const maxH = H * 0.7;
			const ascending = Math.random() > 0.5; // 오르막 or 내리막
			for (let x = 0; x < W; x++) {
				const stepIdx = Math.floor(x / stepW);
				const inStep = (x % stepW) / stepW;
				// 계단 높이
				const t = stepIdx / (stepCount - 1);
				const stepH = ascending ? minH + (maxH - minH) * t : maxH - (maxH - minH) * t;
				// 계단 가장자리에서 급전환 (수직에 가까움)
				let h: number;
				if (inStep < 0.08) {
					// 이전 단과의 전환부
					const prevH = stepIdx === 0 ? stepH : (ascending ? minH + (maxH - minH) * ((stepIdx - 1) / (stepCount - 1)) : maxH - (maxH - minH) * ((stepIdx - 1) / (stepCount - 1)));
					h = prevH + (stepH - prevH) * (inStep / 0.08);
				} else {
					h = stepH + Math.sin(x * 0.03) * 3; // 미세 표면
				}
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#a1887f", soil: "#8d6e63", rock: "#5d4037", highlight: "#bcaaa4" },
		traits: { gravity: 1.0, windMultiplier: 0.8, thickness: "thick", hint: "계단식 고저차! 고지대 점령이 핵심" },
	},
	// ═══ 5. 산악 — 뾰족한 지그재그 봉우리 ═══
	{
		id: "mountains",
		name: "산악",
		icon: "🗻",
		generate: (W, H) => {
			const heights: number[] = [];
			const seed = Math.random() * 100;
			// 무작위 뾰족 봉우리 (삼각형 기반)
			const peakCount = 5 + Math.floor(Math.random() * 4);
			const peaks: { x: number; h: number; w: number }[] = [];
			for (let i = 0; i < peakCount; i++) {
				peaks.push({
					x: W * (0.05 + Math.random() * 0.9),
					h: H * (0.15 + Math.random() * 0.25),
					w: W * (0.04 + Math.random() * 0.08),
				});
			}
			for (let x = 0; x < W; x++) {
				let h = H * 0.65; // 기본 높은 바닥
				for (const peak of peaks) {
					const dist = Math.abs(x - peak.x);
					if (dist < peak.w) {
						// 삼각형 봉우리 (뾰족함)
						const peakH = peak.h + (h - peak.h) * (dist / peak.w);
						h = Math.min(h, peakH);
					}
				}
				// 약간의 노이즈로 자연스러움 추가
				h += Math.sin(x * 0.04 + seed) * 5 + Math.sin(x * 0.1 + seed * 2) * 2;
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#78909c", soil: "#546e7a", rock: "#37474f", highlight: "#90a4ae" },
		traits: { gravity: 1.15, windMultiplier: 1.8, thickness: "normal", hint: "뾰족한 봉우리 사이로 정밀 사격! 고중력+강풍" },
	},
	// ═══ 6. 요새 — 양쪽 성벽 구조물 + 평탄한 중앙 ═══
	{
		id: "fortress",
		name: "요새",
		icon: "🏰",
		generate: (W, H) => {
			const heights: number[] = [];
			const baseFloor = H * 0.55;
			for (let x = 0; x < W; x++) {
				let h = baseFloor;
				// 왼쪽 성벽 (P1 요새) — 두꺼운 벽 + 평탄한 꼭대기
				const lWallCenter = W * 0.15;
				const lWallW = W * 0.06;
				if (Math.abs(x - lWallCenter) < lWallW) {
					h = H * 0.2; // 높은 성벽
				}
				// 왼쪽 성벽 뒤 플랫폼
				if (x < lWallCenter - lWallW && x > W * 0.02) {
					h = H * 0.35;
				}
				// 오른쪽 성벽 (P2 요새)
				const rWallCenter = W * 0.85;
				const rWallW = W * 0.06;
				if (Math.abs(x - rWallCenter) < rWallW) {
					h = H * 0.2;
				}
				if (x > rWallCenter + rWallW && x < W * 0.98) {
					h = H * 0.35;
				}
				// 중앙: 평탄한 전장 + 작은 장애물
				if (x > lWallCenter + lWallW + 20 && x < rWallCenter - rWallW - 20) {
					h = baseFloor;
					// 중앙 작은 둔덕
					const mid = W * 0.5;
					const midDist = Math.abs(x - mid);
					if (midDist < W * 0.05) {
						h -= (1 - midDist / (W * 0.05)) * 40;
					}
				}
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#a1887f", soil: "#6d4c41", rock: "#4e342e", highlight: "#bcaaa4" },
		traits: { gravity: 1.0, windMultiplier: 0.3, thickness: "thick", hint: "성벽 뒤에서 곡사! 드릴탄으로 벽 관통 가능" },
	},
	// ═══ 7. 사막 — 부드러운 큰 모래언덕 + 오아시스 ═══
	{
		id: "desert",
		name: "사막",
		icon: "🏜️",
		generate: (W, H) => {
			const heights: number[] = [];
			const seed = Math.random() * 100;
			for (let x = 0; x < W; x++) {
				// 크고 부드러운 모래언덕 (코사인 기반)
				let h = H * 0.5;
				h += Math.cos(x * 0.0025 + seed) * 60;
				h += Math.cos(x * 0.006 + seed * 1.5) * 30;
				// 풍문 (ripple) — 작은 반복 패턴
				h += Math.sin(x * 0.03 + seed) * 8 * Math.max(0, Math.sin(x * 0.002));
				// 오아시스 — 중앙에 움푹 파인 곳
				const oasisDist = Math.abs(x - W * 0.5) / (W * 0.08);
				if (oasisDist < 1) {
					h += (1 - oasisDist * oasisDist) * 50; // 움푹
				}
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#f4d03f", soil: "#d4a017", rock: "#b8860b", highlight: "#f9e784" },
		traits: { gravity: 0.85, windMultiplier: 1.8, thickness: "normal", hint: "저중력 + 모래폭풍! 포탄이 멀리 날아감" },
	},
	// ═══ 8. 화산 — 거대한 원뿔 + 분화구 ═══
	{
		id: "volcano",
		name: "화산",
		icon: "🌋",
		generate: (W, H) => {
			const heights: number[] = [];
			const volcCx = W * 0.5;
			for (let x = 0; x < W; x++) {
				const dist = Math.abs(x - volcCx);
				const maxDist = W * 0.45;
				// 원뿔 형태 (직선 경사)
				let h: number;
				if (dist < maxDist) {
					h = H * 0.7 - (1 - dist / maxDist) * (H * 0.55);
				} else {
					h = H * 0.7;
				}
				// 분화구 (정상 부근 오목)
				const craterR = W * 0.04;
				if (dist < craterR) {
					h += (1 - dist / craterR) * 50; // 분화구 깊이
				}
				// 경사면 울퉁불퉁 (용암류 자국)
				h += Math.sin(x * 0.015 + dist * 0.02) * 8;
				h += Math.sin(x * 0.04) * 3;
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#424242", soil: "#5d4037", rock: "#3e2723", highlight: "#757575" },
		traits: { gravity: 1.3, windMultiplier: 0.7, thickness: "thin", hint: "가파른 경사 + 고중력! 위에서 쏘면 유리" },
	},
	// ═══ 9. 다리 — 중앙에 파괴 가능한 다리 ═══
	{
		id: "bridge",
		name: "다리",
		icon: "🌉",
		generate: (W, H) => {
			const heights: number[] = [];
			const bridgeH = H * 0.35; // 다리 높이
			const gapStart = W * 0.3;
			const gapEnd = W * 0.7;
			const groundH = H * 0.7;  // 낭떠러지 아래
			for (let x = 0; x < W; x++) {
				if (x < gapStart || x > gapEnd) {
					// 양쪽 대지 — 다리 높이와 같은 수준
					let h = bridgeH;
					// 가장자리로 갈수록 약간 높아짐
					if (x < W * 0.1) h -= (1 - x / (W * 0.1)) * 30;
					if (x > W * 0.9) h -= (1 - (W - x) / (W * 0.1)) * 30;
					h += Math.sin(x * 0.01) * 5;
					heights.push(Math.floor(h));
				} else {
					// 다리 구간 — 얇고 평탄한 다리
					heights.push(Math.floor(bridgeH));
				}
			}
			return heights;
		},
		theme: { surface: "#8d6e63", soil: "#6d4c41", rock: "#4e342e", highlight: "#a1887f" },
		traits: { gravity: 1.0, windMultiplier: 1.0, thickness: "thin", hint: "다리를 파괴하면 적이 낙사! 전략적 사격" },
	},
	// ═══ 10. 메사 — 평탄한 고원 + 절벽 ═══
	{
		id: "mesa",
		name: "메사",
		icon: "🏔️",
		generate: (W, H) => {
			const heights: number[] = [];
			// 3개의 평평한 고원 (서로 다른 높이) + 수직 절벽
			const mesas = [
				{ start: W * 0.02, end: W * 0.28, h: H * 0.3 },
				{ start: W * 0.35, end: W * 0.65, h: H * 0.45 },
				{ start: W * 0.72, end: W * 0.98, h: H * 0.25 },
			];
			for (let x = 0; x < W; x++) {
				let h = H * 0.72; // 바닥
				for (const mesa of mesas) {
					if (x >= mesa.start && x <= mesa.end) {
						const edgeL = x - mesa.start;
						const edgeR = mesa.end - x;
						const edgeDist = Math.min(edgeL, edgeR);
						if (edgeDist < 15) {
							// 급경사 가장자리
							h = mesa.h + (H * 0.72 - mesa.h) * (1 - edgeDist / 15);
						} else {
							h = mesa.h + Math.sin(x * 0.02) * 3; // 평탄
						}
					}
				}
				heights.push(Math.floor(h));
			}
			return heights;
		},
		theme: { surface: "#d4a574", soil: "#a0522d", rock: "#8b4513", highlight: "#e8c9a0" },
		traits: { gravity: 1.0, windMultiplier: 1.2, thickness: "normal", hint: "평탄한 고원! 높은 곳이 유리하지만 좁다" },
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

	/** 원형 영역에 지형을 추가 (흙덩이 무기) */
	addDirt(cx: number, cy: number, radius: number): void {
		this.alphaMap.fillCircle(cx, cy, radius);
		const ctx = this.ctx;
		ctx.save();
		ctx.fillStyle = this.theme.soil;
		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fill();
		// 표면 테두리
		ctx.strokeStyle = this.theme.surface;
		ctx.lineWidth = 2;
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
