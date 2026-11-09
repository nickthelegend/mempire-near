// SPDX-License-Identifier: MIT
//! A line-for-line Rust port of `packages/sim` (the TypeScript lockstep engine).
//!
//! Every number is an integer and every division that can see a negative numerator uses
//! `floor_div`, because the TypeScript engine uses `Math.floor` (round toward minus infinity)
//! while Rust's `/` truncates toward zero. The parity test (`tests/parity.rs`) replays matches
//! recorded by the TypeScript engine and compares the state hash every 40 ticks.

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};

pub const FP: i64 = 1024;
pub const TICKS_PER_SEC: i64 = 20;
pub const HAND_SIZE: usize = 4;
pub const DECK_SIZE: usize = 8;
pub const INPUT_DELAY_TICKS: i64 = 2;

pub const ARENA_W: i64 = 18432;
pub const ARENA_H: i64 = 32768;
pub const RIVER_TOP: i64 = 15360;
pub const RIVER_BOT: i64 = 17408;
pub const RIVER_MID: i64 = 16384;
pub const BRIDGE_X: [i64; 2] = [3584, 14848];
pub const BRIDGE_HALF_W: i64 = 922;
const UNIT_RADIUS: i64 = 358;
const TOWER_RADIUS_PRINCESS: i64 = 1024;
const TOWER_RADIUS_KING: i64 = 1434;
const SPELL_TOWER_DAMAGE_PCT: i64 = 40;
const SPAWN_OFFSETS: [(i64, i64); 5] = [(0, 0), (614, 0), (-614, 0), (0, 614), (0, -614)];

pub const TANK: u8 = 0;
pub const SWARM: u8 = 1;
pub const RANGED: u8 = 2;
pub const SPLASH: u8 = 3;
pub const SUPPORT: u8 = 4;
pub const SPELL: u8 = 5;

pub const META_MAX_BPS: i64 = 1500;
const AURA_SPEED_NUM: i64 = 100;
const AURA_SPEED_DEN: i64 = 115;

struct Princess;
impl Princess {
    const HP: i64 = 1500;
    const DAMAGE: i64 = 95;
    const HIT_TICKS: i64 = 16;
    const RANGE: i64 = 7168;
}
struct King;
impl King {
    const HP: i64 = 2400;
    const DAMAGE: i64 = 105;
    const HIT_TICKS: i64 = 20;
    const RANGE: i64 = 7168;
}

/// Timing and elixir rules. `id` 0 = standard (3 min + 60 s overtime), 1 = rush (30 s).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Format {
    pub regulation_ticks: i64,
    pub overtime_ticks: i64,
    pub double_elixir_at: i64,
    pub elixir_per_tick_fp: i64,
    pub elixir_cap_fp: i64,
    pub start_elixir_fp: i64,
}

pub const STANDARD: Format = Format {
    regulation_ticks: 3600,
    overtime_ticks: 1200,
    double_elixir_at: 2400,
    elixir_per_tick_fp: 18,
    elixir_cap_fp: 10240,
    start_elixir_fp: 5120,
};
pub const RUSH: Format = Format {
    regulation_ticks: 600,
    overtime_ticks: 0,
    double_elixir_at: 9007199254740991,
    elixir_per_tick_fp: 56,
    elixir_cap_fp: 10240,
    start_elixir_fp: 7168,
};

pub fn format_of(id: u8) -> Format {
    if id == 0 {
        STANDARD
    } else {
        RUSH
    }
}
/// The last tick a match of this format can reach (regulation plus overtime).
pub fn max_ticks(id: u8) -> i64 {
    let f = format_of(id);
    f.regulation_ticks + f.overtime_ticks
}

#[derive(Clone, Copy)]
pub struct ArchetypeDef {
    pub hp: i64,
    pub damage: i64,
    pub hit_ticks: i64,
    pub range: i64,
    pub aggro: i64,
    pub speed: i64,
    pub elixir: i64,
    pub count: i64,
    pub splash: i64,
    pub spell_delay: i64,
    pub aura: i64,
}

