// SPDX-License-Identifier: MIT
//! Market prices from OutLayer's TEE price oracle (`price-oracle.testnet` on testnet).
//!
//! A fighter's buff is twice its 24 h move, so the arena needs two numbers per fighter: the latest
//! price and the price 24 h ago. `refresh_prices` asks the oracle for both in one transaction:
//!
//! - `oracle_call`: the oracle's own price feed for the fighter's asset (median of the exchanges its
//!   TEE worker reads). The oracle answers through `oracle_on_call`.
//! - `custom_call`: Coinbase's public 24 h stats `open`, fetched by the same oracle inside the same
//!   OutLayer TEE. The oracle answers through `on_custom_data`.
//!
//! Both callbacks must come from the configured oracle account. The 24 h open must also come from
//! a request this arena made itself (`sender_id` is the arena), because anyone can ask the oracle
//! to send custom data from any URL to any receiver. A fighter's price changes only when both
//! halves are fresh and no more than 15 minutes apart.

use crate::*;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{GasWeight, Promise};

/// OutLayer charges each TEE run from the attached deposit (minimum 0.01 NEAR per run) and refunds
/// the unused part to the payer, which is the arena.
pub const MIN_RUN_DEPOSIT: u128 = 10_000_000_000_000_000_000_000;
pub const SPOT_MSG: &str = "mempire:spot";
pub const OPEN_MSG: &str = "mempire:open24h";
const OPEN_SUFFIX: &str = ":open24h";

/// The five market fighters and the oracle asset that prices each (mainnet asset ids, as the
/// testnet oracle lists them).
pub const DEFAULT_ASSETS: [(&str, &str); 5] = [
    ("BTC", "nbtc.bridge.near"),
    ("ETH", "aurora"),
    ("NEAR", "wrap.near"),
    ("SOL", "22.contract.portalbridge.near"),
    ("ZEC", "zec.omft.near"),
];

#[derive(BorshSerialize, BorshDeserialize, Clone, Default)]
#[borsh(crate = "near_sdk::borsh")]
pub struct OracleHalf {
    pub spot_e8: u128,
    pub spot_ms: u64,
    pub open_e8: u128,
    pub open_ms: u64,
}

