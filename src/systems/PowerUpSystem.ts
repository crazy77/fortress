import type Phaser from "phaser";
import { CONFIG } from "../config";
import type { Terrain } from "../objects/Terrain";

// ═══ 아이템 정의 ═══

export type ItemType =
	// 공격 버프 (발사 전 사용, 턴 유지)
	| "powerUp"      // 파워 2배
	| "damageUp"     // 데미지 2배
	| "doubleShot"   // 더블 샷
	| "fireUp"       // 화염 추가 데미지
	// 방어/회복 (즉시 사용, 턴 유지)
	| "heal"         // 체력 회복
	| "shield"       // 보호막
	// 유틸리티 (즉시 사용, 턴 유지)
	| "moveUp"       // 이동 거리 2배
	| "windReverse"  // 바람 방향 반전
	| "teleport"     // 랜덤 위치 텔레포트
	// 디버프 (즉시 사용, 턴 소모)
	| "angleLock"    // 적 각도 고정
	| "moveLock";    // 적 이동 고정

export interface ItemDef {
	type: ItemType;
	icon: string;
	name: string;
	color: number;
	/** 사용 후에도 공격 가능 여부 (false면 턴 소모) */
	canAttackAfter: boolean;
	/** 설명 */
	desc: string;
}

export const ITEM_DEFS: ItemDef[] = [
	// 공격 버프 (발사 전 활성화 → 발사 시 적용)
	{ type: "powerUp", icon: "💪", name: "파워 UP", color: 0xe67e22, canAttackAfter: true, desc: "다음 발사 파워 2배" },
	{ type: "damageUp", icon: "🔥", name: "데미지 UP", color: 0xc0392b, canAttackAfter: true, desc: "다음 발사 데미지 2배" },
	{ type: "doubleShot", icon: "🎯", name: "더블 샷", color: 0x1abc9c, canAttackAfter: true, desc: "같은 궤도로 2발 발사" },
	{ type: "fireUp", icon: "🔶", name: "화염탄", color: 0xff5722, canAttackAfter: true, desc: "착탄 시 추가 화염 데미지" },
	// 방어/회복
	{ type: "heal", icon: "❤️", name: "체력 회복", color: 0xe74c3c, canAttackAfter: true, desc: "HP 25 회복" },
	{ type: "shield", icon: "🛡️", name: "보호막", color: 0x3498db, canAttackAfter: true, desc: "다음 피격 60% 감소" },
	// 유틸리티
	{ type: "moveUp", icon: "👟", name: "이동 UP", color: 0x2ecc71, canAttackAfter: true, desc: "이번 턴 이동 거리 2배" },
	{ type: "windReverse", icon: "🌀", name: "바람 반전", color: 0x9b59b6, canAttackAfter: true, desc: "바람 방향 즉시 반전" },
	{ type: "teleport", icon: "✨", name: "텔레포트", color: 0xe91e63, canAttackAfter: true, desc: "안전한 랜덤 위치로 순간이동" },
	// 디버프 (턴 소모)
	{ type: "angleLock", icon: "🔒", name: "각도 고정", color: 0x795548, canAttackAfter: false, desc: "적의 조준각 3턴 고정" },
	{ type: "moveLock", icon: "⛓️", name: "이동 봉쇄", color: 0x607d8b, canAttackAfter: false, desc: "적의 이동 3턴 봉쇄" },
];

export function getItemDef(type: ItemType): ItemDef {
	return ITEM_DEFS.find((d) => d.type === type) ?? ITEM_DEFS[0];
}

// ═══ 드롭 가중치 ═══

const DROP_WEIGHTS: { type: ItemType; weight: number }[] = [
	{ type: "heal", weight: 18 },
	{ type: "shield", weight: 14 },
	{ type: "powerUp", weight: 10 },
	{ type: "damageUp", weight: 9 },
	{ type: "doubleShot", weight: 8 },
	{ type: "fireUp", weight: 8 },
	{ type: "moveUp", weight: 10 },
	{ type: "windReverse", weight: 7 },
	{ type: "teleport", weight: 6 },
	{ type: "angleLock", weight: 8 },
	{ type: "moveLock", weight: 8 },
];

function rollItemType(): ItemType {
	const totalWeight = DROP_WEIGHTS.reduce((s, w) => s + w.weight, 0);
	let roll = Math.random() * totalWeight;
	for (const w of DROP_WEIGHTS) {
		roll -= w.weight;
		if (roll <= 0) return w.type;
	}
	return "heal";
}

// ═══ 월드 아이템 (맵에 떨어진 박스) ═══

export class WorldItem {
	readonly type: ItemType;
	readonly def: ItemDef;
	x: number;
	y: number;
	alive = true;
	private container: Phaser.GameObjects.Container;
	private tween: Phaser.Tweens.Tween;
	private falling = false;
	private fallVy = 0;

	constructor(
		private scene: Phaser.Scene,
		x: number,
		y: number,
		type: ItemType,
	) {
		this.x = x;
		this.y = y;
		this.type = type;
		this.def = getItemDef(type);

		const glowGfx = scene.add.graphics();
		glowGfx.fillStyle(0xf39c12, 0.2);
		glowGfx.fillCircle(0, 0, 16);
		glowGfx.fillStyle(0xf39c12, 0.4);
		glowGfx.fillCircle(0, 0, 10);

		const boxIcon = scene.add.text(0, 0, "📦", { fontSize: "18px" });
		boxIcon.setOrigin(0.5);

		this.container = scene.add.container(x, y, [glowGfx, boxIcon]);
		this.container.setDepth(8);

		this.tween = scene.tweens.add({
			targets: this.container,
			y: y - 5,
			duration: 1200,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});
	}

