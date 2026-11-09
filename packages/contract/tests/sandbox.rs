// SPDX-License-Identifier: MIT
//! Integration tests on a real local nearcore sandbox. Nothing is mocked: every play is a signed
//! transaction from a per-match function-call key, prices are ed25519-signed snapshots verified
//! by the contract, and the winner is whatever the contract's own replay says.
//!
//! Build the wasm first: `cargo near build non-reproducible-wasm --no-abi`.
//! Matches run in real time (a Rush match is 30 s plus a 10 s start delay and 5 s of late window),
//! so each test takes about a minute.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signer, SigningKey};
use mempire_arena::{bot, sim};
use near_workspaces::types::{AccessKey, Gas, KeyType, NearToken, SecretKey};
use near_workspaces::{network::Sandbox, Account, Contract, Worker};
use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/target/near/mempire_arena.wasm");
const RUSH: u8 = 1;
const DECK_A: [u8; 8] = [0, 1, 2, 3, 4, 5, 6, 8];
const DECK_B: [u8; 8] = [0, 9, 2, 10, 4, 7, 6, 3];

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

struct Env {
    worker: Worker<Sandbox>,
    arena: Contract,
    relayer: SigningKey,
    treasury: Account,
}

fn tier_stakes() -> Value {
    json!(["10000000000000000000000", "100000000000000000000000", "500000000000000000000000", "1000000000000000000000000"])
}

