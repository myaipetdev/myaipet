/**
 * Deterministic, server-side battle simulation.
 *
 * Extracted from /api/battle/create so the Arena (PvP result) and PvE endpoints
 * can resolve outcomes on the server instead of trusting a client-reported
 * `won`/`turns`/`hp_left` (audit C4/C5). Given the same combatant stats + seed,
 * the result is reproducible.
 */

import crypto from "crypto";

export interface BattleLogEntry {
  turn: number;
  actor: "you" | "them";
  dmg: number;
  their_hp: number;
  your_hp: number;
  crit?: boolean;
  miss?: boolean;
}

export interface SimulationResult {
  won: boolean;
  turns: number;
  player_hp_left: number;
  opponent_hp_left: number;
  player_hp_max: number;
  opponent_hp_max: number;
  log: BattleLogEntry[];
}

export interface Combatant {
  atk: number;
  def: number;
  spd: number;
  level: number;
  name?: string;
  /** Optional explicit max HP (e.g. tuned PvE boss HP). Falls back to the
   *  def/level formula when omitted. */
  hpMax?: number;
}

/** Deterministic 0..1 PRNG from a seed string (used for combat randomness). */
export function seededRng(seed: string): () => number {
  const h = crypto.createHash("sha256").update(seed).digest();
  let state = h.readUInt32LE(0);
  return () => {
    // xorshift32
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function defaultHpMax(c: Combatant): number {
  return 50 + c.def * 2 + c.level * 5;
}

export function simulateBattle(
  player: Combatant,
  opponent: Combatant,
  seed: string,
): SimulationResult {
  const rng = seededRng(seed);
  const playerHpMax = player.hpMax ?? defaultHpMax(player);
  const opponentHpMax = opponent.hpMax ?? defaultHpMax(opponent);
  let playerHp = playerHpMax;
  let opponentHp = opponentHpMax;
  const log: BattleLogEntry[] = [];
  let turn = 0;
  const playerFirst = player.spd >= opponent.spd;

  while (playerHp > 0 && opponentHp > 0 && turn < 50) {
    turn++;
    const actor: "you" | "them" = (playerFirst ? turn % 2 === 1 : turn % 2 === 0) ? "you" : "them";
    const rngRoll = rng();
    const multiplier = 0.7 + rngRoll * 0.6;   // 0.7..1.3
    const crit = rngRoll > 0.95;
    const miss = rngRoll < 0.05;
    if (actor === "you") {
      const raw = player.atk - opponent.def * 0.5;
      const dmg = miss ? 0 : Math.max(1, Math.round(raw * (crit ? 1.6 : multiplier)));
      opponentHp = Math.max(0, opponentHp - dmg);
      log.push({ turn, actor, dmg, their_hp: opponentHp, your_hp: playerHp, ...(crit && { crit: true }), ...(miss && { miss: true }) });
    } else {
      const raw = opponent.atk - player.def * 0.5;
      const dmg = miss ? 0 : Math.max(1, Math.round(raw * (crit ? 1.6 : multiplier)));
      playerHp = Math.max(0, playerHp - dmg);
      log.push({ turn, actor, dmg, their_hp: opponentHp, your_hp: playerHp, ...(crit && { crit: true }), ...(miss && { miss: true }) });
    }
  }

  return {
    won: opponentHp <= 0 && playerHp > 0,
    turns: turn,
    player_hp_left: playerHp,
    opponent_hp_left: opponentHp,
    player_hp_max: playerHpMax,
    opponent_hp_max: opponentHpMax,
    log,
  };
}