	isNear(tx: number, ty: number, radius = 30): boolean {
		const dx = this.x - tx;
		const dy = this.y - ty;
		return dx * dx + dy * dy <= radius * radius;
	}

	collect(): void {
		this.alive = false;
		this.tween.destroy();
		this.scene.tweens.add({
			targets: this.container,
			scaleX: 0,
			scaleY: 0,
			alpha: 0,
			duration: 200,
			ease: "Power2",
			onComplete: () => this.container.destroy(),
		});

		// 실제 아이콘 + 이름 팝업
		const popup = this.scene.add.text(this.x, this.y - 10, `${this.def.icon} ${this.def.name}`, {
			fontSize: "16px",
			color: "#ffffff",
			stroke: "#000000",
			strokeThickness: 3,
			fontStyle: "bold",
		});
		popup.setOrigin(0.5);
		popup.setDepth(25);
		this.scene.tweens.add({
			targets: popup,
			y: popup.y - 50,
			alpha: 0,
			duration: 1200,
			ease: "Power2",
			onComplete: () => popup.destroy(),
		});
	}

	startFalling(): void {
		if (this.falling) return;
		this.falling = true;
		this.fallVy = 0;
		this.tween.destroy();
	}

	updateFall(terrain: Terrain): void {
		if (!this.alive || !this.falling) return;

		this.fallVy += CONFIG.GRAVITY * 0.5;
		this.y += this.fallVy;

		if (terrain.isSolid(this.x, this.y + 5)) {
			const surfaceY = terrain.getHeightAt(this.x);
			this.y = surfaceY - 15;
			this.falling = false;
			this.fallVy = 0;
			this.tween = this.scene.tweens.add({
				targets: this.container,
				y: this.y - 5,
				duration: 1200,
				yoyo: true,
				repeat: -1,
				ease: "Sine.easeInOut",
			});
		}

		if (this.y > CONFIG.PLAY_HEIGHT + 20) {
			this.alive = false;
			this.container.destroy();
			return;
		}

		this.container.setPosition(this.x, this.y);
	}

	destroy(): void {
		this.alive = false;
		this.tween.destroy();
		this.container.destroy();
	}
}

// ═══ 플레이어 인벤토리 ═══

const MAX_INVENTORY = 4;

export class PlayerInventory {
	readonly items: (ItemType | null)[] = [null, null, null, null];

	/** 아이템 추가. 인벤토리 꽉 차면 false 반환 */
	add(type: ItemType): boolean {
		for (let i = 0; i < MAX_INVENTORY; i++) {
			if (this.items[i] === null) {
				this.items[i] = type;
				return true;
			}
		}
		return false; // 인벤토리 꽉 참
	}

	/** 슬롯의 아이템 사용 (제거) */
	use(slotIndex: number): ItemType | null {
		if (slotIndex < 0 || slotIndex >= MAX_INVENTORY) return null;
		const type = this.items[slotIndex];
		this.items[slotIndex] = null;
		return type;
	}

	/** 특정 슬롯에 아이템이 있는지 */
	has(slotIndex: number): boolean {
		return this.items[slotIndex] !== null;
	}

	/** 인벤토리에 아이템이 하나라도 있는지 */
	hasAny(): boolean {
		return this.items.some((i) => i !== null);
	}
}

// ═══ 아이템 매니저 (월드 아이템 + 인벤토리 관리) ═══

export class ItemManager {
	private worldItems: WorldItem[] = [];
	readonly inventories: PlayerInventory[];

	constructor(playerCount: number) {
		this.inventories = Array.from({ length: playerCount }, () => new PlayerInventory());
	}

	/** 폭발 후 아이템 드롭 시도 */
	trySpawnAt(scene: Phaser.Scene, x: number, terrain: Terrain): void {
		if (Math.random() > CONFIG.POWERUP_DROP_CHANCE) return;

		const surfaceY = terrain.getHeightAt(
			Math.max(40, Math.min(CONFIG.WORLD_WIDTH - 40, x)),
		);
		if (surfaceY >= CONFIG.PLAY_HEIGHT - 10) return;

		const type = rollItemType();
		const wi = new WorldItem(scene, x, surfaceY - 20, type);
		this.worldItems.push(wi);
	}

	/** 탱크 위치에서 아이템 수집 시도 */
	checkCollection(player: number, tankX: number, tankY: number): ItemDef | null {
		for (const wi of this.worldItems) {
			if (wi.alive && wi.isNear(tankX, tankY)) {
				const added = this.inventories[player].add(wi.type);
				if (added) {
					wi.collect();
					return wi.def;
				}
				// 인벤토리 꽉 차면 수집 불가
				return null;
			}
		}
		return null;
	}

	/** 지형 파괴 후 낙하 체크 */
	checkFallingAfterExplosion(terrain: Terrain): void {
		for (const wi of this.worldItems) {
			if (wi.alive && !terrain.isSolid(wi.x, wi.y + 10)) {
				wi.startFalling();
			}
		}
	}

	/** 낙하 업데이트 */
	updateFalling(terrain: Terrain): void {
		for (const wi of this.worldItems) {
			wi.updateFall(terrain);
		}
	}

	cleanup(): void {
		this.worldItems = this.worldItems.filter((w) => w.alive);
	}

	destroyAll(): void {
		for (const wi of this.worldItems) wi.destroy();
		this.worldItems = [];
	}
}
