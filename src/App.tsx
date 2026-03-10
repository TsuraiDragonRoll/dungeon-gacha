import React, { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import {
  Gem,
  Zap,
  Trees,
  Mountain,
  BrickWall,
  Shield,
  Sword,
  User,
  Settings,
  Scroll,
  Hammer,
  Castle,
  Waves,
  Trophy,
  ArrowRight,
  Flag
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Phase, GameState, StructureType, Card, Tile, MonsterType, Rarity, Player } from "./types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const calculateIncomeValue = (tilesCount: number) => {
  if (tilesCount >= 3 && tilesCount <= 5) return tilesCount * 4;
  if (tilesCount >= 6 && tilesCount <= 10) return tilesCount * 3;
  if (tilesCount >= 11 && tilesCount <= 17) return tilesCount * 2;
  if (tilesCount >= 18) return tilesCount * 1;
  return 0;
};

const getNextIncomeValue = (p: any) => {
  let income = calculateIncomeValue(p.tilesCount || 0);
  if (p.gear?.some((g: any) => g.id === "g_taxbox")) {
    income += (p.tilesCount || 0);
  }
  return income;
};

const socket: Socket = io("https://dungeon-gacha.onrender.com");

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [roomId, setRoomId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [manaAmount, setManaAmount] = useState(1);
  const [showRulebook, setShowRulebook] = useState(false);
  const [showDraftedHand, setShowDraftedHand] = useState(false);
  const [mobileTab, setMobileTab] = useState<"board" | "stats" | "actions">("board");
  const [pendingWallTiles, setPendingWallTiles] = useState<number[]>([]);
  const [mySocketId, setMySocketId] = useState<string>(socket.id ?? "");
  // Dual-target state for Hero of the Dungeon (hero_leg)
  const [dualTargets, setDualTargets] = useState<number[]>([]);
  const [dualHeroId, setDualHeroId] = useState<string | null>(null);
  // Orion swap-target state
  const [orionHeroId, setOrionHeroId] = useState<string | null>(null);
  const [orionTargets, setOrionTargets] = useState<number[]>([]);

  useEffect(() => {
    // Capture socket ID as soon as it is available (may already be set on mount)
    if (socket.id) setMySocketId(socket.id);
    socket.on("connect", () => setMySocketId(socket.id ?? ""));
    socket.on("reconnect", () => setMySocketId(socket.id ?? ""));

    socket.on("game_updated", (state: GameState) => {
      setGameState(state);
      if (socket.id) setMySocketId(socket.id);
    });

    // Server confirmed this socket as a reconnect of an existing player.
    // Restore their game state and jump straight into the game.
    socket.on("rejoined", (state: GameState) => {
      setGameState(state);
      setJoined(true);
      if (socket.id) setMySocketId(socket.id);
    });

    socket.on("kicked_from_lobby", () => {
      alert("You have been removed from the lobby by the host.");
      window.location.reload();
    });
    return () => {
      socket.off("connect");
      socket.off("reconnect");
      socket.off("game_updated");
      socket.off("rejoined");
      socket.off("kicked_from_lobby");
    };
  }, []);

  // Re-register with the server whenever the socket reconnects mid-game.
  // Without this, the server retains the old socket ID and rejects attacks
  // because player.id !== socket.id.
  useEffect(() => {
    if (!joined || !roomId || !playerName) return;
    const handleReconnect = () => {
      socket.emit("join_game", { roomId, playerName });
    };
    socket.on("connect", handleReconnect);
    return () => { socket.off("connect", handleReconnect); };
  }, [joined, roomId, playerName]);

  const prevTurnRef = useRef(false);

  useEffect(() => {
    if (!gameState) return;
    const isMyTurnNow = gameState.players[gameState.currentPlayerIndex]?.id === mySocketId;

    // Play a ding when transitioning to the player's turn (skip during simultaneous drafting)
    if (isMyTurnNow && !prevTurnRef.current && gameState.status !== Phase.DRAFTING && gameState.status !== Phase.GAME_OVER) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc.connect(gainNode);
          gainNode.connect(ctx.destination);

          // Pleasant high-pitch ding (sine wave frequency ramp)
          osc.type = "sine";
          osc.frequency.setValueAtTime(800, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

          // Fast attack, slow exponential decay
          gainNode.gain.setValueAtTime(0, ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
          gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

          osc.start();
          osc.stop(ctx.currentTime + 0.5);
        }
      } catch (e) {
        console.error("Failed to play turn notification ping:", e);
      }
    }
    prevTurnRef.current = isMyTurnNow;
  }, [gameState, mySocketId]);

  const handleJoin = () => {
    if (roomId && playerName) {
      socket.emit("join_game", { roomId, playerName });
      setJoined(true);
    }
  };

  const handleStart = () => {
    socket.emit("start_game", roomId);
  };

  const handleDraft = (cardId: string) => {
    socket.emit("draft_card", { roomId, cardId });
  };

  const handlePrepAction = (actionId: string) => {
    const action = gameState.actionSpaces.find(a => a.id === actionId);
    if (!action) return;

    if (actionId.includes("wall")) {
      // Wall: multi-tile mode — reset pending selection and wait for tile clicks + confirm
      setSelectedAction(actionId);
      setPendingWallTiles([]);
      setSelectedCard(null);
    } else if (actionId.includes("moat") || actionId.includes("barracks") || actionId.includes("smithy")) {
      setSelectedAction(actionId);
      setSelectedCard(null);
    } else if (actionId.includes("summon") || actionId.includes("gear")) {
      setSelectedAction(actionId);
      setSelectedCard(null);
    } else if (actionId.includes("mana")) {
      setSelectedAction(actionId);
      setManaAmount(1);
    } else {
      socket.emit("prep_action", { roomId, actionId });
      setSelectedAction(null);
      setSelectedCard(null);
    }
  };

  const handleWallConfirm = () => {
    if (!selectedAction || pendingWallTiles.length === 0) return;
    socket.emit("build_walls", { roomId, actionId: selectedAction, tileIds: pendingWallTiles });
    setSelectedAction(null);
    setPendingWallTiles([]);
  };

  const handleManaConfirm = () => {
    if (selectedAction && selectedAction.includes("mana")) {
      socket.emit("prep_action", { roomId, actionId: selectedAction, amount: manaAmount });
      setSelectedAction(null);
      setManaAmount(1);
    }
  };

  const handleSubmitBid = () => {
    socket.emit("submit_bid", { roomId });
  };

  const isHeroDualCard = (cardId: string) => cardId.startsWith("hero_leg");

  const handleDualConfirm = () => {
    if (!dualHeroId || dualTargets.length < 2) return;
    socket.emit("attack_dual_tile", { roomId, tileId1: dualTargets[0], tileId2: dualTargets[1], heroId: dualHeroId });
    setDualTargets([]);
    setDualHeroId(null);
  };

  const handleTileClick = (tileId: number) => {
    if (gameState.status === Phase.ATTACK) {
      // Dual-target mode for hero_leg
      if (dualHeroId) {
        const tile = gameState.board[tileId];
        if (tile.monsterType === null) return; // must be a monster tile
        setDualTargets(prev => {
          if (prev.includes(tileId)) return prev.filter(t => t !== tileId); // deselect
          if (prev.length >= 2) return [prev[1], tileId]; // replace oldest
          return [...prev, tileId];
        });
        return;
      }
      // Orion swap-target mode
      if (orionHeroId) {
        const tile = gameState.board[tileId];
        if (tile.monsterType === null) return;
        const next = orionTargets.includes(tileId)
          ? orionTargets.filter(t => t !== tileId)
          : orionTargets.length >= 2 ? [orionTargets[1], tileId] : [...orionTargets, tileId];
        setOrionTargets(next);
        if (next.length === 2) {
          socket.emit("use_hero_ability", { roomId, heroId: orionHeroId, tileId: next[0], tileId2: next[1] });
          setOrionHeroId(null); setOrionTargets([]);
        }
        return;
      }
      if (selectedCard) {
        const baseId = selectedCard.replace(/_[0-9m]+$/, "");
        // Tess: attack-phase hero ability needing a tile
        if (selectedCard.startsWith("tess")) {
          socket.emit("use_hero_ability", { roomId, heroId: selectedCard, tileId });
          setSelectedCard(null);
          return;
        }
        // Gear abilities that need a tile target in attack phase
        const attackGearNeedingTile = ["g_wand", "g_bribe", "g_crossbow", "g_bomb", "g_knuckles", "g_dagger", "g_bait", "g_caltrops", "g_lance", "g_ballista"];
        if (attackGearNeedingTile.some(g => baseId.startsWith(g))) {
          socket.emit("use_gear_ability", { roomId, gearId: selectedCard, tileId });
          setSelectedCard(null);
          return;
        }
        // Default: hero attack
        socket.emit("attack_tile", { roomId, tileId, heroId: selectedCard });
        setSelectedCard(null);
      } else {
        setSelectedTile(tileId);
      }
    } else if (selectedAction?.includes("wall")) {
      // Multi-tile wall placement: toggle tile in/out of pending set
      setPendingWallTiles(prev =>
        prev.includes(tileId) ? prev.filter(t => t !== tileId) : [...prev, tileId]
      );
    } else if (selectedAction) {
      const action = gameState.actionSpaces.find(a => a.id === selectedAction);
      if (action?.reward.structure) {
        socket.emit("prep_action", { roomId, actionId: selectedAction, tileId });
        setSelectedAction(null);
      }
    } else if (gameState.status === Phase.PREPARATION && selectedCard) {
      const baseId = selectedCard.replace(/_[0-9m]+$/, "");
      // Prep-phase hero abilities needing a tile
      if (selectedCard.startsWith("ewud") || selectedCard.startsWith("boff")) {
        socket.emit("use_hero_ability", { roomId, heroId: selectedCard, tileId });
        setSelectedCard(null);
        // Blueprints or Caltrops in prep phase
      } else if (baseId.startsWith("g_blueprints")) {
        const sType = window.confirm("Build a WALL? (Cancel = BARRACKS)") ? "WALL" : "BARRACKS";
        socket.emit("use_gear_ability", { roomId, gearId: selectedCard, tileId, structureType: sType });
        setSelectedCard(null);
      } else if (baseId.startsWith("g_caltrops")) {
        socket.emit("use_gear_ability", { roomId, gearId: selectedCard, tileId });
        setSelectedCard(null);
      } else {
        setSelectedTile(tileId);
      }
    } else {
      setSelectedTile(tileId);
    }
  };

  const handleDraftedCardClick = (cardId: string) => {
    if (selectedAction && (selectedAction.includes("summon") || selectedAction.includes("gear"))) {
      socket.emit("prep_action", { roomId, actionId: selectedAction, cardId });
      setSelectedAction(null);
      setSelectedCard(null);
      setShowDraftedHand(false);
    }
  };

  const handleActiveCardClick = (cardId: string) => {
    if (selectedCard && (selectedCard.startsWith("vera") || selectedCard.startsWith("g_medkit"))) {
      socket.emit("refresh_hero", { roomId, sourceId: selectedCard, targetId: cardId });
      setSelectedCard(null);
      return;
    }
    // Enter dual-target mode for Hero of the Dungeon
    if (isHeroDualCard(cardId)) {
      if (dualHeroId === cardId) {
        setDualHeroId(null); setDualTargets([]);
      } else {
        setDualHeroId(cardId); setDualTargets([]); setSelectedCard(null); setOrionHeroId(null); setOrionTargets([]);
      }
      return;
    }
    // Clear dual/orion modes when switching to another card
    setDualHeroId(null); setDualTargets([]);

    // ── Orion: enter swap-target mode ──────────────────────────────────────
    if (cardId.startsWith("orion")) {
      if (orionHeroId === cardId) { setOrionHeroId(null); setOrionTargets([]); }
      else { setOrionHeroId(cardId); setOrionTargets([]); setSelectedCard(null); }
      return;
    }
    setOrionHeroId(null); setOrionTargets([]);

    // ── Lina: activate next-attack +1 damage buff immediately ──────────────
    if (cardId.startsWith("lina")) {
      socket.emit("use_hero_ability", { roomId, heroId: cardId });
      return;
    }

    // ── Alcie: prompt for resource to convert ──────────────────────────────
    if (cardId.startsWith("alcie")) {
      const res = window.prompt("Enter resource to convert (wood / clay / stone / gemstones):", "wood");
      if (res && ["wood", "clay", "stone", "gemstones"].includes(res.trim().toLowerCase())) {
        socket.emit("use_hero_ability", { roomId, heroId: cardId, fromResource: res.trim().toLowerCase() });
      }
      return;
    }

    // ── Tess: sets selected card — tile click will call use_hero_ability ───
    if (cardId.startsWith("tess")) {
      if (selectedCard === cardId) { setSelectedCard(null); } else { setSelectedCard(cardId); }
      return;
    }

    // ── Boff: sets selected card — tile click in prep phase builds wall ────
    if (cardId.startsWith("boff")) {
      if (selectedCard === cardId) { setSelectedCard(null); } else { setSelectedCard(cardId); }
      return;
    }

    // ── Gear abilities ──────────────────────────────────────────────────────
    const baseGearId = cardId.replace(/_m?\d+$/, "");

    // Immediate gear abilities (no tile needed)
    const immediateGear = ["g_pick", "g_trowel", "g_lumberaxe", "g_spyglass", "g_horn"];
    if (immediateGear.some(g => baseGearId === g)) {
      socket.emit("use_gear_ability", { roomId, gearId: cardId });
      return;
    }

    // Tile-targeted gear abilities (set selectedCard, handle in handleTileClick)
    const tileTargetGear = ["g_wand", "g_bribe", "g_crossbow", "g_bomb", "g_knuckles", "g_dagger", "g_bait", "g_caltrops", "g_blueprints", "g_lance", "g_ballista"];
    if (tileTargetGear.some(g => baseGearId === g)) {
      if (selectedCard === cardId) { setSelectedCard(null); } else { setSelectedCard(cardId); }
      return;
    }

    // Toggle off or select for other cards (default behavior)
    if (selectedCard === cardId) {
      setSelectedCard(null);
    } else {
      setSelectedCard(cardId);
    }
  };

  const handleEndTurn = () => {
    socket.emit("end_turn", roomId);
  };

  const handleRestartTurn = () => {
    socket.emit("restart_turn", roomId);
  };

  const handleTrade = (from: string, to: string) => {
    socket.emit("trade_resources", { roomId, from, to });
  };

  const handleManaAttack = (tileId: number, amount: number) => {
    socket.emit("mana_attack", { roomId, tileId, amount });
  };

  const handleFinishPrep = () => {
    socket.emit("finish_prep", roomId);
  };

  const handleUndoFinishPrep = () => {
    socket.emit("undo_finish_prep", roomId);
  };

  const handleBonusCardPlay = (cardId: string) => {
    if (!gameState || !me) return;
    const card = me.bonusCards.find((c: any) => c.id === cardId);
    if (!card) return;
    const baseId: string = card.id.replace(/_[01]$/, "");

    // Instant cards (no tile required)
    if (baseId === "bc_caravan" || baseId === "bc_cache") {
      socket.emit("use_bonus_card", { roomId, cardId });
      return;
    }

    // Mercenary Contract: needs a hero from drafted hand selected
    if (baseId === "bc_mercenary") {
      if (!selectedCard) {
        alert("Select a Hero card from your Drafted Hand first, then click Mercenary Contract.");
        return;
      }
      socket.emit("use_bonus_card", { roomId, cardId, cardToSummonId: selectedCard });
      setSelectedCard(null);
      return;
    }

    // Siege Engineering: needs a tile + structure choice
    if (baseId === "bc_siege") {
      if (selectedTile === null) {
        alert("Click a tile on the board first, then click Siege Engineering.");
        return;
      }
      const sType = window.confirm("Build a WALL? (Cancel = MOAT)") ? "WALL" : "MOAT";
      socket.emit("use_bonus_card", { roomId, cardId, tileId: selectedTile, structureType: sType });
      setSelectedTile(null);
      return;
    }

    // Tile-targeted cards (Monster Tamer, Forced Occupation)
    if (selectedTile === null) {
      alert(`Click a tile on the board first, then click ${card.name}.`);
      return;
    }
    socket.emit("use_bonus_card", { roomId, cardId, tileId: selectedTile });
    setSelectedTile(null);
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-sans relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#151619] border border-white/10 rounded-2xl p-8 shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-8">
            <Castle className="w-10 h-10 text-emerald-500" />
            <h1 className="text-3xl font-bold tracking-tight uppercase">Dungeon Gacha</h1>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Dungeon Name (Room ID)</label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Enter room code..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Master Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Your name..."
              />
            </div>
            <button
              onClick={handleJoin}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-900/20 uppercase tracking-widest"
            >
              Enter the Dungeon
            </button>
            <button
              onClick={() => setShowRulebook(true)}
              className="w-full bg-yellow-900/30 hover:bg-yellow-800/40 text-yellow-400 border border-yellow-500/30 font-bold py-3 rounded-xl transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2"
            >
              <Scroll className="w-4 h-4" /> Rulebook
            </button>
          </div>
        </motion.div>
        {/* Version number — update last digit on every change */}
        <div className="absolute bottom-3 left-4 text-white/20 text-[10px] font-mono tracking-widest select-none">
          (Ver. 1.0.2)
        </div>
        {showRulebook && <Rulebook onClose={() => setShowRulebook(false)} />}
      </div>
    );
  }

  if (!gameState) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Summoning game state...</div>;

  const me = gameState.players.find(p => p.id === mySocketId);
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === mySocketId;

  return (
    <div className="h-screen bg-[#0a0502] text-white flex flex-row font-sans selection:bg-emerald-500/30 overflow-hidden">      {/* Sidebar: Stats & Logs — desktop only */}
      <div className="hidden md:flex w-56 xl:w-64 bg-[#151619] border-r border-white/5 flex-col h-full shrink-0">
        <div className="p-6 border-bottom border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Castle className="w-5 h-5 text-emerald-500" />
            <span className="font-bold tracking-tighter text-base uppercase">Floor {gameState.round}</span>
          </div>

          {me && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <StatCard icon={<Gem className="w-4 h-4 text-red-500" />} label="Gems" value={me.gemstones} />
                  <div className="absolute -top-1 -right-1 bg-red-500/20 border border-red-500/30 px-1 rounded text-[8px] font-bold text-red-400">
                    +{getNextIncomeValue(me)} next
                  </div>
                </div>
                <StatCard icon={<Zap className="w-4 h-4 text-blue-400" />} label="Mana" value={me.mana} />
                <StatCard icon={<Trees className="w-4 h-4 text-amber-600" />} label="Wood" value={me.wood} />
                <StatCard icon={<Mountain className="w-4 h-4 text-stone-400" />} label="Stone" value={me.stone} />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <motion.div layout className="space-y-4">
            {gameState.players.map((p, i) => (
              <PlayerRow
                key={p.id}
                player={p}
                isActive={i === gameState.currentPlayerIndex}
                isSelf={p.id === mySocketId}
              />
            ))}
          </motion.div>
        </div>

        <div className="p-3 bg-black/40 border-t border-white/5 h-36 overflow-y-auto shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Chronicles</h3>
            <button
              onClick={() => {
                const text = gameState.logs.join('\n');
                navigator.clipboard.writeText(text).then(() => {
                  /* subtle visual feedback via title flicker */
                }).catch(() => { });
              }}
              title="Copy Chronicles to Clipboard"
              className="text-[9px] font-bold uppercase tracking-widest text-white/20 hover:text-emerald-400 border border-white/10 hover:border-emerald-500/40 px-1.5 py-0.5 rounded transition-all"
            >
              Copy
            </button>
          </div>
          {gameState.logs.slice().reverse().map((log, i) => {
            const isTurnHeader = log.startsWith('[Turn ');
            return (
              <p key={i} className={`text-[11px] mb-1 leading-relaxed ${isTurnHeader
                ? 'text-yellow-400/70 font-semibold'
                : 'text-white/50'
                }`}>
                {isTurnHeader ? (
                  <span className="text-yellow-500 mr-1">◆</span>
                ) : (
                  <span className="text-emerald-500 mr-1">»</span>
                )}
                {log}
              </p>
            );
          })}
        </div>
      </div>

      {/* Main Area: Board & Controls */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 pb-14 md:pb-0">
        {/* Header / Phase Info */}
        <div className="border-b border-white/5 bg-[#151619]/50 backdrop-blur-xl">
          {/* Row 1: phase + turn + action button */}
          <div className="h-10 flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-widest">
                {gameState.status}
              </div>
              {gameState.status !== Phase.DRAFTING && (
                <span className="text-sm text-white/40">
                  {isMyTurn ? "Your Turn - Make your move" : `${gameState.players[gameState.currentPlayerIndex]?.name}'s Turn`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRulebook(true)}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                <Scroll className="w-3 h-3 text-yellow-500" /> Rulebook
              </button>

              {isMyTurn && gameState.status === Phase.ATTACK && (
                <button
                  onClick={handleEndTurn}
                  className="flex items-center gap-2 bg-white text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-emerald-400 transition-colors"
                >
                  Confirm Turn <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2: turn order strip (hidden during draft — everyone picks simultaneously) */}
          {gameState.status !== Phase.DRAFTING && <div className="h-10 px-8 flex items-center gap-1 border-t border-white/5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/20 mr-2 shrink-0">Turn Order</span>
            <div className="flex items-center gap-1 overflow-x-auto">
              {gameState.players.map((p, i) => {
                const isActive = i === gameState.currentPlayerIndex;
                const isSelf = p.id === socket.id;
                return (
                  <React.Fragment key={p.id}>
                    {i > 0 && (
                      <ArrowRight className="w-2.5 h-2.5 text-white/15 shrink-0" />
                    )}
                    <motion.div
                      animate={isActive ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={isActive ? { repeat: Infinity, duration: 1.8, ease: "easeInOut" } : {}}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all shrink-0",
                        isActive
                          ? "text-white border"
                          : "text-white/30 border border-transparent"
                      )}
                      style={isActive ? {
                        backgroundColor: `${p.color}22`,
                        borderColor: `${p.color}66`,
                        boxShadow: `0 0 8px ${p.color}44`
                      } : {}}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: isActive ? p.color : `${p.color}55` }}
                      />
                      <span>{i + 1}.</span>
                      <span className={isActive ? "text-white" : "text-white/30"}>
                        {isSelf ? "You" : p.name}
                      </span>
                      <span
                        className="text-[8px] font-mono ml-0.5"
                        style={{ color: isActive ? `${p.color}cc` : "rgba(255,255,255,0.15)" }}
                      >
                        {p.tilesCount}✦
                      </span>
                    </motion.div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>}
        </div>

        <div className="flex-1 flex items-center justify-center p-2 md:p-4 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1a1c21] to-[#0a0502] overflow-hidden min-h-0">
          {gameState.status === Phase.BIDDING_WAR ? (
            <div className="max-w-md w-full bg-[#151619] border border-white/10 rounded-3xl p-8 text-center shadow-2xl">
              <Gem className="w-16 h-16 text-red-500 mx-auto mb-6" />
              <h2 className="text-2xl font-bold uppercase tracking-tighter mb-4">Flagpole Bidding War</h2>
              <p className="text-white/60 text-sm mb-8 leading-relaxed">
                The center square is cleared! To plant the Flagpole and win, you must bid:
                <br />
                <span className="text-white font-bold">All your Gemstones + 3 Wood + 1 Stone</span>
              </p>

              {!me?.ready ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                      <div className="text-[10px] uppercase text-white/40 mb-1">Your Bid Value</div>
                      <div className="text-xl font-mono font-bold text-red-400">
                        {me ? (me.wood >= 3 && me.stone >= 1 ? me.gemstones + (me.gear.some(g => g.id === "g_decree") ? 10 : 0) : "INELIGIBLE") : 0}
                      </div>
                    </div>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                      <div className="text-[10px] uppercase text-white/40 mb-1">Requirements</div>
                      <div className="text-[10px] font-bold">
                        {me?.wood}/3 Wood • {me?.stone}/1 Stone
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleSubmitBid}
                    disabled={!me || me.wood < 3 || me.stone < 1}
                    className="w-full bg-red-600 hover:bg-red-500 disabled:bg-white/5 disabled:text-white/20 text-white font-bold py-4 rounded-2xl transition-all uppercase tracking-widest shadow-lg shadow-red-900/20"
                  >
                    Submit Bid
                  </button>
                </div>
              ) : (
                <div className="p-6 bg-white/5 rounded-2xl border border-white/10 animate-pulse">
                  <p className="text-sm text-white/40 uppercase tracking-widest font-bold">Waiting for other bidders...</p>
                </div>
              )}
            </div>
          ) : gameState.status === Phase.GAME_OVER ? (
            <GameOverScreen gameState={gameState} myId={mySocketId} roomId={roomId} playerName={playerName} />
          ) : gameState.status === Phase.LOBBY ? (
            <LobbyScreen
              gameState={gameState}
              myId={mySocketId}
              roomId={roomId}
              onStart={handleStart}
            />
          ) : gameState.status === Phase.DRAFTING ? (
            <div className="w-full max-w-5xl overflow-y-auto">
              <AnimatePresence mode="wait">
                {me?.ready ? (
                  <motion.div
                    key="waiting"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex flex-col items-center justify-center gap-4 py-20"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500"
                    />
                    <p className="text-emerald-500 text-sm uppercase tracking-widest font-bold">Waiting for other players...</p>
                    <p className="text-white/20 text-xs">Hands will pass once everyone picks</p>
                  </motion.div>
                ) : (me?.draftStep === "hero" || !me?.draftStep) ? (
                  <motion.div
                    key="hero-pick"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest mb-3">
                        Step 1 of 2 · Heroes
                      </div>
                      <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-1">Choose your Hero</h2>
                      <p className="text-white/30 text-xs">Pick 1 hero from your hand. The rest will pass to the next player.</p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                      {me?.draftHeroHand.map(card => (
                        <CardView
                          key={card.id}
                          card={card}
                          onSelect={() => handleDraft(card.id)}
                        />
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="gear-pick"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest mb-3">
                        Step 2 of 2 · Gear
                      </div>
                      <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-1">Equip your Gear</h2>
                      <p className="text-white/30 text-xs">Pick 1 gear item from your hand. The rest will pass to the next player.</p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                      {me?.draftGearHand.map(card => (
                        <CardView
                          key={card.id}
                          card={card}
                          onSelect={() => handleDraft(card.id)}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            // The outer div must be h-full + overflow-hidden so board-grid's max-height:100% works
            <div className="relative group flex items-center justify-center h-full w-full overflow-hidden">
              <div className="grid grid-cols-9 gap-0.5 bg-white/5 p-1 rounded-lg border border-white/10 shadow-2xl board-grid">
                {gameState.board.map((tile, i) => (
                  <TileView
                    key={i}
                    tile={tile}
                    players={gameState.players}
                    onClick={() => handleTileClick(i)}
                    isSelected={selectedTile === i}
                    isPendingWall={pendingWallTiles.includes(i)}
                    isPendingDual={dualTargets.includes(i)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Panel: Actions / Hand — desktop only */}
        <div className="hidden md:flex shrink-0 border-t border-white/5 bg-[#151619] p-3 gap-4 overflow-x-auto" style={{ minHeight: '10rem', maxHeight: '14rem' }}>
          {gameState.status === Phase.ATTACK && isMyTurn && selectedTile !== null && gameState.board[selectedTile].monsterType !== null && (
            <div className="w-48 flex flex-col gap-3 pr-6 border-r border-white/5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30">Mana Attack</h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="1"
                    max={me ? Math.max(1, me.mana) : 1}
                    value={manaAmount}
                    onChange={(e) => setManaAmount(Number(e.target.value))}
                    className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-[10px] font-mono text-blue-400 w-4">{manaAmount}</span>
                </div>
                <button
                  onClick={() => {
                    handleManaAttack(selectedTile, manaAmount);
                    setManaAmount(1);
                  }}
                  disabled={!me || me.mana < 1}
                  className="w-full py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Attack ({manaAmount} DMG)
                </button>
              </div>
            </div>
          )}

          {gameState.status === Phase.PREPARATION && (
            <div className="w-48 flex flex-col gap-3 pr-6 border-r border-white/5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30">Prep Status</h3>
              <button
                onClick={me?.finishedPrep ? handleUndoFinishPrep : handleFinishPrep}
                className={cn(
                  "w-full py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-500/30",
                  me?.finishedPrep && "bg-orange-600/20 hover:bg-orange-600/30 text-orange-500 border-orange-500/30"
                )}
              >
                {me?.finishedPrep ? "Undo Finish Prep" : "Finish Prep"}
              </button>
              <p className="text-[9px] text-white/30 leading-tight">
                Clicking this means you won't take any more actions this round.
              </p>
            </div>
          )}

          {gameState.status === Phase.PREPARATION && isMyTurn && (
            <div className="flex-1">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30">Preparation Actions</h3>
                {me?.gear.some(g => g.id === "g_scale") && (
                  <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                    <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wider">Merchant's Scale:</span>
                    <div className="flex gap-1">
                      {["wood", "clay", "stone", "gemstones"].map(res => (
                        <button
                          key={res}
                          onClick={() => {
                            const to = prompt(`Trade 1 ${res} for what? (wood, clay, stone, gemstones)`);
                            if (to && ["wood", "clay", "stone", "gemstones"].includes(to)) {
                              handleTrade(res, to);
                            }
                          }}
                          disabled={me[res as keyof Player] < 1 || me.gear.find(g => g.id === "g_scale")?.abilityUsed}
                          className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 rounded text-[8px] font-bold uppercase"
                        >
                          {res.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {gameState.actionSpaces.map(action => (
                  <ActionButton
                    key={action.id}
                    action={action}
                    onClick={() => handlePrepAction(action.id)}
                    disabled={action.used || (me && me.gemstones < action.cost)}
                    active={selectedAction === action.id}
                    me={me}
                  />
                ))}
              </div>
              {selectedAction && (selectedAction.includes("summon") || selectedAction.includes("gear")) && (
                <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-2">Select a card from your Drafted Hand below</p>
                </div>
              )}
              {/* Wall multi-select banner */}
              {selectedAction?.includes("wall") && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg">🧱</span>
                    <div className="flex-1">
                      <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                        Click your tiles to select walls — click again to deselect
                      </p>
                      {pendingWallTiles.length > 0 ? (
                        <p className="text-[10px] text-white/50 mt-0.5">
                          {pendingWallTiles.length} wall{pendingWallTiles.length > 1 ? "s" : ""} selected
                          · costs <span className="text-amber-400 font-bold">{pendingWallTiles.length * 2} Wood</span>
                          {me && me.wood < pendingWallTiles.length * 2 && (
                            <span className="text-red-400 ml-1">(need {pendingWallTiles.length * 2 - me.wood} more Wood)</span>
                          )}
                        </p>
                      ) : (
                        <p className="text-[10px] text-white/30 mt-0.5">No tiles selected yet</p>
                      )}
                    </div>
                    <button onClick={() => { setSelectedAction(null); setPendingWallTiles([]); }}
                      className="text-white/30 hover:text-white/60 text-[9px] uppercase font-bold shrink-0">Cancel</button>
                  </div>
                  {pendingWallTiles.length > 0 && (
                    <button
                      onClick={handleWallConfirm}
                      disabled={!me || me.wood < pendingWallTiles.length * 2}
                      className="w-full py-2 bg-amber-600/30 hover:bg-amber-600/50 disabled:opacity-30 disabled:cursor-not-allowed text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                      Build {pendingWallTiles.length} Wall{pendingWallTiles.length > 1 ? "s" : ""} (costs {pendingWallTiles.length * 2} Wood)
                    </button>
                  )}
                </div>
              )}
              {/* Single-tile structure banner (moat / barracks / smithy) */}
              {selectedAction && (selectedAction.includes("moat") || selectedAction.includes("barracks") || selectedAction.includes("smithy")) && (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-3">
                  <span className="text-xl">🏗</span>
                  <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                    Now click one of <span className="text-white">your tiles</span> on the board to place the structure.
                    {selectedAction.includes("up_moat") && " (Must already have a Moat)"}
                  </p>
                  <button onClick={() => setSelectedAction(null)} className="ml-auto text-white/30 hover:text-white/60 text-[9px] uppercase font-bold shrink-0">Cancel</button>
                </div>
              )}
              {selectedAction && selectedAction.includes("mana") && (
                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex flex-col gap-3">
                  <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">How much mana to generate? (1 mana = 2 gems)</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="1"
                        max={me ? Math.max(1, Math.floor(me.gemstones / 2)) : 1}
                        value={manaAmount}
                        onChange={(e) => setManaAmount(Number(e.target.value))}
                        className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <span className="text-sm font-mono text-blue-400 w-8 text-center">{manaAmount}</span>
                    </div>
                    <button
                      onClick={handleManaConfirm}
                      disabled={!me || me.gemstones < 2}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-white/20 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-lg transition-colors mt-2"
                    >
                      Confirm ({manaAmount * 2} Gems)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View Hand Button */}
          <div className="w-48 flex flex-col gap-3 pr-6 border-r border-white/5 shrink-0">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30">Your Hand</h3>
            <button
              onClick={() => setShowDraftedHand(true)}
              className="flex-1 flex flex-col items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 rounded-xl transition-all group"
            >
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                <Scroll className="w-5 h-5 text-white/40 group-hover:text-white/60" />
              </div>
              <div className="text-center">
                <div className="text-[10px] font-bold text-white/60">View Cards</div>
                <div className="text-[9px] text-white/30">{me?.draftedCards.length || 0} in hand</div>
              </div>
            </button>
          </div>

          {(gameState.status === Phase.PREPARATION || gameState.status === Phase.ATTACK) && (
            <div className="flex-1 min-w-[320px] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30">Active Heroes & Gear</h3>
                <span className="text-[9px] text-white/20 font-mono">
                  {([...(me?.heroes || []), ...(me?.gear || [])]).length} SLOTS USED
                </span>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden flex gap-4 pb-2 scrollbar-thin scrollbar-thumb-white/10">
                {[...(me?.heroes || []), ...(me?.gear || [])].map(item => (
                  <div key={item.id} className="w-40 shrink-0">
                    <CardView
                      card={item}
                      onSelect={() => handleActiveCardClick(item.id)}
                      active={selectedCard === item.id || dualHeroId === item.id || orionHeroId === item.id}
                      disabled={!!item.abilityUsed}
                      spent={!!item.abilityUsed}
                    />
                  </div>
                ))}
                {([...(me?.heroes || []), ...(me?.gear || [])]).length === 0 && (
                  <div className="flex-1 flex items-center justify-center border border-dashed border-white/5 rounded-xl">
                    <p className="text-[10px] text-white/10 italic">Your army is empty. Summon heroes to begin.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dual-Attack Banner (desktop) */}
          {gameState.status === Phase.ATTACK && isMyTurn && dualHeroId && (
            <div className="flex-1 min-w-[280px] flex flex-col gap-3 border-l border-white/5 pl-4">
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">⚔️</span>
                  <p className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider">
                    Hero of the Dungeon — Dual Strike
                  </p>
                  <button
                    onClick={() => { setDualHeroId(null); setDualTargets([]); }}
                    className="ml-auto text-white/30 hover:text-white/60 text-[9px] uppercase font-bold shrink-0"
                  >Cancel</button>
                </div>
                <p className="text-[10px] text-white/50 mb-3">
                  Click <span className="text-yellow-400 font-bold">2 adjacent monster tiles</span> on the board, then confirm.
                  {dualTargets.length > 0 && (
                    <span className="block mt-1 text-yellow-300 font-bold">
                      {dualTargets.length}/2 targets selected
                    </span>
                  )}
                </p>
                <button
                  onClick={handleDualConfirm}
                  disabled={dualTargets.length < 2}
                  className="w-full py-2 bg-yellow-600/30 hover:bg-yellow-600/50 disabled:opacity-30 disabled:cursor-not-allowed text-yellow-300 border border-yellow-500/40 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  ⚔️ Confirm Dual Strike (5 DMG each)
                </button>
              </div>
            </div>
          )}

          {/* Ewud Build Banner (desktop) */}
          {gameState.status === Phase.PREPARATION && isMyTurn && selectedCard && selectedCard.startsWith("ewud") && (
            <div className="flex-1 min-w-[280px] flex flex-col gap-3 border-l border-white/5 pl-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🌿</span>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                    Ewud — Nature's Growth
                  </p>
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="ml-auto text-white/30 hover:text-white/60 text-[9px] uppercase font-bold shrink-0"
                  >Cancel</button>
                </div>
                <p className="text-[10px] text-white/50">
                  Click a clear tile you own on the board to build a <strong className="text-amber-400">Wooden Wall</strong> for free.
                </p>
              </div>
            </div>
          )}

          {/* Orion Swap Banner (desktop) */}
          {gameState.status === Phase.ATTACK && isMyTurn && orionHeroId && (
            <div className="flex-1 min-w-[280px] flex flex-col gap-3 border-l border-white/5 pl-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🌠</span>
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                    Orion — Star Swap
                  </p>
                  <button
                    onClick={() => { setOrionHeroId(null); setOrionTargets([]); }}
                    className="ml-auto text-white/30 hover:text-white/60 text-[9px] uppercase font-bold shrink-0"
                  >Cancel</button>
                </div>
                <p className="text-[10px] text-white/50">
                  Click <span className="text-purple-400 font-bold">2 monster tiles</span> to swap their positions.
                  {orionTargets.length > 0 && (
                    <span className="block mt-1 text-purple-300 font-bold">{orionTargets.length}/2 selected</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Generic Tile-Targeting Banner (desktop) — for Tess, Boff, and tile-targeted gear */}
          {isMyTurn && selectedCard && !selectedCard.startsWith("ewud") && !selectedCard.startsWith("vera") && !selectedCard.startsWith("g_medkit") && (
            (() => {
              const base = selectedCard.replace(/_m?\d+$/, "");
              const tileTargetCards = ["tess", "boff", "g_wand", "g_bribe", "g_crossbow", "g_bomb", "g_knuckles", "g_dagger", "g_bait", "g_caltrops", "g_blueprints", "g_lance", "g_ballista"];
              const isTargeting = tileTargetCards.some(id => base.startsWith(id) || selectedCard.startsWith(id));
              if (!isTargeting) return null;
              const labels: Record<string, string> = {
                tess: "Reveal monster HP in a 3x3 area — click center tile",
                boff: "Repair a wall for 1 Wood — click an owned tile",
                g_wand: "Deal 2 damage for 1 Mana — click a monster tile",
                g_bribe: "Pay 5 gems to claim tile — click a monster tile",
                g_crossbow: "Deal 3 damage (2-tile range) — click a monster tile",
                g_bomb: "2 damage AOE — click target monster tile",
                g_knuckles: "Deal 2 damage; +2 gems on kill — click a monster tile",
                g_dagger: "Poison monster (1 dmg × 2 rounds) — click a monster tile",
                g_bait: "Move monster to adjacent tile — click the monster tile",
                g_caltrops: "Lay Caltrops — click an owned tile",
                g_blueprints: "Free build (no action space) — click an owned tile",
                g_lance: "Lance charge — click an adjacent monster tile",
                g_ballista: "Ballista shot — click a monster in line-of-sight of your wall",
              };
              const hint = Object.entries(labels).find(([k]) => base.startsWith(k) || selectedCard.startsWith(k))?.[1] ?? "Click a tile on the board";
              return (
                <div className="flex-1 min-w-[280px] flex flex-col gap-3 border-l border-white/5 pl-4">
                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🎯</span>
                      <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Select Target</p>
                      <button onClick={() => setSelectedCard(null)} className="ml-auto text-white/30 hover:text-white/60 text-[9px] uppercase font-bold shrink-0">Cancel</button>
                    </div>
                    <p className="text-[10px] text-white/50">{hint}</p>
                  </div>
                </div>
              );
            })()
          )}

          {me && me.bonusCards && me.bonusCards.length > 0 && (
            <div className="w-64 flex flex-col shrink-0 border-l border-white/5 pl-6">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-yellow-400/70 mb-4">⭐ Bonus Cards</h3>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {me.bonusCards.map((c: any) => (
                  <BonusCardView
                    key={c.id}
                    card={c}
                    onPlay={() => handleBonusCardPlay(c.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ MOBILE TAB BAR ════════════════════════════════════════════════ */}
      {/* Shown only on small screens; replaces sidebar + bottom panel UX     */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#151619] border-t border-white/10 flex">
        {([
          { id: "board", label: "Board", icon: <Castle className="w-5 h-5" /> },
          { id: "stats", label: "Stats", icon: <User className="w-5 h-5" /> },
          { id: "actions", label: "Actions", icon: <Sword className="w-5 h-5" /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
              mobileTab === tab.id ? "text-emerald-400" : "text-white/30"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ MOBILE PANELS ════════════════════════════════════════════════ */}
      {/* Stats panel slides up from bottom on mobile */}
      <AnimatePresence>
        {mobileTab === "stats" && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="md:hidden fixed inset-0 bottom-14 z-30 bg-[#151619] overflow-y-auto p-4"
          >
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4">Your Stats</h2>
            {me && (
              <div className="grid grid-cols-2 gap-2 mb-6">
                <div className="relative">
                  <StatCard icon={<Gem className="w-4 h-4 text-red-500" />} label="Gems" value={me.gemstones} />
                  <div className="absolute -top-1 -right-1 bg-red-500/20 border border-red-500/30 px-1 rounded text-[8px] font-bold text-red-400">
                    +{getNextIncomeValue(me)} next
                  </div>
                </div>
                <StatCard icon={<Zap className="w-4 h-4 text-blue-400" />} label="Mana" value={me.mana} />
                <StatCard icon={<Trees className="w-4 h-4 text-amber-600" />} label="Wood" value={me.wood} />
                <StatCard icon={<Mountain className="w-4 h-4 text-stone-400" />} label="Stone" value={me.stone} />
              </div>
            )}
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3">Players</h2>
            <div className="space-y-2 mb-6">
              {gameState.players.map((p, i) => (
                <PlayerRow key={p.id} player={p} isActive={i === gameState.currentPlayerIndex} isSelf={p.id === mySocketId} />
              ))}
            </div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/30 mb-2">Chronicles</h2>
            {gameState.logs.slice(-8).reverse().map((log, i) => (
              <p key={i} className="text-[11px] text-white/50 mb-1 leading-relaxed">
                <span className="text-emerald-500 mr-1">»</span> {log}
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileTab === "actions" && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="md:hidden fixed inset-0 bottom-14 z-30 bg-[#151619] overflow-y-auto p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/30">Actions</h2>
              <button onClick={() => setShowDraftedHand(true)}
                className="flex items-center gap-1.5 text-[10px] font-bold text-white/50 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                <Scroll className="w-3 h-3" /> Hand ({me?.draftedCards.length || 0})
              </button>
            </div>

            {/* Prep Actions */}
            {gameState.status === Phase.PREPARATION && isMyTurn && (
              <div className="mb-4">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {gameState.actionSpaces.map(action => (
                    <ActionButton
                      key={action.id}
                      action={action}
                      onClick={() => handlePrepAction(action.id)}
                      disabled={action.used || (me && me.gemstones < action.cost)}
                      active={selectedAction === action.id}
                      me={me}
                    />
                  ))}
                </div>
                {selectedAction && selectedAction.includes("mana") && (
                  <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex flex-col gap-3">
                    <p className="text-[10px] text-blue-400 font-bold uppercase">Mana amount (1 mana = 2 gems)</p>
                    <div className="flex items-center gap-3">
                      <input type="range" min="1" max={me ? Math.max(1, Math.floor(me.gemstones / 2)) : 1}
                        value={manaAmount} onChange={e => setManaAmount(Number(e.target.value))}
                        className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                      <span className="text-sm font-mono text-blue-400">{manaAmount}</span>
                    </div>
                    <button onClick={handleManaConfirm} disabled={!me || me.gemstones < 2}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 disabled:text-white/20 text-white text-[10px] font-bold uppercase tracking-widest py-2.5 rounded-lg">
                      Confirm ({manaAmount * 2} Gems)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Finish Prep */}
            {gameState.status === Phase.PREPARATION && (
              <button onClick={me?.finishedPrep ? handleUndoFinishPrep : handleFinishPrep}
                className={cn(
                  "w-full py-3 rounded-xl font-bold uppercase tracking-widest text-sm mb-4",
                  me?.finishedPrep
                    ? "bg-orange-600/20 text-orange-400 border border-orange-500/30"
                    : "bg-red-600/20 text-red-400 border border-red-500/30"
                )}>
                {me?.finishedPrep ? "Undo Finish Prep" : "Finish Prep"}
              </button>
            )}

            {/* Active Heroes & Gear */}
            {(gameState.status === Phase.PREPARATION || gameState.status === Phase.ATTACK) && (
              <div className="mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Active Heroes & Gear</h3>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {[...(me?.heroes || []), ...(me?.gear || [])].map(item => (
                    <div key={item.id} className="w-28 shrink-0">
                      <CardView card={item} onSelect={() => handleActiveCardClick(item.id)}
                        active={selectedCard === item.id || dualHeroId === item.id || orionHeroId === item.id}
                        disabled={!!item.abilityUsed}
                        spent={!!item.abilityUsed} />
                    </div>
                  ))}
                  {[...(me?.heroes || []), ...(me?.gear || [])].length === 0 && (
                    <p className="text-[10px] text-white/20 italic">No heroes or gear yet.</p>
                  )}
                </div>
              </div>
            )}

            {/* Dual-Attack Banner (mobile) */}
            {gameState.status === Phase.ATTACK && isMyTurn && dualHeroId && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">⚔️</span>
                  <p className="text-[10px] text-yellow-400 font-bold uppercase tracking-wider flex-1">
                    Hero — Dual Strike
                  </p>
                  <button
                    onClick={() => { setDualHeroId(null); setDualTargets([]); }}
                    className="text-white/30 hover:text-white/60 text-[9px] uppercase font-bold"
                  >Cancel</button>
                </div>
                <p className="text-[10px] text-white/50 mb-2">
                  Select <span className="text-yellow-400 font-bold">2 adjacent monster tiles</span> on the board.
                  {dualTargets.length > 0 && (
                    <span className="ml-1 text-yellow-300 font-bold">{dualTargets.length}/2 selected</span>
                  )}
                </p>
                <button
                  onClick={handleDualConfirm}
                  disabled={dualTargets.length < 2}
                  className="w-full py-2 bg-yellow-600/30 hover:bg-yellow-600/50 disabled:opacity-30 disabled:cursor-not-allowed text-yellow-300 border border-yellow-500/40 rounded-lg text-[10px] font-bold uppercase tracking-widest"
                >
                  ⚔️ Confirm (5 DMG each)
                </button>
              </div>
            )}

            {/* Ewud Build Banner (mobile) */}
            {gameState.status === Phase.PREPARATION && isMyTurn && selectedCard && selectedCard.startsWith("ewud") && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🌿</span>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex-1">
                    Ewud — Nature's Growth
                  </p>
                  <button
                    onClick={() => setSelectedCard(null)}
                    className="text-white/30 hover:text-white/60 text-[9px] uppercase font-bold"
                  >Cancel</button>
                </div>
                <p className="text-[10px] text-white/50">
                  Select a clear tile you own on the board to build a Wooden Wall for free.
                </p>
              </div>
            )}

            {/* Orion Swap Banner (mobile) */}
            {gameState.status === Phase.ATTACK && isMyTurn && orionHeroId && (
              <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🌠</span>
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex-1">Orion — Star Swap</p>
                  <button onClick={() => { setOrionHeroId(null); setOrionTargets([]); }} className="text-white/30 hover:text-white/60 text-[9px] uppercase font-bold">Cancel</button>
                </div>
                <p className="text-[10px] text-white/50">
                  Select <span className="text-purple-400 font-bold">2 monster tiles</span> on the board to swap.
                  {orionTargets.length > 0 && <span className="ml-1 text-purple-300 font-bold">{orionTargets.length}/2 selected</span>}
                </p>
              </div>
            )}

            {/* Generic tile-targeting banner (mobile) */}
            {isMyTurn && selectedCard && !selectedCard.startsWith("ewud") && !selectedCard.startsWith("vera") && !selectedCard.startsWith("g_medkit") && (
              (() => {
                const base = selectedCard.replace(/_m?\d+$/, "");
                const tileTargetCards = ["tess", "boff", "g_wand", "g_bribe", "g_crossbow", "g_bomb", "g_knuckles", "g_dagger", "g_bait", "g_caltrops", "g_blueprints", "g_lance", "g_ballista"];
                const isTargeting = tileTargetCards.some(id => base.startsWith(id) || selectedCard.startsWith(id));
                if (!isTargeting) return null;
                const labels: Record<string, string> = {
                  tess: "Click center tile of 3x3 to reveal monster HP",
                  boff: "Click an owned tile to repair a wall for 1 Wood",
                  g_wand: "Click a monster tile — deal 2 dmg for 1 Mana",
                  g_bribe: "Click a monster tile — pay 5 gems to claim it",
                  g_crossbow: "Click a monster tile (2-tile range) — deal 3 dmg",
                  g_bomb: "Click a monster tile — 2 dmg to it and neighbors",
                  g_knuckles: "Click a monster tile — 2 dmg, +2 gems on kill",
                  g_dagger: "Click a monster tile to poison it",
                  g_bait: "Click a monster tile to bait it away",
                  g_caltrops: "Click an owned tile to lay Caltrops",
                  g_blueprints: "Click an owned tile to build (no action space)",
                  g_lance: "Lance charge — click an adjacent monster tile",
                  g_ballista: "Ballista — click a monster in line-of-sight of your wall",
                };
                const hint = Object.entries(labels).find(([k]) => base.startsWith(k) || selectedCard.startsWith(k))?.[1] ?? "Click a tile";
                return (
                  <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🎯</span>
                      <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider flex-1">Select Target</p>
                      <button onClick={() => setSelectedCard(null)} className="text-white/30 hover:text-white/60 text-[9px] uppercase font-bold">Cancel</button>
                    </div>
                    <p className="text-[10px] text-white/50">{hint}</p>
                  </div>
                );
              })()
            )}

            {/* Mana Attack (Attack phase) */}
            {gameState.status === Phase.ATTACK && isMyTurn && selectedTile !== null && gameState.board[selectedTile].monsterType !== null && (
              <div className="mb-4 p-3 bg-blue-600/10 border border-blue-500/20 rounded-xl">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Mana Attack</h3>
                <div className="flex items-center gap-3 mb-2">
                  <input type="range" min="1" max={me ? Math.max(1, me.mana) : 1}
                    value={manaAmount} onChange={e => setManaAmount(Number(e.target.value))}
                    className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                  <span className="text-sm font-mono text-blue-400">{manaAmount}</span>
                </div>
                <button onClick={() => { handleManaAttack(selectedTile, manaAmount); setManaAmount(1); }}
                  disabled={!me || me.mana < 1}
                  className="w-full py-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase">
                  Attack ({manaAmount} DMG)
                </button>
              </div>
            )}

            {/* Bonus Cards */}
            {me && me.bonusCards && me.bonusCards.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-yellow-400/70 mb-2">⭐ Bonus Cards</h3>
                <div className="space-y-2">
                  {me.bonusCards.map((c: any) => (
                    <BonusCardView key={c.id} card={c} onPlay={() => handleBonusCardPlay(c.id)} />
                  ))}
                </div>
              </div>
            )}

            {/* Turn Controls */}
            {isMyTurn && gameState.status === Phase.ATTACK && (
              <div className="mt-4 space-y-2">
                <button onClick={handleRestartTurn}
                  className="w-full py-2 bg-zinc-700 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-amber-600 transition-colors">
                  ↺ Restart Turn
                </button>
                <button onClick={handleEndTurn}
                  className="w-full py-3 bg-white text-black rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-emerald-400 transition-colors">
                  End Turn →
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDraftedHand && (
          <DraftedHandOverlay
            cards={me?.draftedCards || []}
            onSelect={handleDraftedCardClick}
            onClose={() => setShowDraftedHand(false)}
            selectedAction={selectedAction}
          />
        )}
      </AnimatePresence>

      {showRulebook && <Rulebook onClose={() => setShowRulebook(false)} />}
    </div>
  );
}

function DraftedHandOverlay({ cards, onSelect, onClose, selectedAction }: { cards: Card[], onSelect: (id: string) => void, onClose: () => void, selectedAction: string | null }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-6xl flex flex-col gap-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold uppercase tracking-tighter text-white">Your Arsenal</h2>
            <p className="text-white/40 text-sm uppercase tracking-widest mt-1">
              {cards.length} Cards available to summon or equip
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all text-2xl"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6 max-h-[70vh] overflow-y-auto p-4 -m-4">
          {cards.map(c => {
            const isDisabled = selectedAction !== null && (
              (selectedAction.includes("summon") && c.type !== "HERO") ||
              (selectedAction.includes("gear") && c.type !== "GEAR")
            );

            return (
              <div key={c.id} className="relative group">
                <CardView
                  card={c}
                  onSelect={() => onSelect(c.id)}
                  disabled={isDisabled}
                />
                {isDisabled && (
                  <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest text-center px-4">
                      Requires {c.type === "HERO" ? "Summon" : "Gear"} Action
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          {cards.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-3xl bg-white/5">
              <Scroll className="w-12 h-12 text-white/10 mb-4" />
              <p className="text-white/30 italic uppercase tracking-widest text-sm">Your hand is empty</p>
            </div>
          )}
        </div>

        {selectedAction && (
          <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Zap className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-blue-400 uppercase tracking-widest">Active Action</div>
                <div className="text-lg font-bold text-white">Select a {selectedAction.includes("summon") ? "Hero" : "Gear"} to continue</div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Cost will be deducted on selection</p>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-white/60">Preparation Phase</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function PlayerRow({ player, isActive, isSelf }: { player: any; isActive: boolean; isSelf: boolean; key?: any }) {
  const [hovered, setHovered] = React.useState(false);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = React.useState({ top: 0, left: 0 });

  const handleMouseEnter = (e: React.MouseEvent) => {
    setTooltipPos({ top: e.clientY, left: e.clientX + 16 });
    setHovered(true);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (hovered) setTooltipPos({ top: e.clientY, left: e.clientX + 16 });
  };

  const resources = [
    { label: "Gems", value: player.gemstones, color: "#ef4444", icon: "💎", extra: ` (+${getNextIncomeValue(player)})` },
    { label: "Mana", value: player.mana, color: "#60a5fa", icon: "⚡" },
    { label: "Wood", value: player.wood, color: "#d97706", icon: "🌲" },
    { label: "Clay", value: player.clay, color: "#b45309", icon: "🧱" },
    { label: "Stone", value: player.stone, color: "#94a3b8", icon: "⛰" },
  ];

  return (
    <motion.div
      ref={rowRef}
      layout
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={cn(
        "p-3 rounded-xl border transition-all cursor-default",
        isActive ? "bg-white/5 border-white/20" : "bg-transparent border-transparent opacity-60"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
            <span className="text-sm font-medium">
              {player.name} {isSelf && "(You)"}{(player as any).isBot && " 🤖"}
            </span>
            {player.finishedPrep && (
              <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-white/40 uppercase tracking-tighter">Done</span>
            )}
          </div>
          <span className="text-xs font-mono text-white/40">{player.tilesCount} tiles</span>
        </div>
      </div>

      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.95 }}
            transition={{ duration: 0.14 }}
            className="pointer-events-none z-[9999]"
            style={{
              position: "fixed",
              top: tooltipPos.top,
              left: tooltipPos.left,
              minWidth: "160px",
            }}
          >
            <div
              className="rounded-xl border shadow-2xl overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #0f0f12 60%, #1a1c2188)",
                borderColor: `${player.color}44`,
                boxShadow: `0 8px 32px 0 ${player.color}22`,
              }}
            >
              {/* Header */}
              <div
                className="px-3 py-2 border-b flex items-center gap-2"
                style={{ borderColor: `${player.color}30`, backgroundColor: `${player.color}18` }}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: player.color }} />
                <span className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: player.color }}>
                  {player.name}
                </span>
              </div>

              {/* Resource rows */}
              <div className="px-3 py-2 space-y-1.5">
                {resources.map((r: any) => (
                  <div key={r.label} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] leading-none">{r.icon}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: r.color }}>{r.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono font-bold text-white">{r.value}</span>
                      {r.extra && <span className="text-[8px] font-bold text-red-400 opacity-60">{r.extra}</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Heroes / Gear Details */}
              <div
                className="px-3 py-2 border-t flex flex-col gap-2"
                style={{ borderColor: `${player.color}20`, backgroundColor: `${player.color}0a` }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">Heroes</span>
                  <span className="text-[11px] font-mono font-bold text-white/60">{player.heroes?.length ?? 0}</span>
                </div>
                {player.heroes?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {player.heroes.map((h: any, i: number) => (
                      <div key={i} className={cn("text-[9px] px-1.5 py-0.5 rounded border text-center", h.abilityUsed ? "bg-black/40 text-white/30 border-white/10" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20")}>
                        {h.name}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">Gear</span>
                  <span className="text-[11px] font-mono font-bold text-white/60">{player.gear?.length ?? 0}</span>
                </div>
                {player.gear?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {player.gear.map((g: any, i: number) => (
                      <div key={i} className={cn("text-[9px] px-1.5 py-0.5 rounded border text-center", g.abilityUsed ? "bg-black/40 text-white/30 border-white/10" : "bg-blue-500/10 text-blue-400 border-blue-500/20")}>
                        {g.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function LobbyScreen({ gameState, myId, roomId, onStart }: {
  gameState: GameState;
  myId: string;
  roomId: string;
  onStart: () => void;
}) {
  const isHost = gameState.players[0]?.id === myId;
  const maxPlayers: number = (gameState as any).maxPlayers ?? 4;
  const filledSlots = gameState.players.length;
  const hasBot = gameState.players.some((p: any) => p.isBot);
  const canStart = isHost && filledSlots >= 1 && (filledSlots >= 2 || hasBot);

  const handleKick = (targetId: string) => {
    socket.emit("kick_player", { roomId, targetId });
  };

  const handleSetMax = (n: number) => {
    socket.emit("set_max_players", { roomId, maxPlayers: n });
  };

  const handleAddAI = () => {
    socket.emit("add_ai_player", { roomId });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <Castle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <h2 className="text-2xl font-black uppercase tracking-widest mb-1">Dungeon Lobby</h2>
        <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
          <span>Room:</span>
          <span className="font-mono font-bold text-white/70 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">{roomId}</span>
        </div>
      </div>

      {/* Main card */}
      <div className="bg-[#151619] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">

        {/* Host controls — room size */}
        {isHost && (
          <div className="px-6 py-4 border-b border-white/5 bg-emerald-500/5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-0.5">Room Size</div>
                <div className="text-xs text-white/40">Max players allowed to join</div>
              </div>
              <div className="flex gap-1">
                {[2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => handleSetMax(n)}
                    className={cn(
                      "w-9 h-9 rounded-xl font-bold text-sm transition-all border",
                      maxPlayers === n
                        ? "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/30"
                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Player list */}
        <div className="px-6 py-4 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/25 mb-3">
            Players — {filledSlots} / {maxPlayers}
          </div>

          {/* Filled slots */}
          {gameState.players.map((p, i) => {
            const isMe = p.id === myId;
            const isPlayerHost = i === 0;
            const isBot = (p as any).isBot;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white/3"
                style={{ borderColor: `${p.color}33`, backgroundColor: `${p.color}0a` }}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 text-sm font-bold truncate">
                  {p.name} {isMe && <span className="text-white/30 font-normal">(You)</span>}
                </span>
                {isBot && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded shrink-0">
                    🤖 AI
                  </span>
                )}
                {isPlayerHost && !isBot && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded shrink-0">
                    👑 Host
                  </span>
                )}
                {isHost && !isMe && (
                  <button
                    onClick={() => handleKick(p.id)}
                    className="text-[9px] font-bold uppercase tracking-wider text-red-400/70 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-2 py-1 rounded-lg transition-all shrink-0"
                  >
                    {isBot ? "Remove" : "Kick"}
                  </button>
                )}
              </motion.div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: maxPlayers - filledSlots }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-white/8"
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-white/10" />
              <span className="flex-1 text-sm text-white/20 italic">Waiting for player...</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 space-y-3">
          {isHost ? (
            <>
              {/* Add AI button */}
              {filledSlots < maxPlayers && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleAddAI}
                  className="w-full py-2.5 rounded-xl font-bold uppercase tracking-widest text-sm transition-all bg-purple-900/30 hover:bg-purple-800/40 text-purple-300 border border-purple-500/30 hover:border-purple-500/50"
                >
                  🤖 Add AI Opponent
                </motion.button>
              )}
              <motion.button
                whileHover={canStart ? { scale: 1.02 } : {}}
                whileTap={canStart ? { scale: 0.98 } : {}}
                onClick={onStart}
                disabled={!canStart}
                className={cn(
                  "w-full py-3.5 rounded-xl font-bold uppercase tracking-widest text-sm transition-all",
                  canStart
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
                    : "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                )}
              >
                {canStart ? "⚔ Start Dungeon" : `Waiting for players... (${filledSlots}/${maxPlayers})`}
              </motion.button>
              <p className="text-[10px] text-white/25 text-center">
                {hasBot ? "Playing vs AI. Add more humans or AI opponents to fill the room." : "Share the room code above to invite others, or add an AI opponent."}
              </p>
            </>
          ) : (
            <div className="text-center py-2">
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-sm text-white/40"
              >
                Waiting for the host to start...
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function GameOverScreen({ gameState, myId, roomId, playerName }: {
  gameState: GameState;
  myId: string;
  roomId: string;
  playerName: string;
}) {
  const [rematching, setRematching] = React.useState(false);
  const isSolo = gameState.players.length === 1;
  const sorted = [...gameState.players].sort((a, b) => b.gemstones - a.gemstones);
  const winner = sorted[0];
  const didWin = isSolo || (winner?.id === myId);
  const medals = ["🥇", "🥈", "🥉", "🏅"];

  const handleRematch = () => {
    setRematching(true);
    // Server will wipe the GAME_OVER room and create a fresh lobby;
    // the client stays connected and receives game_updated with the new LOBBY state.
    socket.emit("join_game", { roomId, playerName });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: didWin
          ? "radial-gradient(ellipse at 50% 20%, #78350f55 0%, #0a0502 60%)"
          : "radial-gradient(ellipse at 50% 20%, #7f1d1d44 0%, #0a0502 60%)"
      }}
    >
      {/* Ambient particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${4 + (i % 5) * 3}px`,
              height: `${4 + (i % 5) * 3}px`,
              left: `${(i * 37 + 7) % 100}%`,
              top: `${(i * 53 + 13) % 100}%`,
              backgroundColor: didWin ? `hsl(${40 + i * 12}, 90%, 65%)` : `hsl(${340 + i * 8}, 70%, 55%)`,
              opacity: 0.15 + (i % 4) * 0.07,
            }}
            animate={{ y: [0, -18, 0], opacity: [0.15, 0.35, 0.15] }}
            transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: i * 0.22, ease: "easeInOut" }}
          />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.93 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-lg"
      >
        {/* Main card */}
        <div
          className="rounded-3xl border overflow-hidden shadow-2xl"
          style={{
            background: "linear-gradient(160deg, #131316 0%, #0d0d0f 100%)",
            borderColor: didWin ? "#a16207aa" : "#991b1baa",
            boxShadow: didWin
              ? "0 0 80px #a1620730, 0 24px 60px #00000080"
              : "0 0 80px #991b1b30, 0 24px 60px #00000080",
          }}
        >
          {/* Hero banner */}
          <div
            className="px-8 pt-10 pb-8 text-center relative overflow-hidden"
            style={{
              background: didWin
                ? "linear-gradient(180deg, #78350f44 0%, transparent 100%)"
                : "linear-gradient(180deg, #7f1d1d44 0%, transparent 100%)",
            }}
          >
            {/* Decorative top line */}
            <div
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{
                background: didWin
                  ? "linear-gradient(90deg, transparent, #f59e0b, transparent)"
                  : "linear-gradient(90deg, transparent, #ef4444, transparent)"
              }}
            />

            <motion.div
              animate={{ rotate: [0, -4, 4, -2, 2, 0], scale: [1, 1.1, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="text-6xl mb-3 select-none"
            >
              {didWin ? "👑" : "💀"}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-4xl font-black uppercase tracking-widest mb-1"
              style={{ color: didWin ? "#fbbf24" : "#f87171" }}
            >
              {isSolo ? "Challenge End" : (didWin ? "Victory!" : "Defeated")}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-sm font-medium"
              style={{ color: didWin ? "#fef3c7bb" : "#fecacabb" }}
            >
              {isSolo
                ? `You finished the run with ${winner.gemstones} gemstones. Can you settle for more next time?`
                : (didWin
                  ? `${winner.name} planted the Flagpole and claimed the dungeon!`
                  : `${winner.name} claimed victory. Better luck next time.`)}
            </motion.p>
          </div>

          {/* Leaderboard */}
          <div className="px-6 pb-6 space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/25 mb-3 text-center">
              Final Standings
            </div>

            {sorted.map((p, i) => {
              const isMe = p.id === myId;
              const isWinner = i === 0;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.08 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all"
                  style={{
                    backgroundColor: isWinner ? `${p.color}14` : isMe ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                    borderColor: isWinner ? `${p.color}44` : isMe ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                    boxShadow: isWinner ? `0 0 20px ${p.color}18` : "none",
                  }}
                >
                  {/* Medal */}
                  <span className="text-xl w-7 text-center shrink-0">{medals[i] ?? "🏅"}</span>

                  {/* Player dot + name */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <span className={`font-bold text-sm truncate ${isWinner ? "text-white" : "text-white/60"}`}>
                      {p.name}
                    </span>
                    {isMe && (
                      <span className="text-[8px] font-bold bg-white/10 border border-white/15 text-white/40 px-1.5 py-0.5 rounded uppercase tracking-tight shrink-0">
                        You
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 shrink-0 text-[11px] font-mono">
                    <span className="flex items-center gap-1 text-red-400">
                      <Gem className="w-3 h-3" /> {p.gemstones}
                    </span>
                    <span className="text-white/30">
                      {p.tilesCount} <span className="text-white/20">tiles</span>
                    </span>
                    <span className="text-white/25">
                      {(p.heroes?.length ?? 0)}⚔
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="px-6 pb-8 flex gap-3">
            <motion.button
              whileHover={!rematching ? { scale: 1.03 } : {}}
              whileTap={!rematching ? { scale: 0.97 } : {}}
              onClick={handleRematch}
              disabled={rematching}
              className="flex-1 py-3.5 rounded-2xl font-bold uppercase tracking-widest text-sm transition-all border relative overflow-hidden"
              style={{
                background: didWin
                  ? "linear-gradient(135deg, #a16207, #78350f)"
                  : "linear-gradient(135deg, #1a3a5c, #0f2040)",
                borderColor: didWin ? "#f59e0b55" : "#3b82f655",
                color: didWin ? "#fef3c7" : "#93c5fd",
                boxShadow: didWin ? "0 4px 20px #a1620730" : "0 4px 20px #3b82f620",
                opacity: rematching ? 0.6 : 1,
              }}
            >
              {rematching ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    className="inline-block"
                  >⚔</motion.span>
                  Joining...
                </span>
              ) : "⚔ Rematch"}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => window.location.reload()}
              className="flex-1 py-3.5 rounded-2xl font-bold uppercase tracking-widest text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white/80 transition-all"
            >
              🏰 Exit to Menu
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode, label: string, value: number }) {
  return (
    <div className="bg-black/40 border border-white/5 p-3 rounded-xl flex items-center gap-3">
      {icon}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-white/30">{label}</div>
        <div className="text-sm font-mono font-bold">{value}</div>
      </div>
    </div>
  );
}

function TileView(props: { tile: Tile, players: any[], onClick: () => void, isSelected: boolean, isPendingWall?: boolean, isPendingDual?: boolean, key?: any }) {
  const { tile, players, onClick, isSelected, isPendingWall, isPendingDual } = props;
  const owner = players.find(p => p.id === tile.ownerId);
  const [hovered, setHovered] = React.useState(false);
  const tileRef = React.useRef<HTMLButtonElement>(null);
  const [tooltipPos, setTooltipPos] = React.useState({ top: 0, left: 0 });

  const getMonsterColor = (type: MonsterType | null) => {
    if (type === MonsterType.GOBLIN) return "#10b981";
    if (type === MonsterType.ORC) return "#f59e0b";
    if (type === MonsterType.GIANT) return "#3b82f6";
    if (type === MonsterType.DRAGON) return "#ef4444";
    if (type === MonsterType.DEMON_KING) return "#a855f7";
    return "#ffffff";
  };

  const getMonsterLabel = (type: MonsterType | null) => {
    if (type === MonsterType.GOBLIN) return "Goblin";
    if (type === MonsterType.ORC) return "Orc";
    if (type === MonsterType.GIANT) return "Giant";
    if (type === MonsterType.DRAGON) return "Dragon";
    if (type === MonsterType.DEMON_KING) return "Demon King";
    return "Monster";
  };

  const monsterColor = getMonsterColor(tile.monsterType);
  const hpPercent = tile.monsterMaxHP > 0 ? Math.max(0, (tile.monsterHP / tile.monsterMaxHP) * 100) : 0;

  return (
    <>
      <motion.button
        ref={tileRef}
        whileHover={{ scale: 1.05, zIndex: 10 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        onMouseEnter={(e) => {
          setTooltipPos({
            top: e.clientY - 12,
            left: e.clientX,
          });
          setHovered(true);
        }}
        onMouseMove={(e) => {
          if (hovered) {
            setTooltipPos({
              top: e.clientY - 12,
              left: e.clientX,
            });
          }
        }}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "w-8 h-8 md:w-12 md:h-12 rounded-sm flex items-center justify-center relative transition-all",
          owner ? "shadow-inner" : "bg-[#1a1c21] hover:bg-white/10",
          isSelected && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-black",
          isPendingWall && "ring-2 ring-amber-400 ring-offset-1 ring-offset-black brightness-125",
          isPendingDual && "ring-2 ring-yellow-400 ring-offset-1 ring-offset-black brightness-150",
          tile.id === 40 && "border-2 border-dashed border-yellow-500/50"
        )}
        style={{ backgroundColor: owner ? `${owner.color}44` : undefined, borderColor: owner ? owner.color : 'rgba(255,255,255,0.1)', borderWidth: owner ? '1px' : '0px' }}
      >
        {tile.structure === StructureType.GATE && <Castle className="w-4 h-4 md:w-6 md:h-6 text-white" />}
        {tile.structure === StructureType.WALL && <BrickWall className="w-4 h-4 md:w-6 md:h-6 text-white/80" />}
        {tile.structure === StructureType.MOAT && <Waves className="w-4 h-4 md:w-6 md:h-6 text-blue-400" />}
        {tile.structure === StructureType.BARRACKS && <Shield className="w-4 h-4 md:w-6 md:h-6 text-emerald-400" />}
        {tile.structure === StructureType.SMITHY && <Hammer className="w-4 h-4 md:w-6 md:h-6 text-stone-400" />}
        {tile.structure === StructureType.FLAGPOLE && <Flag className="w-4 h-4 md:w-6 md:h-6 text-yellow-500" />}

        {tile.occupiedByHeroId && !tile.structure && (
          <div className="absolute top-0.5 right-0.5">
            <User className="w-2 h-2 md:w-3 md:h-3 text-emerald-400" />
          </div>
        )}

        {/* Monster circle */}
        {tile.monsterType && (
          <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">
            <div className="absolute inset-0 bg-white rounded-full scale-110" />
            <div
              className="w-full h-full rounded-full flex items-center justify-center text-[8px] md:text-[10px] font-bold text-white shadow-lg"
              style={{ backgroundColor: monsterColor }}
            >
              {tile.monsterHP}
            </div>
          </div>
        )}

        {/* Fortification defense HP (opponent tile being chipped away, no monster) */}
        {!tile.monsterType && tile.monsterMaxHP > 0 && tile.ownerId && (
          <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">
            <div className="absolute inset-0 bg-white rounded-full scale-110" />
            <div
              className="w-full h-full rounded-full flex items-center justify-center text-[8px] md:text-[10px] font-bold text-white shadow-lg"
              style={{ backgroundColor: "#6366f1" }}
            >
              🛡{tile.monsterHP}
            </div>
          </div>
        )}

        {/* Liberated tile indicator: owned, no monster, not occupied */}
        {tile.ownerId && !tile.monsterType && !tile.isOccupied && (
          <div
            className="absolute top-0 left-0 w-3.5 h-3.5 flex items-center justify-center rounded-br-sm pointer-events-none z-10"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          >
            <span className="text-[8px] font-black leading-none" style={{ color: "#ef4444", textShadow: "0 0 4px #ef4444aa" }}>!</span>
          </div>
        )}

        {tile.ownerId && (
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundColor: owner?.color }} />
        )}
      </motion.button>

      <AnimatePresence>
        {hovered && tile.monsterType && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, x: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, scale: 0.92, x: "-50%" }}
            transition={{ duration: 0.1 }}
            className="pointer-events-none z-[9999]"
            style={{
              position: "fixed",
              top: tooltipPos.top - 12,
              left: tooltipPos.left,
              minWidth: "100px",
              translateY: "-100%", // Using translateY instead of transform string
            }}
          >
            <div
              className="rounded-lg px-2.5 py-2 shadow-2xl border text-center"
              style={{
                background: `linear-gradient(135deg, #0f0f12 60%, ${monsterColor}22)`,
                borderColor: `${monsterColor}55`,
                boxShadow: `0 4px 24px 0 ${monsterColor}33`
              }}
            >
              <div className="text-[10px] font-extrabold uppercase tracking-widest leading-none mb-1.5" style={{ color: monsterColor }}>
                {getMonsterLabel(tile.monsterType)}
              </div>
              <div className="text-[9px] font-mono font-bold text-white/70 mb-1.5">
                ❤ {tile.monsterHP} / {tile.monsterMaxHP}
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${hpPercent}%`, backgroundColor: monsterColor, boxShadow: `0 0 6px ${monsterColor}` }}
                />
              </div>
            </div>
            <div
              className="mx-auto w-2 h-2 rotate-45 -mt-1"
              style={{ backgroundColor: "#0f0f12", borderRight: `1px solid ${monsterColor}55`, borderBottom: `1px solid ${monsterColor}55` }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CardView(props: { card: Card, onSelect: () => void, disabled?: boolean, active?: boolean, spent?: boolean, key?: any }) {
  const { card, onSelect, disabled, active, spent } = props;

  const getRarityColor = (rarity: Rarity) => {
    if (rarity === Rarity.NORMAL) return "text-white/40";
    if (rarity === Rarity.EPIC) return "text-purple-400";
    if (rarity === Rarity.SPECIAL) return "text-orange-400";
    if (rarity === Rarity.LEGENDARY) return "text-yellow-400";
    return "text-white/40";
  };

  return (
    <motion.button
      whileHover={!disabled ? { y: -5 } : {}}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "aspect-[2/3] p-3 rounded-xl border text-left flex flex-col transition-all relative overflow-hidden",
        card.type === "HERO" ? "bg-emerald-900/20 border-emerald-500/30" : "bg-blue-900/20 border-blue-500/30",
        active && "ring-2 ring-white ring-offset-2 ring-offset-black",
        disabled && "opacity-50 grayscale cursor-not-allowed"
      )}
    >
      <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center text-[10px] font-bold text-red-600 shadow-md">
        {card.level}
      </div>

      <div className={cn("text-[8px] font-bold uppercase tracking-widest mb-1", getRarityColor(card.rarity))}>
        {card.rarity} {card.type}
      </div>
      <div className="font-bold text-xs mb-1 leading-tight">{card.name}</div>
      <div className="text-[9px] text-white/40 italic mb-2 line-clamp-1">{card.description}</div>
      <div className="text-[10px] text-white/70 leading-relaxed flex-1">{card.ability}</div>

      <div className="mt-2 flex items-center justify-between">
        <div className="text-[9px] font-bold bg-white/10 px-1.5 py-0.5 rounded text-white/60">
          {card.phase}
        </div>
        {spent !== undefined && (
          <div className={cn(
            "text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest",
            spent ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          )}>
            {spent ? "Spent" : "Ready"}
          </div>
        )}
      </div>
    </motion.button>
  );
}

function BonusCardView({ card, onPlay }: { card: any; onPlay: () => void; key?: any }) {
  return (
    <div className="aspect-[2/3] p-3 rounded-xl border border-yellow-500/40 bg-yellow-900/20 text-left flex flex-col relative overflow-hidden">
      {/* Gold shimmer accent */}
      <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent pointer-events-none" />

      <div className="text-[8px] font-bold uppercase tracking-widest mb-1 text-yellow-400/70">
        ⭐ Bonus Card
      </div>
      <div className="font-bold text-xs mb-1 leading-tight text-yellow-100">{card.name}</div>
      <div className="text-[9px] text-white/40 italic mb-2 line-clamp-1">{card.description}</div>
      <div className="text-[10px] text-white/70 leading-relaxed flex-1">{card.ability}</div>

      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="text-[9px] font-bold bg-yellow-500/10 px-1.5 py-0.5 rounded text-yellow-400/80 border border-yellow-500/20">
          Phase: {card.phase}
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onPlay}
          className="text-[8px] font-bold bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-300 border border-yellow-500/40 px-2 py-1 rounded uppercase tracking-widest transition-all"
        >
          Play
        </motion.button>
      </div>
    </div>
  );
}

function ActionButton(props: { action: any, onClick: () => void, disabled?: boolean, active?: boolean, me?: any, key?: any }) {
  const { action, onClick, disabled, active, me } = props;

  let costLabel = `Cost: ${action.cost} Gems`;
  if (action.id.includes("summon") && me) {
    costLabel = `Cost: ${action.cost} Gems + ${me.summonCountThisRound} Mana`;
  }

  // Determine if this action grants a stockpileable resource and what the player currently holds
  const resourceInfo: { key: string; label: string; color: string; icon: string } | null = (() => {
    if (action.reward?.wood != null) return { key: "wood", label: "Wood", color: "#d97706", icon: "🌲" };
    if (action.reward?.clay != null) return { key: "clay", label: "Clay", color: "#b45309", icon: "🧱" };
    if (action.reward?.stone != null) return { key: "stone", label: "Stone", color: "#94a3b8", icon: "⛰" };
    if (action.reward?.mana != null) return { key: "mana", label: "Mana", color: "#60a5fa", icon: "⚡" };
    return null;
  })();

  const currentStock = resourceInfo && me ? (me[resourceInfo.key] ?? 0) : null;
  const pendingReward = resourceInfo
    ? (action.reward[resourceInfo.key] ?? 0)
    : null;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-3 rounded-xl border text-left transition-all relative overflow-hidden group flex flex-col gap-1.5",
        active ? "bg-emerald-500 border-emerald-400 text-black" : "bg-white/5 border-white/10 hover:bg-white/10",
        disabled && "opacity-30 cursor-not-allowed grayscale"
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-tighter opacity-50">{costLabel}</div>
      <div className="text-xs font-bold leading-tight">{action.label}</div>

      {/* Resource accumulation badge */}
      {resourceInfo && currentStock !== null && pendingReward !== null && (
        <div className="flex items-center justify-between mt-0.5 gap-1">
          {/* Current stock */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold font-mono"
            style={{
              color: resourceInfo.color,
              borderColor: `${resourceInfo.color}44`,
              backgroundColor: `${resourceInfo.color}15`,
            }}
          >
            <span>{resourceInfo.icon}</span>
            <span>{currentStock}</span>
          </div>
          {/* Pending reward */}
          <div
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[9px] font-bold font-mono"
            style={{
              color: "#ffffff",
              borderColor: `${resourceInfo.color}55`,
              backgroundColor: `${resourceInfo.color}20`,
            }}
          >
            <span className="text-[8px] opacity-60">+</span>
            <span>{pendingReward}</span>
          </div>
        </div>
      )}

      {action.used && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-red-500 rotate-12 border border-red-500 px-2">Used</span>
        </div>
      )}
    </button>
  );
}


// ── Rulebook ──────────────────────────────────────────────────────────────────
function RuleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-yellow-400 text-sm font-bold uppercase tracking-[0.2em] mb-3 pb-2 border-b border-yellow-500/20">
        {title}
      </h2>
      <div className="space-y-2 text-white/70 text-[13px] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function RuleRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      {label && <span className="text-yellow-300/80 font-bold min-w-[150px] shrink-0">{label}</span>}
      <span>{children}</span>
    </div>
  );
}

function Rulebook({ onClose }: { onClose: () => void }) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          className="w-full max-w-3xl bg-[#12110f] border border-yellow-500/20 rounded-2xl shadow-2xl my-8"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-[#12110f] border-b border-yellow-500/20 px-8 py-5 flex items-center justify-between rounded-t-2xl">
            <div className="flex items-center gap-3">
              <Scroll className="w-6 h-6 text-yellow-400" />
              <h1 className="text-xl font-bold uppercase tracking-widest text-yellow-400">Dungeon Gacha — Rulebook</h1>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none transition-colors">×</button>
          </div>

          {/* Body */}
          <div className="px-8 py-6">

            <RuleSection title="🏰 Overview">
              <p><strong className="text-white">Dungeon Gacha</strong> is a competitive strategy game for <strong className="text-white">1–4 players</strong>. Each player is a Dungeon Master racing to claim the center of a shared <strong className="text-white">9×9 dungeon floor</strong>, build a Flagpole there, and win a final bidding war. Players expand by defeating monsters, constructing fortifications, summoning heroes, and equipping powerful gear.</p>
            </RuleSection>

            <RuleSection title="⚔️ Board Setup">
              <p className="mb-3">The dungeon is a <strong className="text-white">9×9 grid</strong> (81 tiles). Tile 40 (row 4, col 4) is the <strong className="text-white">center tile</strong> — home to the Demon King and the only place a Flagpole can be built.</p>
              <RuleRow label="Monster placement">Monsters spawn by Chebyshev distance from center:</RuleRow>
              <div className="ml-2 mt-1 mb-3 space-y-0.5">
                <div className="flex gap-4"><span className="text-yellow-300/70 w-28">Distance 0</span><span>Demon King — <strong className="text-white">22 HP</strong></span></div>
                <div className="flex gap-4"><span className="text-yellow-300/70 w-28">Distance 1</span><span>Dragon — <strong className="text-white">14 HP</strong></span></div>
                <div className="flex gap-4"><span className="text-yellow-300/70 w-28">Distance 2</span><span>Giant — <strong className="text-white">8 HP</strong></span></div>
                <div className="flex gap-4"><span className="text-yellow-300/70 w-28">Distance 3</span><span>Orc — <strong className="text-white">5 HP</strong></span></div>
                <div className="flex gap-4"><span className="text-yellow-300/70 w-28">Distance 4+</span><span>Goblin — <strong className="text-white">2 HP</strong></span></div>
              </div>
              <RuleRow label="Starting positions">Each player begins with <strong className="text-white">3 claimed tiles</strong> along one board edge. Starting tiles cannot be reclaimed by monsters.</RuleRow>
              <RuleRow label="Starting resources">6 Gemstones · 0 Mana · 0 Wood · 0 Clay · 0 Stone</RuleRow>
            </RuleSection>

            <RuleSection title="🔄 Round Structure">
              <p className="mb-2">Each round follows these five steps in order:</p>
              <div className="space-y-1 ml-2">
                <div className="flex gap-2"><span className="text-yellow-400 font-bold w-6">1.</span><span><strong className="text-white">Income Collection</strong> — earn Gemstones based on tiles controlled</span></div>
                <div className="flex gap-2"><span className="text-yellow-400 font-bold w-6">2.</span><span><strong className="text-white">Preparation Phase</strong> — claim action spaces to build, summon, and gather resources</span></div>
                <div className="flex gap-2"><span className="text-yellow-400 font-bold w-6">3.</span><span><strong className="text-white">Attack Phase</strong> — use heroes and gear to defeat monsters and assault enemies</span></div>
                <div className="flex gap-2"><span className="text-yellow-400 font-bold w-6">4.</span><span><strong className="text-white">Monster Reclamation</strong> — unoccupied, unfortified tiles are retaken by new monsters</span></div>
                <div className="flex gap-2"><span className="text-yellow-400 font-bold w-6">5.</span><span><strong className="text-white">End of Round</strong> — reset hero abilities, tick down occupation tokens, advance round counter</span></div>
              </div>
            </RuleSection>

            <RuleSection title="💰 Step 1 — Income Collection">
              <p className="mb-2">At the start of each round, earn Gemstones based on tiles you control:</p>
              <div className="ml-2 space-y-0.5 mb-3">
                <div className="flex gap-4"><span className="text-yellow-300/70 w-20">3–5 tiles</span><span>×4 Gems per tile</span></div>
                <div className="flex gap-4"><span className="text-yellow-300/70 w-20">6–10 tiles</span><span>×3 Gems per tile</span></div>
                <div className="flex gap-4"><span className="text-yellow-300/70 w-20">11–17 tiles</span><span>×2 Gems per tile</span></div>
                <div className="flex gap-4"><span className="text-yellow-300/70 w-20">18+ tiles</span><span>×1 Gem per tile</span></div>
              </div>
              <RuleRow label="Gem bonuses">Tax Box gear: +1 gem/tile · Golden Compass: +5 gems if you hold a corner · Trove hero: +4 gems/Prep · Zale hero: +2 gems if adjacent to a Moat</RuleRow>
              <RuleRow label="Projected income">Your income for next round is shown as a <span className="text-green-400">+X next</span> badge on the resource bar.</RuleRow>
            </RuleSection>

            <RuleSection title="🎯 Step 2 — Preparation Phase">
              <p className="mb-2">Players take turns claiming <strong className="text-white">Action Spaces</strong>. Each space can only be used once per round. On your turn, choose one.</p>
              <div className="space-y-1 mb-3">
                <RuleRow label="Purchase Lumber">6 Gems → 4 Wood (unclaimed spaces stack +4 Wood each round)</RuleRow>
                <RuleRow label="Purchase Clay">6 Gems → 1 Clay (stacks +1/round)</RuleRow>
                <RuleRow label="Purchase Stone">6 Gems → 1 Stone (stacks +1/round)</RuleRow>
                <RuleRow label="Generate Mana">3 Gems per Mana — spend any amount</RuleRow>
                <RuleRow label="Build Wall">2 Wood — place a Wall on an adjacent owned tile</RuleRow>
                <RuleRow label="Dig Moat">5 Gems — place a Moat on an adjacent owned tile</RuleRow>
                <RuleRow label="Build Barracks">6 Wood + 2 Clay — holds 3 heroes; required after your 1st summon</RuleRow>
                <RuleRow label="Summon Hero">8 Gems + escalating Mana (see Heroes) — draw from hand, choose 1</RuleRow>
                <RuleRow label="Build Smithy">1 Clay + 2 Stone — required to create gear</RuleRow>
                <RuleRow label="Create Gear">8 Gems + Smithy owned — draw from hand, equip 1 gear card</RuleRow>
                <RuleRow label="Build Flagpole">Free — only available after the center tile is cleared; triggers Bidding War</RuleRow>
              </div>
              <RuleRow label="Secondary spaces">With 3+ players, extra slots unlock for Summon, Gear, Stone, and Lumber to prevent bottlenecks.</RuleRow>
              <RuleRow label="Stacking tip">Resources on unclaimed spaces accumulate each round — letting an opponent claim a space early means you collect a larger stack later.</RuleRow>
            </RuleSection>

            <RuleSection title="🦸 Heroes & Summoning">
              <RuleRow label="First summon">Your very first summon ever is <strong className="text-white">free</strong> — no Gem cost, no Mana, no Barracks needed.</RuleRow>
              <RuleRow label="Subsequent summons">Cost 8 Gems + escalating Mana: 2nd summon = 1 Mana, 3rd = 2 Mana, 4th = 3 Mana, etc. — resets each round.</RuleRow>
              <RuleRow label="Barracks capacity">Each Barracks holds <strong className="text-white">3 heroes</strong>. You cannot summon beyond your capacity (except via Mercenary Contract).</RuleRow>
              <RuleRow label="Levelling up">Summoning a hero you already own <strong className="text-white">upgrades it to Level 2</strong> instead of adding a copy — boosting damage or effect significantly.</RuleRow>
              <RuleRow label="Deck refresh">After every 6th hero summoned, draw 6 new cards (with at least 1 Epic guaranteed).</RuleRow>
              <RuleRow label="10th summon bonus">Every 10th total summon rewards a random <strong className="text-white">Special Hero</strong> (Ignis, Seraphina, Mordecai, or Goliath) if Barracks space is available.</RuleRow>
              <RuleRow label="Ready / Spent">Green = hero can act this turn. Red = ability already used. All heroes reset at the start of each Preparation Phase.</RuleRow>
              <RuleRow label="Occupation">Heroes with an Occupy ability place a token on a tile instead of dealing damage — that tile counts as yours and is protected from monster reclamation.</RuleRow>
              <p className="mt-2 font-bold text-white/80 text-[12px] uppercase tracking-wider">Hero Roster</p>
              <div className="mt-1 space-y-0.5 text-[12px]">
                <p className="text-white/50 italic mb-1">Normal Heroes (deal 1–2 dmg or utility; Level 2 improves effect)</p>
                <RuleRow label="Ash">1 dmg to adjacent monster (Lv2: 2)</RuleRow>
                <RuleRow label="Brog">2 dmg to adjacent monster (Lv2: 3)</RuleRow>
                <RuleRow label="Kael">1 dmg to <em>any</em> monster on the board</RuleRow>
                <RuleRow label="Dax">+2 bonus dmg vs Giants, Dragons, and Demon King</RuleRow>
                <RuleRow label="Slink">Steal 2 gems from an adjacent player</RuleRow>
                <RuleRow label="Lina">Next hero attack deals +1 damage (then resets)</RuleRow>
                <RuleRow label="Orion">Swap positions of any 2 monsters on the board</RuleRow>
                <RuleRow label="Tess">Reveal HP of all monsters in a 3×3 area</RuleRow>
                <RuleRow label="Niles">Gain 3 gems when an adjacent monster is defeated</RuleRow>
                <RuleRow label="Eliza / Mura / Pip">Occupy 1 tile (Pip ignores Moats)</RuleRow>
                <RuleRow label="Vera">Refresh another hero’s spent ability (Prep)</RuleRow>
                <RuleRow label="Cora">Enemies attacking this tile must spend +1 Mana (Prep)</RuleRow>
                <RuleRow label="Finley">Reduce wall build cost by 1 Wood this round (Prep)</RuleRow>
                <RuleRow label="Grog">Gain 1 Stone if occupying a cleared tile (Prep)</RuleRow>
                <RuleRow label="Boff">Repair a destroyed structure for 1 Wood (Prep)</RuleRow>
                <RuleRow label="Bryn">Gain 1 Stone at start of each Prep Phase</RuleRow>
                <RuleRow label="Zale">Gain 2 gems if adjacent to a Moat (Prep)</RuleRow>
                <p className="text-white/50 italic mt-2 mb-1">Epic Heroes (stronger baseline; guaranteed in first draw)</p>
                <RuleRow label="Azul / Night">4 dmg to adjacent monster (Lv2: 6)</RuleRow>
                <RuleRow label="Trove">Gain 4 Gemstones each Prep Phase</RuleRow>
                <RuleRow label="Ewud">Build one free Wall (Prep)</RuleRow>
                <RuleRow label="Alcie">Convert 1 resource into 1 each of the other 3 types (Prep)</RuleRow>
                <p className="text-white/50 italic mt-2 mb-1">Legendary Hero</p>
                <RuleRow label="Hero of the Dungeon">5 dmg to <em>each</em> of 2 adjacent monsters simultaneously (Lv2: 8)</RuleRow>
                <p className="text-white/50 italic mt-2 mb-1">Special Heroes (awarded at 10th summon)</p>
                <RuleRow label="Ignis">6 dmg + build a free Wall on that tile (Lv2: 8)</RuleRow>
                <RuleRow label="Seraphina">Spend 1 Mana → occupy 2 non-adjacent cleared tiles</RuleRow>
                <RuleRow label="Mordecai">7 dmg; if monster survives, stun it (+2 dmg on next hit) (Lv2: 12)</RuleRow>
                <RuleRow label="Goliath">Occupy 3 orthogonally adjacent tiles at once</RuleRow>
              </div>
            </RuleSection>

            <RuleSection title="⚙️ Gear & Smithy">
              <RuleRow label="Requirement">You must own a <strong className="text-white">Smithy</strong> to create gear. Cost: 8 Gems per card.</RuleRow>
              <RuleRow label="Deck refresh">After every 6th gear card created, draw 6 new cards.</RuleRow>
              <p className="mt-2 font-bold text-white/80 text-[12px] uppercase tracking-wider">Offensive Gear</p>
              <div className="mt-1 space-y-0.5 text-[12px]">
                <RuleRow label="Iron Longsword">+1 damage to one attack</RuleRow>
                <RuleRow label="Heavy Crossbow">3 damage to a monster up to 2 tiles away</RuleRow>
                <RuleRow label="Fire Bomb">2 damage to target + all adjacent monsters</RuleRow>
                <RuleRow label="Slayer’s Axe">+3 damage vs Orcs or Giants</RuleRow>
                <RuleRow label="Poison Dagger">Target takes 1 damage at end of this round and next</RuleRow>
                <RuleRow label="War Horn">All your heroes deal +1 damage this Attack Phase</RuleRow>
                <RuleRow label="Spiked Knuckles">2 damage; gain 2 gems if monster dies</RuleRow>
                <RuleRow label="Lance">3 damage if a hero moved into this tile this turn</RuleRow>
                <RuleRow label="Magic Wand">2 damage, spending 1 Mana instead of an action</RuleRow>
                <RuleRow label="Ballista">Place on a Wall; auto-deals 2 damage to monsters in line of sight</RuleRow>
              </div>
              <p className="mt-2 font-bold text-white/80 text-[12px] uppercase tracking-wider">Defensive & Utility Gear</p>
              <div className="mt-1 space-y-0.5 text-[12px]">
                <RuleRow label="Tower Shield">Your occupying hero cannot be removed by Dragon/Demon effects</RuleRow>
                <RuleRow label="Monster Bait">Move an adjacent monster to your current tile</RuleRow>
                <RuleRow label="Plated Boots">Your hero may occupy a Moat tile</RuleRow>
                <RuleRow label="Spyglass">Look at the top 3 cards of the Hero Deck (Prep)</RuleRow>
                <RuleRow label="Mining Pick">Spend 1 Mana → gain 2 Stone (Prep)</RuleRow>
                <RuleRow label="Trowel">Spend 1 Mana → gain 2 Clay (Prep)</RuleRow>
                <RuleRow label="Lumber Axe">Spend 1 Mana → gain 3 Wood (Prep)</RuleRow>
                <RuleRow label="Medkit">Reset one hero’s or gear’s ability immediately</RuleRow>
                <RuleRow label="Caltrops">Monsters reclaiming your tiles start with −2 HP</RuleRow>
                <RuleRow label="Reinforced Bricks">Your Walls require +2 additional damage to breach</RuleRow>
              </div>
              <p className="mt-2 font-bold text-white/80 text-[12px] uppercase tracking-wider">Economic & Strategic Gear</p>
              <div className="mt-1 space-y-0.5 text-[12px]">
                <RuleRow label="Merchant’s Scale">Trade resources 1:1 with the bank once per turn (Prep)</RuleRow>
                <RuleRow label="Golden Compass">Gain 5 gems if you occupy a corner tile (Prep)</RuleRow>
                <RuleRow label="Mana Ring">Gain 1 Mana at start of each Attack Phase</RuleRow>
                <RuleRow label="Contract">Reduce your next hero summon cost by 3 gems (Prep)</RuleRow>
                <RuleRow label="Smithy Tools">Reduce your next gear creation cost by 3 gems (Prep)</RuleRow>
                <RuleRow label="Tax Box">Gain +1 gem per controlled tile during Income (Prep)</RuleRow>
                <RuleRow label="Blueprints">Build any structure without using an Action Space (Prep)</RuleRow>
                <RuleRow label="Pouch of Holding">Carry up to 5 unused Mana into the next round (Prep)</RuleRow>
                <RuleRow label="Bribe Letter">Pay 5 gems to skip a monster and immediately occupy its tile</RuleRow>
                <RuleRow label="King’s Decree">+10 to your bid value in the Bidding War</RuleRow>
              </div>
            </RuleSection>

            <RuleSection title="🗡 Step 3 — Attack Phase">
              <p className="mb-2">Players take turns activating hero and gear abilities. Each hero may act <strong className="text-white">once per turn</strong>.</p>
              <RuleRow label="Attacking monsters">Choose a hero → click an adjacent monster tile. Reduce its HP by the hero’s damage. At 0 HP: claim the tile and earn <strong className="text-white">3 Gems</strong>.</RuleRow>
              <RuleRow label="Adjacency rule">You can only target tiles orthogonally adjacent to tiles you already control.</RuleRow>
              <RuleRow label="Mana attacks">Spend Mana directly for damage: 1 Mana = 1 damage to an adjacent monster. Useful for finishing off tough monsters.</RuleRow>
              <RuleRow label="Attacking enemy tiles">Enemy tiles have a <strong className="text-white">Defense Pool</strong> based on structures:</RuleRow>
              <div className="ml-2 mt-1 mb-2 space-y-0.5 text-[12px]">
                <div className="flex gap-3"><span className="text-yellow-300/70 w-36">Base (no structure)</span><span>2 HP</span></div>
                <div className="flex gap-3"><span className="text-yellow-300/70 w-36">Wall (Level 1)</span><span>8 HP (10 with Reinforced Bricks)</span></div>
                <div className="flex gap-3"><span className="text-yellow-300/70 w-36">Wall (Level 2)</span><span>12 HP (14 with Reinforced Bricks)</span></div>
                <div className="flex gap-3"><span className="text-yellow-300/70 w-36">Moat (Level 1)</span><span>10 HP</span></div>
                <div className="flex gap-3"><span className="text-yellow-300/70 w-36">Moat (Level 2)</span><span>14 HP</span></div>
                <div className="flex gap-3"><span className="text-yellow-300/70 w-36">Gate</span><span>Cannot be damaged — bypass with 4 Mana</span></div>
              </div>
              <RuleRow label="Capture reward">Successfully depleting a tile’s Defense Pool earns <strong className="text-white">+5 Gems</strong> and transfers ownership.</RuleRow>
              <RuleRow label="Damage modifiers">Iron Longsword +1 · Slayer’s Axe +3 vs Orcs/Giants · Dax +2 vs Giants+ · War Horn +1 all heroes this phase · Lina buff +1 next attack · Stun (Mordecai) +2 on stunned target · Poison: 1 dmg/round for 2 rounds</RuleRow>
              <RuleRow label="Bonus Card trigger">Earn 1 Bonus Card if you defeat <strong className="text-white">3+ monsters</strong> OR capture <strong className="text-white">3+ enemy tiles</strong> in one Attack Phase (max 1 card per phase).</RuleRow>
              <RuleRow label="! Liberated tiles">A red <strong className="text-red-400">!</strong> badge marks tiles you own with no structure and no occupying hero — these <strong className="text-white">will be reclaimed</strong> at end of round. Fortify them or station an Occupy-ability hero.</RuleRow>
            </RuleSection>

            <RuleSection title="⭐ Bonus Cards">
              <RuleRow label="How to earn">Defeat 3+ monsters OR capture 3+ enemy tiles in one Attack Phase. Max 1 per phase. All Bonus Cards are free to play.</RuleRow>
              <div className="mt-2 space-y-1">
                <RuleRow label="Mercenary Contract">Summon 1 hero free (0 Gems, 0 Mana), ignoring Barracks limit.</RuleRow>
                <RuleRow label="Reinforced Caravan">Instantly gain 4 Wood, 2 Clay, and 1 Stone.</RuleRow>
                <RuleRow label="Hidden Cache">Gain 15 Gemstones — powerful Bidding War trump card.</RuleRow>
                <RuleRow label="Siege Engineering">Build a free Wall or Moat on a cleared tile, no Action Space needed.</RuleRow>
                <RuleRow label="Monster Tamer">Instantly defeat an adjacent monster — claim tile and earn 3 Gems, no damage roll needed.</RuleRow>
                <RuleRow label="Forced Occupation">Place an Occupation Token on any cleared, unowned tile. Counts as your territory for 2 rounds, then expires.</RuleRow>
              </div>
            </RuleSection>

            <RuleSection title="🏗 Structures">
              <div className="space-y-1">
                <RuleRow label="Wall 🧱">Build: 2 Wood. Defense: +6 HP (Level 2: +10). Upgrade with 1 Stone. Reinforced Bricks gear adds +2 HP per tier.</RuleRow>
                <RuleRow label="Moat 🌊">Build: 5 Gems. Defense: +8 HP (Level 2: +12). Most heroes cannot pass through or occupy a Moat (exception: Pip, Plated Boots).</RuleRow>
                <RuleRow label="Barracks 🛡">Build: 6 Wood + 2 Clay. Holds 3 heroes. Required for hero capacity beyond your 1st free summon.</RuleRow>
                <RuleRow label="Smithy 🔨">Build: 1 Clay + 2 Stone. Required to use the Create Gear action.</RuleRow>
                <RuleRow label="Gate 🏰">Indestructible by heroes. Enemies must spend 4 Mana to bypass it.</RuleRow>
                <RuleRow label="Flagpole 🚩">Built only on the cleared center tile. Instantly triggers the Bidding War endgame.</RuleRow>
              </div>
            </RuleSection>

            <RuleSection title="🏆 Endgame — Bidding War">
              <p className="mb-2">The game ends when any player builds the <strong className="text-white">Flagpole</strong> on the cleared center tile. This triggers the <strong className="text-white">Bidding War</strong>.</p>
              <RuleRow label="How to qualify">You must have at least <strong className="text-white">3 Wood + 1 Stone</strong>. Without them, your bid is disqualified.</RuleRow>
              <RuleRow label="Bid value">Your total current Gemstones. King’s Decree gear adds <strong className="text-white">+10</strong> to your bid.</RuleRow>
              <RuleRow label="Winner">Highest valid bid wins the game. Tiebreaker: most raw Gemstones, then earliest player index.</RuleRow>
              <RuleRow label="No valid bids">If no player meets the minimum requirement, the Bidding War fails, the Flagpole is removed, and the game continues.</RuleRow>
              <p className="mt-2 text-white/50 text-[11px]">Strategy: Hoard resources near endgame. A surprise Hidden Cache (+15 Gems) can flip the result. King’s Decree is most valuable if held until the final bid.</p>
            </RuleSection>

            <RuleSection title="🤖 Solo Mode">
              <RuleRow label="Objective">Play against AI opponents. Build the Flagpole before Round 20, or score the most Gemstones when time runs out.</RuleRow>
              <RuleRow label="AI bots">Bots are named Grim, Zara, Vex, Nix, Dusk, Mora, Kade, and Lyra. They draft, build, and attack intelligently.</RuleRow>
              <RuleRow label="Round limit">After Round 20, the game ends automatically and your final Gemstone count is your score.</RuleRow>
            </RuleSection>

            <RuleSection title="📋 Quick Reference">
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[12px]">
                <RuleRow label="Board">9×9 grid (81 tiles)</RuleRow>
                <RuleRow label="Starting tiles">3 per player</RuleRow>
                <RuleRow label="Starting gems">6</RuleRow>
                <RuleRow label="Monster kill">+3 Gems</RuleRow>
                <RuleRow label="Enemy capture">+5 Gems</RuleRow>
                <RuleRow label="Free 1st summon">Always (no cost)</RuleRow>
                <RuleRow label="Barracks capacity">3 heroes each</RuleRow>
                <RuleRow label="Summon mana cost">+1 Mana per extra summon/round</RuleRow>
                <RuleRow label="Deck refresh">Every 6 heroes or gear cards</RuleRow>
                <RuleRow label="10th summon bonus">1 random Special Hero</RuleRow>
                <RuleRow label="Bonus Card trigger">3+ kills or 3+ captures in Attack Phase</RuleRow>
                <RuleRow label="Poison damage">1 per round for 2 rounds</RuleRow>
                <RuleRow label="Stun bonus">+2 on next attack</RuleRow>
                <RuleRow label="Bidding War entry">3 Wood + 1 Stone minimum</RuleRow>
                <RuleRow label="Solo round limit">20 rounds</RuleRow>
              </div>
            </RuleSection>

          </div>

          <div className="px-8 py-4 border-t border-yellow-500/10 flex justify-end rounded-b-2xl">
            <button
              onClick={onClose}
              className="bg-yellow-900/30 hover:bg-yellow-800/50 text-yellow-400 border border-yellow-500/30 font-bold px-6 py-2 rounded-xl transition-all uppercase tracking-widest text-xs"
            >
              Close Rulebook
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

