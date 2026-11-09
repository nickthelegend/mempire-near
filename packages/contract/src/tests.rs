// SPDX-License-Identifier: MIT
//! Unit tests: the Rust referee against matches recorded by the TypeScript engine, plus the
//! market-buff maths. Chain behaviour (escrow, keys, gas, seasons) is tested in tests/sandbox.rs.

use crate::sim::{self, Card, Input};
use crate::{bot, stat_bps, trait_for};
use near_sdk::serde_json::{self, Value};

fn fixtures() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/parity.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("run `pnpm --filter @mempire/sim fixtures` first")).unwrap()
}

fn cards(v: &Value) -> [Card; 8] {
    core::array::from_fn(|i| {
        let c = &v[i];
        Card { archetype: c[0].as_u64().unwrap() as u8, trait_: c[1].as_u64().unwrap() as u8, meta_bps: c[2].as_i64().unwrap() as i16 }
    })
}

#[test]
fn rust_referee_matches_the_typescript_engine_on_recorded_matches() {
    let all = fixtures();
    let list = all["fixtures"].as_array().unwrap();
    assert!(list.len() >= 20);
    let mut ticks = 0;
    for (k, f) in list.iter().enumerate() {
        let format = f["format"].as_u64().unwrap() as u8;
        let mut s = sim::create_match(f["seed"].as_u64().unwrap() as u32, [cards(&f["cards"][0]), cards(&f["cards"][1])], format);
        assert_eq!(sim::hash_state(&s) as u64, f["initialHash"].as_u64().unwrap(), "fixture {k}: initial hash");
        let log: Vec<Input> = f["plays"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| Input {
                tick: p[0].as_u64().unwrap() as u32,
                player: p[1].as_u64().unwrap() as u8,
                deck_index: p[2].as_u64().unwrap() as u8,
                x: p[3].as_i64().unwrap() as i32,
                y: p[4].as_i64().unwrap() as i32,
            })
            .collect();
        let house = f["house"].as_u64().map(|h| h as u8);
        let checkpoints: Vec<(i64, u32)> = f["checkpoints"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| (c[0].as_i64().unwrap(), c[1].as_u64().unwrap() as u32))
            .collect();
        let mut pending: Vec<Input> = Vec::new();
        let mut cp = 0;
        while s.phase != sim::PHASE_ENDED {
            let tick = s.tick;
            if let Some(level) = house {
                if let Some(ev) = bot::decide_bot(&s, 1, level) {
                    pending.push(ev);
                }
            }
            let mut now: Vec<Input> = log.iter().filter(|e| e.tick as i64 == tick).copied().collect();
            pending.retain(|e| {
                if e.tick as i64 == tick {
                    now.push(*e);
                }
                e.tick as i64 > tick
            });
            sim::step_sim(&mut s, &now);
            if cp < checkpoints.len() && checkpoints[cp].0 == s.tick {
                assert_eq!(sim::hash_state(&s), checkpoints[cp].1, "fixture {k}: hash diverged at tick {}", s.tick);
                cp += 1;
            }
        }
        ticks += s.tick;
        let winner = if s.winner == -2 { 2 } else { s.winner };
        assert_eq!(winner, f["winner"].as_i64().unwrap(), "fixture {k}: winner");
        assert_eq!(s.tick, f["endTick"].as_i64().unwrap(), "fixture {k}: end tick");
        assert_eq!(sim::hash_state(&s) as u64, f["finalHash"].as_u64().unwrap(), "fixture {k}: final hash");
    }
    assert!(ticks > 10_000);
}

#[test]
fn traits_are_derived_from_the_ticker_like_the_typescript_engine() {
    // [5,3,3,4,5,5,1,4,5,5,4] is traitFor() of the roster in packages/sim (traits.ts)
    let tickers = ["WIF", "HATS", "DOGGO", "PENG", "MOONCAT", "RKT", "BTC", "ETH", "NEAR", "SOL", "ZEC"];
    let expected = [5u8, 3, 3, 4, 5, 5, 1, 4, 5, 5, 4];
    for (t, e) in tickers.iter().zip(expected) {
        assert_eq!(trait_for(t), e, "{t}");
    }
}

#[test]
fn market_buff_is_twice_the_24h_move_capped_at_15_percent() {
    // +2 % move -> +4 % stat change (400 bps)
    assert_eq!(stat_bps(100_00000000, 102_00000000), 400);
    // -1.23 % -> -246 bps, truncated toward zero like the Solidity original
    assert_eq!(stat_bps(100_00000000, 98_77000000), -246);
    assert_eq!(stat_bps(100_00000000, 98_76999999), -246);
    // capped both ways
    assert_eq!(stat_bps(100_00000000, 150_00000000), 1500);
    assert_eq!(stat_bps(100_00000000, 10_00000000), -1500);
    assert_eq!(stat_bps(0, 5), 0);
    // live Coinbase-shaped numbers: BTC open 75678.8, last 75011.37 -> -0.88 % move -> -176 bps
    assert_eq!(stat_bps(7_567_880_000_000, 7_501_137_000_000), -176);
}

#[test]
fn floor_division_rounds_toward_minus_infinity() {
    assert_eq!(sim::floor_div(-7, 2), -4);
    assert_eq!(sim::floor_div(7, 2), 3);
    assert_eq!(sim::floor_div(-8, 2), -4);
    assert_eq!(sim::isqrt(1_000_000), 1000);
    assert_eq!(sim::isqrt(999_999), 999);
}
