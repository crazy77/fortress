/** Daily Challenge System - unique challenge each day */

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Challenge conditions */
  condition: {
    mapId?: string;
    tankId?: string;
    maxTurns?: number;
    minAccuracy?: number;
    noDamage?: boolean;
    aiDifficulty?: string;
    weaponOnly?: string; // weapon name restriction
  };
  /** Reward */
  xpReward: number;
  coinReward: number;
}

const CHALLENGE_TEMPLATES: Omit<DailyChallenge, "id">[] = [
  {
    title: "명사수",
    description: "명중률 80% 이상으로 AI Hard 격파",
    icon: "🎯",
    condition: { minAccuracy: 80, aiDifficulty: "hard" },
    xpReward: 100,
    coinReward: 50,
  },
  {
    title: "전격전",
    description: "5턴 이내에 승리",
    icon: "⚡",
    condition: { maxTurns: 5 },
    xpReward: 80,
    coinReward: 40,
  },
  {
    title: "무적",
    description: "데미지 없이 승리",
    icon: "🛡️",
    condition: { noDamage: true },
    xpReward: 150,
    coinReward: 80,
  },
  {
    title: "화산 정복",
    description: "화산 맵에서 AI Normal 격파",
    icon: "🌋",
    condition: { mapId: "volcano", aiDifficulty: "normal" },
    xpReward: 60,
    coinReward: 30,
  },
  {
    title: "다리 위의 전투",
    description: "다리 맵에서 승리",
    icon: "🌉",
    condition: { mapId: "bridge" },
    xpReward: 60,
    coinReward: 30,
  },
  {
    title: "중전차 마스터",
    description: "중전차로 AI Hard 격파",
    icon: "🏋️",
    condition: { tankId: "heavy", aiDifficulty: "hard" },
    xpReward: 90,
    coinReward: 45,
  },
  {
    title: "호버 스피드런",
    description: "호버로 4턴 이내 승리",
    icon: "💨",
    condition: { tankId: "hover", maxTurns: 4 },
    xpReward: 120,
    coinReward: 60,
  },
  {
    title: "카타펄트 전문가",
    description: "카타펄트로 명중률 70% 이상 승리",
    icon: "🪨",
    condition: { tankId: "catapult", minAccuracy: 70 },
    xpReward: 100,
    coinReward: 50,
  },
  {
    title: "레이저 정밀타격",
    description: "레이저로 명중률 90% 이상 달성",
    icon: "🔬",
    condition: { tankId: "laser", minAccuracy: 90 },
    xpReward: 110,
    coinReward: 55,
  },
  {
    title: "계단 공략",
    description: "계단 맵에서 AI Hard 격파",
    icon: "🪜",
    condition: { mapId: "stairs", aiDifficulty: "hard" },
    xpReward: 80,
    coinReward: 40,
  },
  {
    title: "군도 생존자",
    description: "군도 맵에서 승리",
    icon: "🏝️",
    condition: { mapId: "islands" },
    xpReward: 60,
    coinReward: 30,
  },
  {
    title: "사막의 여우",
    description: "사막 맵에서 3턴 이내 승리",
    icon: "🦊",
    condition: { mapId: "desert", maxTurns: 3 },
    xpReward: 130,
    coinReward: 65,
  },
];

const STORAGE_KEY = "fortress_daily_challenge";

interface DailySaveData {
  date: string; // YYYY-MM-DD
  completed: boolean;
  challengeIndex: number;
}

function getDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Deterministic pseudo-random from date string */
function dateToSeed(dateStr: string): number {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getTodayChallenge(): DailyChallenge {
  const dateStr = getDateString();
  const seed = dateToSeed(dateStr);
  const index = seed % CHALLENGE_TEMPLATES.length;
  const template = CHALLENGE_TEMPLATES[index];
  return {
    ...template,
    id: `daily_${dateStr}`,
  };
}

export function isDailyChallengeCompleted(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data: DailySaveData = JSON.parse(raw);
    return data.date === getDateString() && data.completed;
  } catch {
    return false;
  }
}

export function completeDailyChallenge(): void {
  const dateStr = getDateString();
  const seed = dateToSeed(dateStr);
  const data: DailySaveData = {
    date: dateStr,
    completed: true,
    challengeIndex: seed % CHALLENGE_TEMPLATES.length,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/** Check if a game result satisfies the daily challenge conditions */
export function checkDailyChallenge(
  challenge: DailyChallenge,
  result: {
    won: boolean;
    mapId: string;
    tankId: string;
    accuracy: number;
    turnsPlayed: number;
    noDamageTaken: boolean;
    aiDifficulty: string;
    aiEnabled: boolean;
  },
): boolean {
  if (!result.won) return false;
  if (!result.aiEnabled) return false; // daily challenges require AI mode

  const c = challenge.condition;
  if (c.mapId && c.mapId !== result.mapId) return false;
  if (c.tankId && c.tankId !== result.tankId) return false;
  if (c.maxTurns && result.turnsPlayed > c.maxTurns) return false;
  if (c.minAccuracy && result.accuracy < c.minAccuracy) return false;
  if (c.noDamage && !result.noDamageTaken) return false;
  if (c.aiDifficulty && c.aiDifficulty !== result.aiDifficulty) return false;

  return true;
}