async fn deploy(first_season_minutes: u64) -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(WASM)?;
    let arena = worker.dev_deploy(&wasm).await?;
    let treasury = worker.dev_create_account().await?;
    let relayer = SigningKey::generate(&mut rand::rngs::OsRng);
    let pk = format!("ed25519:{}", bs58::encode(relayer.verifying_key().to_bytes()).into_string());
    arena
        .call("new")
        .args_json(json!({
            "owner": arena.id(), "treasury": treasury.id(), "relayer_pk": pk, "tier_stakes": tier_stakes(),
            "first_season_minutes": first_season_minutes,
            "price_source": "https://api.exchange.coinbase.com/products/{SYMBOL}-USD/stats",
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(Env { worker, arena, relayer, treasury })
}

fn signed_prices(relayer: &SigningKey, ts_ms: u64, rows: &[(&str, u128, u128)]) -> Value {
    let payload = json!({
        "ts_ms": ts_ms,
        "source": "https://api.exchange.coinbase.com/products/{SYMBOL}-USD/stats",
        "prices": rows.iter().map(|(t, o, l)| json!([t, o.to_string(), l.to_string()])).collect::<Vec<_>>(),
    })
    .to_string();
    let sig = relayer.sign(payload.as_bytes());
    json!({ "payload": payload, "signature": B64.encode(sig.to_bytes()) })
}

async fn post_default_prices(env: &Env) -> anyhow::Result<()> {
    let args = signed_prices(
        &env.relayer,
        now_ms(),
        &[("BTC", 7_567_880_000_000, 7_501_137_000_000), ("ETH", 222_779_000_000, 213_538_000_000), ("NEAR", 360_450_000, 363_300_000), ("SOL", 8_892_000_000, 8_708_000_000), ("ZEC", 125_052_000_000, 119_618_000_000)],
    );
    env.arena.call("post_prices").args_json(args).transact().await?.into_result()?;
    Ok(())
}

fn cards(config: &Value, deck: &[u8], mods: &[i64]) -> [sim::Card; 8] {
    core::array::from_fn(|i| {
        let f = &config["roster"][deck[i] as usize];
        sim::Card { archetype: f["archetype"].as_u64().unwrap() as u8, trait_: f["trait_id"].as_u64().unwrap() as u8, meta_bps: mods[i] as i16 }
    })
}

fn deck_of(m: &Value, key: &str) -> Vec<u8> {
    m[key].as_array().unwrap().iter().map(|v| v.as_u64().unwrap() as u8).collect()
}

/// The plays each human seat will send: the published bot for that seat, simulated offline
/// against the opponent (the other bot, or the house bot the referee runs).
fn plan(config: &Value, m: &Value) -> [Vec<sim::Input>; 2] {
    let mods: Vec<i64> = m["mods"].as_array().unwrap().iter().map(|v| v.as_i64().unwrap()).collect();
    let house = m["house"].as_u64();
    let mut s = sim::create_match(m["seed"].as_u64().unwrap() as u32, [cards(config, &deck_of(m, "deck0"), &mods[..8]), cards(config, &deck_of(m, "deck1"), &mods[8..])], m["format"].as_u64().unwrap() as u8);
    let mut log: Vec<sim::Input> = Vec::new();
    let mut pending: Vec<sim::Input> = Vec::new();
    while s.phase != sim::PHASE_ENDED {
        let t = s.tick;
        if let Some(e) = bot::decide_bot(&s, 0, 2) {
            log.push(e);
        }
        match house {
            Some(_) => {
                if let Some(e) = bot::decide_bot(&s, 1, 1) {
                    pending.push(e);
                }
            }
            None => {
                if let Some(e) = bot::decide_bot(&s, 1, 1) {
                    log.push(e);
                }
            }
        }
        let mut now: Vec<sim::Input> = log.iter().filter(|e| e.tick as i64 == t).copied().collect();
        now.extend(pending.iter().filter(|e| e.tick as i64 == t).copied());
        pending.retain(|e| e.tick as i64 > t);
        sim::step_sim(&mut s, &now);
    }
    [log.iter().filter(|e| e.player == 0).copied().collect(), log.iter().filter(|e| e.player == 1).copied().collect()]
}

/// Send a seat's plays in real time through its session key.
async fn drive(session: Account, arena: near_workspaces::AccountId, id: u64, start_ms: u64, plays: Vec<sim::Input>) -> (u32, u32) {
    let (mut ok, mut refused) = (0, 0);
    for p in plays {
        loop {
            let now_tick = now_ms().saturating_sub(start_ms) * 20 / 1000;
            if now_tick + 40 >= p.tick as u64 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        let res = session
            .call(&arena, "play")
            .args_json(json!({ "id": id.to_string(), "tick": p.tick, "deck_index": p.deck_index, "x": p.x, "y": p.y }))
            .gas(Gas::from_tgas(15))
            .transact()
            .await;
        match res.map(|r| r.is_success()) {
            Ok(true) => ok += 1,
            _ => refused += 1,
        }
    }
    (ok, refused)
}

async fn wait_until(ms: u64) {
    while now_ms() < ms {
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

async fn view(arena: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(arena.view(method).args_json(args).await?.json()?)
}

/// Replays the on-chain log off-chain with the same Rust engine the contract runs and returns
/// (winner, end tick, final hash): what an honest client computes before it claims.
fn offline_result(config: &Value, m: &Value, log: &Value) -> (u8, u32, u32) {
    let mods: Vec<i64> = m["mods"].as_array().unwrap().iter().map(|v| v.as_i64().unwrap()).collect();
    let mut s = sim::create_match(m["seed"].as_u64().unwrap() as u32, [cards(config, &deck_of(m, "deck0"), &mods[..8]), cards(config, &deck_of(m, "deck1"), &mods[8..])], m["format"].as_u64().unwrap() as u8);
    let plays: Vec<sim::Input> = log
        .as_array()
        .unwrap()
        .iter()
        .map(|p| sim::Input { tick: p["tick"].as_u64().unwrap() as u32, player: p["seat"].as_u64().unwrap() as u8, deck_index: p["deck_index"].as_u64().unwrap() as u8, x: p["x"].as_i64().unwrap() as i32, y: p["y"].as_i64().unwrap() as i32 })
        .collect();
    let house = m["house"].as_u64();
    let mut pending: Vec<sim::Input> = Vec::new();
    while s.phase != sim::PHASE_ENDED {
        let t = s.tick;
        if house.is_some() {
            if let Some(e) = bot::decide_bot(&s, 1, 1) {
                pending.push(e);
            }
        }
        let mut now: Vec<sim::Input> = plays.iter().filter(|e| e.tick as i64 == t).copied().collect();
        now.extend(pending.iter().filter(|e| e.tick as i64 == t).copied());
        pending.retain(|e| e.tick as i64 > t);
        sim::step_sim(&mut s, &now);
    }
    (if s.winner == -2 { 2 } else { s.winner as u8 }, s.tick as u32, sim::hash_state(&s))
}

fn balance_of(v: &near_workspaces::types::NearToken) -> u128 {
    v.as_yoctonear()
}

#[tokio::test]
async fn pvp_match_is_refereed_on_chain_and_fake_claims_are_rejected() -> anyhow::Result<()> {
    let env = deploy(60).await?;
    post_default_prices(&env).await?;
    let config = view(&env.arena, "get_config", json!({})).await?;
    let a = env.worker.dev_create_account().await?;
    let b = env.worker.dev_create_account().await?;
    let worker = env.worker.clone();
    let (ska, _) = session_key_raw(&a, &env.arena).await?;
    let (skb, _) = session_key_raw(&b, &env.arena).await?;
    let stake = NearToken::from_yoctonear(10_000_000_000_000_000_000_000);

    // escrow: wrong amount refused, own match refused
    let bad = a.call(env.arena.id(), "create_match").args_json(json!({"tier": 0, "format": RUSH, "deck": DECK_A, "session_key": ska.public_key()})).deposit(NearToken::from_millinear(5)).transact().await?;
    assert!(!bad.is_success(), "a short stake must be refused");
    let id: String = a.call(env.arena.id(), "create_match").args_json(json!({"tier": 0, "format": RUSH, "deck": DECK_A, "session_key": ska.public_key()})).deposit(stake).transact().await?.json()?;
    let own = a.call(env.arena.id(), "join_match").args_json(json!({"id": id, "deck": DECK_B})).deposit(stake).transact().await?;
    assert!(!own.is_success(), "joining your own match must be refused");
    b.call(env.arena.id(), "join_match").args_json(json!({"id": id, "deck": DECK_B, "session_key": skb.public_key()})).deposit(stake).transact().await?.into_result()?;
    let m = view(&env.arena, "get_match", json!({"id": id})).await?;
    assert_eq!(m["state"], 2);
    // the market read at kick-off: BTC (slot 6 of deck A) -0.88 % move -> -176 bps, house fighters neutral
    assert_eq!(m["mods"][6], -176);
    assert_eq!(m["status"][0], 1);

    // session-key scope: it cannot stake, cannot move funds, cannot call anything but play
    let sa = Account::from_secret_key(a.id().clone(), ska.clone(), &worker);
    let r = sa.call(env.arena.id(), "create_match").args_json(json!({"tier": 0, "format": RUSH, "deck": DECK_A})).deposit(stake).transact().await;
    assert!(r.map(|r| !r.is_success()).unwrap_or(true), "a session key must not stake");
    let r = sa.call(env.arena.id(), "settle").args_json(json!({"id": id})).transact().await;
    assert!(r.map(|r| !r.is_success()).unwrap_or(true), "a session key must not call settle");
    let r = sa.transfer_near(b.id(), NearToken::from_millinear(1)).await;
    assert!(r.map(|r| !r.is_success()).unwrap_or(true), "a session key must not transfer NEAR");

    // real-time plays from both session keys
    let start_ms = m["start_ms"].as_str().unwrap().parse::<u64>()?;
    let [p0, p1] = plan(&config, &m);
    let sb = Account::from_secret_key(b.id().clone(), skb.clone(), &worker);
    let id_n: u64 = id.parse()?;
    let ha = tokio::spawn(drive(sa, env.arena.id().clone(), id_n, start_ms, p0));
    let hb = tokio::spawn(drive(sb, env.arena.id().clone(), id_n, start_ms, p1));
    let (ra, rb) = (ha.await?, hb.await?);
    println!("plays landed: seat0 {} (refused {}), seat1 {} (refused {})", ra.0, ra.1, rb.0, rb.1);
    assert!(ra.0 + rb.0 >= 6, "plays must land");

    // settling before close is refused
    let early = a.call(env.arena.id(), "settle").args_json(json!({"id": id})).max_gas().transact().await?;
    assert!(!early.is_success());
    let m = view(&env.arena, "get_match", json!({"id": id})).await?;
    wait_until(m["close_ms"].as_str().unwrap().parse::<u64>()? + 1500).await;

    let log = view(&env.arena, "get_plays", json!({"id": id})).await?;
    let (winner, end_tick, hash) = offline_result(&config, &m, &log);
    // both players claim the opposite of what happened: both are rejected
    let fake = if winner == 0 { 1 } else { 0 };
    for p in [&a, &b] {
        let r = p.call(env.arena.id(), "settle").args_json(json!({"id": id, "claim": {"winner": fake, "end_tick": end_tick, "final_hash": hash}})).max_gas().transact().await?;
        assert!(!r.is_success(), "a fake winner claim must be rejected");
        assert!(format!("{:?}", r.into_result().unwrap_err()).contains("claim rejected by the referee"));
    }
    // a forged hash with the right winner is rejected too
    let r = a.call(env.arena.id(), "settle").args_json(json!({"id": id, "claim": {"winner": winner, "end_tick": end_tick, "final_hash": hash ^ 1}})).max_gas().transact().await?;
    assert!(!r.is_success());

    // gas refunds from the rejected claims land a block or two later; let them settle first
    tokio::time::sleep(Duration::from_secs(4)).await;
    let before_a = a.view_account().await?.balance;
    let before_b = b.view_account().await?.balance;
    let before_t = env.treasury.view_account().await?.balance;
    let honest = env.worker.dev_create_account().await?; // anyone can settle with the true result
    let res = honest.call(env.arena.id(), "settle").args_json(json!({"id": id, "claim": {"winner": winner, "end_tick": end_tick, "final_hash": hash}})).max_gas().transact().await?;
    let gas = res.total_gas_burnt;
    let out: Value = res.into_result()?.json()?;
    println!("referee settle: {} plays, {} ticks, {} TGas, outcome {out}", log.as_array().unwrap().len(), end_tick, gas.as_tgas());
    assert_eq!(out["status"], "settled");
    assert_eq!(out["winner"], winner);
    let m = view(&env.arena, "get_match", json!({"id": id})).await?;
    assert_eq!(m["state"], 3);
    assert_eq!(m["final_hash"], hash);
    let pot = 2 * 10_000_000_000_000_000_000_000u128;
    let after_a = a.view_account().await?.balance;
    let after_b = b.view_account().await?.balance;
    let after_t = env.treasury.view_account().await?.balance;
    match winner {
        0 => assert_eq!(balance_of(&after_a) - balance_of(&before_a), pot * 92 / 100),
        1 => assert_eq!(balance_of(&after_b) - balance_of(&before_b), pot * 92 / 100),
        _ => assert_eq!(balance_of(&after_a) - balance_of(&before_a), pot * 92 / 200),
    }
    assert_eq!(balance_of(&after_t) - balance_of(&before_t), pot * 5 / 100);
    let season = view(&env.arena, "get_season", json!({"season": 0})).await?;
    assert_eq!(season["pool"], (pot * 3 / 100).to_string());
    if winner < 2 {
        assert_eq!(season["top"].as_array().unwrap().len(), 1);
    }
    // settled matches cannot be settled again
    let again = a.call(env.arena.id(), "settle").args_json(json!({"id": id})).max_gas().transact().await?;
    assert!(!again.is_success());
    // session keys are deleted after the match with the player's own full key
    a.batch(a.id()).delete_key(ska.public_key()).transact().await?.into_result()?;
    assert!(a.view_access_key(&ska.public_key()).await.is_err(), "session key deleted");
    Ok(())
}

/// A fresh per-match session key: a function-call key on the player's own account, limited to the
/// arena's `play` with a 0.25 NEAR gas allowance.
async fn session_key_raw(player: &Account, arena: &Contract) -> anyhow::Result<(SecretKey, ())> {
    let sk = SecretKey::from_random(KeyType::ED25519);
    player
        .batch(player.id())
        .add_key(sk.public_key(), AccessKey::function_call_access(arena.id(), &["play"], Some(NearToken::from_millinear(250))))
        .transact()
        .await?
        .into_result()?;
    Ok((sk, ()))
}

#[tokio::test]
async fn house_bot_plays_inside_the_referee_and_pays_from_its_treasury() -> anyhow::Result<()> {
    let env = deploy(60).await?;
    post_default_prices(&env).await?;
    let config = view(&env.arena, "get_config", json!({})).await?;
    let owner = env.arena.as_account();
    let house = owner.create_subaccount("kumo").initial_balance(NearToken::from_near(3)).transact().await?.into_result()?;
    owner.call(env.arena.id(), "add_house").args_json(json!({"account": house.id(), "name": "Kumo", "difficulty": 1, "tier": 0, "deck": [0, 1, 2, 3, 4, 5, 9, 10]})).transact().await?.into_result()?;
    let stranger = env.worker.dev_create_account().await?;
    let r = stranger.call(env.arena.id(), "house_deposit").deposit(NearToken::from_near(1)).transact().await?;
    assert!(!r.is_success(), "only the house account funds its treasury");
    let r = stranger.call(env.arena.id(), "add_house").args_json(json!({"account": stranger.id(), "name": "x", "difficulty": 1, "tier": 0, "deck": DECK_A})).transact().await?;
    assert!(!r.is_success(), "only the owner adds houses");
    house.call(env.arena.id(), "house_deposit").deposit(NearToken::from_near(1)).transact().await?.into_result()?;

    let player = env.worker.dev_create_account().await?;
    let (sk, _) = session_key_raw(&player, &env.arena).await?;
    let stake = NearToken::from_yoctonear(10_000_000_000_000_000_000_000);
    let id: String = player.call(env.arena.id(), "challenge_house").args_json(json!({"house": 0, "format": RUSH, "deck": DECK_A, "session_key": sk.public_key()})).deposit(stake).transact().await?.json()?;
    let houses = view(&env.arena, "get_houses", json!({})).await?;
    assert_eq!(houses[0]["treasury"], "990000000000000000000000");
    assert_eq!(houses[0]["in_play"], "10000000000000000000000");
    // the house account cannot send plays: the referee plays for it
    let r = house.call(env.arena.id(), "play").args_json(json!({"id": id, "tick": 0, "deck_index": 0, "x": 9000, "y": 20000})).transact().await?;
    assert!(!r.is_success());

    let m = view(&env.arena, "get_match", json!({"id": id})).await?;
    let start_ms = m["start_ms"].as_str().unwrap().parse::<u64>()?;
    let [p0, _] = plan(&config, &m);
    let session = Account::from_secret_key(player.id().clone(), sk, &env.worker);
    let landed = drive(session, env.arena.id().clone(), id.parse()?, start_ms, p0).await;
    println!("house match plays landed {} refused {}", landed.0, landed.1);
    wait_until(m["close_ms"].as_str().unwrap().parse::<u64>()? + 1500).await;

    // checkpointed replay: a small gas budget makes the referee stop and resume
    let partial = stranger.call(env.arena.id(), "settle").args_json(json!({"id": id})).gas(Gas::from_tgas(60)).transact().await?;
    let p: Value = partial.into_result()?.json()?;
    println!("partial referee call: {p}");
    let mut calls = 1;
    let mut out = p;
    while out["status"] == "replaying" {
        out = stranger.call(env.arena.id(), "settle").args_json(json!({"id": id})).gas(Gas::from_tgas(60)).transact().await?.into_result()?.json()?;
        calls += 1;
        assert!(calls < 40);
    }
    println!("house match settled over {calls} referee calls of 60 TGas: {out}");
    let log = view(&env.arena, "get_plays", json!({"id": id})).await?;
    let (winner, end_tick, hash) = offline_result(&config, &m, &log);
    assert_eq!(out["winner"], winner);
    assert_eq!(out["end_tick"], end_tick);
    assert_eq!(out["final_hash"], hash);
    let houses = view(&env.arena, "get_houses", json!({})).await?;
    assert_eq!(houses[0]["in_play"], "0");
    let pot = 2 * 10_000_000_000_000_000_000_000u128;
    let treasury = houses[0]["treasury"].as_str().unwrap().parse::<u128>()?;
    match winner {
        1 => {
            assert_eq!(houses[0]["wins"], 1);
            assert_eq!(treasury, 990_000_000_000_000_000_000_000 + pot * 92 / 100);
        }
        0 => {
            assert_eq!(houses[0]["losses"], 1);
            assert_eq!(treasury, 990_000_000_000_000_000_000_000);
        }
        _ => assert_eq!(treasury, 990_000_000_000_000_000_000_000 + pot * 92 / 200),
    }
    // a house withdraws only its own treasury
    let r = stranger.call(env.arena.id(), "house_withdraw").args_json(json!({"amount": "1"})).transact().await?;
    assert!(!r.is_success());
    house.call(env.arena.id(), "house_withdraw").args_json(json!({"amount": "100000000000000000000000"})).transact().await?.into_result()?;
    Ok(())
}

#[tokio::test]
async fn prices_need_the_relayer_signature_and_open_matches_refund() -> anyhow::Result<()> {
    let env = deploy(60).await?;
    // a snapshot signed by anyone else is refused
    let impostor = SigningKey::generate(&mut rand::rngs::OsRng);
    let r = env.arena.call("post_prices").args_json(signed_prices(&impostor, now_ms(), &[("BTC", 1, 2)])).transact().await?;
    assert!(!r.is_success(), "an impostor's snapshot must be refused");
    // a stale snapshot is refused
    let r = env.arena.call("post_prices").args_json(signed_prices(&env.relayer, now_ms() - 3_600_000, &[("BTC", 1, 2)])).transact().await?;
    assert!(!r.is_success());
    // a tampered payload (signature over different bytes) is refused
    let mut args = signed_prices(&env.relayer, now_ms(), &[("BTC", 100, 101)]);
    args["payload"] = Value::String(args["payload"].as_str().unwrap().replace("101", "150"));
    let r = env.arena.call("post_prices").args_json(args).transact().await?;
    assert!(!r.is_success());
    post_default_prices(&env).await?;
    let prices = view(&env.arena, "get_prices", json!({})).await?;
    assert_eq!(prices["prices"][0]["ticker"], "BTC");
    assert_eq!(prices["prices"][0]["stat_bps"], -176);

    // an open match refunds its creator on cancel; a stranger cannot cancel early
    let a = env.worker.dev_create_account().await?;
    let stranger = env.worker.dev_create_account().await?;
    let stake = NearToken::from_yoctonear(10_000_000_000_000_000_000_000);
    let id: String = a.call(env.arena.id(), "create_match").args_json(json!({"tier": 0, "format": RUSH, "deck": DECK_A})).deposit(stake).transact().await?.json()?;
    let open = view(&env.arena, "open_matches", json!({})).await?;
    assert_eq!(open[1], id);
    let r = stranger.call(env.arena.id(), "cancel_match").args_json(json!({"id": id})).transact().await?;
    assert!(!r.is_success());
    let before = a.view_account().await?.balance;
    let res = a.call(env.arena.id(), "cancel_match").args_json(json!({"id": id})).transact().await?;
    let burnt = res.total_gas_burnt;
    res.into_result()?;
    let after = a.view_account().await?.balance;
    // refunded stake minus at most the gas this call burnt
    assert!(after.as_yoctonear() + burnt.as_gas() as u128 * 100_000_000 >= before.as_yoctonear() + stake.as_yoctonear() - 1_000_000_000_000_000_000_000);
    let m = view(&env.arena, "get_match", json!({"id": id})).await?;
    assert_eq!(m["state"], 4);
    let r = a.call(env.arena.id(), "join_match").args_json(json!({"id": id, "deck": DECK_B})).deposit(stake).transact().await?;
    assert!(!r.is_success(), "a cancelled match cannot be joined");
    Ok(())
}

#[tokio::test]
async fn weekly_season_pays_its_top_three_automatically() -> anyhow::Result<()> {
    // season 0 is a 1-minute launch season here so the test can cross a season boundary
    let env = deploy(1).await?;
    post_default_prices(&env).await?;
    let config = view(&env.arena, "get_config", json!({})).await?;
    let genesis_end = config["first_season_end_ms"].as_str().unwrap().parse::<u64>()?;
    let a = env.worker.dev_create_account().await?;
    let b = env.worker.dev_create_account().await?;
    let (ska, _) = session_key_raw(&a, &env.arena).await?;
    let stake = NearToken::from_yoctonear(10_000_000_000_000_000_000_000);
    let id: String = a.call(env.arena.id(), "create_match").args_json(json!({"tier": 0, "format": RUSH, "deck": DECK_A, "session_key": ska.public_key()})).deposit(stake).transact().await?.json()?;
    b.call(env.arena.id(), "join_match").args_json(json!({"id": id, "deck": DECK_B})).deposit(stake).transact().await?.into_result()?;
    let m = view(&env.arena, "get_match", json!({"id": id})).await?;
    let start_ms = m["start_ms"].as_str().unwrap().parse::<u64>()?;
    let [p0, _] = plan(&config, &m);
    // seat 0 plays the hard bot, seat 1 plays nothing: seat 0 should take towers
    let session = Account::from_secret_key(a.id().clone(), ska, &env.worker);
    drive(session, env.arena.id().clone(), id.parse()?, start_ms, p0).await;
    wait_until(m["close_ms"].as_str().unwrap().parse::<u64>()? + 1500).await;
    assert!(now_ms() < genesis_end + 60_000);
    let out: Value = b.call(env.arena.id(), "settle").args_json(json!({"id": id})).max_gas().transact().await?.into_result()?.json()?;
    let m = view(&env.arena, "get_match", json!({"id": id})).await?;
    let season_of_match = m["season"].as_u64().unwrap();
    println!("season match settled in season {season_of_match}: {out}");
    let pool = view(&env.arena, "get_season", json!({"season": season_of_match})).await?;
    let top = pool["top"].as_array().unwrap().clone();
    let pool_amount = pool["pool"].as_str().unwrap().parse::<u128>()?;
    assert!(pool_amount >= 2 * 10_000_000_000_000_000_000_000u128 * 3 / 100);

    // too early to finalize the current season
    let r = a.call(env.arena.id(), "finalize_season").args_json(json!({"season": season_of_match + 5})).transact().await?;
    assert!(!r.is_success());
    // after the boundary, anyone finalizes; top 1 receives 50 % (2nd/3rd shares roll over)
    let next = if season_of_match == 0 { genesis_end } else { genesis_end + season_of_match * 7 * 24 * 3600 * 1000 };
    wait_until(next + 2000).await;
    let first = top.first().map(|t| t["account"].as_str().unwrap().to_string());
    let before = match &first {
        Some(w) if w == a.id().as_str() => a.view_account().await?.balance.as_yoctonear(),
        Some(_) => b.view_account().await?.balance.as_yoctonear(),
        None => 0,
    };
    a.call(env.arena.id(), "finalize_season").args_json(json!({"season": season_of_match})).transact().await?.into_result()?;
    let done = view(&env.arena, "get_season", json!({"season": season_of_match})).await?;
    println!("season {season_of_match} finalized: {done}");
    assert_eq!(done["finalized"], true);
    if let Some(w) = first {
        let after = if w == a.id().as_str() { a.view_account().await?.balance.as_yoctonear() } else { b.view_account().await?.balance.as_yoctonear() };
        let paid = done["paid"][0]["amount"].as_str().unwrap().parse::<u128>()?;
        assert_eq!(paid, pool_amount * 50 / 100);
        // the winner did not sign the finalize call, so the full share arrives
        if w != a.id().as_str() {
            assert_eq!(after - before, paid);
        }
        let next_pool = view(&env.arena, "get_season", json!({"season": season_of_match + 1})).await?;
        assert_eq!(next_pool["pool"].as_str().unwrap().parse::<u128>()?, pool_amount - paid);
    }
    let r = a.call(env.arena.id(), "finalize_season").args_json(json!({"season": season_of_match})).transact().await?;
    assert!(!r.is_success(), "a season pays once");
    Ok(())
}
