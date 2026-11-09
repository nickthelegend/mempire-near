// SPDX-License-Identifier: MIT
//! Mempire arena on NEAR.
//!
//! Two players (or a player and a house bot) stake NEAR, drop cards in real time with a per-match
//! function-call key limited to `play`, and the arena itself replays the stored play log through
//! the Rust port of the deterministic sim (`sim.rs`) to decide the winner. Nobody's claim decides
//! a payout: a claim that disagrees with the replay is rejected.
//!
//! Money: winner 92 %, season pool 3 %, protocol treasury 5 %. The weekly season pays its top
//! three 50/30/20 when the first match of the next season settles (or when anyone calls
//! `finalize_season`). Houses are sub-accounts with a treasury held here on their behalf.

pub mod bot;
pub mod sim;

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PublicKey};
use sim::{Card, Input, SimState};

pub const OPEN: u8 = 1;
pub const ACTIVE: u8 = 2;
pub const SETTLED: u8 = 3;
pub const VOID: u8 = 4;
pub const NO_WINNER: u8 = 3;

pub const STATUS_LIVE: u8 = 0;
pub const STATUS_HOUSE: u8 = 1;
pub const STATUS_STALE: u8 = 2;
pub const STATUS_NO_PRICE: u8 = 4;

pub const WINNER_BPS: u128 = 9200;
pub const SEASON_BPS: u128 = 300;
pub const TREASURY_BPS: u128 = 500;

pub const MAX_PRICE_AGE_MS: u64 = 6 * 3600 * 1000;
/// A signed price snapshot may be at most this far from the block clock either way.
pub const PRICE_SKEW_MS: u64 = 15 * 60 * 1000;
pub const START_DELAY_MS: u64 = 10_000;
pub const LATE_TICKS: u64 = 100;
pub const EARLY_TICKS: u64 = 200;
pub const MAX_PLAYS: u16 = 200;
pub const OPEN_TTL_MS: u64 = 30 * 60 * 1000;
pub const WEEK_MS: u64 = 7 * 24 * 3600 * 1000;
/// The referee stops stepping and checkpoints when less than this much prepaid gas is left.
const GAS_RESERVE: Gas = Gas::from_tgas(40);

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Fighter {
    pub ticker: String,
    /// 0 house fighter (always neutral), 1 market fighter (relayer price).
    pub kind: u8,
    pub archetype: u8,
    pub trait_id: u8,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Default)]
