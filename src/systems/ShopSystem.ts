import type { ItemType } from "./PowerUpSystem";

/** Shop economy system - earn coins, buy weapons/items */

// Coin rewards for actions
export const COIN_REWARDS = {
  HIT: 15,           // hitting opponent
  DIRECT_HIT: 25,    // direct hit (within explosion radius)
  KILL: 50,          // killing blow
  TURN_BONUS: 5,     // base per turn
  COMBO_2: 10,       // 2-hit combo bonus
  COMBO_3: 20,       // 3+ combo bonus
  HIGH_GROUND: 5,    // shooting from high ground
  NO_DAMAGE_TURN: 8, // completing a turn without taking damage
} as const;

// Shop items with prices
export interface ShopItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  type: "weapon_ammo" | "item";
  /** For weapon_ammo: index in weapon array. For item: ItemType */
  weaponIndex?: number;
  itemType?: ItemType;
  description: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  // Weapon ammo refills
  { id: "ammo_large", name: "대형탄 +1", icon: "🔥", price: 20, type: "weapon_ammo", weaponIndex: 1, description: "대형탄 1발 추가" },
  { id: "ammo_shotgun", name: "산탄 +1", icon: "🎯", price: 15, type: "weapon_ammo", weaponIndex: 2, description: "산탄 1발 추가" },
  { id: "ammo_bounce", name: "바운스 +1", icon: "🏀", price: 20, type: "weapon_ammo", weaponIndex: 3, description: "바운스탄 1발 추가" },
  { id: "ammo_napalm", name: "나팔름 +1", icon: "🔶", price: 25, type: "weapon_ammo", weaponIndex: 4, description: "나팔름 1발 추가" },
  { id: "ammo_drill", name: "드릴 +1", icon: "⛏️", price: 35, type: "weapon_ammo", weaponIndex: 5, description: "드릴탄 1발 추가" },
  { id: "ammo_cluster", name: "집속탄 +1", icon: "🎆", price: 30, type: "weapon_ammo", weaponIndex: 6, description: "집속탄 1발 추가" },
  { id: "ammo_dirt", name: "흙덩이 +1", icon: "🟤", price: 15, type: "weapon_ammo", weaponIndex: 7, description: "흙덩이 1발 추가" },
  // Items
  { id: "item_heal", name: "체력 회복", icon: "❤️", price: 25, type: "item", itemType: "heal", description: "HP 25 회복" },
  { id: "item_shield", name: "보호막", icon: "🛡️", price: 30, type: "item", itemType: "shield", description: "다음 피격 60% 감소" },
  { id: "item_powerup", name: "파워 UP", icon: "💪", price: 20, type: "item", itemType: "powerUp", description: "다음 발사 파워 2배" },
  { id: "item_dmgup", name: "데미지 UP", icon: "🔥", price: 25, type: "item", itemType: "damageUp", description: "다음 발사 데미지 2배" },
  { id: "item_teleport", name: "텔레포트", icon: "✨", price: 35, type: "item", itemType: "teleport", description: "랜덤 안전 위치로 이동" },
];

export class ShopSystem {
  /** Player coins [p1, p2] */
  coins: [number, number] = [30, 30]; // starting coins

  /** Purchase history for UI */
  private lastPurchase: { player: number; item: ShopItem } | null = null;

  addCoins(player: number, amount: number): void {
    this.coins[player] = Math.min(999, this.coins[player] + amount);
  }

  canAfford(player: number, item: ShopItem): boolean {
    return this.coins[player] >= item.price;
  }

  /** Buy an item. Returns true if purchase successful */
  buy(player: number, item: ShopItem): boolean {
    if (!this.canAfford(player, item)) return false;
    this.coins[player] -= item.price;
    this.lastPurchase = { player, item };
    return true;
  }

  getLastPurchase() {
    const p = this.lastPurchase;
    this.lastPurchase = null;
    return p;
  }

  /** Reset for new match */
  reset(): void {
    this.coins = [30, 30];
    this.lastPurchase = null;
  }
}
