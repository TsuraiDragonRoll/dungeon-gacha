export enum Phase {
  LOBBY = "LOBBY",
  DRAFTING = "DRAFTING",
  PREPARATION = "PREPARATION",
  ATTACK = "ATTACK",
  BIDDING_WAR = "BIDDING_WAR",
  GAME_OVER = "GAME_OVER",
}

export enum StructureType {
  WALL = "WALL",
  GATE = "GATE",
  MOAT = "MOAT",
  BARRACKS = "BARRACKS",
  SMITHY = "SMITHY",
  FLAGPOLE = "FLAGPOLE",
}

export enum Rarity {
  NORMAL = "NORMAL",
  EPIC = "EPIC",
  SPECIAL = "SPECIAL",
  LEGENDARY = "LEGENDARY",
}

export enum MonsterType {
  GOBLIN = "GOBLIN",
  ORC = "ORC",
  GIANT = "GIANT",
  DRAGON = "DRAGON",
  DEMON_KING = "DEMON_KING",
}

export interface Card {
  id: string;
  name: string;
  type: "HERO" | "GEAR" | "BONUS";
  rarity: Rarity;
  level: number;
  ability: string;
  description: string;
  phase: "A" | "P" | "A/P";
  effect: any;
  abilityUsed?: boolean;
}

export interface Tile {
  id: number;
  ownerId: string | null;
  structure: StructureType | null;
  level: number; // 1: Wood/Basic, 2: Stone/Upgraded
  monsterType: MonsterType | null;
  monsterHP: number;
  monsterMaxHP: number;
  isOccupied: boolean; // Occupied by hero or building
  occupiedByHeroId?: string | null;
  infected?: boolean;
  occupationTokenOwnerId?: string | null;  // Forced Occupation bonus card
  occupationTokenRoundsLeft?: number;      // Counts down each round
}

export interface Player {
  id: string;
  name: string;
  gemstones: number;
  mana: number;
  wood: number;
  clay: number;
  stone: number;
  heroes: Card[];
  gear: Card[];
  bonusCards: Card[];
  ready: boolean;
  draftHeroHand: Card[];
  draftGearHand: Card[];
  draftedCards: Card[];
  draftedHero: boolean;
  draftedGear: boolean;
  finishedPrep: boolean;
  usedFreeSummon: boolean;
  summonCountThisRound: number;
  totalSummons: number;
  heroesPlayedSinceRefill: number;     // Resets to 0 after every 6 hero plays (triggers refill)
  gearPlayedSinceRefill: number;       // Resets to 0 after every 6 gear plays (triggers refill)
  color: string;
  tilesCount: number;
  bidAmount?: number;
  earnedBonusThisAttack: boolean;          // Max 1 bonus card per attack phase
  monstersDefeatedThisAttack: number;      // Running count toward bonus trigger
  enemyCapturesThisAttack: number;         // Running count toward bonus trigger
}

export interface GameState {
  id: string;
  status: Phase;
  players: Player[];
  board: Tile[];
  currentPlayerIndex: number;
  round: number;
  logs: string[];
  actionSpaces: { id: string; used: boolean; type: "PRIMARY" | "SECONDARY"; label: string; cost: number; reward: any }[];
  heroDeck: Card[];
  specialDeck: Card[];
  gearDeck: Card[];
}
