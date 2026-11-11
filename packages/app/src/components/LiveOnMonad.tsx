import {useEffect,useState} from 'react';
import {reader} from '../chain/provider';
import {formatNear,type Totals} from '@mempire/sdk';
export function LiveOnMonad(){const [totals,setTotals]=useState<Totals|null>(null);const [error,setError]=useState('');useEffect(()=>{let live=true;void reader.totals().then(t=>{if(live)setTotals(t);}).catch(e=>{if(live)setError(String(e));});return()=>{live=false;};},[]);return <section className="well" style={{padding:'10px 12px',display:'grid',gap:6}}><span className="label">Live on NEAR testnet</span><p className="fine" style={{margin:0}}>{totals?`${totals.settled} settled matches · ${formatNear(totals.volume)} NEAR volume`:(error||'Reading the arena…')}</p><a href="/#/proof" className="label">Receipts + deployment proof ↗</a></section>;}
