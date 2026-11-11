import { useEffect } from 'react';
import { useWallet } from './wallet';
import { useDeck } from './deck';
export function usePlayerSync(){const address=useWallet(s=>s.address);useEffect(()=>{if(!address)return;return useDeck.subscribe(s=>{localStorage.setItem(`mempire:near:loadout:${address}`,JSON.stringify({active:s.active,slots:s.slots,slot:s.slot,tier:s.tier}));});},[address]);}
