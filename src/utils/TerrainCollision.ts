/** 지형의 알파 채널을 Uint8Array로 관리하여 동기적 충돌 검사를 수행 */
export class TerrainAlphaMap {
	private map: Uint8Array;

	constructor(
		private width: number,
		private height: number,
	) {
		this.map = new Uint8Array(width * height);
	}

	/** 절차적 지형 높이 데이터로 알파맵 초기화 */
	initFromHeights(heights: number[]): void {
		this.map.fill(0);
		for (let x = 0; x < this.width; x++) {
			const terrainTop = heights[x] ?? this.height;
			for (let y = terrainTop; y < this.height; y++) {
				this.map[y * this.width + x] = 1;
			}
		}
	}

	isSolid(x: number, y: number): boolean {
		const ix = Math.floor(x);
		const iy = Math.floor(y);
		if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return false;
		return this.map[iy * this.width + ix] === 1;
	}

	/** 원형 영역을 제거 (폭발) */
	clearCircle(cx: number, cy: number, radius: number): void {
		const r2 = radius * radius;
		const minX = Math.max(0, Math.floor(cx - radius));
		const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
		const minY = Math.max(0, Math.floor(cy - radius));
		const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));

		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const dx = x - cx;
				const dy = y - cy;
				if (dx * dx + dy * dy <= r2) {
					this.map[y * this.width + x] = 0;
				}
			}
		}
	}

	/** 해당 x좌표 컬럼에서 가장 위에 있는 지형 y좌표 반환 (초기 배치용) */
	getColumnHeight(x: number): number {
		const ix = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
		for (let y = 0; y < this.height; y++) {
			if (this.map[y * this.width + ix] === 1) return y;
		}
		return this.height;
	}

	/**
	 * startY에서 아래로 탐색하여 첫 번째 지형 표면(solid 픽셀)을 반환.
	 * - 탱크가 현재 서 있는 층을 추적하는 핵심 함수
	 * - 위로는 절대 탐색하지 않아 다른 층으로 점프하지 않음
	 * - 지형이 없으면 this.height 반환 (낙사)
	 */
	findSurfaceBelow(x: number, startY: number): number {
		const ix = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
		const sy = Math.max(0, Math.min(this.height - 1, Math.floor(startY)));

		for (let y = sy; y < this.height; y++) {
			if (this.map[y * this.width + ix] === 1) {
				return y;
			}
		}
		return this.height;
	}
}
