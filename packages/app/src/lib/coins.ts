import { roster } from '@mempire/sdk';
export type AssetKind = 'meme' | 'crypto' | 'stock';
export const ASSET_KINDS: { id: AssetKind; label: string }[] = [{ id: 'meme', label: 'House' }, { id: 'crypto', label: 'Market' }];
export interface Coin { coinId: number; mint: string; feedId: string; ticker: string; name: string; hue: number;
 balance: number; priceUsd: number; liquidityUsd: number; ageHours: number; logoUrl?: string; cardArt?: string;
 kind: AssetKind; decimals: number; change24h?: number; metaBps?: number; fdvUsd?: number; volume24h?: number;
 pumpFun?: boolean; url?: string; pythSymbol: string; priceState?: string; updatedAt?: number }
// IDs and archetypes come from the deployed NEAR roster. Artwork stays from the imported client.
// Fighters without a matching source portrait use its existing class crest, never invented asset art.
const HUES = [260, 260, 137, 265, 190, 320, 38, 320, 2, 265, 70];
const SOURCE_ART: Record<string,string> = { WIF:'wif',BTC:'btc',ETH:'eth',SOL:'sol' };
export const COINS: Coin[] = roster.fighters.map(f => ({ coinId:f.fighterId, mint:`near:${f.ticker.toLowerCase()}`,
 feedId:`near:${f.ticker.toLowerCase()}`,ticker:f.ticker,name:f.name,hue:HUES[f.fighterId],balance:0,priceUsd:0,
 liquidityUsd:0,ageHours:0,kind:f.kind==='house'?'meme':'crypto',decimals:24,pythSymbol:'',
 logoUrl: SOURCE_ART[f.ticker] ? `/art/card_${SOURCE_ART[f.ticker]}.webp` : `/art/coin_${['wif','wif','doggo','peng','mooncat','rkt'][f.archetype]}.webp`,
 cardArt: SOURCE_ART[f.ticker] ? `/art/card_${SOURCE_ART[f.ticker]}.webp` : `/art/icon_${['tank','swarm','ranged','splash','support','spell'][f.archetype]}.webp`,
 priceState:f.kind==='house'?'House: neutral':'Price not read' }));
export const coinByMint = (mint:string) => COINS.find(c=>c.mint===mint.toLowerCase());
export const coinById = (id:number) => COINS[id];
export const coinByTicker = (ticker:string) => COINS.find(c=>c.ticker===ticker.replace(/^\$+/,'').toUpperCase());
export const tickerOf = (c:Coin) => `$${c.ticker}`;
export const isEligible = () => true;
export const ineligibleReason = (_c:Coin):string|null => null;
export const REGISTRY_META = { cluster:'NEAR testnet' };
export const archetypeForFeed = (mint:string) => roster.fighters[coinByMint(mint)?.coinId ?? 0].archetype;
export function overlayLivePrices(rows:{coinId:number;priceUsd?:number;change24h?:number}[]) {
 for (const row of rows) { const c=COINS[row.coinId]; if(c) { if(row.priceUsd!==undefined)c.priceUsd=row.priceUsd; c.change24h=row.change24h; } } return true;
}
export function overlayMeta(bps:Map<number,number>) { for(const c of COINS)c.metaBps=bps.get(c.coinId)??0;return true; }
