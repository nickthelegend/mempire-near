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

// ── OutLayer TEE oracle: parsing, combining and who may deliver ─────────────────────────────

mod oracle_rules {
    use crate::oracle::{self, combine, decimal_to_e8, to_e8, CustomDataResult, OracleAssetPrice, OracleHalf, OraclePrice, OraclePriceData};
    use crate::{Arena, PriceEntry, SRC_ORACLE, SRC_RELAYER};
    use near_sdk::json_types::{U128, U64};
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, AccountId, NearToken, PublicKey};

    const NOW: u64 = 1_794_604_654_871; // ms, the probe's block time
    fn acc(s: &str) -> AccountId { s.parse().unwrap() }
    fn ctx(predecessor: &str, now_ms: u64) {
        testing_env!(VMContextBuilder::new()
            .current_account_id(acc("arena.testnet"))
            .predecessor_account_id(acc(predecessor))
            .block_timestamp(now_ms * 1_000_000)
            .attached_deposit(NearToken::from_yoctonear(0))
            .build());
    }
    fn relayer_key() -> ed25519_dalek::SigningKey { ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]) }
    fn arena() -> Arena {
        ctx("arena.testnet", NOW);
        let pk: PublicKey = format!("ed25519:{}", bs58::encode(relayer_key().verifying_key().to_bytes()).into_string()).parse().unwrap();
        let stakes = vec![U128(1), U128(2), U128(3), U128(4)];
        let mut a = Arena::new(acc("arena.testnet"), acc("treasury.testnet"), pk, stakes, 90, "relayer".into());
        a.set_oracle(acc("price-oracle.testnet"), oracle::DEFAULT_ASSETS.iter().map(|(t, s)| (t.to_string(), s.to_string())).collect());
        a
    }
    fn spot(ts_ms: u64, rows: &[(&str, Option<u128>)]) -> OraclePriceData {
        OraclePriceData {
            timestamp: U64(ts_ms * 1_000_000),
            recency_duration_sec: 300,
            prices: rows.iter().map(|(a, m)| OracleAssetPrice { asset_id: a.to_string(), price: m.map(|m| OraclePrice { multiplier: U128(m), decimals: 8 }) }).collect(),
        }
    }
    fn opens(ts_s: u64, rows: &[(&str, f64)]) -> Vec<CustomDataResult> {
        rows.iter().map(|(t, v)| CustomDataResult { id: format!("{t}:open24h"), value: Some(json!(v)), timestamp: Some(ts_s), error: None }).collect()
    }
    fn price(a: &Arena, ticker: &str) -> near_sdk::serde_json::Value {
        a.get_prices()["prices"].as_array().unwrap().iter().find(|r| r["ticker"] == ticker).unwrap().clone()
    }

    #[test]
    fn decimals_parse_without_floats() {
        assert_eq!(decimal_to_e8("71461.82"), Some(7_146_182_000_000));
        assert_eq!(decimal_to_e8("3.3938"), Some(339_380_000));
        assert_eq!(decimal_to_e8("943"), Some(94_300_000_000));
        assert_eq!(decimal_to_e8("0.12345678"), Some(12_345_678));
        for bad in ["", ".5", "5.", "-1", "1e5", "1.123456789", "12a", "+3"] {
            assert_eq!(decimal_to_e8(bad), None, "{bad}");
        }
        assert_eq!(to_e8(6_854_400_666_666, 8), Some(6_854_400_666_666));
        assert_eq!(to_e8(68_544, 0), Some(6_854_400_000_000));
        assert_eq!(to_e8(685_440_066_666_660, 10), Some(6_854_400_666_666));
    }

    #[test]
    fn halves_combine_only_when_both_fresh_and_close() {
        let cur = PriceEntry::default();
        let h = OracleHalf { spot_e8: 102, spot_ms: NOW, open_e8: 100, open_ms: NOW - 60_000 };
        let e = combine(&h, &cur, NOW).unwrap();
        assert_eq!((e.open_e8, e.last_e8, e.ts_ms, e.source), (100, 102, NOW - 60_000, SRC_ORACLE));
        // a missing half, halves 16 min apart, or a reading 16 min old never count
        assert!(combine(&OracleHalf { open_ms: 0, ..h.clone() }, &cur, NOW).is_none());
        assert!(combine(&OracleHalf { open_ms: NOW - 16 * 60_000, ..h.clone() }, &cur, NOW).is_none());
        assert!(combine(&h, &cur, NOW + 16 * 60_000).is_none());
        // an oracle price is only replaced by a newer oracle reading; a relayer price always yields
        let held = PriceEntry { open_e8: 1, last_e8: 1, ts_ms: NOW, source: SRC_ORACLE };
        assert!(combine(&h, &held, NOW).is_none());
        let relayer = PriceEntry { ts_ms: NOW + 1, source: SRC_RELAYER, ..held };
        assert!(combine(&h, &relayer, NOW).is_some());
    }

    #[test]
    fn oracle_prices_land_from_both_callbacks_and_are_labelled() {
        let mut a = arena();
        ctx("price-oracle.testnet", NOW);
        // spot alone changes nothing yet
        assert_eq!(a.oracle_on_call(acc("arena.testnet"), spot(NOW, &[("nbtc.bridge.near", Some(6_854_400_666_666)), ("aurora", None)]), "mempire:spot".into()), 0);
        assert_eq!(price(&a, "BTC")["source"], "none");
        let n = a.on_custom_data(acc("arena.testnet"), opens(NOW / 1000 + 20, &[("BTC", 71461.82), ("ETH", 2015.04)]), "mempire:open24h".into());
        assert_eq!(n, 1, "BTC has both halves; ETH has no spot");
        let btc = price(&a, "BTC");
        assert_eq!(btc["source"], "oracle");
        assert_eq!(btc["oracle_asset"], "nbtc.bridge.near");
        assert_eq!(btc["last_e8"], "6854400666666");
        assert_eq!(btc["open_e8"], "7146182000000");
        assert_eq!(btc["status"], 0);
        assert_eq!(btc["stat_bps"], -816); // 2 x -4.08 %
        assert_eq!(a.get_oracle()["updates"], "1");
    }

    #[test]
    #[should_panic(expected = "only the configured price oracle can deliver prices")]
    fn spot_from_anyone_but_the_oracle_is_refused() {
        let mut a = arena();
        ctx("attacker.testnet", NOW);
        a.oracle_on_call(acc("attacker.testnet"), spot(NOW, &[("nbtc.bridge.near", Some(1))]), "mempire:spot".into());
    }

    #[test]
    #[should_panic(expected = "custom data counts only when the arena requested it")]
    fn custom_data_someone_else_asked_the_oracle_for_is_refused() {
        // anyone can call price-oracle.custom_call(receiver_id = arena) with their own URL
        let mut a = arena();
        ctx("price-oracle.testnet", NOW);
        a.on_custom_data(acc("attacker.testnet"), opens(NOW / 1000, &[("BTC", 1.0)]), "mempire:open24h".into());
    }

    #[test]
    fn relayer_fallback_never_overwrites_a_live_oracle_price() {
        let mut a = arena();
        ctx("price-oracle.testnet", NOW);
        a.oracle_on_call(acc("x.testnet"), spot(NOW, &[("wrap.near", Some(351_140_000))]), "mempire:spot".into());
        a.on_custom_data(acc("arena.testnet"), opens(NOW / 1000, &[("NEAR", 3.3938)]), "mempire:open24h".into());
        assert_eq!(price(&a, "NEAR")["source"], "oracle");
        assert_eq!(price(&a, "NEAR")["stat_bps"], 693);
        // a newer, validly signed relayer snapshot: NEAR keeps its oracle price, SOL (no oracle
        // reading yet) takes the relayer price and is labelled as such
        use ed25519_dalek::Signer;
        let payload = json!({ "ts_ms": NOW + 60_000, "source": "relayer", "prices": [["NEAR", "100000000", "200000000"], ["SOL", "8000000000", "8100000000"]] }).to_string();
        let sig = relayer_key().sign(payload.as_bytes()).to_bytes().to_vec();
        ctx("anyone.testnet", NOW + 60_000);
        assert_eq!(a.post_prices(payload, sig.into()), 1);
        assert_eq!(price(&a, "NEAR")["source"], "oracle");
        assert_eq!(price(&a, "NEAR")["last_e8"], "351140000");
        assert_eq!(price(&a, "SOL")["source"], "relayer");
    }

    #[test]
    #[should_panic(expected = "attach at least 0.02 NEAR")]
    fn refresh_needs_the_outlayer_deposit() {
        let mut a = arena();
        a.refresh_prices();
    }
}