// The oracle's callback payloads (price-oracle v0.7.0, `PriceData` and `CustomDataResult`).
#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct OraclePrice {
    pub multiplier: U128,
    pub decimals: u8,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct OracleAssetPrice {
    pub asset_id: String,
    pub price: Option<OraclePrice>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct OraclePriceData {
    pub timestamp: U64,
    pub recency_duration_sec: u32,
    pub prices: Vec<OracleAssetPrice>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct CustomDataResult {
    pub id: String,
    #[serde(default)]
    pub value: Option<Value>,
    #[serde(default)]
    pub timestamp: Option<u64>,
    #[serde(default)]
    pub error: Option<String>,
}

pub fn source_name(source: u8) -> &'static str {
    match source {
        SRC_ORACLE => "oracle",
        SRC_RELAYER => "relayer",
        _ => "none",
    }
}

/// Oracle fixed-point price to the arena's 8-decimal integer.
pub fn to_e8(multiplier: u128, decimals: u8) -> Option<u128> {
    if decimals <= 8 {
        multiplier.checked_mul(10u128.pow(8 - decimals as u32))
    } else {
        Some(multiplier / 10u128.checked_pow(decimals as u32 - 8)?)
    }
}

/// A plain decimal ("71461.82", "943", "3.3938") to an 8-decimal integer, without floats.
/// Anything else (signs, exponents, empty parts, more than 8 decimals) is refused.
pub fn decimal_to_e8(text: &str) -> Option<u128> {
    let (int, frac) = match text.split_once('.') {
        Some((i, f)) => (i, f),
        None => (text, ""),
    };
    if int.is_empty() || frac.len() > 8 || !int.bytes().all(|b| b.is_ascii_digit()) || !frac.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if text.contains('.') && frac.is_empty() {
        return None;
    }
    let int: u128 = int.parse().ok()?;
    let mut frac_e8: u128 = if frac.is_empty() { 0 } else { frac.parse().ok()? };
    frac_e8 *= 10u128.pow(8 - frac.len() as u32);
    int.checked_mul(100_000_000)?.checked_add(frac_e8)
}

fn value_e8(v: &Value) -> Option<u128> {
    match v {
        Value::Number(n) => decimal_to_e8(&n.to_string()),
        Value::String(s) => decimal_to_e8(s),
        _ => None,
    }
}

/// Combine both halves into a price when they are fresh and close together. Returns the new entry.
pub fn combine(h: &OracleHalf, cur: &PriceEntry, now: u64) -> Option<PriceEntry> {
    if h.spot_ms == 0 || h.open_ms == 0 || h.spot_e8 == 0 || h.open_e8 == 0 {
        return None;
    }
    if h.spot_ms.abs_diff(h.open_ms) > PRICE_SKEW_MS {
        return None;
    }
    let ts = h.spot_ms.min(h.open_ms);
    if ts + PRICE_SKEW_MS < now || ts > now + PRICE_SKEW_MS {
        return None;
    }
    if cur.source == SRC_ORACLE && ts <= cur.ts_ms {
        return None;
    }
    Some(PriceEntry { open_e8: h.open_e8, last_e8: h.spot_e8, ts_ms: ts, source: SRC_ORACLE })
}

fn coinbase_stats_url(ticker: &str) -> String {
    format!("https://api.exchange.coinbase.com/products/{ticker}-USD/stats")
}

fn usd(e8: u128) -> String {
    format!("{}.{:02}", e8 / 100_000_000, (e8 % 100_000_000) / 1_000_000)
}

impl Arena {
    fn oracle_index(&self, asset_id: &str) -> Option<usize> {
        if asset_id.is_empty() {
            return None;
        }
        self.oracle_assets.iter().position(|a| a == asset_id)
    }

    fn assert_oracle(&self) {
        let oracle = self.oracle.as_ref().unwrap_or_else(|| env::panic_str("no price oracle configured"));
        require!(&env::predecessor_account_id() == oracle, "only the configured price oracle can deliver prices");
    }

    /// Fold fresh halves into `prices` for the given fighters and log what changed.
    fn apply_halves(&mut self, touched: &[usize]) -> u32 {
        let now = now_ms();
        let mut rows = Vec::new();
        for &i in touched {
            if let Some(entry) = combine(&self.oracle_halves[i], &self.prices[i], now) {
                rows.push(json!({
                    "ticker": self.roster[i].ticker, "asset": self.oracle_assets[i],
                    "open_e8": U128(entry.open_e8), "last_e8": U128(entry.last_e8), "ts_ms": U64(entry.ts_ms),
                    "stat_bps": stat_bps(entry.open_e8, entry.last_e8),
                }));
                self.prices[i] = entry;
            }
        }
        if !rows.is_empty() {
            self.oracle_updates += 1;
            let text: Vec<String> = rows
                .iter()
                .map(|r| {
                    let bps = r["stat_bps"].as_i64().unwrap_or(0);
                    let last: u128 = r["last_e8"].as_str().and_then(|s| s.parse().ok()).unwrap_or(0);
                    format!("{} ${} buff {}{}.{:02}%", r["ticker"].as_str().unwrap_or(""), usd(last), if bps < 0 { "-" } else { "+" }, bps.abs() / 100, bps.abs() % 100)
                })
                .collect();
            env::log_str(&format!("Priced by OutLayer TEE oracle: {}", text.join(", ")));
            env::log_str(&format!(
                "EVENT_JSON:{}",
                json!({ "standard": "mempire", "version": "1.0.0", "event": "oracle_prices", "data": rows })
            ));
        }
        rows.len() as u32
    }
}

#[near]
impl Arena {
    /// Owner: point the arena at the OutLayer price oracle. `assets`: [ticker, oracle asset id]
    /// for market fighters; fighters left out keep the relayer fallback.
    pub fn set_oracle(&mut self, oracle: AccountId, assets: Vec<(String, String)>) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        self.internal_set_oracle(oracle, assets);
    }

    /// Ask the OutLayer TEE oracle for fresh prices: the oracle's spot feed and Coinbase's 24 h open,
    /// both fetched inside its TEE. Anyone may call it and pay for the two OutLayer runs (at least
    /// 0.01 NEAR each; OutLayer refunds the unused part to the arena). Prices land in the callbacks.
    #[payable]
    pub fn refresh_prices(&mut self) -> U64 {
        let oracle = self.oracle.clone().unwrap_or_else(|| env::panic_str("no price oracle configured"));
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit >= 2 * MIN_RUN_DEPOSIT,
            "attach at least 0.02 NEAR: OutLayer charges each of the two TEE runs and refunds the rest to the arena"
        );
        let mut assets = Vec::new();
        let mut requests = Vec::new();
        for (i, asset) in self.oracle_assets.iter().enumerate() {
            if asset.is_empty() {
                continue;
            }
            let ticker = &self.roster[i].ticker;
            assets.push(asset.clone());
            requests.push(json!({
                "id": format!("{ticker}{OPEN_SUFFIX}"), "token_id": "",
                "source": { "custom": { "url": coinbase_stats_url(ticker), "json_path": "open", "value_type": "number", "method": "GET", "headers": [] } },
            }));
        }
        require!(!assets.is_empty(), "no fighter is mapped to an oracle asset");
        self.oracle_refreshes += 1;
        let me = env::current_account_id();
        let half = deposit / 2;
        let spot_args = json!({ "receiver_id": me, "asset_ids": assets, "msg": SPOT_MSG }).to_string().into_bytes();
        let open_args = json!({ "receiver_id": me, "custom_data_request": requests, "msg": OPEN_MSG }).to_string().into_bytes();
        // Two independent receipts; each gets an equal share of the remaining gas.
        Promise::new(oracle.clone()).function_call_weight(
            "oracle_call".to_string(),
            spot_args,
            NearToken::from_yoctonear(half),
            Gas::from_tgas(60),
            GasWeight(1),
        ).detach();
        Promise::new(oracle.clone()).function_call_weight(
            "custom_call".to_string(),
            open_args,
            NearToken::from_yoctonear(deposit - half),
            Gas::from_tgas(60),
            GasWeight(1),
        ).detach();
        env::log_str(&format!(
            "refresh #{}: asked {oracle} (OutLayer TEE) for {} spot prices and 24 h opens",
            self.oracle_refreshes,
            assets.len()
        ));
        U64(self.oracle_refreshes)
    }

    /// Oracle callback for `oracle_call`: the oracle's spot price per asset. Any sender may have
    /// paid for it; the numbers are the oracle's own feed either way.
    pub fn oracle_on_call(&mut self, sender_id: AccountId, data: OraclePriceData, msg: String) -> u32 {
        self.assert_oracle();
        let _ = (sender_id, msg);
        let ts_ms = data.timestamp.0 / 1_000_000;
        let mut touched = Vec::new();
        let mut missing = Vec::new();
        for row in data.prices {
            let Some(i) = self.oracle_index(&row.asset_id) else { continue };
            match row.price.and_then(|p| to_e8(p.multiplier.0, p.decimals)) {
                Some(e8) if e8 > 0 => {
                    let h = &mut self.oracle_halves[i];
                    if ts_ms > h.spot_ms {
                        h.spot_e8 = e8;
                        h.spot_ms = ts_ms;
                        touched.push(i);
                    }
                }
                _ => missing.push(row.asset_id),
            }
        }
        if !missing.is_empty() {
            env::log_str(&format!("oracle had no fresh price for: {}", missing.join(", ")));
        }
        self.apply_halves(&touched)
    }

    /// Oracle callback for `custom_call`: Coinbase 24 h opens fetched in the oracle's TEE. Only
    /// requests this arena made count, since anyone can point the oracle at any URL.
    pub fn on_custom_data(&mut self, sender_id: AccountId, data: Vec<CustomDataResult>, msg: String) -> u32 {
        self.assert_oracle();
        require!(sender_id == env::current_account_id(), "custom data counts only when the arena requested it");
        require!(msg == OPEN_MSG, "unexpected custom data message");
        let now = now_ms();
        let mut touched = Vec::new();
        for item in data {
            let Some(ticker) = item.id.strip_suffix(OPEN_SUFFIX) else { continue };
            let Some(i) = self.roster.iter().position(|f| f.ticker == ticker && f.kind == 1) else { continue };
            if self.oracle_assets[i].is_empty() {
                continue;
            }
            if let Some(err) = item.error {
                env::log_str(&format!("oracle could not fetch the 24 h open for {ticker}: {err}"));
                continue;
            }
            let Some(e8) = item.value.as_ref().and_then(value_e8).filter(|v| *v > 0) else { continue };
            let ts = item.timestamp.map(|s| s.saturating_mul(1000)).unwrap_or(now);
            let h = &mut self.oracle_halves[i];
            if ts > h.open_ms {
                h.open_e8 = e8;
                h.open_ms = ts;
                touched.push(i);
            }
        }
        self.apply_halves(&touched)
    }

    pub fn get_oracle(&self) -> Value {
        let rows: Vec<_> = self
            .roster
            .iter()
            .enumerate()
            .filter(|(_, f)| f.kind == 1)
            .map(|(i, f)| {
                let h = &self.oracle_halves[i];
                json!({
                    "ticker": f.ticker,
                    "asset": if self.oracle_assets[i].is_empty() { None } else { Some(&self.oracle_assets[i]) },
                    "open_source": if self.oracle_assets[i].is_empty() { None } else { Some(coinbase_stats_url(&f.ticker)) },
                    "spot_e8": U128(h.spot_e8), "spot_ms": U64(h.spot_ms),
                    "open_e8": U128(h.open_e8), "open_ms": U64(h.open_ms),
                    "price_source": source_name(self.prices[i].source),
                })
            })
            .collect();
        json!({
            "oracle": self.oracle,
            "min_deposit": U128(2 * MIN_RUN_DEPOSIT),
            "refreshes": U64(self.oracle_refreshes),
            "updates": U64(self.oracle_updates),
            "fighters": rows,
        })
    }

    /// One-time upgrade from the Nov 9 arena layout (no oracle fields, no price source). Keeps every
    /// match, play, season and stat; existing prices are marked as relayer prices.
    #[private]
    #[init(ignore_state)]
    pub fn migrate(oracle: AccountId, assets: Vec<(String, String)>) -> Self {
        let old: OldArena = env::state_read().unwrap_or_else(|| env::panic_str("no state to migrate"));
        let n = old.roster.len();
        let mut arena = Self {
            owner: old.owner,
            treasury: old.treasury,
            relayer_pk: old.relayer_pk,
            tier_stakes: old.tier_stakes,
            roster: old.roster,
            prices: old
                .prices
                .into_iter()
                .map(|p| PriceEntry { open_e8: p.open_e8, last_e8: p.last_e8, ts_ms: p.ts_ms, source: if p.ts_ms == 0 { SRC_NONE } else { SRC_RELAYER } })
                .collect(),
            price_source: old.price_source,
            houses: old.houses,
            genesis_ms: old.genesis_ms,
            first_season_end_ms: old.first_season_end_ms,
            next_match_id: old.next_match_id,
            waiting: old.waiting,
            matches: old.matches,
            plays: old.plays,
            checkpoints: old.checkpoints,
            stats: old.stats,
            seasons: old.seasons,
            points: old.points,
            settled_count: old.settled_count,
            volume: old.volume,
            treasury_total: old.treasury_total,
            season_paid_total: old.season_paid_total,
            refereed_ticks: old.refereed_ticks,
            oracle: None,
            oracle_assets: vec![String::new(); n],
            oracle_halves: vec![OracleHalf::default(); n],
            oracle_refreshes: 0,
            oracle_updates: 0,
        };
        arena.internal_set_oracle(oracle, assets);
        arena
    }
}

