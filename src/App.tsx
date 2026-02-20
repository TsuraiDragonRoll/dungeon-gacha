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

  useEffect(() => {
    socket.on("game_updated", (state: GameState) => {
      setGameState(state);
    });
    return () => {
      socket.off("game_updated");
    };
  }, []);

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

    if (actionId.includes("wall") || actionId.includes("moat") || actionId.includes("barracks") || actionId.includes("smithy")) {
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

  const handleTileClick = (tileId: number) => {
    if (gameState.status === Phase.ATTACK) {
      if (selectedCard) {
        socket.emit("attack_tile", { roomId, tileId, heroId: selectedCard });
        setSelectedCard(null);
      } else {
        setSelectedTile(tileId);
      }
    } else if (selectedAction) {
      const action = gameState.actionSpaces.find(a => a.id === selectedAction);
      if (action?.reward.structure) {
        socket.emit("prep_action", { roomId, actionId: selectedAction, tileId });
        setSelectedAction(null);
      }
    } else {
      setSelectedTile(tileId);
    }
  };

  const handleCardClick = (cardId: string) => {
    if (gameState?.status === Phase.ATTACK) {
      setSelectedCard(cardId);
    } else if (selectedAction && (selectedAction.includes("summon") || selectedAction.includes("gear"))) {
      socket.emit("prep_action", { roomId, actionId: selectedAction, cardId });
      setSelectedAction(null);
      setSelectedCard(null);
    }
  };

  const handleEndTurn = () => {
    socket.emit("end_turn", roomId);
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
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-sans">
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
        {showRulebook && <Rulebook onClose={() => setShowRulebook(false)} />}
      </div>
    );
  }

  if (!gameState) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Summoning game state...</div>;

  const me = gameState.players.find(p => p.id === socket.id);
  const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.id === socket.id;

  return (
    <div className="min-h-screen bg-[#0a0502] text-white flex flex-col md:flex-row font-sans selection:bg-emerald-500/30">
      {/* Sidebar: Stats & Logs */}
      <div className="w-full md:w-80 bg-[#151619] border-r border-white/5 flex flex-col h-screen">
        <div className="p-6 border-bottom border-white/5">
          <div className="flex items-center gap-2 mb-6">
            <Castle className="w-6 h-6 text-emerald-500" />
            <span className="font-bold tracking-tighter text-xl uppercase">Dungeon Floor {gameState.round}</span>
          </div>

          {me && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <StatCard icon={<Gem className="w-4 h-4 text-red-500" />} label="Gems" value={me.gemstones} />
                <StatCard icon={<Zap className="w-4 h-4 text-blue-400" />} label="Mana" value={me.mana} />
                <StatCard icon={<Trees className="w-4 h-4 text-amber-600" />} label="Wood" value={me.wood} />
                <StatCard icon={<Mountain className="w-4 h-4 text-stone-400" />} label="Stone" value={me.stone} />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Dungeon Masters</h3>
          {gameState.players.map((p, i) => (
            <div key={p.id} className={cn(
              "p-3 rounded-xl border transition-all",
              i === gameState.currentPlayerIndex ? "bg-white/5 border-white/20" : "bg-transparent border-transparent opacity-60"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-medium">{p.name} {p.id === socket.id && "(You)"}</span>
                  {p.finishedPrep && <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-white/40 uppercase tracking-tighter">Done</span>}
                </div>
                <span className="text-xs font-mono text-white/40">{p.tilesCount} tiles</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 bg-black/40 border-t border-white/5 h-48 overflow-y-auto">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2">Chronicles</h3>
          {gameState.logs.slice(-10).reverse().map((log, i) => (
            <p key={i} className="text-[11px] text-white/50 mb-1 leading-relaxed">
              <span className="text-emerald-500 mr-1">»</span> {log}
            </p>
          ))}
        </div>
      </div>

      {/* Main Area: Board & Controls */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header / Phase Info */}
        <div className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#151619]/50 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-widest">
              {gameState.status}
            </div>
            <span className="text-sm text-white/40">
              {isMyTurn ? "Your Turn - Make your move" : `${gameState.players[gameState.currentPlayerIndex]?.name}'s Turn`}
            </span>
          </div>

          {isMyTurn && gameState.status === Phase.ATTACK && (
            <button
              onClick={handleEndTurn}
              className="flex items-center gap-2 bg-white text-black px-4 py-1.5 rounded-full text-xs font-bold hover:bg-emerald-400 transition-colors"
            >
              Confirm Turn <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center p-8 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1a1c21] to-[#0a0502]">
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
            <div className="text-center">
              <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6 animate-bounce" />
              <h2 className="text-4xl font-bold mb-4 uppercase tracking-widest">Victory!</h2>
              <div className="space-y-4 mb-8">
                {gameState.players.sort((a, b) => b.gemstones - a.gemstones).map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between gap-8 bg-white/5 p-4 rounded-xl border border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-white/20">#{i + 1}</span>
                      <span className="font-bold">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1 text-red-500 font-mono"><Gem className="w-4 h-4" /> {p.gemstones}</span>
                      <span className="text-white/40 text-xs">{p.tilesCount} tiles</span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => window.location.reload()} className="px-8 py-3 bg-emerald-600 rounded-xl font-bold uppercase tracking-widest hover:bg-emerald-500 transition-all">
                Play Again
              </button>
            </div>
          ) : gameState.status === Phase.LOBBY ? (
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Waiting for Masters...</h2>
              <p className="text-white/40 mb-8">{gameState.players.length} / 4 players joined</p>
              {gameState.players.length >= 2 && (
                <button onClick={handleStart} className="px-8 py-3 bg-emerald-600 rounded-xl font-bold uppercase tracking-widest hover:bg-emerald-500 transition-all">
                  Start Game
                </button>
              )}
            </div>
          ) : gameState.status === Phase.DRAFTING ? (
            <div className="w-full max-w-4xl">
              <h2 className="text-center text-xl font-bold mb-2 uppercase tracking-widest">Draft your Arsenal</h2>
              <div className="flex justify-center gap-4 mb-8">
                <div className={cn(
                  "px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all",
                  me?.draftedHero ? "bg-emerald-500/20 border-emerald-500 text-emerald-500" : "bg-white/5 border-white/10 text-white/30"
                )}>
                  Hero {me?.draftedHero ? "✓" : "Needed"}
                </div>
                <div className={cn(
                  "px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all",
                  me?.draftedGear ? "bg-blue-500/20 border-blue-500 text-blue-500" : "bg-white/5 border-white/10 text-white/30"
                )}>
                  Gear {me?.draftedGear ? "✓" : "Needed"}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {me?.draftHand.map(card => (
                  <CardView
                    key={card.id}
                    card={card}
                    onSelect={() => handleDraft(card.id)}
                    disabled={me.ready || (card.type === "HERO" && me.draftedHero) || (card.type === "GEAR" && me.draftedGear)}
                  />
                ))}
              </div>
              {me?.ready && <p className="text-center mt-8 text-emerald-500 animate-pulse">Waiting for other players...</p>}
            </div>
          ) : (
            <div className="relative group">
              <div className="grid grid-cols-9 gap-1 bg-white/5 p-1 rounded-lg border border-white/10 shadow-2xl">
                {gameState.board.map((tile, i) => (
                  <TileView
                    key={i}
                    tile={tile}
                    players={gameState.players}
                    onClick={() => handleTileClick(i)}
                    isSelected={selectedTile === i}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Panel: Actions / Hand */}
        <div className="h-64 border-t border-white/5 bg-[#151619] p-6 flex gap-6 overflow-x-auto">
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
                  Attack ({manaAmount * 2} DMG)
                </button>
              </div>
            </div>
          )}

          {gameState.status === Phase.PREPARATION && (
            <div className="w-48 flex flex-col gap-3 pr-6 border-r border-white/5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30">Prep Status</h3>
              <button
                onClick={handleFinishPrep}
                disabled={me?.finishedPrep}
                className={cn(
                  "w-full py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all",
                  me?.finishedPrep ? "bg-white/5 text-white/20 border border-white/5" : "bg-red-600/20 hover:bg-red-600/30 text-red-500 border border-red-500/30"
                )}
              >
                {me?.finishedPrep ? "Prep Finished" : "Finish Prep"}
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

          <div className="w-80 flex flex-col">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-4">Drafted Hand</h3>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {me?.draftedCards.map(c => (
                <CardView
                  key={c.id}
                  card={c}
                  onSelect={() => handleCardClick(c.id)}
                  disabled={!selectedAction || (!selectedAction.includes("summon") && c.type === "HERO") || (!selectedAction.includes("gear") && c.type === "GEAR")}
                />
              ))}
              {me?.draftedCards.length === 0 && <p className="text-[10px] text-white/20 italic">No cards left in hand.</p>}
            </div>
          </div>

          {(gameState.status === Phase.PREPARATION || gameState.status === Phase.ATTACK) && (
            <div className="w-80 flex flex-col">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-4">Active Heroes & Gear</h3>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {[...(me?.heroes || []), ...(me?.gear || [])].map(item => (
                  <CardView
                    key={item.id}
                    card={item}
                    onSelect={() => handleCardClick(item.id)}
                    active={selectedCard === item.id}
                    disabled={gameState.status === Phase.ATTACK && !!item.abilityUsed}
                    spent={!!item.abilityUsed}
                  />
                ))}
              </div>
            </div>
          )}

          {me && me.bonusCards && me.bonusCards.length > 0 && (
            <div className="w-80 flex flex-col">
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
    </div>
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

function TileView(props: { tile: Tile, players: any[], onClick: () => void, isSelected: boolean, key?: any }) {
  const { tile, players, onClick, isSelected } = props;
  const owner = players.find(p => p.id === tile.ownerId);

  const getMonsterColor = (type: MonsterType | null) => {
    if (type === MonsterType.GOBLIN) return "#10b981";
    if (type === MonsterType.ORC) return "#f59e0b";
    if (type === MonsterType.GIANT) return "#3b82f6";
    if (type === MonsterType.DRAGON) return "#ef4444";
    if (type === MonsterType.DEMON_KING) return "#a855f7";
    return "#ffffff";
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05, zIndex: 10 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "w-8 h-8 md:w-12 md:h-12 rounded-sm flex items-center justify-center relative transition-all",
        owner ? "shadow-inner" : "bg-[#1a1c21] hover:bg-white/10",
        isSelected && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-black",
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

      {tile.monsterType && (
        <div className="relative w-6 h-6 md:w-8 md:h-8 flex items-center justify-center">
          <div className="absolute inset-0 bg-white rounded-full scale-110" />
          <div
            className="w-full h-full rounded-full flex items-center justify-center text-[8px] md:text-[10px] font-bold text-white shadow-lg"
            style={{ backgroundColor: getMonsterColor(tile.monsterType) }}
          >
            {tile.monsterHP}
          </div>
        </div>
      )}

      {tile.ownerId && (
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundColor: owner?.color }} />
      )}
    </motion.button>
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

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "p-3 rounded-xl border text-left transition-all relative overflow-hidden group",
        active ? "bg-emerald-500 border-emerald-400 text-black" : "bg-white/5 border-white/10 hover:bg-white/10",
        disabled && "opacity-30 cursor-not-allowed grayscale"
      )}
    >
      <div className="text-[10px] font-bold uppercase tracking-tighter opacity-50 mb-1">{costLabel}</div>
      <div className="text-xs font-bold leading-tight">{action.label}</div>
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
              <p>Dungeon Gacha is a <strong className="text-white">2–4 player</strong> strategic dungeon conquest game played on a <strong className="text-white">9×9 grid</strong>. Players start on opposite edges and expand by defeating monsters, building structures, summoning heroes, and equipping gear. The first player to clear the centre tile and win the <strong className="text-white">Flagpole Bidding War</strong> becomes the Dungeon Gacha Champion.</p>
            </RuleSection>

            <RuleSection title="⚔️ Setup & Drafting">
              <RuleRow label="Players">2–4 Dungeon Masters. Each starts with 3 tiles along one board edge and 6 Gemstones.</RuleRow>
              <RuleRow label="Starting tiles">The centre of your 3 tiles has a Gate. The flanking two are empty owned tiles.</RuleRow>
              <RuleRow label="Drafting phase">Each player receives 6 Hero cards. Pick one, pass the hand clockwise, repeat until all cards are gone. All card types flow through the same draft.</RuleRow>
              <RuleRow label="Drafted hand">Cards you draft sit in your Drafted Hand and can later be Summoned (heroes) or Created as Gear during Preparation phases.</RuleRow>
              <RuleRow label="Refilling">When your Drafted Hand empties after a summon/create action, you automatically draw 6 new cards from the deck.</RuleRow>
            </RuleSection>

            <RuleSection title="🔄 Game Phases">
              <p className="mb-2">Each round alternates between two phases:</p>
              <RuleRow label="Preparation">Players take turns selecting one action from the shared Action Spaces. Click <em>Finish Prep</em> when done with all desired actions for the round.</RuleRow>
              <RuleRow label="Attack">Players take turns using heroes or mana to attack monsters or enemy tiles. Click <em>Confirm Turn</em> when finished.</RuleRow>
              <p className="mt-2 text-white/50 text-[11px]">Resources on unclaimed action spaces accumulate each round they go uncollected — a deliberate tempo trap.</p>
            </RuleSection>

            <RuleSection title="💰 Resources">
              <RuleRow label="Gemstones 💎">Main currency. Earned as tile-scaled income each round. Used to pay for all action spaces.</RuleRow>
              <RuleRow label="Mana ⚡">Used for repeated summons, mana attacks, and capturing enemy tiles. Generated via Mana action spaces (2 Gems → 1 Mana).</RuleRow>
              <RuleRow label="Wood 🌲">Required: Walls (2W), Barracks (6W + 2C), and Bidding War entry (3W).</RuleRow>
              <RuleRow label="Clay">Required: Barracks (2C), Smithy (1C + 2S).</RuleRow>
              <RuleRow label="Stone ⛰">Required: Smithy (2S), Bidding War entry (1S).</RuleRow>
              <RuleRow label="Income scale">3–5 tiles: ×4 Gems · 6–10: ×3 · 11–17: ×2 · 18+: ×1 Gem per tile</RuleRow>
            </RuleSection>

            <RuleSection title="🎯 Action Spaces (Preparation)">
              <RuleRow label="Purchase Lumber">6 Gems → 4 Wood (stacks +4 each unclaimed round)</RuleRow>
              <RuleRow label="Purchase Clay">6 Gems → 1 Clay (stacks +1/round)</RuleRow>
              <RuleRow label="Purchase Stone">6 Gems → 1 Stone (stacks +1/round)</RuleRow>
              <RuleRow label="Generate Mana">2 Gems → 1 Mana (choose quantity with slider)</RuleRow>
              <RuleRow label="Build Wall">10 Gems + 2 Wood → place Wall on designated owned tile</RuleRow>
              <RuleRow label="Dig Moat">5 Gems → place Moat on designated owned tile</RuleRow>
              <RuleRow label="Build Barracks">10 Gems + 6 Wood + 2 Clay → each Barracks holds 3 heroes</RuleRow>
              <RuleRow label="Summon Hero">8 Gems + N Mana (N = summons done this round) → pull a hero from Drafted Hand. Your very first ever summon bypasses both the Mana cost and Barracks requirement.</RuleRow>
              <RuleRow label="Build Smithy">10 Gems + 1 Clay + 2 Stone → unlocks Create Gear action</RuleRow>
              <RuleRow label="Create Gear">8 Gems + owned Smithy → equip a Gear card from Drafted Hand</RuleRow>
              <RuleRow label="Build Flagpole">Free — only unlocked once centre tile (40) is cleared. Triggers the Bidding War immediately.</RuleRow>
            </RuleSection>

            <RuleSection title="🏗 Structures">
              <RuleRow label="Gate 🏰">Your starting structure. Indestructible. Costs attacker +4 Mana to capture.</RuleRow>
              <RuleRow label="Wall 🧱">Costs attacker +3 Mana (Stone Wall upgrade: +5 Mana).</RuleRow>
              <RuleRow label="Moat 🌊">Costs attacker +4 Mana (upgraded: +6 Mana).</RuleRow>
              <RuleRow label="Barracks 🛡">Each holds 3 heroes. You must have free Barracks capacity before summoning a 2nd+ hero (first summon ever is free).</RuleRow>
              <RuleRow label="Smithy 🔨">Required to use the Create Gear action.</RuleRow>
              <RuleRow label="Flagpole 🚩">Placed at the board centre by the triggering player. Initiates the Bidding War.</RuleRow>
            </RuleSection>

            <RuleSection title="🦸 Heroes">
              <RuleRow label="Summoning">Use Summon Hero action. Your first-ever summon is free of Barracks & Mana requirements. Each additional summon this round costs +1 Mana.</RuleRow>
              <RuleRow label="Using in battle">During Attack phase: select a Ready hero from Active Heroes, then click a target tile.</RuleRow>
              <RuleRow label="Ready / Spent">A green Ready badge means the hero can attack. Red Spent means they've already acted this round. Abilities reset at start of each Preparation phase.</RuleRow>
              <RuleRow label="Occupy ability">Heroes with "Occupy" in their ability text can hold tiles, preventing monster reclamation at round end.</RuleRow>
              <RuleRow label="Levelling">Drafting the same hero name a second time upgrades their existing card to Level 2, boosting their damage or effect.</RuleRow>
              <RuleRow label="10th summon bonus">Every 10 total hero summons awards a bonus Special Hero if Barracks space is available.</RuleRow>
            </RuleSection>

            <RuleSection title="⚙️ Gear">
              <RuleRow label="Creating">Create Gear action space + a Smithy on your territory. Pull a Gear card from your Drafted Hand into active slots.</RuleRow>
              <RuleRow label="Offensive">Iron Longsword (+1 dmg), Heavy Crossbow (3 dmg at range), Slayer's Axe (+3 vs Orcs/Giants), War Horn (+1 all heroes this phase), and more.</RuleRow>
              <RuleRow label="Defensive / Utility">Tower Shield (protect occupying hero), Monster Bait (reposition monsters), Plated Boots (ignore Moats), Medkit (refresh a hero ability).</RuleRow>
              <RuleRow label="Economic">Contract (–3 Gem summon cost), Smithy Tools (–3 Gem gear cost), Tax Box (+1 Gem per tile/round), Mana Ring (+1 Mana per Attack phase), Merchant's Scale (trade any resource 1:1 once/turn).</RuleRow>
              <RuleRow label="Strategic">King's Decree (+10 Gem value in Bidding War), Pouch of Holding (carry 5 unused Mana to next round), Bribe Letter (skip a monster tile for 5 Gems).</RuleRow>
            </RuleSection>

            <RuleSection title="⭐ Bonus Cards">
              <RuleRow label="Earning">Defeat your <strong className="text-white">3rd monster tile</strong> OR capture your <strong className="text-white">3rd enemy tile</strong> in one Attack phase. Maximum 1 Bonus Card earned per Attack phase.</RuleRow>
              <RuleRow label="Cost">Free — no Gems required to play.</RuleRow>
              <div className="mt-3 space-y-1">
                <RuleRow label="Mercenary Contract">Prep. Summon 1 hero from your Drafted Hand for free (0 Gems, 0 Mana), ignoring Barracks limit. Select the hero card first.</RuleRow>
                <RuleRow label="Reinforced Caravan">Prep. Instantly gain 4 Wood, 2 Clay, and 1 Stone.</RuleRow>
                <RuleRow label="Hidden Cache">Prep. Gain 15 Gemstones. Great surprise for Bidding War.</RuleRow>
                <RuleRow label="Siege Engineering">Prep. Click a tile you own, then play — builds a free Wall or Moat, uses no Action Space.</RuleRow>
                <RuleRow label="Monster Tamer">Attack (your turn). Click an adjacent monster tile, then play — defeats it instantly and awards the tile and 3 Gems.</RuleRow>
                <RuleRow label="Forced Occupation">Attack (your turn). Click any cleared, unoccupied tile on the board, then play — places a 2-round token counting as your territory.</RuleRow>
              </div>
            </RuleSection>

            <RuleSection title="🗡 Combat">
              <RuleRow label="Monster attacks">Select a monster tile → click a Ready hero → hero deals damage. If HP hits 0 you claim the tile (+3 Gems).</RuleRow>
              <RuleRow label="Mana attacks">Select a monster tile → set Mana amount → click Attack. Each Mana = 2 damage.</RuleRow>
              <RuleRow label="Enemy tiles">Click an adjacent enemy tile (your turn). Costs 2 Mana base (+more for Walls/Moats/Gates). You claim the tile (+5 Gems from the old owner).</RuleRow>
              <RuleRow label="Adjacency rule">You can only target tiles immediately next to (orthogonally adjacent to) tiles you already control.</RuleRow>
              <RuleRow label="Monster HP">Goblin 2 · Orc 5 · Giant 8 · Dragon 14 · Demon King 22. Stronger monsters ring the centre.</RuleRow>
              <RuleRow label="Reclamation">At round end, unoccupied, structureless non-starting tiles revert to random monsters.</RuleRow>
            </RuleSection>

            <RuleSection title="🏆 Victory — Bidding War">
              <p>Once centre tile 40 has no monsters, any player may use <strong className="text-white">Build Flagpole</strong> on their Preparation turn to trigger the Bidding War.</p>
              <div className="mt-2 space-y-1">
                <RuleRow label="Entry requirement">3 Wood and 1 Stone minimum. Without these your bid is disqualified.</RuleRow>
                <RuleRow label="Bid value">All current Gemstones + 10 bonus if you hold King's Decree.</RuleRow>
                <RuleRow label="Winner">Highest valid bid. Ties broken by raw Gemstone count, then player ID. Winner plants the Flagpole and claims the title.</RuleRow>
              </div>
            </RuleSection>

            <RuleSection title="💡 Strategy Tips">
              <p>• Build a Barracks early — after your first free summon you cannot recruit more heroes without Barracks capacity.</p>
              <p>• Unclaimed action spaces stack resources. Let opponents bleed Gems taking spaces early; collect a fat Wood stack later for free.</p>
              <p>• Mana is the scarcest resource. Save it for fortified enemy tiles or sequential hero summons, not routine monster clearing.</p>
              <p>• Aggressively clear 3 monsters per Attack phase to farm Bonus Cards — they are some of the strongest plays in the game.</p>
              <p>• Hidden Cache (15 Gems) can swing a Bidding War. Hold it as a trump card and reveal it at the last moment.</p>
              <p>• Occupy-ability heroes lock tiles against monster reclamation — essential for holding deep, structureless territory.</p>
              <p>• Always keep 3 Wood and 1 Stone on hand. The Bidding War can trigger without warning.</p>
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