#[borsh(crate = "near_sdk::borsh")]
pub struct PriceEntry {
    pub open_e8: u128,
    pub last_e8: u128,
    pub ts_ms: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
pub struct House {
    pub account: AccountId,
    pub name: String,
    pub difficulty: u8,
    pub tier: u8,
    pub stake: u128,
    pub deck: [u8; 8],
    pub treasury: u128,
    pub in_play: u128,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Match {
    pub p0: AccountId,
    pub p1: Option<AccountId>,
    /// Index into `houses` when seat 1 is a house bot.
    pub house: Option<u8>,
    pub stake: u128,
    pub tier: u8,
    pub format: u8,
    pub state: u8,
    pub winner: u8,
    pub deck0: [u8; 8],
    pub deck1: [u8; 8],
    pub mods: [i16; 16],
    pub status: [u8; 16],
    pub seed: u32,
    pub created_ms: u64,
    pub start_ms: u64,
    pub close_ms: u64,
    pub plays0: u16,
    pub plays1: u16,
    pub last_tick0: u32,
    pub last_tick1: u32,
    pub session0: Option<String>,
    pub session1: Option<String>,
    pub end_tick: u32,
    pub final_hash: u32,
    pub paid: u128,
    pub to_season: u128,
    pub to_treasury: u128,
    pub season: u32,
    pub referee_calls: u32,
    pub settled_ms: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Play {
    pub tick: u32,
    pub seat: u8,
    pub deck_index: u8,
    pub x: u16,
    pub y: u16,
}

#[derive(BorshSerialize, BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Checkpoint {
    pub state: SimState,
    pub cursor: u32,
    pub bot_pending: Vec<Input>,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Default, Serialize, Deserialize)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Stats {
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
    pub streak: u32,
    pub best_streak: u32,
    pub matches: u32,
    pub rejected_claims: u32,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Default)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Season {
    pub pool: u128,
    pub top: Vec<(AccountId, u64)>,
    pub finalized: bool,
    pub paid: Vec<(AccountId, u128)>,
    pub rolled_over: u128,
}

#[derive(Serialize, Deserialize, Clone, Copy)]
#[serde(crate = "near_sdk::serde")]
pub struct Claim {
    pub winner: u8,
    pub end_tick: u32,
    pub final_hash: u32,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct PriceRow(String, String, String);

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct PricePayload {
    ts_ms: u64,
    source: String,
    /// [ticker, open_e8 (24 h ago), last_e8]
    prices: Vec<PriceRow>,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct SettleOutcome {
    pub status: String,
    pub tick: u32,
    pub winner: Option<u8>,
    pub end_tick: Option<u32>,
    pub final_hash: Option<u32>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Arena {
    owner: AccountId,
    treasury: AccountId,
    relayer_pk: Vec<u8>,
    tier_stakes: Vec<u128>,
    roster: Vec<Fighter>,
    prices: Vec<PriceEntry>,
    price_source: String,
    houses: Vec<House>,
    genesis_ms: u64,
    first_season_end_ms: u64,
    next_match_id: u64,
    waiting: Vec<u64>,
    matches: LookupMap<u64, Match>,
    plays: LookupMap<u64, Vec<Play>>,
    checkpoints: LookupMap<u64, Checkpoint>,
    stats: LookupMap<AccountId, Stats>,
    seasons: LookupMap<u32, Season>,
    points: LookupMap<String, u64>,
    settled_count: u64,
    volume: u128,
    treasury_total: u128,
    season_paid_total: u128,
    refereed_ticks: u64,
}

fn trait_for(ticker: &str) -> u8 {
    sim::bytes_mod(&env::keccak256(ticker.as_bytes()), 6)
}

fn now_ms() -> u64 {
    env::block_timestamp_ms()
}

pub fn stat_bps(open_e8: u128, last_e8: u128) -> i16 {
    if open_e8 == 0 {
        return 0;
    }
    let (o, l) = (open_e8 as i128, last_e8 as i128);
    // twice the 24 h move, truncated toward zero, capped at +-15 %
    let bps = (l - o) * 20000 / o;
    bps.clamp(-1500, 1500) as i16
}

#[near]
impl Arena {
    /// `relayer_pk`: the ed25519 key whose signed price snapshots the arena accepts.
    /// `first_season_minutes`: length of the launch season 0; every later season is 7 days.
    #[init]
    pub fn new(
        owner: AccountId,
        treasury: AccountId,
        relayer_pk: PublicKey,
        tier_stakes: Vec<U128>,
        first_season_minutes: u64,
        price_source: String,
    ) -> Self {
        require!(tier_stakes.len() == 4 && tier_stakes.iter().all(|s| s.0 > 0), "four non-zero tier stakes");
        let pk = relayer_pk.as_bytes();
        require!(pk.len() == 33 && pk[0] == 0, "relayer key must be ed25519");
        let fighters: [(&str, u8, u8); 11] = [
            ("WIF", 0, 0), ("HATS", 0, 1), ("DOGGO", 0, 2), ("PENG", 0, 3), ("MOONCAT", 0, 4), ("RKT", 0, 5),
            ("BTC", 1, 0), ("ETH", 1, 5), ("NEAR", 1, 3), ("SOL", 1, 1), ("ZEC", 1, 2),
        ];
        let roster: Vec<Fighter> = fighters
            .iter()
            .map(|(t, k, a)| Fighter { ticker: t.to_string(), kind: *k, archetype: *a, trait_id: trait_for(t) })
            .collect();
        let n = roster.len();
        let genesis = now_ms();
        Self {
            owner,
            treasury,
            relayer_pk: pk[1..].to_vec(),
            tier_stakes: tier_stakes.iter().map(|s| s.0).collect(),
            roster,
            prices: vec![PriceEntry::default(); n],
            price_source,
            houses: Vec::new(),
            genesis_ms: genesis,
            first_season_end_ms: genesis + first_season_minutes * 60_000,
            next_match_id: 1,
            waiting: vec![0; 8],
            matches: LookupMap::new(b"m"),
            plays: LookupMap::new(b"p"),
            checkpoints: LookupMap::new(b"c"),
            stats: LookupMap::new(b"s"),
            seasons: LookupMap::new(b"z"),
            points: LookupMap::new(b"q"),
            settled_count: 0,
            volume: 0,
            treasury_total: 0,
            season_paid_total: 0,
            refereed_ticks: 0,
        }
    }

    // ── Prices ──────────────────────────────────────────────────────────────────────────────

    /// Anyone may submit a snapshot; only the relayer key's signature makes it count.
    pub fn post_prices(&mut self, payload: String, signature: Base64VecU8) -> u32 {
        let sig: [u8; 64] = signature.0.as_slice().try_into().unwrap_or_else(|_| env::panic_str("signature must be 64 bytes"));
        let pk: [u8; 32] = self.relayer_pk.as_slice().try_into().unwrap();
        require!(env::ed25519_verify(&sig, payload.as_bytes(), &pk), "bad relayer signature");
        let p: PricePayload = near_sdk::serde_json::from_str(&payload).unwrap_or_else(|_| env::panic_str("bad payload"));
        let now = now_ms();
        require!(p.ts_ms + PRICE_SKEW_MS >= now && p.ts_ms <= now + PRICE_SKEW_MS, "snapshot time too far from the block clock");
        let mut updated = 0;
        for row in p.prices {
            let Some(i) = self.roster.iter().position(|f| f.ticker == row.0 && f.kind == 1) else {
                env::panic_str(&format!("unknown market fighter {}", row.0))
            };
            let open: u128 = row.1.parse().unwrap_or_else(|_| env::panic_str("bad open price"));
            let last: u128 = row.2.parse().unwrap_or_else(|_| env::panic_str("bad last price"));
            require!(open > 0 && last > 0, "prices must be positive");
            if p.ts_ms > self.prices[i].ts_ms {
                self.prices[i] = PriceEntry { open_e8: open, last_e8: last, ts_ms: p.ts_ms };
                updated += 1;
            }
        }
        self.price_source = p.source;
        env::log_str(&format!("prices posted: {updated} updated at {}", p.ts_ms));
        updated
    }

    fn market_read(&self, ids: &[u8; 16]) -> ([i16; 16], [u8; 16]) {
        let mut mods = [0i16; 16];
        let mut status = [0u8; 16];
        let now = now_ms();
        for (i, id) in ids.iter().enumerate() {
            let f = &self.roster[*id as usize];
            if f.kind == 0 {
                status[i] = STATUS_HOUSE;
                continue;
            }
            let p = &self.prices[*id as usize];
            if p.ts_ms == 0 {
                status[i] = STATUS_NO_PRICE;
            } else if now > p.ts_ms + MAX_PRICE_AGE_MS {
                status[i] = STATUS_STALE;
            } else {
                status[i] = STATUS_LIVE;
                mods[i] = stat_bps(p.open_e8, p.last_e8);
            }
        }
        (mods, status)
    }

    // ── Houses ──────────────────────────────────────────────────────────────────────────────

    pub fn add_house(&mut self, account: AccountId, name: String, difficulty: u8, tier: u8, deck: Vec<u8>) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        require!(difficulty <= 2 && (tier as usize) < 4, "bad difficulty or tier");
        require!(self.houses.iter().all(|h| h.account != account), "house exists");
        let deck = self.check_deck(&deck);
        self.houses.push(House {
            account,
            name,
            difficulty,
            tier,
            stake: self.tier_stakes[tier as usize],
            deck,
            treasury: 0,
            in_play: 0,
            wins: 0,
            losses: 0,
            draws: 0,
        });
    }

    /// A house funds its own treasury from its own account.
    #[payable]
    pub fn house_deposit(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        let h = self.houses.iter_mut().find(|h| h.account == who).unwrap_or_else(|| env::panic_str("not a house"));
        h.treasury += env::attached_deposit().as_yoctonear();
        U128(h.treasury)
    }

    pub fn house_withdraw(&mut self, amount: U128) -> Promise {
        let who = env::predecessor_account_id();
        let h = self.houses.iter_mut().find(|h| h.account == who).unwrap_or_else(|| env::panic_str("not a house"));
        require!(amount.0 <= h.treasury, "more than the treasury");
        h.treasury -= amount.0;
        Promise::new(who).transfer(NearToken::from_yoctonear(amount.0))
    }

    // ── Matches ─────────────────────────────────────────────────────────────────────────────

    fn check_deck(&self, deck: &[u8]) -> [u8; 8] {
        require!(deck.len() == 8, "a deck is eight fighters");
        let mut seen = 0u32;
        let mut out = [0u8; 8];
        for (i, id) in deck.iter().enumerate() {
            require!((*id as usize) < self.roster.len(), "unknown fighter");
            require!(seen & (1 << id) == 0, "duplicate fighter");
            seen |= 1 << id;
            out[i] = *id;
        }
        out
    }

    fn take_stake(&self, expected: u128) {
        require!(env::attached_deposit().as_yoctonear() == expected, format!("attach exactly the stake: {expected} yocto"));
    }

    #[payable]
    pub fn create_match(&mut self, tier: u8, format: u8, deck: Vec<u8>, session_key: Option<PublicKey>) -> U64 {
        require!((tier as usize) < 4 && format <= 1, "bad tier or format");
        let deck = self.check_deck(&deck);
        let stake = self.tier_stakes[tier as usize];
        self.take_stake(stake);
        let id = self.next_match_id;
        self.next_match_id += 1;
        let m = Match {
            p0: env::predecessor_account_id(),
            p1: None,
            house: None,
            stake,
            tier,
            format,
            state: OPEN,
            winner: NO_WINNER,
            deck0: deck,
            deck1: [0; 8],
            mods: [0; 16],
            status: [0; 16],
            seed: 0,
            created_ms: now_ms(),
            start_ms: 0,
            close_ms: 0,
            plays0: 0,
            plays1: 0,
            last_tick0: 0,
            last_tick1: 0,
            session0: session_key.map(|k| String::from(&k)),
            session1: None,
            end_tick: 0,
            final_hash: 0,
            paid: 0,
            to_season: 0,
            to_treasury: 0,
            season: 0,
            referee_calls: 0,
            settled_ms: 0,
        };
        self.matches.insert(id, m);
        let slot = (tier * 2 + format) as usize;
        let waiting = self.waiting[slot];
        if waiting == 0 || self.matches.get(&waiting).map(|w| w.state != OPEN).unwrap_or(true) {
            self.waiting[slot] = id;
        }
        env::log_str(&format!("EVENT_JSON:{{\"event\":\"match_created\",\"id\":{id},\"tier\":{tier},\"format\":{format}}}"));
        U64(id)
    }

    fn kick_off(&self, id: u64, m: &mut Match) {
        let mut ids = [0u8; 16];
        ids[..8].copy_from_slice(&m.deck0);
        ids[8..].copy_from_slice(&m.deck1);
        let (mods, status) = self.market_read(&ids);
        m.mods = mods;
        m.status = status;
        let mut seed_src = Vec::with_capacity(96);
        seed_src.extend_from_slice(&id.to_le_bytes());
        seed_src.extend_from_slice(&ids);
        for v in mods {
            seed_src.extend_from_slice(&v.to_le_bytes());
        }
        seed_src.extend_from_slice(&env::random_seed());
        let h = env::keccak256(&seed_src);
        m.seed = u32::from_le_bytes([h[0], h[1], h[2], h[3]]);
        m.start_ms = now_ms() + START_DELAY_MS;
        let max = sim::max_ticks(m.format) as u64;
        m.close_ms = m.start_ms + (max + LATE_TICKS) * 50 + 1000;
        m.state = ACTIVE;
    }

    #[payable]
    pub fn join_match(&mut self, id: U64, deck: Vec<u8>, session_key: Option<PublicKey>) {
        let id = id.0;
        let mut m = self.matches.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such match"));
        require!(m.state == OPEN, "match is not open");
        let who = env::predecessor_account_id();
        require!(who != m.p0, "cannot join your own match");
        let deck = self.check_deck(&deck);
        self.take_stake(m.stake);
        m.p1 = Some(who);
        m.deck1 = deck;
        m.session1 = session_key.map(|k| String::from(&k));
        self.kick_off(id, &mut m);
        let slot = (m.tier * 2 + m.format) as usize;
        if self.waiting[slot] == id {
            self.waiting[slot] = 0;
        }
        self.matches.insert(id, m);
        env::log_str(&format!("EVENT_JSON:{{\"event\":\"match_joined\",\"id\":{id}}}"));
    }

    /// Challenge a house bot at its fixed stake. The house plays seat 1 with the published bot,
    /// run by the referee itself, and its treasury escrows the matching stake.
    #[payable]
    pub fn challenge_house(&mut self, house: u8, format: u8, deck: Vec<u8>, session_key: Option<PublicKey>) -> U64 {
        require!(format <= 1, "bad format");
        let deck = self.check_deck(&deck);
        let hi = house as usize;
        require!(hi < self.houses.len(), "no such house");
        let (stake, tier, house_deck, house_account) = {
            let h = &self.houses[hi];
            (h.stake, h.tier, h.deck, h.account.clone())
        };
        let who = env::predecessor_account_id();
        require!(who != house_account, "a house cannot challenge itself");
        self.take_stake(stake);
        {
            let h = &mut self.houses[hi];
            require!(h.treasury >= stake, "house treasury cannot cover the stake");
            h.treasury -= stake;
            h.in_play += stake;
        }
        let id = self.next_match_id;
        self.next_match_id += 1;
        let mut m = Match {
            p0: who,
            p1: Some(house_account),
            house: Some(house),
            stake,
            tier,
            format,
            state: OPEN,
            winner: NO_WINNER,
            deck0: deck,
            deck1: house_deck,
            mods: [0; 16],
            status: [0; 16],
            seed: 0,
            created_ms: now_ms(),
            start_ms: 0,
            close_ms: 0,
            plays0: 0,
            plays1: 0,
            last_tick0: 0,
            last_tick1: 0,
            session0: session_key.map(|k| String::from(&k)),
            session1: None,
            end_tick: 0,
            final_hash: 0,
            paid: 0,
            to_season: 0,
            to_treasury: 0,
            season: 0,
            referee_calls: 0,
            settled_ms: 0,
        };
        self.kick_off(id, &mut m);
        self.matches.insert(id, m);
        env::log_str(&format!("EVENT_JSON:{{\"event\":\"house_challenged\",\"id\":{id},\"house\":{house}}}"));
        U64(id)
    }

    /// Cancel your own open match (or anyone, once it has waited 30 minutes): the stake returns.
    pub fn cancel_match(&mut self, id: U64) -> Promise {
        let id = id.0;
        let mut m = self.matches.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such match"));
        require!(m.state == OPEN, "match is not open");
        let who = env::predecessor_account_id();
        require!(who == m.p0 || now_ms() >= m.created_ms + OPEN_TTL_MS, "only the creator can cancel before 30 minutes");
        m.state = VOID;
        let slot = (m.tier * 2 + m.format) as usize;
        if self.waiting[slot] == id {
            self.waiting[slot] = 0;
        }
        let (p0, stake) = (m.p0.clone(), m.stake);
        self.matches.insert(id, m);
        Promise::new(p0).transfer(NearToken::from_yoctonear(stake))
    }

    /// One card drop. Called through the player's per-match function-call key (method `play`
    /// only), so the predecessor is the player's own account.
    pub fn play(&mut self, id: U64, tick: u32, deck_index: u8, x: u16, y: u16) {
        let id = id.0;
        let mut m = self.matches.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such match"));
        require!(m.state == ACTIVE, "match is not active");
        let who = env::predecessor_account_id();
        let seat: u8 = if who == m.p0 {
            0
        } else if m.house.is_none() && m.p1.as_ref() == Some(&who) {
            1
        } else {
            env::panic_str("not a player in this match")
        };
        let now = now_ms();
        require!(now >= m.start_ms, "match has not started");
        let now_tick = (now - m.start_ms) * 20 / 1000;
        let t = tick as u64;
        require!(deck_index < 8, "bad deck index");
        require!(t <= sim::max_ticks(m.format) as u64, "tick past the end of the match");
        require!(t + LATE_TICKS >= now_tick, "play landed too late for its tick");
        require!(t <= now_tick + EARLY_TICKS, "play is too far ahead");
        if seat == 0 {
            require!(tick >= m.last_tick0, "ticks must not go backwards");
            require!(m.plays0 < MAX_PLAYS, "too many plays");
            m.plays0 += 1;
            m.last_tick0 = tick;
        } else {
            require!(tick >= m.last_tick1, "ticks must not go backwards");
            require!(m.plays1 < MAX_PLAYS, "too many plays");
            m.plays1 += 1;
            m.last_tick1 = tick;
        }
        let mut log = self.plays.get(&id).cloned().unwrap_or_default();
        log.push(Play { tick, seat, deck_index, x, y });
        self.plays.insert(id, log);
        self.matches.insert(id, m);
    }

    fn cards(&self, deck: &[u8; 8], mods: &[i16]) -> [Card; 8] {
        core::array::from_fn(|i| {
            let f = &self.roster[deck[i] as usize];
            Card { archetype: f.archetype, trait_: f.trait_id, meta_bps: mods[i] }
        })
    }

    /// The referee. Anyone may call it once no more plays can land. It replays the stored log
    /// (plus the house bot's moves) from the last checkpoint for as long as the attached gas
    /// allows; when the match ends it settles with the replay's result. A `claim` that differs
    /// from the replay is rejected and the whole call reverts.
    pub fn settle(&mut self, id: U64, claim: Option<Claim>) -> SettleOutcome {
        let id = id.0;
        let mut m = self.matches.get(&id).cloned().unwrap_or_else(|| env::panic_str("no such match"));
        require!(m.state == ACTIVE, "match is not active");
        require!(now_ms() >= m.close_ms, "plays can still land: wait for close");
        let mut cp = match self.checkpoints.remove(&id) {
            Some(cp) => cp,
            None => Checkpoint {
                state: sim::create_match(
                    m.seed,
                    [self.cards(&m.deck0, &m.mods[..8]), self.cards(&m.deck1, &m.mods[8..])],
                    m.format,
                ),
                cursor: 0,
                bot_pending: Vec::new(),
            },
        };
        let mut log: Vec<Play> = self.plays.get(&id).cloned().unwrap_or_default();
        log.sort_by_key(|p| p.tick); // stable: equal ticks keep arrival order; the sim sorts within a tick
        let house = m.house.map(|h| self.houses[h as usize].difficulty);
        let start_tick = cp.state.tick;
        let mut now_inputs: Vec<Input> = Vec::with_capacity(8);
        while cp.state.phase != sim::PHASE_ENDED {
            if env::used_gas().saturating_add(GAS_RESERVE) > env::prepaid_gas() {
                break;
            }
            let tick = cp.state.tick;
            if let Some(level) = house {
                if let Some(ev) = bot::decide_bot(&cp.state, 1, level) {
                    cp.bot_pending.push(ev);
                }
            }
            now_inputs.clear();
            while (cp.cursor as usize) < log.len() && (log[cp.cursor as usize].tick as i64) <= tick {
                let p = log[cp.cursor as usize];
                if p.tick as i64 == tick {
                    now_inputs.push(Input { tick: p.tick, player: p.seat, deck_index: p.deck_index, x: p.x as i32, y: p.y as i32 });
                }
                cp.cursor += 1;
            }
            cp.bot_pending.retain(|e| {
                if e.tick as i64 == tick {
                    now_inputs.push(*e);
                }
                e.tick as i64 > tick
            });
            sim::step_sim(&mut cp.state, &now_inputs);
        }
        self.refereed_ticks += (cp.state.tick - start_tick) as u64;
        m.referee_calls += 1;
        if cp.state.phase != sim::PHASE_ENDED {
            let tick = cp.state.tick as u32;
            self.checkpoints.insert(id, cp);
            self.matches.insert(id, m);
            return SettleOutcome { status: "replaying".into(), tick, winner: None, end_tick: None, final_hash: None };
        }
        let winner: u8 = if cp.state.winner == -2 { 2 } else { cp.state.winner as u8 };
        let end_tick = cp.state.tick as u32;
        let final_hash = sim::hash_state(&cp.state);
        if let Some(c) = claim {
            if c.winner != winner || c.end_tick != end_tick || c.final_hash != final_hash {
                env::panic_str(&format!(
                    "claim rejected by the referee: replay gives winner {winner}, end tick {end_tick}, hash {final_hash}"
                ));
            }
        }
        m.end_tick = end_tick;
        m.final_hash = final_hash;
        self.pay_out(id, &mut m, winner);
        self.matches.insert(id, m);
        SettleOutcome { status: "settled".into(), tick: end_tick, winner: Some(winner), end_tick: Some(end_tick), final_hash: Some(final_hash) }
    }

    fn season_of(&self, ms: u64) -> u32 {
        if ms < self.first_season_end_ms {
            0
        } else {
            1 + ((ms - self.first_season_end_ms) / WEEK_MS) as u32
        }
    }

    fn pay_out(&mut self, id: u64, m: &mut Match, winner: u8) {
        let season = self.season_of(now_ms());
        if season > 0 {
            let prev = season - 1;
            if !self.seasons.get(&prev).map(|s| s.finalized).unwrap_or(false) {
                self.finalize(prev);
            }
        }
        let pot = m.stake * 2;
        let to_treasury = pot * TREASURY_BPS / 10_000;
        let to_season = pot * SEASON_BPS / 10_000;
        let mut paid = pot - to_treasury - to_season;
        m.state = SETTLED;
        m.winner = winner;
        m.season = season;
        m.settled_ms = now_ms();
        let mut s = self.seasons.get(&season).cloned().unwrap_or_default();
        s.pool += to_season;
        self.seasons.insert(season, s);
        self.settled_count += 1;
        self.volume += pot;
        self.treasury_total += to_treasury;
        if to_treasury > 0 {
            Promise::new(self.treasury.clone()).transfer(NearToken::from_yoctonear(to_treasury)).detach();
        }
        let p1 = m.p1.clone().unwrap();
        let house = m.house.map(|h| h as usize);
        if let Some(hi) = house {
            self.houses[hi].in_play -= m.stake;
        }
        if winner == 2 {
            let half = paid / 2;
            paid = half * 2;
            self.bump(&m.p0.clone(), 2, m.tier, season);
            Promise::new(m.p0.clone()).transfer(NearToken::from_yoctonear(half)).detach();
            match house {
                Some(hi) => {
                    self.houses[hi].treasury += half;
                    self.houses[hi].draws += 1;
                }
                None => {
                    self.bump(&p1, 2, m.tier, season);
                    Promise::new(p1.clone()).transfer(NearToken::from_yoctonear(half)).detach();
                }
            }
        } else {
            let (win, lose) = if winner == 0 { (m.p0.clone(), p1.clone()) } else { (p1.clone(), m.p0.clone()) };
            match house {
                Some(hi) => {
                    if winner == 1 {
                        self.houses[hi].treasury += paid;
                        self.houses[hi].wins += 1;
                        self.bump(&lose, 1, m.tier, season);
                    } else {
                        self.houses[hi].losses += 1;
                        self.bump(&win, 0, m.tier, season);
                        Promise::new(win).transfer(NearToken::from_yoctonear(paid)).detach();
                    }
                }
                None => {
                    self.bump(&win, 0, m.tier, season);
                    self.bump(&lose, 1, m.tier, season);
                    Promise::new(win).transfer(NearToken::from_yoctonear(paid)).detach();
                }
            }
        }
        m.paid = paid;
        m.to_season = to_season;
        m.to_treasury = to_treasury + (pot - to_treasury - to_season - paid);
        self.checkpoints.remove(&id);
        env::log_str(&format!(
            "EVENT_JSON:{{\"event\":\"match_settled\",\"id\":{id},\"winner\":{winner},\"end_tick\":{},\"final_hash\":{},\"paid\":\"{paid}\"}}",
            m.end_tick, m.final_hash
        ));
    }

    /// result: 0 win, 1 loss, 2 draw. Season points go to winners: tier base x streak (max 5).
    fn bump(&mut self, who: &AccountId, result: u8, tier: u8, season: u32) {
        let mut st = self.stats.get(who).cloned().unwrap_or_default();
        st.matches += 1;
        match result {
            0 => {
                st.wins += 1;
                st.streak += 1;
                st.best_streak = st.best_streak.max(st.streak);
                let base = [1u64, 3, 10, 30][tier as usize];
                let delta = base * st.streak.min(5) as u64;
                let key = format!("{season}:{who}");
                let total = self.points.get(&key).copied().unwrap_or(0) + delta;
                self.points.insert(key, total);
                let mut s = self.seasons.get(&season).cloned().unwrap_or_default();
                s.top.retain(|(a, _)| a != who);
                s.top.push((who.clone(), total));
                s.top.sort_by(|a, b| b.1.cmp(&a.1));
                s.top.truncate(3);
                self.seasons.insert(season, s);
            }
            1 => {
                st.losses += 1;
                st.streak = 0;
            }
            _ => st.draws += 1,
        }
        self.stats.insert(who.clone(), st);
    }

    fn finalize(&mut self, season: u32) {
        let mut s = self.seasons.get(&season).cloned().unwrap_or_default();
        if s.finalized {
            return;
        }
        s.finalized = true;
        let shares = [5000u128, 3000, 2000];
        let mut left = s.pool;
        let top = s.top.clone();
        for (i, (who, _)) in top.iter().enumerate() {
            let amount = s.pool * shares[i] / 10_000;
            left -= amount;
            s.paid.push((who.clone(), amount));
            self.season_paid_total += amount;
            if amount > 0 {
                Promise::new(who.clone()).transfer(NearToken::from_yoctonear(amount)).detach();
            }
        }
        // shares nobody earned roll into the next season's pool
        s.rolled_over = left;
        self.seasons.insert(season, s);
        let mut next = self.seasons.get(&(season + 1)).cloned().unwrap_or_default();
        next.pool += left;
        self.seasons.insert(season + 1, next);
        env::log_str(&format!("EVENT_JSON:{{\"event\":\"season_finalized\",\"season\":{season}}}"));
    }

    /// Pay out a finished season's top three. Anyone may call it; settles do it automatically.
    pub fn finalize_season(&mut self, season: u32) {
        require!(season < self.season_of(now_ms()), "season has not ended");
        require!(!self.seasons.get(&season).map(|s| s.finalized).unwrap_or(false), "already finalized");
        self.finalize(season);
    }

    // ── Views ───────────────────────────────────────────────────────────────────────────────

    pub fn get_config(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({
            "owner": self.owner,
            "treasury": self.treasury,
            "relayer_pk": format!("ed25519:{}", near_sdk::bs58::encode(&self.relayer_pk).into_string()),
            "tier_stakes": self.tier_stakes.iter().map(|s| U128(*s)).collect::<Vec<_>>(),
            "roster": self.roster,
            "price_source": self.price_source,
            "genesis_ms": U64(self.genesis_ms),
            "first_season_end_ms": U64(self.first_season_end_ms),
            "week_ms": U64(WEEK_MS),
            "start_delay_ms": START_DELAY_MS,
            "late_ticks": LATE_TICKS,
            "early_ticks": EARLY_TICKS,
            "max_plays": MAX_PLAYS,
            "bps": { "winner": WINNER_BPS as u64, "season": SEASON_BPS as u64, "treasury": TREASURY_BPS as u64 },
        })
    }

    pub fn get_prices(&self) -> near_sdk::serde_json::Value {
        let now = now_ms();
        let rows: Vec<_> = self
            .roster
            .iter()
            .zip(self.prices.iter())
            .enumerate()
            .filter(|(_, (f, _))| f.kind == 1)
            .map(|(i, (f, p))| {
                let status = if p.ts_ms == 0 { STATUS_NO_PRICE } else if now > p.ts_ms + MAX_PRICE_AGE_MS { STATUS_STALE } else { STATUS_LIVE };
                near_sdk::serde_json::json!({
                    "fighter_id": i, "ticker": f.ticker, "open_e8": U128(p.open_e8), "last_e8": U128(p.last_e8),
                    "ts_ms": U64(p.ts_ms), "status": status,
                    "stat_bps": if status == STATUS_LIVE { stat_bps(p.open_e8, p.last_e8) } else { 0 },
                })
            })
            .collect();
        near_sdk::serde_json::json!({ "source": self.price_source, "max_age_ms": U64(MAX_PRICE_AGE_MS), "prices": rows })
    }

    pub fn get_houses(&self) -> near_sdk::serde_json::Value {
        let rows: Vec<_> = self
            .houses
            .iter()
            .enumerate()
            .map(|(i, h)| {
                near_sdk::serde_json::json!({
                    "index": i, "account": h.account, "name": h.name, "difficulty": h.difficulty, "tier": h.tier,
                    "stake": U128(h.stake), "deck": h.deck, "treasury": U128(h.treasury), "in_play": U128(h.in_play),
                    "wins": h.wins, "losses": h.losses, "draws": h.draws,
                })
            })
            .collect();
        near_sdk::serde_json::Value::Array(rows)
    }

    pub fn get_match(&self, id: U64) -> Option<near_sdk::serde_json::Value> {
        self.matches.get(&id.0).map(|m| self.match_json(id.0, m))
    }

    fn match_json(&self, id: u64, m: &Match) -> near_sdk::serde_json::Value {
        let checkpoint_tick = self.checkpoints.get(&id).map(|c| c.state.tick);
        near_sdk::serde_json::json!({
            "id": U64(id), "p0": m.p0, "p1": m.p1, "house": m.house, "stake": U128(m.stake), "tier": m.tier,
            "format": m.format, "state": m.state, "winner": m.winner, "deck0": m.deck0, "deck1": m.deck1,
            "mods": m.mods, "status": m.status, "seed": m.seed, "created_ms": U64(m.created_ms),
            "start_ms": U64(m.start_ms), "close_ms": U64(m.close_ms), "plays0": m.plays0, "plays1": m.plays1,
            "session0": m.session0, "session1": m.session1, "end_tick": m.end_tick, "final_hash": m.final_hash,
            "paid": U128(m.paid), "to_season": U128(m.to_season), "to_treasury": U128(m.to_treasury),
            "season": m.season, "referee_calls": m.referee_calls, "settled_ms": U64(m.settled_ms),
            "checkpoint_tick": checkpoint_tick,
        })
    }

    pub fn get_plays(&self, id: U64, from: Option<u32>) -> Vec<Play> {
        let log = self.plays.get(&id.0).cloned().unwrap_or_default();
        log.into_iter().skip(from.unwrap_or(0) as usize).collect()
    }

    /// Newest first.
    pub fn recent_matches(&self, limit: Option<u32>, before: Option<U64>) -> Vec<near_sdk::serde_json::Value> {
        let mut out = Vec::new();
        let mut id = before.map(|b| b.0).unwrap_or(self.next_match_id);
        let limit = limit.unwrap_or(20).min(50) as usize;
        while id > 1 && out.len() < limit {
            id -= 1;
            if let Some(m) = self.matches.get(&id) {
                out.push(self.match_json(id, m));
            }
        }
        out
    }

    pub fn open_matches(&self) -> Vec<U64> {
        self.waiting.iter().map(|w| U64(*w)).collect()
    }

    pub fn get_player(&self, account: AccountId) -> Stats {
        self.stats.get(&account).cloned().unwrap_or_default()
    }

    pub fn current_season(&self) -> u32 {
        self.season_of(now_ms())
    }

    pub fn get_season(&self, season: u32) -> near_sdk::serde_json::Value {
        let s = self.seasons.get(&season).cloned().unwrap_or_default();
        let (start, end) = if season == 0 {
            (self.genesis_ms, self.first_season_end_ms)
        } else {
            let st = self.first_season_end_ms + (season as u64 - 1) * WEEK_MS;
            (st, st + WEEK_MS)
        };
        near_sdk::serde_json::json!({
            "season": season, "start_ms": U64(start), "end_ms": U64(end), "pool": U128(s.pool),
            "top": s.top.iter().map(|(a, p)| near_sdk::serde_json::json!({"account": a, "points": p})).collect::<Vec<_>>(),
            "finalized": s.finalized,
            "paid": s.paid.iter().map(|(a, p)| near_sdk::serde_json::json!({"account": a, "amount": U128(*p)})).collect::<Vec<_>>(),
            "rolled_over": U128(s.rolled_over),
        })
    }

    pub fn get_points(&self, season: u32, account: AccountId) -> u64 {
        self.points.get(&format!("{season}:{account}")).copied().unwrap_or(0)
    }

    pub fn get_totals(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({
            "matches": U64(self.next_match_id - 1),
            "settled": U64(self.settled_count),
            "volume": U128(self.volume),
            "to_treasury": U128(self.treasury_total),
            "season_paid": U128(self.season_paid_total),
            "refereed_ticks": U64(self.refereed_ticks),
            "houses": self.houses.len(),
        })
    }
}

#[cfg(test)]
mod tests;
