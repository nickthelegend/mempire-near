// SPDX-License-Identifier: MIT
//! OutLayer TEE price oracle, on a real local nearcore sandbox.
//!
//! The oracle here is the exact bytecode deployed at `price-oracle.testnet` (v0.7.0, code hash
//! C1frAe93wcjtGjeavZDA6znsV5EUnKJFWuX24vTmH3ZV, saved in tests/fixtures), set up through its own
//! owner methods and fed by a registered reporter account with `report_prices`. When its cache is fresh,
//! `oracle_call` answers without OutLayer, which is what lets the spot half run in the sandbox.
//! OutLayer itself (the TEE workers behind `custom_call`) does not exist in a sandbox, so the 24 h
//! open half and the full TEE path are proven on testnet instead (deployments/oracle-*.json).
//!
//! The migration test upgrades the exact Nov 9 arena bytecode (also in tests/fixtures) in place.
//!
//! Build the wasm first: `cargo near build non-reproducible-wasm --no-abi`.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use ed25519_dalek::{Signer, SigningKey};
use near_workspaces::types::NearToken;
use near_workspaces::{network::Sandbox, Account, Contract, Worker};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

const WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/target/near/mempire_arena.wasm");
const ORACLE_WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/price-oracle-testnet-v0.7.0.wasm");
const OLD_ARENA_WASM: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/arena-deployed-2026-11-09.wasm");

const ASSETS: [(&str, &str); 5] =
    [("BTC", "nbtc.bridge.near"), ("ETH", "aurora"), ("NEAR", "wrap.near"), ("SOL", "22.contract.portalbridge.near"), ("ZEC", "zec.omft.near")];

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

fn tier_stakes() -> Value {
    json!(["10000000000000000000000", "100000000000000000000000", "500000000000000000000000", "1000000000000000000000000"])
}

fn assets_arg() -> Value {
    json!(ASSETS.iter().map(|(t, a)| json!([t, a])).collect::<Vec<_>>())
}

async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}

fn row<'a>(prices: &'a Value, ticker: &str) -> &'a Value {
    prices["prices"].as_array().unwrap().iter().find(|r| r["ticker"] == ticker).unwrap()
}