pub const ARCHETYPES: [ArchetypeDef; 6] = [
    ArchetypeDef { hp: 1400, damage: 150, hit_ticks: 30, range: 1228, aggro: 5632, speed: 46, elixir: 4, count: 1, splash: 0, spell_delay: 0, aura: 0 },
    ArchetypeDef { hp: 190, damage: 45, hit_ticks: 22, range: 921, aggro: 5632, speed: 92, elixir: 3, count: 4, splash: 0, spell_delay: 0, aura: 0 },
    ArchetypeDef { hp: 320, damage: 110, hit_ticks: 28, range: 5120, aggro: 6144, speed: 61, elixir: 3, count: 1, splash: 0, spell_delay: 0, aura: 0 },
    ArchetypeDef { hp: 520, damage: 140, hit_ticks: 36, range: 3276, aggro: 5632, speed: 51, elixir: 4, count: 1, splash: 1638, spell_delay: 0, aura: 0 },
    ArchetypeDef { hp: 450, damage: 55, hit_ticks: 26, range: 1433, aggro: 5120, speed: 56, elixir: 3, count: 1, splash: 0, spell_delay: 0, aura: 3072 },
    ArchetypeDef { hp: 0, damage: 320, hit_ticks: 0, range: 0, aggro: 0, speed: 0, elixir: 4, count: 0, splash: 2560, spell_delay: 20, aura: 0 },
];

/// Trait per-mille multipliers: hp, damage, hit ticks, speed, range (Swift, Brutal, Stalwart,
/// Relentless, Farsighted, Ironclad).
const TRAITS: [[i64; 5]; 6] = [
    [860, 1000, 1000, 1220, 1000],
    [1000, 1240, 1180, 1000, 1000],
    [1280, 880, 1000, 1000, 1000],
    [1000, 870, 800, 1000, 1000],
    [850, 1000, 1000, 1000, 1220],
    [1120, 1100, 1000, 830, 1000],
];

#[inline]
pub fn floor_div(a: i64, b: i64) -> i64 {
    let q = a / b;
    if (a % b != 0) && ((a < 0) != (b < 0)) {
        q - 1
    } else {
        q
    }
}