impl Arena {
    fn internal_set_oracle(&mut self, oracle: AccountId, assets: Vec<(String, String)>) {
        let n = self.roster.len();
        let mut mapped = vec![String::new(); n];
        for (ticker, asset) in assets {
            let Some(i) = self.roster.iter().position(|f| f.ticker == ticker && f.kind == 1) else {
                env::panic_str(&format!("unknown market fighter {ticker}"))
            };
            require!(!asset.is_empty(), "empty oracle asset id");
            mapped[i] = asset;
        }
        env::log_str(&format!("price oracle set to {oracle} for {} fighters", mapped.iter().filter(|a| !a.is_empty()).count()));
        self.oracle = Some(oracle);
        self.oracle_assets = mapped;
        self.oracle_halves = vec![OracleHalf::default(); n];
    }
}

// ── The Nov 9 layout, read once by `migrate` ─────────────────────────────────────────────────

#[derive(BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct OldPriceEntry {
    open_e8: u128,
    last_e8: u128,
    ts_ms: u64,
}

#[derive(BorshDeserialize)]
#[borsh(crate = "near_sdk::borsh")]
struct OldArena {
    owner: AccountId,
    treasury: AccountId,
    relayer_pk: Vec<u8>,
    tier_stakes: Vec<u128>,
    roster: Vec<Fighter>,
    prices: Vec<OldPriceEntry>,
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
