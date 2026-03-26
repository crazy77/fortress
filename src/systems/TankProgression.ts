/** Tank Progression System - XP and level-based stat bonuses */

const STORAGE_KEY = "fortress_tank_progression";

export interface TankLevel {
  xp: number;
  level: number;
  gamesPlayed: number;
  wins: number;
}

/** XP required for each level (cumulative) */
const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];
const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1;

/** Stat bonus per level (multiplier added per level) */
export const LEVEL_BONUSES = {
  /** +1% damage per level */
  damageMultiplier: 0.01,
  /** +2 fuel per level */
  fuelBonus: 2,
  /** +0.5% explosion radius per level */
  radiusMultiplier: 0.005,
} as const;

export interface AllTankProgress {
  [tankId: string]: TankLevel;
}

function loadProgress(): AllTankProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveProgress(data: AllTankProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function getLevel(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i;
  }
  return 0;
}

export class TankProgressionSystem {
  private data: AllTankProgress;

  constructor() {
    this.data = loadProgress();
  }

  getTankProgress(tankId: string): TankLevel {
    if (!this.data[tankId]) {
      this.data[tankId] = { xp: 0, level: 0, gamesPlayed: 0, wins: 0 };
    }
    return this.data[tankId];
  }

  getLevel(tankId: string): number {
    return this.getTankProgress(tankId).level;
  }

  getXP(tankId: string): number {
    return this.getTankProgress(tankId).xp;
  }

  /** XP needed for next level */
  getXPToNextLevel(tankId: string): { current: number; needed: number } {
    const prog = this.getTankProgress(tankId);
    const nextLvl = Math.min(prog.level + 1, MAX_LEVEL);
    const currentThreshold = LEVEL_THRESHOLDS[prog.level] ?? 0;
    const nextThreshold = LEVEL_THRESHOLDS[nextLvl] ?? LEVEL_THRESHOLDS[MAX_LEVEL];
    return {
      current: prog.xp - currentThreshold,
      needed: nextThreshold - currentThreshold,
    };
  }

  /** Add XP and check for level up. Returns new level if leveled up, null otherwise */
  addXP(tankId: string, amount: number): number | null {
    const prog = this.getTankProgress(tankId);
    const oldLevel = prog.level;
    prog.xp += amount;
    prog.level = getLevel(prog.xp);
    this.save();
    return prog.level > oldLevel ? prog.level : null;
  }

  /** Record a game played */
  recordGame(tankId: string, won: boolean): void {
    const prog = this.getTankProgress(tankId);
    prog.gamesPlayed++;
    if (won) prog.wins++;
    this.save();
  }

  /** Get stat multipliers for a tank based on its level */
  getStatBonuses(tankId: string): { damageMultiplier: number; fuelBonus: number; radiusMultiplier: number } {
    const level = this.getLevel(tankId);
    return {
      damageMultiplier: 1 + level * LEVEL_BONUSES.damageMultiplier,
      fuelBonus: level * LEVEL_BONUSES.fuelBonus,
      radiusMultiplier: 1 + level * LEVEL_BONUSES.radiusMultiplier,
    };
  }

  /** Get level title for display */
  getLevelTitle(level: number): string {
    const titles = ["신병", "이병", "일병", "상병", "병장", "하사", "중사", "상사", "원사", "장군"];
    return titles[Math.min(level, titles.length - 1)];
  }

  isMaxLevel(tankId: string): boolean {
    return this.getLevel(tankId) >= MAX_LEVEL;
  }

  private save(): void {
    saveProgress(this.data);
  }
}

// Singleton
let _instance: TankProgressionSystem | null = null;
export function getTankProgression(): TankProgressionSystem {
  if (!_instance) _instance = new TankProgressionSystem();
  return _instance;
}