#[inline]
fn clamp(v: i64, lo: i64, hi: i64) -> i64 {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

/// Integer square root, the same Newton iteration as `fixed.ts`.
pub fn isqrt(n: i64) -> i64 {
    if n < 0 {
        return 0;
    }
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[inline]
pub fn fp_dist(ax: i64, ay: i64, bx: i64, by: i64) -> i64 {
    let dx = ax - bx;
    let dy = ay - by;
    isqrt(dx * dx + dy * dy)
}

#[inline]
fn apply_pm(base: i64, pm: i64) -> i64 {
    floor_div(base * pm, 1000)
}

/// Level is always 1 in this port, so the level multiplier is 1000 per mille.
pub fn scale_stat(base: i64, bps: i64) -> i64 {
    let b = clamp(bps, -META_MAX_BPS, META_MAX_BPS);
    floor_div(base * 1000 * (10_000 + b), 10_000_000)
}

pub fn effective_def(archetype: u8, trait_: u8) -> ArchetypeDef {
    let def = ARCHETYPES[archetype as usize];
    if archetype == SPELL {
        return def;
    }
    let t = TRAITS[trait_ as usize];
    ArchetypeDef {
        hp: apply_pm(def.hp, t[0]),
        damage: apply_pm(def.damage, t[1]),
        hit_ticks: core::cmp::max(1, apply_pm(def.hit_ticks, t[2])),
        speed: apply_pm(def.speed, t[3]),
        range: apply_pm(def.range, t[4]),
        ..def
    }
}

/// keccak256(ticker) as a big-endian integer, mod 6: the card's permanent trait.
pub fn bytes_mod(bytes: &[u8], n: u32) -> u8 {
    let mut acc: u32 = 0;
    for b in bytes {
        acc = (acc * 256 + *b as u32) % n;
    }
    acc as u8
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Card {
    pub archetype: u8,
    pub trait_: u8,
    pub meta_bps: i16,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Input {
    pub tick: u32,
    pub player: u8,
    pub deck_index: u8,
    pub x: i32,
    pub y: i32,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Unit {
    pub id: i64,
    pub owner: u8,
    pub archetype: u8,
    pub trait_: u8,
    pub attacking: bool,
    pub x: i64,
    pub y: i64,
    pub hp: i64,
    pub max_hp: i64,
    pub cooldown: i64,
    pub target_unit: i64,
    pub target_tower: i64,
    pub meta_bps: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Tower {
    pub owner: u8,
    pub king: bool,
    pub x: i64,
    pub y: i64,
    pub hp: i64,
    pub cooldown: i64,
    pub awake: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Spell {
    pub owner: u8,
    pub x: i64,
    pub y: i64,
    pub explode_tick: i64,
    pub meta_bps: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Player {
    pub elixir: i64,
    pub deck: [Card; 8],
    pub cycle: [u8; 8],
}

pub const PHASE_REGULATION: u8 = 0;
pub const PHASE_OVERTIME: u8 = 1;
pub const PHASE_ENDED: u8 = 2;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct SimState {
    pub tick: i64,
    pub phase: u8,
    pub format: u8,
    /// -1 undecided, -2 draw, else seat.
    pub winner: i64,
    pub units: Vec<Unit>,
    pub towers: Vec<Tower>,
    pub spells: Vec<Spell>,
    pub players: [Player; 2],
    pub next_unit_id: i64,
    pub rng_state: u32,
}

struct XorShift32(u32);
impl XorShift32 {
    fn new(seed: u32) -> Self {
        XorShift32(if seed == 0 { 0x9e3779b9 } else { seed })
    }
    fn next(&mut self) -> u32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        x
    }
}

fn shuffled_cycle(rng: &mut XorShift32) -> [u8; 8] {
    let mut c = [0u8, 1, 2, 3, 4, 5, 6, 7];
    let mut i = 7usize;
    while i > 0 {
        let j = (rng.next() % (i as u32 + 1)) as usize;
        c.swap(i, j);
        i -= 1;
    }
    c
}

pub fn create_match(seed: u32, decks: [[Card; 8]; 2], format: u8) -> SimState {
    let f = format_of(format);
    let mut rng = XorShift32::new(seed);
    let c0 = shuffled_cycle(&mut rng);
    let c1 = shuffled_cycle(&mut rng);
    let tower = |owner: u8, king: bool, x: i64, y: i64| Tower {
        owner,
        king,
        x,
        y,
        hp: if king { King::HP } else { Princess::HP },
        cooldown: 0,
        awake: !king,
    };
    let mirror = |y: i64| ARENA_H - y;
    SimState {
        tick: 0,
        phase: PHASE_REGULATION,
        format,
        winner: -1,
        units: Vec::new(),
        towers: vec![
            tower(0, false, BRIDGE_X[0], 6144),
            tower(0, false, BRIDGE_X[1], 6144),
            tower(0, true, 9216, 2560),
            tower(1, false, BRIDGE_X[0], mirror(6144)),
            tower(1, false, BRIDGE_X[1], mirror(6144)),
            tower(1, true, 9216, mirror(2560)),
        ],
        spells: Vec::new(),
        players: [
            Player { elixir: f.start_elixir_fp, deck: decks[0], cycle: c0 },
            Player { elixir: f.start_elixir_fp, deck: decks[1], cycle: c1 },
        ],
        next_unit_id: 1,
        rng_state: rng.0,
    }
}

fn own_half_clamp(player: u8, x: i64, y: i64) -> (i64, i64) {
    let x = clamp(x, 512, ARENA_W - 512);
    let y = if player == 0 {
        clamp(y, 512, RIVER_TOP - 512)
    } else {
        clamp(y, RIVER_BOT + 512, ARENA_H - 512)
    };
    (x, y)
}

fn cycle_pos(cycle: &[u8; 8], deck_index: u8) -> usize {
    cycle.iter().position(|c| *c == deck_index).unwrap_or(8)
}

fn apply_input(s: &mut SimState, ev: &Input) {
    let deck_idx = ev.deck_index;
    if deck_idx as usize >= DECK_SIZE {
        return;
    }
    let p = ev.player as usize;
    let pos = cycle_pos(&s.players[p].cycle, deck_idx);
    if pos >= HAND_SIZE {
        return;
    }
    let card = s.players[p].deck[deck_idx as usize];
    let def = effective_def(card.archetype, card.trait_);
    let cost = def.elixir * FP;
    if s.players[p].elixir < cost {
        return;
    }
    let (x, y) = if card.archetype == SPELL {
        (clamp(ev.x as i64, 512, ARENA_W - 512), clamp(ev.y as i64, 512, ARENA_H - 512))
    } else {
        own_half_clamp(ev.player, ev.x as i64, ev.y as i64)
    };
    s.players[p].elixir -= cost;
    // played card goes to the back of the cycle
    let cycle = &mut s.players[p].cycle;
    for k in pos..7 {
        cycle[k] = cycle[k + 1];
    }
    cycle[7] = deck_idx;

    let bps = card.meta_bps as i64;
    if card.archetype == SPELL {
        s.spells.push(Spell { owner: ev.player, x, y, explode_tick: s.tick + def.spell_delay, meta_bps: bps });
        return;
    }
    let hp = scale_stat(def.hp, bps);
    for i in 0..def.count {
        let (ox, oy) = SPAWN_OFFSETS[(i as usize) % SPAWN_OFFSETS.len()];
        let id = s.next_unit_id;
        s.next_unit_id += 1;
        s.units.push(Unit {
            id,
            owner: ev.player,
            archetype: card.archetype,
            trait_: card.trait_,
            attacking: false,
            x: clamp(x + ox, 512, ARENA_W - 512),
            y: clamp(y + oy, 512, ARENA_H - 512),
            hp,
            max_hp: hp,
            cooldown: 0,
            target_unit: -1,
            target_tower: -1,
            meta_bps: bps,
        });
    }
}

fn nearest_enemy_unit(s: &SimState, ui: usize, radius: i64) -> i64 {
    let u = &s.units[ui];
    let mut best: i64 = -1;
    let mut best_d = radius + 1;
    for e in &s.units {
        if e.owner == u.owner || e.hp <= 0 {
            continue;
        }
        let d = fp_dist(u.x, u.y, e.x, e.y);
        if d < best_d || (d == best_d && best != -1 && e.id < best) {
            best_d = d;
            best = e.id;
        }
    }
    best
}

fn pick_target_tower(s: &SimState, u: &Unit) -> usize {
    let enemy_base = if u.owner == 0 { 3 } else { 0 };
    let lane = if u.x < 9216 { 0 } else { 1 };
    let princess = enemy_base + lane;
    if s.towers[princess].hp > 0 {
        return princess;
    }
    let king = enemy_base + 2;
    if s.towers[king].hp > 0 {
        return king;
    }
    let other = enemy_base + (1 - lane);
    if s.towers[other].hp > 0 {
        other
    } else {
        king
    }
}

fn move_toward(u: &mut Unit, tx_in: i64, ty_in: i64, speed: i64) {
    let mut tx = tx_in;
    let mut ty = ty_in;
    let needs_bridge = if u.owner == 0 {
        u.y < RIVER_TOP && ty_in > RIVER_TOP
    } else {
        u.y > RIVER_BOT && ty_in < RIVER_BOT
    };
    if needs_bridge {
        let lane = if u.x < 9216 { 0 } else { 1 };
        tx = BRIDGE_X[lane];
        ty = RIVER_MID;
    }
    if u.y >= RIVER_TOP && u.y <= RIVER_BOT {
        let lane = if u.x < 9216 { 0 } else { 1 };
        u.x = clamp(u.x, BRIDGE_X[lane] - BRIDGE_HALF_W, BRIDGE_X[lane] + BRIDGE_HALF_W);
    }
    let d = fp_dist(u.x, u.y, tx, ty);
    if d == 0 {
        return;
    }
    let step = core::cmp::min(speed, d);
    u.x += floor_div(step * (tx - u.x), d);
    u.y += floor_div(step * (ty - u.y), d);
}

fn has_support_aura(s: &SimState, ui: usize) -> bool {
    let u = &s.units[ui];
    let aura = ARCHETYPES[SUPPORT as usize].aura;
    for o in &s.units {
        if o.owner != u.owner || o.hp <= 0 || o.archetype != SUPPORT || o.id == u.id {
            continue;
        }
        if fp_dist(u.x, u.y, o.x, o.y) <= aura {
            return true;
        }
    }
    false
}

fn deal_splash(s: &mut SimState, owner: u8, cx: i64, cy: i64, radius: i64, damage: i64) {
    for e in s.units.iter_mut() {
        if e.owner == owner || e.hp <= 0 {
            continue;
        }
        if fp_dist(cx, cy, e.x, e.y) <= radius + UNIT_RADIUS {
            e.hp -= damage;
        }
    }
}

fn damage_tower(s: &mut SimState, idx: usize, dmg: i64) {
    let t = &mut s.towers[idx];
    if t.hp <= 0 {
        return;
    }
    t.hp -= dmg;
    if t.king {
        t.awake = true;
    }
    if t.hp <= 0 {
        t.hp = 0;
        if !t.king {
            let king = if t.owner == 0 { 2 } else { 5 };
            s.towers[king].awake = true;
        }
    }
}

fn find_alive(s: &SimState, id: i64) -> Option<usize> {
    s.units.iter().position(|e| e.id == id && e.hp > 0)
}

fn step_units(s: &mut SimState) {
    let n = s.units.len();
    for ui in 0..n {
        if s.units[ui].hp <= 0 {
            continue;
        }
        let def = effective_def(s.units[ui].archetype, s.units[ui].trait_);
        if s.units[ui].cooldown > 0 {
            s.units[ui].cooldown -= 1;
        }
        let mut target: Option<usize> = None;
        if s.units[ui].target_unit != -1 {
            target = find_alive(s, s.units[ui].target_unit);
            if let Some(ti) = target {
                let (u, t) = (&s.units[ui], &s.units[ti]);
                if fp_dist(u.x, u.y, t.x, t.y) > def.aggro + FP {
                    target = None;
                }
            }
        }
        if target.is_none() {
            let id = nearest_enemy_unit(s, ui, def.aggro);
            target = if id == -1 { None } else { s.units.iter().position(|e| e.id == id) };
            s.units[ui].target_unit = match target {
                Some(ti) => s.units[ti].id,
                None => -1,
            };
        }

        if let Some(ti) = target {
            let (tx, ty) = (s.units[ti].x, s.units[ti].y);
            let d = fp_dist(s.units[ui].x, s.units[ui].y, tx, ty);
            if d <= def.range + 2 * UNIT_RADIUS {
                s.units[ui].attacking = true;
                if s.units[ui].cooldown == 0 {
                    let dmg = scale_stat(def.damage, s.units[ui].meta_bps);
                    if def.splash > 0 {
                        let owner = s.units[ui].owner;
                        deal_splash(s, owner, tx, ty, def.splash, dmg);
                    } else {
                        s.units[ti].hp -= dmg;
                    }
                    let buffed = has_support_aura(s, ui);
                    s.units[ui].cooldown = if buffed {
                        floor_div(def.hit_ticks * AURA_SPEED_NUM, AURA_SPEED_DEN)
                    } else {
                        def.hit_ticks
                    };
                }
            } else {
                s.units[ui].attacking = false;
                move_toward(&mut s.units[ui], tx, ty, def.speed);
            }
            continue;
        }

        let tower_idx = pick_target_tower(s, &s.units[ui]);
        s.units[ui].target_tower = tower_idx as i64;
        let (twx, twy, king) = (s.towers[tower_idx].x, s.towers[tower_idx].y, s.towers[tower_idx].king);
        let radius = if king { TOWER_RADIUS_KING } else { TOWER_RADIUS_PRINCESS };
        let d = fp_dist(s.units[ui].x, s.units[ui].y, twx, twy);
        if d <= def.range + radius + UNIT_RADIUS {
            s.units[ui].attacking = true;
            if s.units[ui].cooldown == 0 {
                let dmg = scale_stat(def.damage, s.units[ui].meta_bps);
                damage_tower(s, tower_idx, dmg);
                let buffed = has_support_aura(s, ui);
                s.units[ui].cooldown = if buffed {
                    floor_div(def.hit_ticks * AURA_SPEED_NUM, AURA_SPEED_DEN)
                } else {
                    def.hit_ticks
                };
            }
        } else {
            s.units[ui].attacking = false;
            move_toward(&mut s.units[ui], twx, twy, def.speed);
        }
    }
}

fn step_towers(s: &mut SimState) {
    for ti in 0..s.towers.len() {
        if s.towers[ti].hp <= 0 {
            continue;
        }
        if s.towers[ti].cooldown > 0 {
            s.towers[ti].cooldown -= 1;
        }
        let t = &s.towers[ti];
        if t.king && !t.awake {
            continue;
        }
        let (range, damage, hit) = if t.king {
            (King::RANGE, King::DAMAGE, King::HIT_TICKS)
        } else {
            (Princess::RANGE, Princess::DAMAGE, Princess::HIT_TICKS)
        };
        let mut best: Option<usize> = None;
        let mut best_d = range + UNIT_RADIUS + 1;
        for (ei, e) in s.units.iter().enumerate() {
            if e.owner == t.owner || e.hp <= 0 {
                continue;
            }
            let d = fp_dist(t.x, t.y, e.x, e.y);
            if d < best_d || (d == best_d && best.map(|b| e.id < s.units[b].id).unwrap_or(false)) {
                best_d = d;
                best = Some(ei);
            }
        }
        if let Some(b) = best {
            if s.towers[ti].cooldown == 0 {
                // tower level is always 1 in this port
                s.units[b].hp -= damage;
                s.towers[ti].cooldown = hit;
            }
        }
    }
}

fn step_spells(s: &mut SimState) {
    let spells = core::mem::take(&mut s.spells);
    let mut remaining = Vec::new();
    for sp in spells {
        if s.tick < sp.explode_tick {
            remaining.push(sp);
            continue;
        }
        let def = ARCHETYPES[SPELL as usize];
        let dmg = scale_stat(def.damage, sp.meta_bps);
        deal_splash(s, sp.owner, sp.x, sp.y, def.splash, dmg);
        let tower_dmg = floor_div(dmg * SPELL_TOWER_DAMAGE_PCT, 100);
        for i in 0..s.towers.len() {
            let t = &s.towers[i];
            if t.owner == sp.owner || t.hp <= 0 {
                continue;
            }
            let r = if t.king { TOWER_RADIUS_KING } else { TOWER_RADIUS_PRINCESS };
            if fp_dist(sp.x, sp.y, t.x, t.y) <= def.splash + r {
                damage_tower(s, i, tower_dmg);
            }
        }
    }
    s.spells = remaining;
}

fn alive_towers(s: &SimState, owner: u8) -> i64 {
    s.towers.iter().filter(|t| t.owner == owner && t.hp > 0).count() as i64
}
fn total_tower_hp(s: &SimState, owner: u8) -> i64 {
    s.towers.iter().filter(|t| t.owner == owner).map(|t| t.hp).sum()
}

fn end(s: &mut SimState, winner: i64) {
    s.phase = PHASE_ENDED;
    s.winner = winner;
}

fn check_end(s: &mut SimState, before: (i64, i64)) {
    if s.towers[2].hp <= 0 {
        return end(s, 1);
    }
    if s.towers[5].hp <= 0 {
        return end(s, 0);
    }
    let f = format_of(s.format);
    let by_hp = |s: &SimState| {
        let (a, b) = (total_tower_hp(s, 0), total_tower_hp(s, 1));
        if a == b {
            -2
        } else if a > b {
            0
        } else {
            1
        }
    };
    if s.phase == PHASE_OVERTIME {
        let (a, b) = (alive_towers(s, 0), alive_towers(s, 1));
        if a < before.0 {
            return end(s, 1);
        }
        if b < before.1 {
            return end(s, 0);
        }
        if s.tick + 1 >= f.regulation_ticks + f.overtime_ticks {
            let w = by_hp(s);
            end(s, w);
        }
        return;
    }
    if s.tick + 1 >= f.regulation_ticks {
        let (a, b) = (alive_towers(s, 0), alive_towers(s, 1));
        if a != b {
            end(s, if a > b { 0 } else { 1 });
        } else if f.overtime_ticks > 0 {
            s.phase = PHASE_OVERTIME;
        } else {
            let w = by_hp(s);
            end(s, w);
        }
    }
}

/// Advance one tick with exactly the inputs scheduled for `s.tick` (others are ignored).
pub fn step_sim(s: &mut SimState, inputs: &[Input]) {
    if s.phase == PHASE_ENDED {
        return;
    }
    let before = (alive_towers(s, 0), alive_towers(s, 1));
    let f = format_of(s.format);
    let gain = if s.phase == PHASE_OVERTIME || s.tick >= f.double_elixir_at {
        f.elixir_per_tick_fp * 2
    } else {
        f.elixir_per_tick_fp
    };
    for p in s.players.iter_mut() {
        p.elixir = core::cmp::min(f.elixir_cap_fp, p.elixir + gain);
    }
    let mut now: Vec<Input> = inputs.iter().filter(|e| e.tick as i64 == s.tick).copied().collect();
    now.sort_by(|a, b| {
        a.player
            .cmp(&b.player)
            .then(a.deck_index.cmp(&b.deck_index))
            .then(a.x.cmp(&b.x))
            .then(a.y.cmp(&b.y))
    });
    for ev in &now {
        apply_input(s, ev);
    }
    step_spells(s);
    step_units(s);
    step_towers(s);
    if s.units.iter().any(|u| u.hp <= 0) {
        s.units.retain(|u| u.hp > 0);
    }
    check_end(s, before);
    s.tick += 1;
}

struct Fnv(u32);
impl Fnv {
    fn int(&mut self, v: i64) -> &mut Self {
        let mut x = v as u32;
        for _ in 0..4 {
            self.0 ^= x & 0xff;
            self.0 = self.0.wrapping_mul(0x01000193);
            x >>= 8;
        }
        self
    }
}

/// FNV-1a over the same fields, in the same order, as `hashState` in `engine.ts`.
pub fn hash_state(s: &SimState) -> u32 {
    let mut h = Fnv(0x811c9dc5);
    h.int(s.tick).int(s.rng_state as i64).int(s.winner + 3);
    h.int(s.phase as i64);
    h.int(s.next_unit_id);
    for p in &s.players {
        h.int(p.elixir);
        for c in &p.cycle {
            h.int(*c as i64);
        }
    }
    for u in &s.units {
        h.int(u.id).int(u.owner as i64).int(u.archetype as i64).int(u.x).int(u.y).int(u.hp)
            .int(u.cooldown).int(u.max_hp).int(1).int(u.trait_ as i64).int(u.meta_bps)
            .int(u.target_unit).int(u.target_tower).int(if u.attacking { 1 } else { 0 });
    }
    for t in &s.towers {
        h.int(t.hp).int(t.cooldown).int(if t.awake { 1 } else { 0 });
    }
    for sp in &s.spells {
        h.int(sp.owner as i64).int(sp.x).int(sp.y).int(sp.explode_tick).int(1).int(sp.meta_bps);
    }
    h.0
}
