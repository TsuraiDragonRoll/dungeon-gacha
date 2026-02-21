import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { HERO_CARDS, GEAR_CARDS, SPECIAL_HEROES, BONUS_CARDS } from "./src/constants";
import { Phase, StructureType, Rarity, MonsterType } from "./src/types";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  const PORT = process.env.PORT || 8080;
  const games = new Map<string, any>();

  function shuffle(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function getMonsterForTile(tileId: number) {
    const size = 9;
    const x = tileId % size;
    const y = Math.floor(tileId / size);
    const center = 4;
    const dist = Math.max(Math.abs(x - center), Math.abs(y - center));

    if (dist === 0) return { type: MonsterType.DEMON_KING, hp: 22 };
    if (dist === 1) return { type: MonsterType.DRAGON, hp: 14 };
    if (dist === 2) return { type: MonsterType.GIANT, hp: 8 };
    if (dist === 3) return { type: MonsterType.ORC, hp: 5 };
    return { type: MonsterType.GOBLIN, hp: 2 };
  }

  function createDecks() {
    const heroDeck: any[] = [];
    HERO_CARDS.forEach(card => {
      const count = 2;
      for (let i = 0; i < count; i++) {
        heroDeck.push({ ...card, id: `${card.id}_${i}` });
      }
    });

    const gearDeck: any[] = [];
    GEAR_CARDS.forEach((card, i) => {
      gearDeck.push({ ...card, id: `${card.id}_m${i}` });
    });

    const specialDeck: any[] = [];
    SPECIAL_HEROES.forEach(card => {
      specialDeck.push({ ...card });
    });

    // Bonus deck: 2 copies of each bonus card, shuffled
    const bonusDeck: any[] = [];
    BONUS_CARDS.forEach(card => {
      bonusDeck.push({ ...card, id: `${card.id}_0` });
      bonusDeck.push({ ...card, id: `${card.id}_1` });
    });

    return { heroDeck: shuffle(heroDeck), gearDeck: shuffle(gearDeck), specialDeck: shuffle(specialDeck), bonusDeck: shuffle(bonusDeck) };
  }

  function drawCards(deck: any[], count: number, guaranteeEpic = false) {
    const hand: any[] = [];
    if (guaranteeEpic) {
      const epicIdx = deck.findIndex(c => c.rarity === Rarity.EPIC);
      if (epicIdx !== -1) {
        hand.push(deck.splice(epicIdx, 1)[0]);
        count--;
      }
    }
    for (let i = 0; i < count; i++) {
      if (deck.length > 0) {
        hand.push(deck.pop());
      }
    }
    return hand;
  }

  function getStartingTiles(playerIndex: number) {
    // 9x9 grid, center of 4 sides
    // Sides: 0: Top, 1: Right, 2: Bottom, 3: Left
    const center = 4;
    const size = 9;
    if (playerIndex === 0) return [center - 1, center, center + 1]; // Top (3, 4, 5)
    if (playerIndex === 1) return [(center - 1) * size + 8, center * size + 8, (center + 1) * size + 8]; // Right (35, 44, 53)
    if (playerIndex === 2) return [8 * size + center - 1, 8 * size + center, 8 * size + center + 1]; // Bottom (75, 76, 77)
    if (playerIndex === 3) return [(center - 1) * size, center * size, (center + 1) * size]; // Left (27, 36, 45)
    return [];
  }

  function calculateIncome(tilesCount: number) {
    if (tilesCount >= 3 && tilesCount <= 5) return tilesCount * 4;
    if (tilesCount >= 6 && tilesCount <= 10) return tilesCount * 3;
    if (tilesCount >= 11 && tilesCount <= 17) return tilesCount * 2;
    if (tilesCount >= 18) return tilesCount * 1;
    return 0;
  }

  function advanceTurn(game: any) {
    if (game.status === Phase.PREPARATION) {
      let nextIndex = (game.currentPlayerIndex + 1) % game.players.length;
      let count = 0;
      while (game.players[nextIndex].finishedPrep && count < game.players.length) {
        nextIndex = (nextIndex + 1) % game.players.length;
        count++;
      }

      if (game.players.every((p: any) => p.finishedPrep)) {
        game.status = Phase.ATTACK;
        game.currentPlayerIndex = 0;

        // Monster reclamation logic
        game.board.forEach((tile: any) => {
          if (!tile.isOccupied && tile.ownerId !== null) {
            const player = game.players.find((p: any) => p.id === tile.ownerId);
            if (player) player.tilesCount--;

            const monster = getMonsterForTile(tile.id);
            tile.ownerId = null;
            tile.structure = null;
            tile.monsterType = monster.type;
            tile.monsterHP = monster.hp;
            tile.monsterMaxHP = monster.hp;
            game.logs.push(`Monster reclaimed tile ${tile.id}!`);
          }
        });

        game.players.forEach(p => {
          p.summonCountThisRound = 0;
        });

        game.logs.push("All players finished preparation. Attack phase begins!");

        // Mana Ring Gear
        game.players.forEach(p => {
          if (p.gear.some((g: any) => g.id === "g_ring")) {
            p.mana += 1;
          }
        });
      } else {
        game.currentPlayerIndex = nextIndex;
      }
    } else if (game.status === Phase.ATTACK) {
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
      if (game.currentPlayerIndex === 0) {
        game.status = Phase.PREPARATION;
        game.round++;

        // Re-sort players by tile count ascending (fewest tiles goes first as catch-up)
        game.players.sort((a: any, b: any) => (a.tilesCount - b.tilesCount) || a.id.localeCompare(b.id));
        game.currentPlayerIndex = 0;

        // SOLO MODE: End game after 20 rounds
        if (game.players.length === 1 && game.round > 20) {
          game.status = Phase.GAME_OVER;
          game.logs.push(`Solo run complete! Final gemstone tally: ${game.players[0].gemstones}`);
          return;
        }

        game.logs.push(`Turn order updated: ${game.players.map((p: any) => p.name).join(" → ")}`);

        game.board.forEach((tile: any) => {
          // Tiles with structures are always occupied.
          // Starting tiles are also always occupied.
          const isStartingTile = game.players.some((_: any, idx: number) => getStartingTiles(idx).includes(tile.id));
          tile.isOccupied = tile.structure !== null || isStartingTile || !!tile.occupiedByHeroId;

          // Reset partial defense damage on opponent tiles so fortifications regenerate each round
          if (tile.ownerId !== null && tile.monsterType === null && tile.monsterHP > 0) {
            tile.monsterHP = 0;
            tile.monsterMaxHP = 0;
          }
        });

        game.actionSpaces.forEach((a: any) => {
          a.used = false;
          if (a.id === "p_lumber") a.reward.wood += 4;
          if (a.id === "p_clay") a.reward.clay += 1;
          if (a.id === "p_stone") a.reward.stone += 1;
          if (a.id === "s_lumber") a.reward.wood += 2;
          if (a.id === "s_stone") a.reward.stone += 1;
        });

        // Add secondary actions if not already present (for 3+ players)
        if (game.players.length >= 3 && !game.actionSpaces.some((a: any) => a.id === "s_lumber")) {
          game.actionSpaces.push(
            { id: "s_lumber", used: false, type: "SECONDARY", label: "Purchase Lumber (2)", cost: 6, reward: { wood: 2 } },
            { id: "s_stone", used: false, type: "SECONDARY", label: "Purchase Stone (1)", cost: 6, reward: { stone: 1 } },
            { id: "s_up_wall", used: false, type: "SECONDARY", label: "Upgrade Wall (1 Stone)", cost: 10, reward: { structure: StructureType.WALL } },
            { id: "s_up_moat", used: false, type: "SECONDARY", label: "Upgrade Moat", cost: 4, reward: { structure: StructureType.MOAT } },
            { id: "s_summon", used: false, type: "SECONDARY", label: "Summon Hero (S)", cost: 8, reward: { hero: true } },
            { id: "s_gear", used: false, type: "SECONDARY", label: "Create Gear (S)", cost: 8, reward: { gear: true } }
          );
        }

        game.players.forEach((p: any) => {
          p.gemstones += calculateIncome(p.tilesCount);

          // Tax Box Gear
          if (p.gear.some((g: any) => g.id === "g_taxbox")) {
            p.gemstones += p.tilesCount;
          }

          p.finishedPrep = false; // Reset for next round
          p.heroes.forEach((h: any) => h.abilityUsed = false);
          p.gear.forEach((g: any) => g.abilityUsed = false);

          // Hero Resource Generation at start of prep phase
          p.heroes.forEach((h: any) => {
            if (h.id.startsWith("bryn")) {
              p.stone += 1;
              game.logs.push(`${p.name}'s ${h.name} supplied 1 Stone.`);
            } else if (h.id.startsWith("trove")) {
              p.gemstones += 4;
              game.logs.push(`${p.name}'s ${h.name} supplied 4 Gemstones.`);
            } else if (h.id.startsWith("grog") || h.id.startsWith("zale")) {
              // Find tile occupied by this hero
              const occupiedTile = game.board.find((t: any) => t.occupiedByHeroId === h.id);
              if (occupiedTile) {
                if (h.id.startsWith("grog") && occupiedTile.monsterType === null) {
                  p.stone += 1;
                  game.logs.push(`${p.name}'s ${h.name} supplied 1 Stone (occupying monster-cleared square).`);
                } else if (h.id.startsWith("zale")) {
                  // Check adjacent for moat
                  const tid = occupiedTile.id;
                  const x = tid % 9, y = Math.floor(tid / 9);
                  const ns = [];
                  if (x > 0) ns.push(tid - 1);
                  if (x < 8) ns.push(tid + 1);
                  if (y > 0) ns.push(tid - 9);
                  if (y < 8) ns.push(tid + 9);
                  const adjMoat = ns.some(n => game.board[n].structure === StructureType.MOAT);
                  if (adjMoat) {
                    p.gemstones += 2;
                    game.logs.push(`${p.name}'s ${h.name} supplied 2 Gemstones (adjacent to Moat).`);
                  }
                }
              }
            }
          });

          // Reset bonus-card attack trackers for the new round
          p.earnedBonusThisAttack = false;
          p.monstersDefeatedThisAttack = 0;
          p.enemyCapturesThisAttack = 0;
        });

        // Tick down occupation tokens from Forced Occupation bonus cards
        game.board.forEach((tile: any) => {
          if (tile.occupationTokenRoundsLeft > 0) {
            tile.occupationTokenRoundsLeft--;
            if (tile.occupationTokenRoundsLeft === 0) {
              const tokenOwner = game.players.find((p: any) => p.id === tile.occupationTokenOwnerId);
              if (tokenOwner) { tokenOwner.tilesCount--; }
              tile.occupationTokenOwnerId = null;
              // If not owned normally, it is no longer occupied
              if (tile.ownerId === null) tile.isOccupied = false;
              game.logs.push(`Occupation token on tile ${tile.id} expired.`);
            }
          }
        });

        game.logs.push(`Round ${game.round} begins. Preparation phase.`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AI BOT ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  const BOT_NAMES = ["Grim", "Zara", "Vex", "Nix", "Dusk", "Mora", "Kade", "Lyra"];
  const BOT_DELAYS = { min: 900, max: 1600 };

  function botDelay() {
    return BOT_DELAYS.min + Math.random() * (BOT_DELAYS.max - BOT_DELAYS.min);
  }

  /** Called after every game_updated emit. Schedules bot turns as needed. */
  function scheduleBot(game: any, roomId: string) {
    if (!game) return;

    // DRAFTING: bots pick simultaneously — schedule any bot that still has hands
    if (game.status === Phase.DRAFTING) {
      game.players.forEach((p: any) => {
        if (!p.isBot) return;
        if (p.ready) return; // already done

        setTimeout(() => {
          const g = games.get(roomId);
          if (!g || g.status !== Phase.DRAFTING) return;
          const bot = g.players.find((pl: any) => pl.id === p.id);
          if (!bot || bot.ready) return;

          // Pick hero
          if (bot.draftStep === "hero" && bot.draftHeroHand.length > 0) {
            const pick = bot.draftHeroHand.reduce((best: any, c: any) => {
              const rarityScore = (r: string) => r === "EPIC" ? 3 : r === "RARE" ? 2 : 1;
              return rarityScore(c.rarity) >= rarityScore(best.rarity) ? c : best;
            });
            // Simulate draft_card logic inline
            const idx = bot.draftHeroHand.findIndex((c: any) => c.id === pick.id);
            if (idx !== -1) {
              const chosen = bot.draftHeroHand.splice(idx, 1)[0];
              bot.draftedCards.push(chosen);
              bot.draftedHero = true;
              bot.draftStep = "gear";
              g.logs.push(`${bot.name} [BOT] drafted hero: ${chosen.name}`);
            }
            io.to(roomId).emit("game_updated", g);
            // Schedule gear pick
            scheduleBot(g, roomId);
          }
          // Pick gear
          else if (bot.draftStep === "gear" && bot.draftGearHand.length > 0) {
            const pick = bot.draftGearHand.reduce((best: any, c: any) => {
              const rarityScore = (r: string) => r === "EPIC" ? 3 : r === "RARE" ? 2 : 1;
              return rarityScore(c.rarity) >= rarityScore(best.rarity) ? c : best;
            });
            const idx = bot.draftGearHand.findIndex((c: any) => c.id === pick.id);
            if (idx !== -1) {
              const chosen = bot.draftGearHand.splice(idx, 1)[0];
              bot.draftedCards.push(chosen);
              bot.draftedGear = true;
              bot.ready = true;
              g.logs.push(`${bot.name} [BOT] drafted gear: ${chosen.name}`);
            }
            // Rotate hands
            const heroHands = g.players.map((p2: any) => p2.draftHeroHand);
            const gearHands = g.players.map((p2: any) => p2.draftGearHand);
            // Check if all ready
            const allEmpty = g.players.every((p2: any) =>
              p2.ready || (p2.draftHeroHand.length === 0 && p2.draftGearHand.length === 0)
            );
            if (allEmpty || g.players.every((p2: any) => p2.ready)) {
              g.status = Phase.PREPARATION;
              g.currentPlayerIndex = 0;
              g.players.forEach((p2: any) => {
                p2.ready = false;
                p2.gemstones += calculateIncome(p2.tilesCount);
                p2.finishedPrep = false;
              });
              g.logs.push("Drafting complete. Preparation phase begins!");
            }
            io.to(roomId).emit("game_updated", g);
            scheduleBot(g, roomId);
          }
        }, botDelay());
      });
      return;
    }

    // PREP & ATTACK: schedule current player if bot
    const current = game.players[game.currentPlayerIndex];
    if (!current?.isBot) return;

    setTimeout(() => {
      const g = games.get(roomId);
      if (!g) return;
      const bot = g.players[g.currentPlayerIndex];
      if (!bot?.isBot || bot.id !== current.id) return;

      if (g.status === Phase.PREPARATION) runBotPrep(g, bot, roomId);
      else if (g.status === Phase.ATTACK) runBotAttack(g, bot, roomId);
    }, botDelay());
  }

  function runBotPrep(g: any, bot: any, roomId: string) {
    if (bot.finishedPrep) { advanceTurn(g); io.to(roomId).emit("game_updated", g); scheduleBot(g, roomId); return; }

    const canAfford = (cost: number) => bot.gemstones >= cost;
    const actionAvail = (id: string) => {
      const a = g.actionSpaces.find((a: any) => a.id === id);
      return a && !a.used && canAfford(a.cost);
    };

    // 1. Summon a hero if possible
    const heroCard = bot.draftedCards.find((c: any) => c.type === "HERO");
    if (heroCard && actionAvail("p_summon")) {
      const action = g.actionSpaces.find((a: any) => a.id === "p_summon");
      const barracksCount = g.board.filter((t: any) => t.ownerId === bot.id && t.structure === StructureType.BARRACKS).length;
      const maxHeroes = bot.totalSummons === 0 ? Infinity : barracksCount * 3;
      if (bot.heroes.length < maxHeroes) {
        bot.gemstones -= action.cost;
        const cardIdx = bot.draftedCards.findIndex((c: any) => c.id === heroCard.id);
        const card = bot.draftedCards.splice(cardIdx, 1)[0];
        card.abilityUsed = false;
        const existing = bot.heroes.find((h: any) => h.name === card.name);
        if (existing) { existing.level = Math.min(2, existing.level + 1); }
        else { bot.heroes.push(card); }
        bot.totalSummons++;
        bot.summonCountThisRound++;
        bot.heroesPlayedSinceRefill++;
        if (bot.heroesPlayedSinceRefill >= 6) {
          bot.heroesPlayedSinceRefill = 0;
          bot.draftedCards.push(...drawCards(g.heroDeck, 6, true));
        }
        action.used = true;
        g.logs.push(`${bot.name} [BOT] summoned ${card.name}.`);
        advanceTurn(g);
        io.to(roomId).emit("game_updated", g);
        scheduleBot(g, roomId);
        return;
      }
    }

    // 2. Equip a gear card if possible (need smithy after first)
    const gearCard = bot.draftedCards.find((c: any) => c.type === "GEAR");
    const hasSmithy = g.board.some((t: any) => t.ownerId === bot.id && t.structure === StructureType.SMITHY);
    if (gearCard && hasSmithy && actionAvail("p_gear")) {
      const action = g.actionSpaces.find((a: any) => a.id === "p_gear");
      bot.gemstones -= action.cost;
      const cardIdx = bot.draftedCards.findIndex((c: any) => c.id === gearCard.id);
      const card = bot.draftedCards.splice(cardIdx, 1)[0];
      card.abilityUsed = false;
      bot.gear.push(card);
      bot.gearPlayedSinceRefill++;
      if (bot.gearPlayedSinceRefill >= 6) {
        bot.gearPlayedSinceRefill = 0;
        bot.draftedCards.push(...drawCards(g.gearDeck, 6));
      }
      action.used = true;
      g.logs.push(`${bot.name} [BOT] equipped ${card.name}.`);
      advanceTurn(g);
      io.to(roomId).emit("game_updated", g);
      scheduleBot(g, roomId);
      return;
    }

    // 3. Build a wall if has 2+ wood and an eligible tile
    if (bot.wood >= 2 && actionAvail("p_wall")) {
      const eligibleTile = g.board.find((t: any) => t.ownerId === bot.id && !t.structure);
      if (eligibleTile) {
        const action = g.actionSpaces.find((a: any) => a.id === "p_wall");
        bot.gemstones -= action.cost;
        bot.wood -= 2;
        eligibleTile.structure = StructureType.WALL;
        eligibleTile.isOccupied = true;
        action.used = true;
        g.logs.push(`${bot.name} [BOT] built a Wall.`);
        advanceTurn(g);
        io.to(roomId).emit("game_updated", g);
        scheduleBot(g, roomId);
        return;
      }
    }

    // 4. Buy lumber if affordable
    if (actionAvail("p_lumber")) {
      const action = g.actionSpaces.find((a: any) => a.id === "p_lumber");
      bot.gemstones -= action.cost;
      bot.wood += action.reward.wood;
      action.reward.wood = 0;
      action.used = true;
      g.logs.push(`${bot.name} [BOT] purchased Lumber.`);
      advanceTurn(g);
      io.to(roomId).emit("game_updated", g);
      scheduleBot(g, roomId);
      return;
    }

    // 5. Generate mana if affordable
    if (actionAvail("p_mana1")) {
      const action = g.actionSpaces.find((a: any) => a.id === "p_mana1");
      bot.gemstones -= action.cost;
      bot.mana += 1;
      action.used = true;
      g.logs.push(`${bot.name} [BOT] generated Mana.`);
      advanceTurn(g);
      io.to(roomId).emit("game_updated", g);
      scheduleBot(g, roomId);
      return;
    }

    // 6. Finish prep
    bot.finishedPrep = true;
    g.logs.push(`${bot.name} [BOT] finished preparation.`);
    if (g.players[g.currentPlayerIndex].id === bot.id) advanceTurn(g);
    io.to(roomId).emit("game_updated", g);
    scheduleBot(g, roomId);
  }

  function runBotAttack(g: any, bot: any, roomId: string) {
    // Find all bot-owned tiles
    const botTileIds = new Set(g.board.filter((t: any) => t.ownerId === bot.id).map((t: any) => t.id));

    const isAdjToBot = (tileId: number) => {
      const x = tileId % 9, y = Math.floor(tileId / 9);
      const ns = [];
      if (x > 0) ns.push(tileId - 1); if (x < 8) ns.push(tileId + 1);
      if (y > 0) ns.push(tileId - 9); if (y < 8) ns.push(tileId + 9);
      return ns.some(n => botTileIds.has(n));
    };

    // Ready heroes
    const readyHeroes = bot.heroes.filter((h: any) => !h.abilityUsed);

    if (readyHeroes.length > 0) {
      // Find best adjacent monster tile (lowest HP = easiest kill)
      const monsterTargets = g.board
        .filter((t: any) => t.monsterType !== null && isAdjToBot(t.id))
        .sort((a: any, b: any) => a.monsterHP - b.monsterHP);

      // Find adjacent enemy tiles (owned by opponent)
      const enemyTargets = g.board
        .filter((t: any) => t.ownerId !== null && t.ownerId !== bot.id && isAdjToBot(t.id));

      const target = monsterTargets[0] || enemyTargets[0];
      const hero = readyHeroes[0];

      if (target) {
        // Calculate damage (matches server attack logic)
        let damage = 1;
        if (hero.id.startsWith("brog")) damage = hero.level === 1 ? 2 : 3;
        if (hero.id.startsWith("azul")) damage = hero.level === 1 ? 4 : 6;
        if (hero.id.startsWith("ignis")) damage = hero.level === 1 ? 6 : 8;
        if (hero.id.startsWith("mordecai")) damage = hero.level === 1 ? 7 : 12;

        if (target.monsterType !== null) {
          target.monsterHP -= damage;
          hero.abilityUsed = true;
          g.logs.push(`${bot.name} [BOT]: ${hero.name} attacked tile ${target.id} for ${damage} dmg (HP: ${target.monsterHP}).`);

          if (target.monsterHP <= 0) {
            target.ownerId = bot.id;
            target.monsterType = null;
            target.monsterHP = 0;
            target.monsterMaxHP = 0;
            target.isOccupied = true;
            bot.tilesCount++;
            g.logs.push(`${bot.name} [BOT] captured tile ${target.id}!`);

            // Bonus card check
            bot.monstersDefeatedThisAttack = (bot.monstersDefeatedThisAttack || 0) + 1;
            if (bot.monstersDefeatedThisAttack >= 3 && !bot.earnedBonusThisAttack && g.bonusDeck.length > 0) {
              bot.earnedBonusThisAttack = true;
              const bonus = g.bonusDeck.pop();
              if (bonus) { bot.bonusCards.push(bonus); g.logs.push(`${bot.name} [BOT] earned bonus card: ${bonus.name}!`); }
            }
          }
        } else {
          // Enemy tile — simplified: instant capture attempt with damage resistance
          target.monsterHP = (target.monsterHP || 0) + damage;
          hero.abilityUsed = true;
          const threshold = target.structure === StructureType.WALL ? 8 : target.structure === StructureType.MOAT ? 12 : 2;
          if (target.monsterHP >= threshold) {
            const prevOwner = g.players.find((p: any) => p.id === target.ownerId);
            if (prevOwner) prevOwner.tilesCount--;
            target.ownerId = bot.id;
            target.structure = null;
            target.monsterHP = 0;
            target.monsterMaxHP = 0;
            target.isOccupied = true;
            bot.tilesCount++;
            g.logs.push(`${bot.name} [BOT] captured enemy tile ${target.id}!`);
          } else {
            g.logs.push(`${bot.name} [BOT]: ${hero.name} dealt ${damage} dmg to enemy tile ${target.id} (${threshold - target.monsterHP} more needed).`);
          }
        }

        io.to(roomId).emit("game_updated", g);
        // Schedule another attack if more heroes are ready
        scheduleBot(g, roomId);
        return;
      }
    }

    // No more moves — end turn
    g.logs.push(`${bot.name} [BOT] ends their turn.`);
    advanceTurn(g);
    io.to(roomId).emit("game_updated", g);
    scheduleBot(g, roomId);
  }

  // ═══════════════════════════════════════════════════════════════════════════

  io.on("connection", (socket) => {
    socket.on("join_game", ({ roomId, playerName }) => {
      socket.join(roomId);

      // Resolve client IP (handles reverse proxies like Render/Nginx)
      const rawIp = (socket.handshake.headers["x-forwarded-for"] as string)
        || socket.handshake.address
        || "";
      const clientIp = rawIp.split(",")[0].trim();

      // ── REJOIN CHECK ──────────────────────────────────────────────────────────
      // If the game exists (in any non-GAME_OVER phase) and a player with the same
      // name AND IP is found, treat this as a reconnect — update their socket ID
      // and restore their session without touching game state.
      if (games.has(roomId)) {
        const existingGame = games.get(roomId);
        if (existingGame.status !== Phase.GAME_OVER) {
          const disconnectedPlayer = existingGame.players.find(
            (p: any) => p.name === playerName && p.ip === clientIp
          );
          if (disconnectedPlayer) {
            const oldId = disconnectedPlayer.id;
            disconnectedPlayer.id = socket.id;
            existingGame.logs.push(`${playerName} reconnected.`);
            // Move them into the socket room so they receive future broadcasts
            socket.join(roomId);
            // Tell the reconnecting client their state is restored
            socket.emit("rejoined", existingGame);
            // Tell everyone else the player is back
            io.to(roomId).emit("game_updated", existingGame);
            return;
          }

          // Also guard: if the player's current socket ID is still active (same tab),
          // don't add them as a duplicate.
          const alreadyActive = existingGame.players.find(
            (p: any) => p.id === socket.id
          );
          if (alreadyActive) {
            socket.emit("rejoined", existingGame);
            return;
          }
        }
      }

      // ── GAME OVER RESET ───────────────────────────────────────────────────────
      if (games.has(roomId) && games.get(roomId).status === Phase.GAME_OVER) {
        games.delete(roomId);
      }

      // ── CREATE ROOM ───────────────────────────────────────────────────────────
      if (!games.has(roomId)) {
        games.set(roomId, {
          id: roomId,
          status: Phase.LOBBY,
          players: [],
          board: Array(81).fill(null).map((_, i) => {
            const monster = getMonsterForTile(i);
            return {
              id: i,
              ownerId: null,
              structure: null,
              level: 1,
              monsterType: monster.type,
              monsterHP: monster.hp,
              monsterMaxHP: monster.hp,
              isOccupied: false,
            };
          }),
          currentPlayerIndex: 0,
          round: 1,
          logs: [],
          actionSpaces: [
            { id: "p_lumber", used: false, type: "PRIMARY", label: "Purchase Lumber (4)", cost: 6, reward: { wood: 4 } },
            { id: "p_clay", used: false, type: "PRIMARY", label: "Purchase Clay (1)", cost: 6, reward: { clay: 1 } },
            { id: "p_stone", used: false, type: "PRIMARY", label: "Purchase Stone (1)", cost: 6, reward: { stone: 1 } },
            { id: "p_mana1", used: false, type: "PRIMARY", label: "Generate Mana (1:2)", cost: 2, reward: { mana: 1 } },
            { id: "p_mana2", used: false, type: "PRIMARY", label: "Generate Mana (1:2)", cost: 2, reward: { mana: 1 } },
            { id: "p_wall", used: false, type: "PRIMARY", label: "Build Wall (2 Wood)", cost: 10, reward: { structure: StructureType.WALL } },
            { id: "p_moat", used: false, type: "PRIMARY", label: "Dig Moat", cost: 5, reward: { structure: StructureType.MOAT } },
            { id: "p_barracks", used: false, type: "PRIMARY", label: "Build Barracks (6W, 2C)", cost: 10, reward: { structure: StructureType.BARRACKS } },
            { id: "p_summon", used: false, type: "PRIMARY", label: "Summon Hero", cost: 8, reward: { hero: true } },
            { id: "p_smithy", used: false, type: "PRIMARY", label: "Build Smithy (1C, 2S)", cost: 10, reward: { structure: StructureType.SMITHY } },
            { id: "p_gear", used: false, type: "PRIMARY", label: "Create Gear", cost: 8, reward: { gear: true } },
            { id: "p_flag", used: false, type: "PRIMARY", label: "Build Flagpole (Center)", cost: 0, reward: { flag: true } },
          ],
          maxPlayers: 4,
          ...createDecks()
        });
      }

      // ── ADD NEW PLAYER ────────────────────────────────────────────────────────
      const game = games.get(roomId);
      if (game.players.length < game.maxPlayers && game.status === Phase.LOBBY) {
        const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"];
        game.players.push({
          id: socket.id,
          ip: clientIp,           // stored for future reconnect identification
          name: playerName,
          gemstones: 6,
          mana: 0,
          wood: 0,
          clay: 0,
          stone: 0,
          heroes: [],
          gear: [],
          bonusCards: [],
          ready: false,
          draftHeroHand: [],
          draftGearHand: [],
          draftStep: "hero",  // "hero" | "gear"
          draftedCards: [],
          draftedHero: false,
          draftedGear: false,
          finishedPrep: false,
          usedFreeSummon: false,
          summonCountThisRound: 0,
          totalSummons: 0,
          heroesPlayedSinceRefill: 0,
          gearPlayedSinceRefill: 0,
          color: colors[game.players.length],
          tilesCount: 3,
          earnedBonusThisAttack: false,
          monstersDefeatedThisAttack: 0,
          enemyCapturesThisAttack: 0,
        });
        io.to(roomId).emit("game_updated", game);
      }
    });


    socket.on("kick_player", ({ roomId, targetId }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.LOBBY) return;
      if (game.players[0]?.id !== socket.id) return;
      if (targetId === socket.id) return;

      const idx = game.players.findIndex((p: any) => p.id === targetId);
      if (idx === -1) return;

      game.players.splice(idx, 1);
      game.logs.push(`A player was kicked from the lobby.`);
      io.to(targetId).emit("kicked_from_lobby");
      io.to(roomId).emit("game_updated", game);
    });

    socket.on("add_ai_player", ({ roomId }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.LOBBY) return;
      if (game.players[0]?.id !== socket.id) return;
      if (game.players.length >= game.maxPlayers) return;

      const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"];
      const usedBotNames = game.players.filter((p: any) => p.isBot).map((p: any) => p.name);
      const botName = BOT_NAMES.find(n => !usedBotNames.includes(n)) || "Bot";
      const botId = `bot_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      game.players.push({
        id: botId,
        ip: "bot",
        name: botName,
        isBot: true,
        gemstones: 6,
        mana: 0,
        wood: 0,
        clay: 0,
        stone: 0,
        heroes: [],
        gear: [],
        bonusCards: [],
        ready: false,
        draftHeroHand: [],
        draftGearHand: [],
        draftStep: "hero",
        draftedCards: [],
        draftedHero: false,
        draftedGear: false,
        finishedPrep: false,
        usedFreeSummon: false,
        summonCountThisRound: 0,
        totalSummons: 0,
        heroesPlayedSinceRefill: 0,
        gearPlayedSinceRefill: 0,
        color: colors[game.players.length % colors.length],
        tilesCount: 3,
        earnedBonusThisAttack: false,
        monstersDefeatedThisAttack: 0,
        enemyCapturesThisAttack: 0,
      });
      game.logs.push(`AI opponent "${botName}" joined the lobby.`);
      io.to(roomId).emit("game_updated", game);
    });

    socket.on("set_max_players", ({ roomId, maxPlayers }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.LOBBY) return;
      // Only the host can change the cap
      if (game.players[0]?.id !== socket.id) return;

      const cap = Math.max(1, Math.min(4, Number(maxPlayers)));
      game.maxPlayers = cap;

      // Kick excess players if the new cap is lower
      while (game.players.length > cap) {
        const kicked = game.players.pop();
        if (kicked) {
          game.logs.push(`Player removed due to room size reduction.`);
          io.to(kicked.id).emit("kicked_from_lobby");
        }
      }

      io.to(roomId).emit("game_updated", game);
    });


    socket.on("start_game", (roomId) => {
      const game = games.get(roomId);
      if (game && game.players.length >= 1) {
        game.status = Phase.DRAFTING;

        // Setup starting tiles
        game.players.forEach((p: any, idx: number) => {
          const tiles = getStartingTiles(idx);
          tiles.forEach(tId => {
            game.board[tId].ownerId = p.id;
            game.board[tId].monsterType = null;
            game.board[tId].monsterHP = 0;
            game.board[tId].monsterMaxHP = 0;
            game.board[tId].isOccupied = true;
            if (tId === tiles[1]) game.board[tId].structure = StructureType.GATE;
          });
        });

        // Initialize drafting hands (6 hero cards + 6 gear cards each)
        // Hero and gear hands are separate; players pick hero first, then gear.
        game.players.forEach((p: any) => {
          p.draftHeroHand = drawCards(game.heroDeck, 6, true);
          p.draftGearHand = drawCards(game.gearDeck, 6);
          p.draftStep = "hero"; // always start on hero page
        });

        // In solo mode there is only one player, so no hand-passing needed.
        // The single player just drafts down their own hero then gear page.

        game.logs.push("Game started! Drafting phase begins.");

        if (game.players.length >= 3) {
          game.actionSpaces.push(
            { id: "p_summon2", used: false, type: "PRIMARY", label: "Summon Hero (2)", cost: 8, reward: { hero: true } },
            { id: "s_lumber", used: false, type: "SECONDARY", label: "Purchase Lumber (2)", cost: 6, reward: { wood: 2 } },
            { id: "s_stone", used: false, type: "SECONDARY", label: "Purchase Stone (1)", cost: 6, reward: { stone: 1 } },
            { id: "s_up_wall", used: false, type: "SECONDARY", label: "Upgrade Wall (1 Stone)", cost: 10, reward: { structure: StructureType.WALL } },
            { id: "s_up_moat", used: false, type: "SECONDARY", label: "Upgrade Moat", cost: 4, reward: { structure: StructureType.MOAT } },
            { id: "s_summon", used: false, type: "SECONDARY", label: "Summon Hero (S)", cost: 8, reward: { hero: true } },
            { id: "s_gear", used: false, type: "SECONDARY", label: "Create Gear (S)", cost: 8, reward: { gear: true } }
          );
        }

        io.to(roomId).emit("game_updated", game);
        scheduleBot(game, roomId); // kick off bot drafting
      }
    });

    socket.on("draft_card", ({ roomId, cardId }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.DRAFTING) return;

      const player = game.players.find((p: any) => p.id === socket.id);
      if (!player) return;

      // ── Step 1: Pick a hero ──────────────────────────────────────────────────
      if (player.draftStep === "hero") {
        if (player.draftedHero) return; // already picked this step
        const idx = player.draftHeroHand.findIndex((c: any) => c.id === cardId);
        if (idx === -1) return; // card not in their hero hand

        const card = player.draftHeroHand.splice(idx, 1)[0];
        player.draftedCards.push(card);
        player.draftedHero = true;
        player.draftStep = "gear"; // advance immediately — show gear page
        game.logs.push(`${player.name} drafted hero: ${card.name}.`);

        io.to(roomId).emit("game_updated", game);
        return;
      }

      // ── Step 2: Pick a gear ──────────────────────────────────────────────────
      if (player.draftStep === "gear") {
        if (player.draftedGear) return;
        const idx = player.draftGearHand.findIndex((c: any) => c.id === cardId);
        if (idx === -1) return;

        const card = player.draftGearHand.splice(idx, 1)[0];
        player.draftedCards.push(card);
        player.draftedGear = true;
        player.ready = true; // player has now completed their full pick
        game.logs.push(`${player.name} drafted gear: ${card.name}.`);
      }

      // ── All players done with their pick pair? ───────────────────────────────
      if (game.players.every((p: any) => p.ready)) {
        // Rotate hands (hero hand passes left, gear hand passes left)
        const heroHands = game.players.map((p: any) => p.draftHeroHand);
        const gearHands = game.players.map((p: any) => p.draftGearHand);
        game.players.forEach((p: any, i: number) => {
          p.draftHeroHand = heroHands[(i + 1) % heroHands.length];
          p.draftGearHand = gearHands[(i + 1) % gearHands.length];
          p.draftedHero = false;
          p.draftedGear = false;
          p.draftStep = "hero"; // next round starts with hero pick
          p.ready = false;
        });

        // Are all hands now exhausted?
        const allEmpty = game.players.every(
          (p: any) => p.draftHeroHand.length === 0 && p.draftGearHand.length === 0
        );

        if (allEmpty) {
          // Drafting complete — move to preparation
          game.status = Phase.PREPARATION;
          game.currentPlayerIndex = 0;
          game.players.forEach((p: any) => {
            p.ready = false;
            p.gemstones += calculateIncome(p.tilesCount);
            p.finishedPrep = false;
          });
          game.logs.push("Drafting complete. Preparation phase begins!");
        }
      }

      io.to(roomId).emit("game_updated", game);
    });

    socket.on("prep_action", ({ roomId, actionId, tileId, cardId, amount }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.PREPARATION) return;

      const player = game.players[game.currentPlayerIndex];
      if (player.id !== socket.id) return;

      const action = game.actionSpaces.find((a: any) => a.id === actionId);
      if (!action || action.used) return;

      let finalCost = action.cost;
      let manaAmount = 1;

      if (action.reward.hero && player.gear.some((g: any) => g.id === "g_contract")) {
        finalCost = Math.max(0, finalCost - 3);
      }
      if (action.reward.gear && player.gear.some((g: any) => g.id === "g_smithytools")) {
        finalCost = Math.max(0, finalCost - 3);
      }

      if (actionId.includes("mana")) {
        manaAmount = Math.max(1, Math.floor(Number(amount) || 1));
        finalCost = manaAmount * 2;
      }

      if (player.gemstones < finalCost) return;

      // Handle specific requirements
      if (actionId === "p_wall" && player.wood < 2) return;
      if (actionId === "p_barracks" && (player.wood < 6 || player.clay < 2)) return;
      if (actionId === "p_smithy" && (player.clay < 1 || player.stone < 2)) return;

      // New requirements
      if (action.reward.gear) {
        const hasSmithy = game.board.some((t: any) => t.ownerId === player.id && t.structure === StructureType.SMITHY);
        if (!hasSmithy) {
          game.logs.push(`${player.name} needs a Smithy to create Gear!`);
          return;
        }

        const cardIdx = player.draftedCards.findIndex((c: any) => c.id === cardId && c.type === "GEAR");
        if (cardIdx === -1) {
          game.logs.push(`${player.name} must select a Gear card from their drafted hand!`);
          return;
        }
        const card = player.draftedCards.splice(cardIdx, 1)[0];
        card.abilityUsed = false;
        player.gear.push(card);

        player.gearPlayedSinceRefill++;
        if (player.gearPlayedSinceRefill >= 6) {
          player.gearPlayedSinceRefill = 0;
          player.draftedCards.push(...drawCards(game.gearDeck, 6));
          game.logs.push(`${player.name} equipped their 6th gear — 6 new gear cards added!`);
        }
      }

      if (action.reward.hero) {
        // The very first hero summon of the game (totalSummons === 0) is free of the
        // barracks requirement. Every subsequent summon still needs barracks capacity.
        if (player.totalSummons > 0) {
          const barracksCount = game.board.filter((t: any) => t.ownerId === player.id && t.structure === StructureType.BARRACKS).length;
          const maxHeroes = barracksCount * 3;
          if (player.heroes.length >= maxHeroes) {
            game.logs.push(`${player.name} needs more Barracks! (Each holds 3 heroes)`);
            return;
          }
        }

        const manaCost = player.summonCountThisRound;
        if (player.mana < manaCost) {
          game.logs.push(`${player.name} needs ${manaCost} mana to summon another hero!`);
          return;
        }

        const cardIdx = player.draftedCards.findIndex((c: any) => c.id === cardId && c.type === "HERO");
        if (cardIdx === -1) {
          game.logs.push(`${player.name} must select a Hero card from their drafted hand!`);
          return;
        }

        player.mana -= manaCost;
        player.summonCountThisRound++;
        player.totalSummons++;

        const card = player.draftedCards.splice(cardIdx, 1)[0];
        card.abilityUsed = false;

        // Level up on summon: if a hero with this name is already active, upgrade it instead
        const existingHero = player.heroes.find((h: any) => h.name === card.name);
        if (existingHero) {
          existingHero.level = Math.min(2, existingHero.level + 1);
          game.logs.push(`${player.name} summoned ${card.name} again — upgraded to Level ${existingHero.level}!`);
        } else {
          player.heroes.push(card);
          game.logs.push(`${player.name} summoned ${card.name}!`);
        }

        if (player.totalSummons % 10 === 0) {
          const barracksCount = game.board.filter((t: any) => t.ownerId === player.id && t.structure === StructureType.BARRACKS).length;
          const maxHeroes = barracksCount * 3;

          if (player.heroes.length < maxHeroes) {
            const specialHero = game.specialDeck.pop();
            if (specialHero) {
              player.heroes.push(specialHero);
              game.logs.push(`${player.name} summoned their 10th hero and received ${specialHero.name}!`);
            }
          } else {
            game.logs.push(`${player.name} reached the 10th summon but has no room for a Special Hero!`);
          }
        }

        player.heroesPlayedSinceRefill++;
        if (player.heroesPlayedSinceRefill >= 6) {
          player.heroesPlayedSinceRefill = 0;
          player.draftedCards.push(...drawCards(game.heroDeck, 6, true));
          game.logs.push(`${player.name} summoned their 6th hero — 6 new hero cards added!`);
        }
      }

      if (action.reward.flag) {
        const centerTile = game.board[40];
        if (centerTile.monsterType !== null) {
          game.logs.push("The center square must be cleared of monsters to build the Flagpole!");
          return;
        }

        if (game.players.length === 1) {
          game.status = Phase.GAME_OVER;
          game.logs.push(`${game.players[0].name} built the Flagpole and finished their solo run!`);
        } else {
          game.status = Phase.BIDDING_WAR;
          game.logs.push("The Flagpole Bidding War has commenced!");
          game.players.forEach(p => p.ready = false);
        }
        io.to(roomId).emit("game_updated", game);
        return;
      }

      // Execute action
      player.gemstones -= finalCost;
      if (action.reward.wood) player.wood += action.reward.wood;
      if (action.reward.clay) player.clay += action.reward.clay;
      if (action.reward.stone) player.stone += action.reward.stone;
      if (action.reward.mana) player.mana += manaAmount;

      // Reset accumulation spaces to base value
      // Reset accumulation spaces to 0 so they receive the base increment next round
      if (action.id === "p_lumber") action.reward.wood = 0;
      if (action.id === "p_clay") action.reward.clay = 0;
      if (action.id === "p_stone") action.reward.stone = 0;
      if (action.id === "s_lumber") action.reward.wood = 0;
      if (action.id === "s_stone") action.reward.stone = 0;

      if (action.reward.structure) {
        const tile = tileId !== undefined ? game.board[tileId] : undefined;

        if (!tile) {
          game.logs.push(`${player.name}: click a tile on the board to place the structure!`);
          player.gemstones += finalCost; // full refund
          return;
        }

        if (tile.ownerId !== player.id) {
          game.logs.push(`${player.name}: you can only build on tiles you own!`);
          player.gemstones += finalCost;
          return;
        }

        // Upgrade actions need an existing structure; plain builds need empty tiles
        const isUpgrade = actionId === "s_up_wall" || actionId === "s_up_moat";
        if (isUpgrade) {
          const requiredBase = actionId === "s_up_wall" ? StructureType.WALL : StructureType.MOAT;
          if (tile.structure !== requiredBase) {
            game.logs.push(`${player.name}: that tile doesn't have the structure to upgrade!`);
            player.gemstones += finalCost;
            return;
          }
        } else if (tile.structure) {
          game.logs.push(`${player.name}: that tile already has a structure (${tile.structure})!`);
          player.gemstones += finalCost;
          return;
        }

        // If occupied by a hero, evict them
        if (tile.occupiedByHeroId) {
          const hero = player.heroes.find((h: any) => h.id === tile.occupiedByHeroId);
          if (hero) {
            hero.abilityUsed = false;
            game.logs.push(`${hero.name} was freed from tile ${tileId} as a structure was built.`);
          }
          tile.occupiedByHeroId = null;
        }

        tile.structure = action.reward.structure;
        tile.isOccupied = true;

        if (actionId === "p_wall" || actionId === "s_up_wall") player.wood -= 2;
        if (actionId === "p_barracks") { player.wood -= 6; player.clay -= 2; }
        if (actionId === "p_smithy") { player.clay -= 1; player.stone -= 2; }
      }

      action.used = true;
      game.logs.push(`${player.name} performed: ${action.label}`);

      advanceTurn(game);
      io.to(roomId).emit("game_updated", game);
      scheduleBot(game, roomId);
    });

    // ── BUILD WALLS (multi-tile) ──────────────────────────────────────────────
    socket.on("build_walls", ({ roomId, actionId, tileIds }: { roomId: string, actionId: string, tileIds: number[] }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.PREPARATION) return;

      const player = game.players[game.currentPlayerIndex];
      if (player.id !== socket.id) return;

      const action = game.actionSpaces.find((a: any) => a.id === actionId);
      if (!action || action.used || !action.reward?.structure) return;

      const ids: number[] = [...new Set<number>(tileIds)]; // deduplicate
      if (ids.length === 0) return;

      const woodNeeded = ids.length * 2;
      if (player.wood < woodNeeded) {
        game.logs.push(`${player.name}: not enough Wood — need ${woodNeeded}, have ${player.wood}.`);
        io.to(roomId).emit("game_updated", game);
        return;
      }

      // Validate every selected tile
      for (const id of ids) {
        const t = game.board[id];
        if (!t) { game.logs.push(`${player.name}: tile ${id} doesn't exist.`); io.to(roomId).emit("game_updated", game); return; }
        if (t.ownerId !== player.id) { game.logs.push(`${player.name}: you don't own tile ${id}.`); io.to(roomId).emit("game_updated", game); return; }
        if (t.structure) { game.logs.push(`${player.name}: tile ${id} already has a structure (${t.structure}).`); io.to(roomId).emit("game_updated", game); return; }
      }

      // Removed BFS connectivity check to allow free placement anywhere on owned territory

      // ── Place all walls ──────────────────────────────────────────────────
      for (const id of ids) {
        const t = game.board[id];
        if (t.occupiedByHeroId) {
          const hero = player.heroes.find((h: any) => h.id === t.occupiedByHeroId);
          if (hero) hero.abilityUsed = false;
          t.occupiedByHeroId = null;
        }
        t.structure = StructureType.WALL;
        t.isOccupied = true;
      }

      player.wood -= woodNeeded;
      action.used = true;
      game.logs.push(`${player.name} built ${ids.length} Wall${ids.length > 1 ? "s" : ""} — paid ${woodNeeded} Wood.`);

      advanceTurn(game);
      io.to(roomId).emit("game_updated", game);
      scheduleBot(game, roomId);
    });


    socket.on("finish_prep", (roomId) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.PREPARATION) return;

      const player = game.players.find((p: any) => p.id === socket.id);
      if (!player || player.finishedPrep) return;

      player.finishedPrep = true;
      game.logs.push(`${player.name} has finished their preparation.`);

      // If it was their turn, advance it
      if (game.players[game.currentPlayerIndex].id === socket.id) {
        advanceTurn(game);
      } else if (game.players.every((p: any) => p.finishedPrep)) {
        // Even if it wasn't their turn, check if everyone is done
        game.status = Phase.ATTACK;
        game.currentPlayerIndex = 0;
        game.logs.push("All players finished preparation. Attack phase begins!");
      }

      io.to(roomId).emit("game_updated", game);
      scheduleBot(game, roomId);
    });

    socket.on("undo_finish_prep", (roomId) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.PREPARATION) return;

      const player = game.players.find((p: any) => p.id === socket.id);
      if (!player || !player.finishedPrep) return;

      player.finishedPrep = false;
      game.logs.push(`${player.name} resumed preparation.`);

      io.to(roomId).emit("game_updated", game);
    });

    socket.on("submit_bid", ({ roomId }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.BIDDING_WAR) return;

      const player = game.players.find((p: any) => p.id === socket.id);
      if (!player || player.ready) return;

      // Check if they can afford the minimum bid: all gemstones, 3 lumber, 1 stone
      if (player.wood < 3 || player.stone < 1) {
        player.bidAmount = -1; // Cannot win
      } else {
        // Calculate bid value
        let value = player.gemstones;
        // King's Decree bonus
        if (player.gear.some((g: any) => g.id === "g_decree")) {
          value += 10;
        }
        player.bidAmount = value;
      }

      player.ready = true;

      if (game.players.every((p: any) => p.ready)) {
        // Sort by bid value, then raw gemstones as tie-breaker, then id for determinism
        const sorted = [...game.players].sort((a, b) => {
          const valA = a.bidAmount || 0;
          const valB = b.bidAmount || 0;
          if (valB !== valA) return valB - valA;
          if (b.gemstones !== a.gemstones) return b.gemstones - a.gemstones;
          return a.id.localeCompare(b.id);
        });
        const winner = sorted[0];

        if (winner.bidAmount === -1) {
          game.logs.push("No one could afford the Bidding War requirements! The game continues.");
          game.status = Phase.PREPARATION;
          game.players.forEach(p => {
            p.ready = false;
            p.bidAmount = undefined;
          });
        } else {
          game.status = Phase.GAME_OVER;
          const centerTile = game.board[40];
          centerTile.ownerId = winner.id;
          centerTile.structure = StructureType.FLAGPOLE;
          game.logs.push(`BIDDING WAR OVER! ${winner.name} won the bid with a value of ${winner.bidAmount} and planted the Flagpole!`);
          game.logs.push(`${winner.name} is the Dungeon Gacha champion!`);
        }
      }

      io.to(roomId).emit("game_updated", game);
    });

    socket.on("attack_tile", ({ roomId, tileId, heroId }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.ATTACK) return;

      const player = game.players[game.currentPlayerIndex];
      if (player.id !== socket.id) return;

      const tile = game.board[tileId];

      // Handle 'Occupy' ability on owned tiles
      if (tile.ownerId === player.id) {
        const hero = player.heroes.find((h: any) => h.id === heroId);
        if (!hero) return;

        // Toggle off if already occupied by THIS hero
        if (tile.occupiedByHeroId === heroId) {
          tile.occupiedByHeroId = null;
          hero.abilityUsed = false;

          // Recalculate isOccupied based on structures or starting tiles
          const playerIdx = game.players.findIndex((p: any) => p.id === player.id);
          const isStartingTile = getStartingTiles(playerIdx).includes(tileId);
          tile.isOccupied = tile.structure !== null || isStartingTile;

          game.logs.push(`${player.name}'s ${hero.name} stopped occupying tile ${tileId}.`);
          io.to(roomId).emit("game_updated", game);
          return;
        }

        // Occupy if not used and hero has ability
        if (!hero.abilityUsed && hero.ability.toLowerCase().includes("occupy")) {
          // If already occupied by another hero, free that hero first
          if (tile.occupiedByHeroId) {
            const otherHero = player.heroes.find((h: any) => h.id === tile.occupiedByHeroId);
            if (otherHero) otherHero.abilityUsed = false;
          }

          tile.isOccupied = true;
          tile.occupiedByHeroId = heroId;
          hero.abilityUsed = true;
          game.logs.push(`${player.name}'s ${hero.name} occupied tile ${tileId}.`);
          io.to(roomId).emit("game_updated", game);
        }
        return;
      }

      // Check adjacency
      const x = tileId % 9;
      const y = Math.floor(tileId / 9);
      const neighbors = [];
      if (x > 0) neighbors.push(tileId - 1);
      if (x < 8) neighbors.push(tileId + 1);
      if (y > 0) neighbors.push(tileId - 9);
      if (y < 8) neighbors.push(tileId + 9);

      const hasAdjacent = neighbors.some(n => game.board[n].ownerId === player.id);
      if (!hasAdjacent) {
        game.logs.push("You can only attack tiles adjacent to your territory!");
        return;
      }

      if (tile.monsterType !== null) {
        // Monster combat
        const hero = player.heroes.find((h: any) => h.id === heroId);
        if (!hero || hero.abilityUsed) {
          game.logs.push("Select a ready hero to attack the monster!");
          return;
        }

        // Calculate damage
        let damage = 0;
        if (hero.id.startsWith("ash")) damage = hero.level === 1 ? 1 : 2;
        if (hero.id.startsWith("brog")) damage = hero.level === 1 ? 2 : 3;
        if (hero.id.startsWith("kael")) damage = hero.level === 1 ? 1 : 2;
        if (hero.id.startsWith("azul")) damage = hero.level === 1 ? 4 : 6;
        if (hero.id.startsWith("night")) damage = hero.level === 1 ? 4 : 6;
        if (hero.id.startsWith("ignis")) damage = hero.level === 1 ? 6 : 8;
        if (hero.id.startsWith("mordecai")) damage = hero.level === 1 ? 7 : 12;
        if (hero.id.startsWith("hero_leg")) damage = hero.level === 1 ? 5 : 8;
        if (hero.id.startsWith("dax")) {
          damage = hero.level === 1 ? 1 : 2;
          if (tile.monsterType === MonsterType.GIANT || tile.monsterType === MonsterType.DRAGON || tile.monsterType === MonsterType.DEMON_KING) {
            damage += 2;
          }
        }

        // Generic damage for others
        if (damage === 0) damage = 1;

        // Gear bonuses
        player.gear.forEach((g: any) => {
          if (g.id === "g_sword") damage += 1;
          if (g.id === "g_axe" && (tile.monsterType === MonsterType.ORC || tile.monsterType === MonsterType.GIANT)) damage += 3;
          if (g.id === "g_horn") damage += 1;
        });

        tile.monsterHP -= damage;
        hero.abilityUsed = true;
        game.logs.push(`${player.name}'s ${hero.name} dealt ${damage} damage to the ${tile.monsterType}!`);

        // Opponent-owned tiles require +2 extra damage beyond killing the monster to claim
        const isOpponentMonsterTile = tile.ownerId !== null;
        const claimThreshold = isOpponentMonsterTile ? -2 : 0;

        if (tile.monsterHP <= claimThreshold) {
          tile.monsterType = null;
          tile.monsterHP = 0;
          tile.monsterMaxHP = 0;
          tile.ownerId = player.id;
          tile.isOccupied = false; // Liberated, not occupied
          player.tilesCount++;
          player.gemstones += 3;
          game.logs.push(`${player.name} defeated the monster and claimed tile ${tileId}!`);

          // Bonus card: award after 3rd monster kill this attack phase
          player.monstersDefeatedThisAttack++;
          if (player.monstersDefeatedThisAttack >= 3 && !player.earnedBonusThisAttack && game.bonusDeck && game.bonusDeck.length > 0) {
            const bonusCard = game.bonusDeck.pop();
            player.bonusCards.push(bonusCard);
            player.earnedBonusThisAttack = true;
            game.logs.push(`${player.name} earned a Bonus Card for liberating 3 monster tiles!`);
          }
        }
      } else if (tile.ownerId !== null) {
        // Player-owned tile combat (hero-damage system)
        const oldOwnerId = tile.ownerId;
        const oldOwner = game.players.find((p: any) => p.id === oldOwnerId);

        if (tile.structure === StructureType.GATE) {
          // Gate: indestructible to heroes — mana-only (unchanged)
          if (player.mana < 4) {
            game.logs.push("The Gate requires 4 Mana to capture!");
            return;
          }
          player.mana -= 4;
          // falls through to shared capture block below
        } else {
          // Non-gate opponent tile: hero must attack and deplete defense HP
          const hero = player.heroes.find((h: any) => h.id === heroId);
          if (!hero || hero.abilityUsed) {
            game.logs.push("Select a ready hero to attack the enemy tile!");
            return;
          }

          // Calculate damage (mirrors the monster-combat calculation)
          let damage = 0;
          if (hero.id.startsWith("ash")) damage = hero.level === 1 ? 1 : 2;
          if (hero.id.startsWith("brog")) damage = hero.level === 1 ? 2 : 3;
          if (hero.id.startsWith("kael")) damage = hero.level === 1 ? 1 : 2;
          if (hero.id.startsWith("azul")) damage = hero.level === 1 ? 4 : 6;
          if (hero.id.startsWith("night")) damage = hero.level === 1 ? 4 : 6;
          if (hero.id.startsWith("ignis")) damage = hero.level === 1 ? 6 : 8;
          if (hero.id.startsWith("mordecai")) damage = hero.level === 1 ? 7 : 12;
          if (hero.id.startsWith("hero_leg")) damage = hero.level === 1 ? 5 : 8;
          if (hero.id.startsWith("dax")) damage = hero.level === 1 ? 1 : 2;
          if (damage === 0) damage = 1;

          player.gear.forEach((g: any) => {
            if (g.id === "g_sword") damage += 1;
            if (g.id === "g_horn") damage += 1;
          });

          // Initialise defense HP pool on first attack this round
          if (tile.monsterHP === 0) {
            let defense = 2; // base resistance for any opponent tile
            if (tile.structure === StructureType.WALL) defense += tile.level === 1 ? 6 : 10;
            if (tile.structure === StructureType.MOAT) defense += tile.level === 1 ? 8 : 12;
            tile.monsterHP = defense;
            tile.monsterMaxHP = defense;
          }

          tile.monsterHP -= damage;
          hero.abilityUsed = true;
          game.logs.push(
            `${player.name}'s ${hero.name} dealt ${damage} damage to ${oldOwner?.name}'s tile ${tileId}! ` +
            `(${Math.max(0, tile.monsterHP)} defense HP remaining)`
          );

          if (tile.monsterHP > 0) {
            // Defense not yet broken — update clients and stop
            io.to(roomId).emit("game_updated", game);
            return;
          }
          // Defense depleted — proceed to capture
          tile.monsterHP = 0;
          tile.monsterMaxHP = 0;
        }

        // Shared capture block (gate-mana path or depleted-defense path)
        tile.ownerId = player.id;
        tile.structure = null;
        tile.isOccupied = true;
        tile.occupiedByHeroId = null;
        player.tilesCount++;
        if (oldOwner) {
          oldOwner.tilesCount--;
          player.gemstones += 5; // Capture bonus
        }
        game.logs.push(`${player.name} captured ${oldOwner?.name}'s tile ${tileId}!`);

        // Bonus card: award after 3rd enemy tile capture this attack phase
        player.enemyCapturesThisAttack++;
        if (player.enemyCapturesThisAttack >= 3 && !player.earnedBonusThisAttack && game.bonusDeck && game.bonusDeck.length > 0) {
          const bonusCard = game.bonusDeck.pop();
          player.bonusCards.push(bonusCard);
          player.earnedBonusThisAttack = true;
          game.logs.push(`${player.name} earned a Bonus Card for capturing 3 enemy tiles!`);
        }
      }

      io.to(roomId).emit("game_updated", game);
      scheduleBot(game, roomId);
    });

    // ── DUAL ATTACK (Hero of the Dungeon: 5 dmg to each of 2 adjacent monsters) ──
    socket.on("attack_dual_tile", ({ roomId, tileId1, tileId2, heroId }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.ATTACK) return;

      const player = game.players[game.currentPlayerIndex];
      if (player.id !== socket.id) return;

      const hero = player.heroes.find((h: any) => h.id === heroId);
      if (!hero || hero.abilityUsed) {
        game.logs.push("Select a ready Hero of the Dungeon to use this ability!");
        io.to(roomId).emit("game_updated", game);
        return;
      }

      const tile1 = game.board[tileId1];
      const tile2 = game.board[tileId2];

      // Both tiles must be monster tiles
      if (!tile1 || tile1.monsterType === null) {
        game.logs.push("First target must be a monster tile!");
        io.to(roomId).emit("game_updated", game);
        return;
      }
      if (!tile2 || tile2.monsterType === null) {
        game.logs.push("Second target must be a monster tile!");
        io.to(roomId).emit("game_updated", game);
        return;
      }

      // The two target tiles must be adjacent to each other
      const row1 = Math.floor(tileId1 / 9), col1 = tileId1 % 9;
      const row2 = Math.floor(tileId2 / 9), col2 = tileId2 % 9;
      const tilesAdjacent = (row1 === row2 && Math.abs(col1 - col2) === 1) ||
        (col1 === col2 && Math.abs(row1 - row2) === 1);
      if (!tilesAdjacent) {
        game.logs.push("The two monster targets must be adjacent to each other!");
        io.to(roomId).emit("game_updated", game);
        return;
      }

      // At least one of the two tiles must be adjacent to the player's territory
      const getNeighbors = (tid: number) => {
        const x = tid % 9, y = Math.floor(tid / 9);
        const ns: number[] = [];
        if (x > 0) ns.push(tid - 1);
        if (x < 8) ns.push(tid + 1);
        if (y > 0) ns.push(tid - 9);
        if (y < 8) ns.push(tid + 9);
        return ns;
      };
      const adj1 = getNeighbors(tileId1).some(n => game.board[n].ownerId === player.id);
      const adj2 = getNeighbors(tileId2).some(n => game.board[n].ownerId === player.id);
      if (!adj1 && !adj2) {
        game.logs.push("At least one target must be adjacent to your territory!");
        io.to(roomId).emit("game_updated", game);
        return;
      }

      const damage = hero.level === 1 ? 5 : 8;

      // Apply damage to tile 1
      tile1.monsterHP -= damage;
      game.logs.push(`${player.name}'s ${hero.name} deals ${damage} damage to the ${tile1.monsterType} on tile ${tileId1}!`);
      if (tile1.monsterHP <= (tile1.ownerId !== null ? -2 : 0)) {
        tile1.monsterType = null;
        tile1.monsterHP = 0;
        tile1.monsterMaxHP = 0;
        tile1.ownerId = player.id;
        tile1.isOccupied = false;
        player.tilesCount++;
        player.gemstones += 3;
        game.logs.push(`${player.name} claimed tile ${tileId1}!`);
        player.monstersDefeatedThisAttack++;
        if (player.monstersDefeatedThisAttack >= 3 && !player.earnedBonusThisAttack && game.bonusDeck && game.bonusDeck.length > 0) {
          const bonusCard = game.bonusDeck.pop();
          player.bonusCards.push(bonusCard);
          player.earnedBonusThisAttack = true;
          game.logs.push(`${player.name} earned a Bonus Card for liberating 3 monster tiles!`);
        }
      }

      // Apply damage to tile 2
      tile2.monsterHP -= damage;
      game.logs.push(`${player.name}'s ${hero.name} deals ${damage} damage to the ${tile2.monsterType} on tile ${tileId2}!`);
      if (tile2.monsterHP <= (tile2.ownerId !== null ? -2 : 0)) {
        tile2.monsterType = null;
        tile2.monsterHP = 0;
        tile2.monsterMaxHP = 0;
        tile2.ownerId = player.id;
        tile2.isOccupied = false;
        player.tilesCount++;
        player.gemstones += 3;
        game.logs.push(`${player.name} claimed tile ${tileId2}!`);
        player.monstersDefeatedThisAttack++;
        if (player.monstersDefeatedThisAttack >= 3 && !player.earnedBonusThisAttack && game.bonusDeck && game.bonusDeck.length > 0) {
          const bonusCard = game.bonusDeck.pop();
          player.bonusCards.push(bonusCard);
          player.earnedBonusThisAttack = true;
          game.logs.push(`${player.name} earned a Bonus Card for liberating 3 monster tiles!`);
        }
      }

      hero.abilityUsed = true;

      io.to(roomId).emit("game_updated", game);
      scheduleBot(game, roomId);
    });

    socket.on("trade_resources", ({ roomId, from, to }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.PREPARATION) return;

      const player = game.players.find((p: any) => p.id === socket.id);
      if (!player) return;

      if (!player.gear.some((g: any) => g.id === "g_scale")) {
        game.logs.push(`${player.name} needs a Merchant's Scale to trade resources!`);
        return;
      }

      const gear = player.gear.find((g: any) => g.id === "g_scale");
      if (gear.abilityUsed) {
        game.logs.push(`${player.name} already used their Merchant's Scale this turn!`);
        return;
      }

      // 'from' and 'to' are resource names: 'wood', 'clay', 'stone', 'gemstones'
      if (player[from] < 1) return;

      player[from] -= 1;
      player[to] += 1;
      gear.abilityUsed = true;

      game.logs.push(`${player.name} traded 1 ${from} for 1 ${to} using the Merchant's Scale.`);
      io.to(roomId).emit("game_updated", game);
    });

    socket.on("mana_attack", ({ roomId, tileId, amount }) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.ATTACK) return;

      const player = game.players[game.currentPlayerIndex];
      if (player.id !== socket.id) return;

      const tile = game.board[tileId];
      if (tile.monsterType === null) return;

      const manaToUse = Math.min(player.mana, Math.max(1, Math.floor(Number(amount) || 1)));
      if (manaToUse <= 0) return;

      // Check adjacency
      const x = tileId % 9;
      const y = Math.floor(tileId / 9);
      const neighbors = [];
      if (x > 0) neighbors.push(tileId - 1);
      if (x < 8) neighbors.push(tileId + 1);
      if (y > 0) neighbors.push(tileId - 9);
      if (y < 8) neighbors.push(tileId + 9);

      const hasAdjacent = neighbors.some(n => game.board[n].ownerId === player.id);
      if (!hasAdjacent) {
        game.logs.push("You can only attack monsters adjacent to your territory!");
        return;
      }

      const damage = manaToUse * 2;
      player.mana -= manaToUse;
      tile.monsterHP -= damage;

      game.logs.push(`${player.name} used ${manaToUse} Mana to deal ${damage} damage to the ${tile.monsterType}!`);

      if (tile.monsterHP <= 0) {
        tile.monsterType = null;
        tile.monsterHP = 0;
        tile.monsterMaxHP = 0;
        tile.ownerId = player.id;
        tile.isOccupied = false; // Liberated, not occupied
        tile.occupiedByHeroId = null;

        player.tilesCount++;
        player.gemstones += 3;
        game.logs.push(`${player.name} defeated the monster and captured tile ${tileId}!`);
      }

      io.to(roomId).emit("game_updated", game);
    });

    socket.on("refresh_hero", ({ roomId, sourceId, targetId }) => {
      const game = games.get(roomId);
      if (!game) return;

      const player = game.players.find((p: any) => p.id === socket.id);
      if (!player) return;

      // Find the source of the refresh (either a hero like Vera or a Gear like Medkit)
      const sourceHero = player.heroes.find((h: any) => h.id === sourceId);
      const sourceGear = player.gear.find((g: any) => g.id === sourceId);
      const source = sourceHero || sourceGear;

      const targetHero = player.heroes.find((h: any) => h.id === targetId);

      if (!source || !targetHero) return;
      if (source.abilityUsed) {
        game.logs.push(`${source.name}'s ability was already used!`);
        return;
      }

      targetHero.abilityUsed = false;
      source.abilityUsed = true;

      game.logs.push(`${player.name} used ${source.name} to refresh the ability of ${targetHero.name}!`);

      io.to(roomId).emit("game_updated", game);
    });

    socket.on("use_bonus_card", ({ roomId, cardId, tileId, cardToSummonId, structureType }) => {
      const game = games.get(roomId);
      if (!game) return;

      const player = game.players.find((p: any) => p.id === socket.id);
      if (!player) return;

      const cardIdx = player.bonusCards.findIndex((c: any) => c.id === cardId);
      if (cardIdx === -1) return;

      const card = player.bonusCards[cardIdx];
      const baseId: string = card.id.replace(/_[01]$/, "");

      // ── Mercenary Contract (prep phase, free) ────────────────────────────────
      if (baseId === "bc_mercenary") {
        if (game.status !== Phase.PREPARATION) {
          game.logs.push("Mercenary Contract can only be used in the Preparation phase."); return;
        }
        const heroIdx = player.draftedCards.findIndex((c: any) => c.id === cardToSummonId && c.type === "HERO");
        if (heroIdx === -1) {
          game.logs.push(`${player.name} must select a Hero from their drafted hand.`); return;
        }
        // 0 mana cost, ignores barracks limit
        const hero = player.draftedCards.splice(heroIdx, 1)[0];
        hero.abilityUsed = false;

        const existingHero = player.heroes.find((h: any) => h.name === hero.name);
        if (existingHero) {
          existingHero.level = Math.min(2, existingHero.level + 1);
          game.logs.push(`${player.name} played Mercenary Contract and summoned ${hero.name} again — upgraded to Level ${existingHero.level}!`);
        } else {
          player.heroes.push(hero);
          game.logs.push(`${player.name} played Mercenary Contract and summoned ${hero.name} for free!`);
        }

        player.summonCountThisRound++;
        player.totalSummons++;
        player.heroesPlayedSinceRefill++;
        if (player.heroesPlayedSinceRefill >= 6) {
          player.heroesPlayedSinceRefill = 0;
          player.draftedCards.push(...drawCards(game.heroDeck, 6, true));
          game.logs.push(`${player.name} summoned their 6th hero — 6 new hero cards added!`);
        }
        player.bonusCards.splice(cardIdx, 1);
      }

      // ── Reinforced Caravan (prep phase, free) ───────────────────────────────
      else if (baseId === "bc_caravan") {
        if (game.status !== Phase.PREPARATION) {
          game.logs.push("Reinforced Caravan can only be used in the Preparation phase."); return;
        }
        player.wood += 4;
        player.clay += 2;
        player.stone += 1;
        player.bonusCards.splice(cardIdx, 1);
        game.logs.push(`${player.name} played Reinforced Caravan and gained 4 Wood, 2 Clay, and 1 Stone!`);
      }

      // ── Hidden Cache (prep phase, free) ─────────────────────────────────────
      else if (baseId === "bc_cache") {
        if (game.status !== Phase.PREPARATION) {
          game.logs.push("Hidden Cache can only be used in the Preparation phase."); return;
        }
        player.gemstones += 15;
        player.bonusCards.splice(cardIdx, 1);
        game.logs.push(`${player.name} played Hidden Cache and gained 15 Gemstones!`);
      }

      // ── Siege Engineering (prep phase, free) ────────────────────────────────
      else if (baseId === "bc_siege") {
        if (game.status !== Phase.PREPARATION) {
          game.logs.push("Siege Engineering can only be used in the Preparation phase."); return;
        }
        if (tileId === undefined || tileId === null) {
          game.logs.push("Select a tile to build on."); return;
        }
        const siegeTile = game.board[tileId];
        if (!siegeTile || siegeTile.ownerId !== player.id || siegeTile.structure || siegeTile.monsterType !== null) {
          game.logs.push("Siege Engineering requires a clear, owned tile with no existing structure."); return;
        }
        const sType = structureType === "MOAT" ? StructureType.MOAT : StructureType.WALL;
        siegeTile.structure = sType;
        siegeTile.isOccupied = true;
        player.bonusCards.splice(cardIdx, 1);
        game.logs.push(`${player.name} played Siege Engineering and built a ${sType} on tile ${tileId} for free!`);
      }

      // ── Monster Tamer (attack phase, free) ──────────────────────────────────
      else if (baseId === "bc_tamer") {
        if (game.status !== Phase.ATTACK) {
          game.logs.push("Monster Tamer can only be used in the Attack phase."); return;
        }
        if (game.players[game.currentPlayerIndex].id !== player.id) {
          game.logs.push("It is not your turn."); return;
        }
        if (tileId === undefined || tileId === null) {
          game.logs.push("Select a tile to tame."); return;
        }
        const tamerTile = game.board[tileId];
        if (!tamerTile || tamerTile.monsterType === null) {
          game.logs.push("Monster Tamer requires a tile with a monster."); return;
        }
        // Adjacency check
        const tx = tileId % 9, ty = Math.floor(tileId / 9);
        const tNeighbors: number[] = [];
        if (tx > 0) tNeighbors.push(tileId - 1);
        if (tx < 8) tNeighbors.push(tileId + 1);
        if (ty > 0) tNeighbors.push(tileId - 9);
        if (ty < 8) tNeighbors.push(tileId + 9);
        if (!tNeighbors.some(n => game.board[n].ownerId === player.id)) {
          game.logs.push("The target monster must be adjacent to your territory."); return;
        }
        const tamerMonsterName = tamerTile.monsterType;
        tamerTile.monsterType = null;
        tamerTile.monsterHP = 0;
        tamerTile.monsterMaxHP = 0;
        tamerTile.ownerId = player.id;
        tamerTile.isOccupied = false;
        player.tilesCount++;
        player.gemstones += 3; // standard tile reward
        player.monstersDefeatedThisAttack++;
        if (player.monstersDefeatedThisAttack >= 3 && !player.earnedBonusThisAttack && game.bonusDeck && game.bonusDeck.length > 0) {
          const bonus = game.bonusDeck.pop();
          player.bonusCards.push(bonus);
          player.earnedBonusThisAttack = true;
          game.logs.push(`${player.name} earned a Bonus Card for liberating 3 monster tiles!`);
        }
        player.bonusCards.splice(cardIdx, 1);
        game.logs.push(`${player.name} played Monster Tamer and instantly defeated the ${tamerMonsterName} on tile ${tileId}!`);
      }

      // ── Forced Occupation (attack phase, free) ──────────────────────────────
      else if (baseId === "bc_occupy") {
        if (game.status !== Phase.ATTACK) {
          game.logs.push("Forced Occupation can only be used in the Attack phase."); return;
        }
        if (game.players[game.currentPlayerIndex].id !== player.id) {
          game.logs.push("It is not your turn."); return;
        }
        if (tileId === undefined || tileId === null) {
          game.logs.push("Select a tile to occupy."); return;
        }
        const occupyTile = game.board[tileId];
        if (!occupyTile || occupyTile.monsterType !== null || occupyTile.isOccupied) {
          game.logs.push("Forced Occupation requires a cleared, unoccupied square."); return;
        }
        occupyTile.isOccupied = true;
        occupyTile.occupationTokenOwnerId = player.id;
        occupyTile.occupationTokenRoundsLeft = 2;
        player.tilesCount++;
        player.bonusCards.splice(cardIdx, 1);
        game.logs.push(`${player.name} played Forced Occupation on tile ${tileId} for 2 rounds!`);
      }

      else {
        game.logs.push(`Unknown bonus card: ${card.name}`);
        return;
      }

      io.to(roomId).emit("game_updated", game);
    });

    socket.on("use_hero_ability", ({ roomId, heroId, tileId }) => {
      const game = games.get(roomId);
      if (!game) return;

      const player = game.players.find((p: any) => p.id === socket.id);
      if (!player) return;

      const hero = player.heroes.find((h: any) => h.id === heroId);
      if (!hero) return;

      if (hero.abilityUsed) {
        game.logs.push(`${player.name}'s ${hero.name} has already used their ability this round.`);
        io.to(roomId).emit("game_updated", game);
        return;
      }

      // Ewud: Build one wooden wall (Prep phase)
      if (hero.id.startsWith("ewud")) {
        if (game.status !== Phase.PREPARATION) {
          game.logs.push(`${hero.name}'s ability can only be used in the Preparation phase.`);
          io.to(roomId).emit("game_updated", game);
          return;
        }
        if (tileId === undefined || tileId === null) {
          game.logs.push("Select a tile to build on.");
          io.to(roomId).emit("game_updated", game);
          return;
        }
        const targetTile = game.board[tileId];
        if (!targetTile || targetTile.ownerId !== player.id || targetTile.structure || targetTile.monsterType !== null) {
          game.logs.push("Ewud can only build a wall on a clear, owned tile with no existing structure.");
          io.to(roomId).emit("game_updated", game);
          return;
        }
        targetTile.structure = StructureType.WALL;
        targetTile.isOccupied = true;
        hero.abilityUsed = true;
        game.logs.push(`${player.name}'s ${hero.name} built a wooden wall on tile ${tileId}.`);
      }

      io.to(roomId).emit("game_updated", game);
    });

    socket.on("end_turn", (roomId) => {
      const game = games.get(roomId);
      if (!game || game.status !== Phase.ATTACK) return;

      const player = game.players[game.currentPlayerIndex];
      if (player.id !== socket.id) return;

      advanceTurn(game);
      io.to(roomId).emit("game_updated", game);
      scheduleBot(game, roomId);
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