async fn init_arena(arena: &Contract, treasury: &Account, relayer: &SigningKey) -> anyhow::Result<()> {
    let pk = format!("ed25519:{}", bs58::encode(relayer.verifying_key().to_bytes()).into_string());
    arena
        .call("new")
        .args_json(json!({
            "owner": arena.id(), "treasury": treasury.id(), "relayer_pk": pk, "tier_stakes": tier_stakes(),
            "first_season_minutes": 90, "price_source": "https://api.exchange.coinbase.com/products/{SYMBOL}-USD/stats",
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

fn signed_prices(relayer: &SigningKey, ts_ms: u64, rows: &[(&str, u128, u128)]) -> Value {
    let payload = json!({
        "ts_ms": ts_ms,
        "source": "https://api.exchange.coinbase.com/products/{SYMBOL}-USD/stats",
        "prices": rows.iter().map(|(t, o, l)| json!([t, o.to_string(), l.to_string()])).collect::<Vec<_>>(),
    })
    .to_string();
    json!({ "payload": payload, "signature": B64.encode(relayer.sign(payload.as_bytes()).to_bytes()) })
}

/// The testnet oracle's bytecode, with one reporter and our five assets.
async fn deploy_oracle(worker: &Worker<Sandbox>) -> anyhow::Result<(Contract, Account)> {
    let oracle = worker.dev_deploy(&std::fs::read(ORACLE_WASM)?).await?;
    oracle
        .call("new")
        .args_json(json!({ "recency_duration_sec": 300, "owner_id": oracle.id(), "near_claim_amount": "0" }))
        .transact()
        .await?
        .into_result()?;
    let version = view(&oracle, "get_version", json!({})).await?;
    assert_eq!(version, "0.7.0");
    // v0.7.0 (the deployed version) manages oracles and assets with owner-only methods.
    let reporter = worker.dev_create_account().await?;
    oracle.call("add_oracle").args_json(json!({ "account_id": reporter.id() })).deposit(NearToken::from_yoctonear(1)).transact().await?.into_result()?;
    for (_, asset) in ASSETS {
        oracle.call("add_asset").args_json(json!({ "asset_id": asset })).deposit(NearToken::from_yoctonear(1)).transact().await?.into_result()?;
    }
    Ok((oracle, reporter))
}

#[tokio::test]
async fn real_oracle_bytecode_delivers_spot_prices_and_only_the_oracle_counts() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let (oracle, reporter) = deploy_oracle(&worker).await?;
    let arena = worker.dev_deploy(&std::fs::read(WASM)?).await?;
    let treasury = worker.dev_create_account().await?;
    let relayer = SigningKey::generate(&mut rand::rngs::OsRng);
    init_arena(&arena, &treasury, &relayer).await?;

    // Before an oracle is configured, refresh is refused loudly.
    let stranger = worker.dev_create_account().await?;
    let r = stranger.call(arena.id(), "refresh_prices").deposit(NearToken::from_millinear(20)).max_gas().transact().await?;
    assert!(format!("{:?}", r.into_result().unwrap_err()).contains("no price oracle configured"));

    // Only the owner points the arena at the oracle.
    let r = stranger.call(arena.id(), "set_oracle").args_json(json!({ "oracle": oracle.id(), "assets": assets_arg() })).transact().await?;
    assert!(format!("{:?}", r.into_result().unwrap_err()).contains("owner only"));
    arena.call("set_oracle").args_json(json!({ "oracle": oracle.id(), "assets": assets_arg() })).transact().await?.into_result()?;

    // The registered reporter pushes BTC and NEAR into the oracle's cache (same call its TEE
    // push signers make on testnet).
    reporter
        .call(oracle.id(), "report_prices")
        .args_json(json!({ "prices": [
            { "asset_id": "nbtc.bridge.near", "price": { "multiplier": "6854400666666", "decimals": 8 } },
            { "asset_id": "wrap.near", "price": { "multiplier": "35114", "decimals": 4 } },
        ]}))
        .transact()
        .await?
        .into_result()?;

    // Too small a deposit for two OutLayer runs is refused.
    let r = stranger.call(arena.id(), "refresh_prices").deposit(NearToken::from_millinear(19)).max_gas().transact().await?;
    assert!(format!("{:?}", r.into_result().unwrap_err()).contains("attach at least 0.02 NEAR"));

    // Anyone may ask the oracle to deliver its own cached spot prices to the arena.
    let r = stranger
        .call(oracle.id(), "oracle_call")
        .args_json(json!({ "receiver_id": arena.id(), "asset_ids": ["nbtc.bridge.near", "wrap.near"], "msg": "mempire:spot" }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let o = view(&arena, "get_oracle", json!({})).await?;
    let fighter = |t: &str| o["fighters"].as_array().unwrap().iter().find(|f| f["ticker"] == t).unwrap().clone();
    assert_eq!(fighter("BTC")["spot_e8"], "6854400666666");
    assert_eq!(fighter("NEAR")["spot_e8"], "351140000", "4-decimal oracle price normalised to 8 decimals");
    assert_eq!(fighter("ETH")["spot_e8"], "0", "ETH had no fresh oracle price");
    // A spot price alone never changes a fighter: the 24 h open half is still missing.
    let prices = view(&arena, "get_prices", json!({})).await?;
    assert_eq!(row(&prices, "BTC")["source"], "none");
    assert_eq!(row(&prices, "BTC")["oracle_asset"], "nbtc.bridge.near");

    // Calling the callbacks directly, as anyone but the oracle, is refused.
    let fake = json!({ "sender_id": stranger.id(), "data": { "timestamp": format!("{}", now_ms() * 1_000_000), "recency_duration_sec": 300, "prices": [{ "asset_id": "aurora", "price": { "multiplier": "1", "decimals": 8 } }] }, "msg": "mempire:spot" });
    let r = stranger.call(arena.id(), "oracle_on_call").args_json(fake).transact().await?;
    assert!(format!("{:?}", r.into_result().unwrap_err()).contains("only the configured price oracle can deliver prices"));
    let fake = json!({ "sender_id": arena.id(), "data": [{ "id": "BTC:open24h", "value": 1, "timestamp": now_ms() / 1000 }], "msg": "mempire:open24h" });
    let r = stranger.call(arena.id(), "on_custom_data").args_json(fake).transact().await?;
    assert!(format!("{:?}", r.into_result().unwrap_err()).contains("only the configured price oracle can deliver prices"));

    // refresh_prices fans out to oracle_call and custom_call. The sandbox oracle has no OutLayer,
    // so custom_call fails inside the oracle ("OutLayer not configured") and oracle_call does too
    // for ETH/SOL/ZEC, which are not cached. The arena's own state stays consistent: the refresh
    // is counted, no fighter is repriced, and the relayer fallback still works.
    let before = view(&arena, "get_oracle", json!({})).await?;
    let r = stranger.call(arena.id(), "refresh_prices").deposit(NearToken::from_millinear(20)).max_gas().transact().await?;
    assert!(r.is_success(), "the refresh call itself succeeds: {:?}", r.failures());
    let logs = r.logs().join("\n");
    assert!(logs.contains("asked") && logs.contains("for 5 spot prices and 24 h opens"), "{logs}");
    assert!(!r.failures().is_empty(), "the oracle's OutLayer receipts fail in a sandbox");
    let after = view(&arena, "get_oracle", json!({})).await?;
    assert_eq!(after["refreshes"], "1");
    assert_eq!(after["updates"], before["updates"]);
    let r = arena.call("post_prices").args_json(signed_prices(&relayer, now_ms(), &[("ETH", 200_000_000_000, 204_000_000_000)])).transact().await?;
    assert!(r.is_success(), "{:?}", r.failures());
    let prices = view(&arena, "get_prices", json!({})).await?;
    assert_eq!(row(&prices, "ETH")["source"], "relayer");
    assert_eq!(row(&prices, "ETH")["stat_bps"], 400);
    assert_eq!(prices["oracle"], oracle.id().to_string());
    Ok(())
}

#[tokio::test]
async fn the_nov_9_arena_migrates_in_place_and_keeps_its_state() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let old = std::fs::read(OLD_ARENA_WASM)?;
    let arena = worker.dev_deploy(&old).await?;
    let treasury = worker.dev_create_account().await?;
    let relayer = SigningKey::generate(&mut rand::rngs::OsRng);
    init_arena(&arena, &treasury, &relayer).await?;
    let ts = now_ms();
    arena
        .call("post_prices")
        .args_json(signed_prices(&relayer, ts, &[("BTC", 7_168_109_000_000, 6_871_428_000_000), ("NEAR", 341_470_000, 351_490_000)]))
        .transact()
        .await?
        .into_result()?;
    let config_before = view(&arena, "get_config", json!({})).await?;
    let totals_before = view(&arena, "get_totals", json!({})).await?;
    assert!(config_before.get("oracle").is_none(), "the old layout has no oracle");

    // Strangers cannot run the migration.
    let stranger = worker.dev_create_account().await?;
    let new_wasm = std::fs::read(WASM)?;
    let r = arena.as_account().deploy(&new_wasm).await?;
    assert!(r.is_success());
    let r = stranger.call(arena.id(), "migrate").args_json(json!({ "oracle": "price-oracle.testnet", "assets": assets_arg() })).transact().await?;
    assert!(r.is_failure());
    arena
        .call("migrate")
        .args_json(json!({ "oracle": "price-oracle.testnet", "assets": assets_arg() }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let config = view(&arena, "get_config", json!({})).await?;
    assert_eq!(config["oracle"], "price-oracle.testnet");
    for key in ["owner", "treasury", "relayer_pk", "tier_stakes", "roster", "genesis_ms", "first_season_end_ms"] {
        assert_eq!(config[key], config_before[key], "{key} survives the migration");
    }
    assert_eq!(view(&arena, "get_totals", json!({})).await?, totals_before);
    let prices = view(&arena, "get_prices", json!({})).await?;
    assert_eq!(row(&prices, "BTC")["source"], "relayer", "existing prices are labelled as relayer prices");
    assert_eq!(row(&prices, "BTC")["last_e8"], "6871428000000");
    assert_eq!(row(&prices, "BTC")["stat_bps"], -827);
    assert_eq!(row(&prices, "ETH")["source"], "none");
    assert_eq!(row(&prices, "SOL")["oracle_asset"], "22.contract.portalbridge.near");
    let o = view(&arena, "get_oracle", json!({})).await?;
    assert_eq!(o["fighters"].as_array().unwrap().len(), 5);
    assert_eq!(o["min_deposit"], "20000000000000000000000");
    Ok(())
}
