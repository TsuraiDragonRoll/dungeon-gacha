import { Card, Rarity } from "./types";

export const HERO_CARDS: Partial<Card>[] = [
  // Normal Heroes
  { id: "ash", name: "Ash", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Deal 1 damage to a monster.", phase: "A", description: "A beginner human firewizard" },
  { id: "eliza", name: "Eliza", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Occupy 1 square.", phase: "A", description: "A lizardman footsoldier" },
  { id: "brog", name: "Brog", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Deal 2 damage to a monster.", phase: "A", description: "An orc traitor" },
  { id: "slink", name: "Slink", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Steal 2 gemstones from an adjacent player.", phase: "A", description: "A rat thief" },
  { id: "kael", name: "Kael", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Deal 1 damage to any monster on the board.", phase: "A", description: "A human archer" },
  { id: "finley", name: "Finley", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Reduces the cost of building a wall by 1 lumber.", phase: "P", description: "A human squire" },
  { id: "mura", name: "Mura", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Occupy 1 square.", phase: "A", description: "A naga guard" },
  { id: "grog", name: "Grog", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Gain 1 stone if occupying a monster-cleared square.", phase: "P", description: "A dwarven miner" },
  { id: "pip", name: "Pip", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Set a trap on an owned tile. If a monster reclaims it, the monster starts at −3 HP.", phase: "A", description: "A kobold tunneler" },
  { id: "vera", name: "Vera", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Refresh the ability of 1 hero.", phase: "P", description: "A human herbalist" },
  { id: "dax", name: "Dax", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Deals +2 damage if the monster is a Giant or larger.", phase: "A", description: "A beast hunter" },
  { id: "niles", name: "Niles", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Gain 3 gemstones when a monster is defeated in an adjacent square.", phase: "A", description: "A human grave digger" },
  { id: "cora", name: "Cora", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "If this square is attacked, it costs the enemy +1 mana.", phase: "P", description: "A shield maiden" },
  { id: "tess", name: "Tess", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Deal 1 damage to every monster in a 3x3 area centered on a tile you click.", phase: "A", description: "A human scout" },
  { id: "boff", name: "Boff", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Repair a destroyed structure for 1 lumber.", phase: "P", description: "A human carpenter" },
  { id: "lina", name: "Lina", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "The next hero attack deals +1 damage.", phase: "A", description: "A human torch bearer" },
  { id: "orion", name: "Orion", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Swap the positions of any 2 monsters on the board.", phase: "A", description: "A star gazer" },
  { id: "zale", name: "Zale", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Gain 2 gemstones if occupying a square adjacent to a moat.", phase: "P", description: "A merman fisher" },
  { id: "bryn", name: "Bryn", type: "HERO", rarity: Rarity.NORMAL, level: 1, ability: "Gain 1 stone during the preparation phase.", phase: "P", description: "A human stonemason" },

  // Epic Heroes
  { id: "azul", name: "Azul", type: "HERO", rarity: Rarity.EPIC, level: 1, ability: "Deal 4 damage to a monster.", phase: "A", description: "Elf water mage" },
  { id: "night", name: "Night", type: "HERO", rarity: Rarity.EPIC, level: 1, ability: "Deal 4 damage to a monster.", phase: "A", description: "Necromancer" },
  { id: "trove", name: "Trove", type: "HERO", rarity: Rarity.EPIC, level: 1, ability: "Generates 4 gemstones every preparation phase.", phase: "P", description: "Dragonborn" },
  { id: "ewud", name: "Ewud", type: "HERO", rarity: Rarity.EPIC, level: 1, ability: "Build one wooden wall.", phase: "P", description: "Elder Tree Spirit" },
  { id: "alcie", name: "Alcie", type: "HERO", rarity: Rarity.EPIC, level: 1, ability: "Turn any 1 resource into 3 different resources.", phase: "P", description: "Human Alchemist" },

  // Legendary Hero
  { id: "hero_leg", name: "Hero", type: "HERO", rarity: Rarity.LEGENDARY, level: 1, ability: "Deal 5 damage each to 2 adjacent monsters.", phase: "A", description: "Hero of the dungeon" },
];

export const SPECIAL_HEROES: Partial<Card>[] = [
  { id: "ignis", name: "Ignis", type: "HERO", rarity: Rarity.SPECIAL, level: 1, ability: "Deal 6 damage to a monster and build a wooden wall on that square.", phase: "A", description: "A flame sentinel" },
  { id: "seraphina", name: "Seraphina", type: "HERO", rarity: Rarity.SPECIAL, level: 1, ability: "Spend 1 Mana to simultaneously occupy up to 2 monster-cleared squares adjacent to your territory.", phase: "A", description: "A celestial archangel" },
  { id: "mordecai", name: "Mordecai", type: "HERO", rarity: Rarity.SPECIAL, level: 1, ability: "Deal 7 damage to a monster; if it survives, it is stunned.", phase: "A", description: "A cursed warlock" },
  { id: "goliath", name: "Goliath", type: "HERO", rarity: Rarity.SPECIAL, level: 1, ability: "Occupy up to 3 cleared squares that are orthogonally adjacent to each other and to your territory.", phase: "A", description: "An iron guard" },
];

export const GEAR_CARDS: Partial<Card>[] = [
  // Offensive Gear
  { id: "g_sword", name: "Iron Longsword", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Deal +1 damage to a monster.", phase: "A", description: "Offensive Gear" },
  { id: "g_crossbow", name: "Heavy Crossbow", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Deal 3 damage to a monster up to 2 tiles away.", phase: "A", description: "Offensive Gear" },
  { id: "g_bomb", name: "Fire Bomb", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Deal 2 damage to a monster and all monsters orthogonally adjacent to it.", phase: "A", description: "Offensive Gear" },
  { id: "g_axe", name: "Slayer’s Axe", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Deal +3 damage specifically to Orcs or Giants.", phase: "A", description: "Offensive Gear" },
  { id: "g_dagger", name: "Poison Dagger", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Monster takes 1 damage at the end of this and next turn.", phase: "A", description: "Offensive Gear" },
  { id: "g_horn", name: "War Horn", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "All Heroes deal +1 damage this phase.", phase: "A", description: "Offensive Gear" },
  { id: "g_knuckles", name: "Spiked Knuckles", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Deal 2 damage; if monster dies, gain 2 gems.", phase: "A", description: "Offensive Gear" },
  { id: "g_lance", name: "Lance", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Deal 4 damage to an adjacent monster tile.", phase: "A", description: "Offensive Gear" },
  { id: "g_wand", name: "Magic Wand", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Deal 2 damage (costs 1 Mana instead of an action).", phase: "A", description: "Offensive Gear" },
  { id: "g_ballista", name: "Ballista", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Place on a wall. It deals 2 damage to any monster in its line of sight.", phase: "A", description: "Offensive Gear" },

  // Defensive & Utility Gear
  { id: "g_shield", name: "Tower Shield", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "The occupying hero on this tile is immune to Dragon/Demon King forced reclamation.", phase: "A", description: "Defensive Gear" },
  { id: "g_bait", name: "Monster Bait", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Move a monster from an adjacent tile to your current tile.", phase: "A", description: "Utility Gear" },
  { id: "g_boots", name: "Plated Boots", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Hero can occupy a tile containing a Moat.", phase: "A", description: "Utility Gear" },
  { id: "g_spyglass", name: "Spyglass", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Gain 3 Mana instantly.", phase: "P", description: "Utility Gear" },
  { id: "g_pick", name: "Mining Pick", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Spend 1 Mana to gain 2 Stone.", phase: "P", description: "Utility Gear" },
  { id: "g_trowel", name: "Trowel", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Spend 1 Mana to gain 2 Clay.", phase: "P", description: "Utility Gear" },
  { id: "g_lumberaxe", name: "Lumber Axe", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Spend 1 Mana to gain 3 Wood.", phase: "P", description: "Utility Gear" },
  { id: "g_medkit", name: "Medkit", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Reset a Hero’s ability immediately.", phase: "A/P", description: "Utility Gear" },
  { id: "g_caltrops", name: "Caltrops", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "If a monster reclaims this tile, it starts with -2 HP.", phase: "A", description: "Utility Gear" },
  { id: "g_bricks", name: "Reinforced Bricks", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Your stone walls require +2 damage/mana to bypass.", phase: "P", description: "Defensive Gear" },

  // Economic & Strategic Gear
  { id: "g_scale", name: "Merchant’s Scale", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Trade resources 1:1 with the bank once per turn.", phase: "P", description: "Economic Gear" },
  { id: "g_compass", name: "Golden Compass", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Gain 5 gems if you occupy a corner square.", phase: "P", description: "Economic Gear" },
  { id: "g_ring", name: "Mana Ring", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Gain 1 Mana at the start of every Attack Phase.", phase: "A", description: "Economic Gear" },
  { id: "g_contract", name: "Contract", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Reduces the Gem cost of Summoning by 3.", phase: "P", description: "Economic Gear" },
  { id: "g_smithytools", name: "Smithy Tools", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Reduces the Gem cost of Creating Gear by 3.", phase: "P", description: "Economic Gear" },
  { id: "g_taxbox", name: "Tax Box", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Gain 1 gem for every tile you occupy.", phase: "P", description: "Economic Gear" },
  { id: "g_blueprints", name: "Blueprints", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Build a structure without using a Primary Action space.", phase: "P", description: "Strategic Gear" },
  { id: "g_pouch", name: "Pouch of Holding", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Carry over 5 unused Mana to the next round.", phase: "P", description: "Strategic Gear" },
  { id: "g_bribe", name: "Bribe Letter", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "For 5 gems, skip a monster and occupy its tile.", phase: "A", description: "Strategic Gear" },
  { id: "g_decree", name: "King’s Decree", type: "GEAR", rarity: Rarity.NORMAL, level: 1, ability: "Gives you +10 Gemstone Value during the Flagpole Bidding War.", phase: "P", description: "Strategic Gear" },
];

export const BONUS_CARDS: Partial<Card>[] = [
  {
    id: "bc_mercenary",
    name: "Mercenary Contract",
    type: "BONUS" as any,
    rarity: Rarity.SPECIAL,
    level: 1,
    ability: "Summon 1 Hero from your hand for free (0 Gems, 0 Mana). Ignores Barracks limit for this use.",
    phase: "P",
    description: "Instant Bonus Card",
  },
  {
    id: "bc_caravan",
    name: "Reinforced Caravan",
    type: "BONUS" as any,
    rarity: Rarity.SPECIAL,
    level: 1,
    ability: "Immediately gain 4 Wood, 2 Clay, and 1 Stone from the bank.",
    phase: "P",
    description: "Instant Bonus Card",
  },
  {
    id: "bc_tamer",
    name: "Monster Tamer",
    type: "BONUS" as any,
    rarity: Rarity.SPECIAL,
    level: 1,
    ability: "Defeat one adjacent monster instantly without dealing damage.",
    phase: "A",
    description: "Attack Phase Bonus Card",
  },
  {
    id: "bc_siege",
    name: "Siege Engineering",
    type: "BONUS" as any,
    rarity: Rarity.SPECIAL,
    level: 1,
    ability: "Build a Wall or Moat for free on any cleared tile you occupy. Does not use an action space.",
    phase: "P",
    description: "Prep Phase Bonus Card",
  },
  {
    id: "bc_cache",
    name: "Hidden Cache",
    type: "BONUS" as any,
    rarity: Rarity.SPECIAL,
    level: 1,
    ability: "Gain 15 Gemstones. Keep hidden to surprise opponents during the Bidding War.",
    phase: "P",
    description: "Instant Bonus Card",
  },
  {
    id: "bc_occupy",
    name: "Forced Occupation",
    type: "BONUS" as any,
    rarity: Rarity.SPECIAL,
    level: 1,
    ability: "Place an Occupation Token on any cleared square you don't own. It stays occupied for 2 rounds, counting toward your tile total.",
    phase: "A",
    description: "Attack Phase Bonus Card",
  },
];

