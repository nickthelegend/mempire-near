// SPDX-License-Identifier: MIT
//! Rust port of `packages/sim/src/bot.ts`: the deterministic house bot. The arena runs it inside
//! the referee replay for the house seat, so a house never sends a transaction during a match and
//! cannot play anything the published bot would not.

use crate::sim::*;

#[derive(Clone, Copy)]
struct Diff {
    act_every: i64,
    save_to: i64,
}
const DIFFS: [Diff; 3] = [
    Diff { act_every: 56, save_to: 9 * FP },
    Diff { act_every: 24, save_to: 7 * FP },
    Diff { act_every: 8, save_to: 5 * FP },
];
const DEFEND_PREF: [u8; 5] = [SPLASH, RANGED, SWARM, TANK, SUPPORT];
const ATTACK_PREF: [u8; 5] = [TANK, SUPPORT, RANGED, SPLASH, SWARM];

struct HandCard {
    deck_index: u8,
    arch: u8,
    cost: i64,
}

fn hand_of(s: &SimState, player: usize) -> [HandCard; 4] {
    let p = &s.players[player];
    core::array::from_fn(|i| {
        let deck_index = p.cycle[i];
        let card = p.deck[deck_index as usize];
        HandCard { deck_index, arch: card.archetype, cost: ARCHETYPES[card.archetype as usize].elixir * FP }
    })
}

fn pick_by_pref(hand: &[HandCard; 4], pref: &[u8; 5], elixir: i64) -> Option<(u8, u8)> {
    for a in pref {
        if let Some(c) = hand.iter().find(|h| h.arch == *a && h.cost <= elixir) {
            return Some((c.deck_index, c.arch));
        }
    }
    None
}

fn spell_target(s: &SimState, player: u8) -> Option<(i64, i64)> {
    let enemies: Vec<&Unit> = s.units.iter().filter(|u| u.owner != player && u.hp > 0).collect();
    for c in &enemies {
        let near: Vec<&&Unit> = enemies.iter().filter(|e| fp_dist(c.x, c.y, e.x, e.y) <= 2560).collect();
        if near.len() >= 3 {
            let (sx, sy) = near.iter().fold((0i64, 0i64), |(x, y), e| (x + e.x, y + e.y));
            let n = near.len() as i64;
            return Some((floor_div(sx, n), floor_div(sy, n)));
        }
    }
    None
}

/// `difficulty`: 0 easy, 1 normal, 2 hard.
pub fn decide_bot(s: &SimState, player: u8, difficulty: u8) -> Option<Input> {
    let cfg = DIFFS[core::cmp::min(difficulty, 2) as usize];
    if s.phase == PHASE_ENDED || s.tick % cfg.act_every != 0 {
        return None;
    }
    let pi = player as usize;
    let elixir = s.players[pi].elixir;
    let hand = hand_of(s, pi);
    let ev = |deck_index: u8, x: i64, y: i64| Input {
        tick: (s.tick + INPUT_DELAY_TICKS) as u32,
        player,
        deck_index,
        x: x as i32,
        y: y as i32,
    };

    // 1. spell on a fat cluster
    if let Some(spell) = hand.iter().find(|h| h.arch == SPELL && h.cost <= elixir) {
        if let Some((x, y)) = spell_target(s, player) {
            return Some(ev(spell.deck_index, x, y));
        }
    }

    // 2. defend if invaded
    let on_our_half = |u: &Unit| if player == 0 { u.y < RIVER_TOP } else { u.y > RIVER_BOT };
    let mut threats: Vec<&Unit> = s.units.iter().filter(|u| u.owner != player && u.hp > 0 && on_our_half(u)).collect();
    threats.sort_by(|a, b| {
        let depth = if player == 0 { a.y.cmp(&b.y) } else { b.y.cmp(&a.y) };
        depth.then(a.id.cmp(&b.id))
    });
    if let Some(threat) = threats.first() {
        return match pick_by_pref(&hand, &DEFEND_PREF, elixir) {
            Some((deck_index, _)) => {
                let home_y = if player == 0 { 2560 } else { ARENA_H - 2560 };
                let off = if home_y > threat.y { 1536 } else { -1536 };
                let y = (threat.y + off).clamp(512, ARENA_H - 512);
                Some(ev(deck_index, threat.x, y))
            }
            None => None,
        };
    }

    // 3. reinforce an active push
    let pusher = s.units.iter().find(|u| {
        u.owner == player && u.hp > 0 && if player == 0 { u.y > RIVER_TOP - 5120 } else { u.y < RIVER_BOT + 5120 }
    });
    let enemy_base = if player == 0 { 3 } else { 0 };
    let left = &s.towers[enemy_base];
    let right = &s.towers[enemy_base + 1];
    let stage_y = if player == 0 { RIVER_TOP - 2048 } else { RIVER_BOT + 2048 };
    let back = if player == 0 { -2048 } else { 2048 };
    if let Some(p) = pusher {
        let lane = if p.x < 9216 { 0 } else { 1 };
        return pick_by_pref(&hand, &ATTACK_PREF, elixir).map(|(d, _)| ev(d, BRIDGE_X[lane], stage_y + back));
    }

    // 4. open a fresh push once saved up
    if elixir < cfg.save_to {
        return None;
    }
    let lane = if left.hp <= 0 {
        0
    } else if right.hp <= 0 {
        1
    } else if left.hp <= right.hp {
        0
    } else {
        1
    };
    let (d, arch) = pick_by_pref(&hand, &ATTACK_PREF, elixir)?;
    let y = if arch == TANK { stage_y } else { stage_y + back };
    Some(ev(d, BRIDGE_X[lane], y))
}
