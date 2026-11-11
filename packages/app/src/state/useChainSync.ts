import { useEffect } from 'react';
import { useChain } from './chain';
import { useCollection, type MintedCard } from './collection';
import { useDeck } from './deck';
import { useLadder } from './ladder';
import { useWallet } from './wallet';
import {useMatch} from './match';
import { COINS } from '../lib/coins';

/**
 * Keeps onchain state in step with the wallet.
 *
 * Boots the registry read once regardless of connection, because a visitor who
 * has connected nothing should still see the real coin registry — that read needs
 * no signer. Then loads wallet-scoped data whenever the address changes.
 *
 * Mounted once, in Shell.
 */
export function useChainSync(): void {
  const address = useWallet((s) => s.address);
  const connected = useWallet((s) => s.connected);
  const isGuest = useWallet((s) => s.isGuest);
  const init = useChain((s) => s.init);
  const loadWallet = useChain((s) => s.loadWallet);
  const clearWallet = useChain((s) => s.clearWallet);

  useEffect(() => { void init(); }, [init]);

  // Ladder standing is per-wallet and read-only here; the match store writes it.
  useEffect(() => {
    if (connected && address) {
      void useLadder.getState().load(address);
      void useLadder.getState().loadTop();
    } else {
      useLadder.getState().reset();
    }
  }, [connected, address]);

  useEffect(() => {
    if (!connected || !address) { clearWallet(); return; }
    // A guest signs through its own browser-held keypair, so it is passed the
    // same null adapter a wallet-less session has — `canSign` resolves the
    // difference downstream.
    void loadWallet(address);
  }, [connected, address, isGuest, loadWallet, clearWallet]);


  const mode=useChain(s=>s.mode);
  useEffect(()=>{if(connected && mode==='onchain')void useMatch.getState().resumeWaiting().catch(e=>useMatch.setState({error:String(e)}));},[connected,address,mode]);

  useChainCollection();
}

/**
 * Make the collection *be* the wallet's on-chain cards.
 *
 * Without this the two never met. The collection was seeded locally from the
 * coin registry and saved to the player row, while the actual minted `Card`
 * PDAs lived on chain — and the two sets had almost no mints in common. So a
 * player looked at eight fighters, picked eight for a deck, and the Arena
 * reported "8 of your cards are not minted onchain yet", because none of the
 * cards they were shown were the ones they owned.
 *
 * That is the game failing quietly: the fighters on screen have to be the
 * cards the wallet actually owns on chain, or the collection is fiction.
 *
 * The local collection survives for exactly one case — a wallet with no minted
 * cards at all, where the seeded set is what lets someone see the game before
 * spending anything. The moment a real card exists, the chain wins.
 */
function useChainCollection(): void {
  const cards = useChain((s) => s.cards);
  const mode = useChain((s) => s.mode);

  useEffect(() => {
    if (cards.length === 0) {
      // No cards on chain for this account (or nobody signed in): the
      // collection is empty, not a set of cards the player does not own.
      if (useCollection.getState().cards.length) useCollection.setState({ cards: [], nextId: 1 });
      return;
    }
    if (mode === 'offline') return;

    const mapped: MintedCard[] = cards.map((c) => ({
      // Keyed on the PDA id so the mapping is stable across reloads and two
      // cards for the same coin can never collide.
      id: `chain_${c.id}`,
      mint: c.mint,
      archetype: c.archetype as MintedCard['archetype'],
      level: c.level,
    }));

    /**
     * Chain cards, plus a seeded card for every coin not yet minted.
     *
     * Replacing the collection outright was a trap. A wallet with one minted
     * card ended up with a one-card collection, `repoint` could fill exactly
     * one deck slot, and `deck needs 8 cards` then blocked every mode —
     * including free Practice, which had worked a moment earlier. Minting your
     * first fighter, the thing the app tells you to do, locked you out of the
     * game, and the only way back was minting seven more distinct coins.
     *
     * So the chain still wins for any coin it knows about, and the seeded card
     * survives for the rest. An unminted card is honest about what it is: the
     * Arena already reports "N of your cards are not minted onchain yet" and
     * holds the match to rating only, which is precisely the pre-mint state.
     */
    const merged: MintedCard[] = [
      ...mapped,
    ];

    const current = useCollection.getState().cards;
    const collectionMatches = current.length === merged.length
      && current.every((c, i) => c.id === merged[i].id && c.level === merged[i].level);

    const fieldableMints = new Set(COINS.map((c) => c.mint));
    // Cards that exist *and* this build can field. A card whose coin was
    // registered after this client was built passes the first test and fails
    // the second, and a deck holding one is just as dead as a deck holding a
    // dangling id — so staleness has to mean both, or the re-point below never
    // runs for the case that needs it most.
    const valid0 = new Set(
      merged.filter((c) => fieldableMints.has(c.mint)).map((c) => c.id),
    );
    const deckNow = useDeck.getState();
    // Checked separately from the collection because the two are restored by
    // different effects and either can land first — this way whichever runs
    // last still leaves both consistent.
    const deckStale = [deckNow.active, ...deckNow.slots]
      .some((slot) => slot.some((id) => !valid0.has(id)));

    if (collectionMatches && !deckStale) return;

    if (!collectionMatches) {
      useCollection.setState({ cards: merged, nextId: merged.length + 1 });
    }

    // Re-point the decks at the cards that now exist. A deck naming ids from
    // the old local set would be eight dangling references, which reads to the
    // player as their deck having been wiped.
    const deck = useDeck.getState();
    const key=`mempire:near:loadout:${useWallet.getState().address}`;
    let saved: {active?:string[];slots?:string[][];slot?:number;tier?:number} | null=null;
    try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{/* invalid save is replaced by a free loadout */}
    const allowed=new Set(merged.map(c=>c.id));
    const valid=(ids:string[])=>ids.length<=8&&new Set(ids).size===ids.length&&ids.every(id=>allowed.has(id));
    const starter=[0,9,2,10,4,7,3,1].map(id=>`chain_${id}`);
    const active=saved?.active&&valid(saved.active)?saved.active:starter;
    const slots=Array.from({length:3},(_,i)=>saved?.slots?.[i]&&valid(saved.slots[i])?saved.slots[i]:i===0?active:[]);
    useDeck.setState({active,slots,slot:Math.max(0,Math.min(2,saved?.slot??deck.slot)),tier:Math.max(0,Math.min(3,saved?.tier??0))});
  }, [cards, mode]);
}
