import { artSmallOf, fighter, pct } from './fighters';

/**
 * A 1200x630 result card drawn from the settled match's real numbers: result, pot, the WIF burned,
 * the season share, and the deck with each fighter's stored market move. Downloaded as a PNG.
 */
export interface ShareInput {
  title: 'Victory' | 'Defeat' | 'Tie';
  matchId: string;
  tier: string;
  format: string;
  pot: string; // formatted WIF
  paid: string;
  burned: string;
  season: string;
  deck: { id: number; bps: number; live: boolean }[];
  tx: string;
}

const load = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src;
});

export async function renderShareCard(s: ShareInput): Promise<Blob> {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 630;
  const g = c.getContext('2d')!;
  const [bg, crest, flame, logo, ...arts] = await Promise.all([
    load('/brand/v2/og-art.jpg'), load(s.title === 'Defeat' ? '/brand/v2/fx-defeat.webp' : '/brand/v2/fx-victory.webp'),
    load('/brand/v2/fx-burn.webp'), load('/brand/v2/logo.webp'), ...s.deck.map((d) => load(artSmallOf(d.id))),
  ]);
  g.fillStyle = '#071b1d'; g.fillRect(0, 0, 1200, 630);
  if (bg) g.drawImage(bg, 0, 0, 1200, 630);
  const shade = g.createLinearGradient(0, 0, 1200, 0);
  shade.addColorStop(0, 'rgba(3,12,13,0.96)'); shade.addColorStop(0.62, 'rgba(3,12,13,0.82)'); shade.addColorStop(1, 'rgba(3,12,13,0.15)');
  g.fillStyle = shade; g.fillRect(0, 0, 1200, 630);

  if (logo) g.drawImage(logo, 56, 44, 52, 52);
  g.font = "900 34px 'Big Shoulders Display'"; g.fillStyle = '#f7e2a8'; g.textBaseline = 'middle';
  g.fillText('MEMPIRE', 120, 72);
  g.font = "600 20px 'Barlow Condensed'"; g.fillStyle = '#a3bcb7';
  g.fillText(`MATCH #${s.matchId} · ${s.tier.toUpperCase()} · ${s.format.toUpperCase()}`, 290, 74);

  if (crest) g.drawImage(crest, 52, 118, 150, 150);
  g.font = "900 128px 'Big Shoulders Display'";
  const grad = g.createLinearGradient(0, 140, 0, 260);
  if (s.title === 'Defeat') { grad.addColorStop(0, '#dfe8ea'); grad.addColorStop(1, '#7f9399'); }
  else { grad.addColorStop(0, '#fff3c4'); grad.addColorStop(0.5, '#ffe39a'); grad.addColorStop(1, '#b07a22'); }
  g.fillStyle = grad; g.fillText(s.title.toUpperCase(), 214, 196);

  const rows: [string, string, string][] = [
    ['POT', `${s.pot} WIF`, '#f7e2a8'],
    [s.title === 'Tie' ? 'PAID TO EACH' : 'PAID TO THE WINNER (92%)', `${s.paid} WIF`, '#ffe39a'],
    ['BURNED FOR GOOD (5%)', `${s.burned} WIF`, '#ffb067'],
    ['TO THE SEASON POOL (3%)', `${s.season} WIF`, '#7cb8ff'],
  ];
  rows.forEach(([label, value, color], i) => {
    const y = 300 + i * 46;
    g.font = "600 19px 'Barlow Condensed'"; g.fillStyle = '#a3bcb7'; g.fillText(label, 60, y);
    g.font = "800 32px 'Big Shoulders Display'"; g.fillStyle = color; g.textAlign = 'right'; g.fillText(value, 640, y); g.textAlign = 'left';
  });
  if (flame) g.drawImage(flame, 650, 362, 46, 46);

  // The deck with each fighter's stored market move.
  g.font = "600 17px 'Barlow Condensed'"; g.fillStyle = '#a3bcb7';
  g.fillText('YOUR DECK · STAT CHANGE STORED AT KICK-OFF', 60, 506);
  s.deck.forEach((d, i) => {
    const x = 60 + i * 72, y = 524, r = 30;
    g.save(); g.beginPath(); g.arc(x + r, y + r, r, 0, Math.PI * 2); g.clip();
    const a = arts[i];
    if (a) g.drawImage(a, a.naturalWidth * 0.15, a.naturalHeight * 0.06, a.naturalWidth * 0.7, a.naturalWidth * 0.7, x, y, r * 2, r * 2);
    g.restore();
    g.lineWidth = 3; g.strokeStyle = d.live ? (d.bps > 0 ? '#2fd39a' : d.bps < 0 ? '#ff4d6d' : '#e8b64c') : '#9a6a1c';
    g.beginPath(); g.arc(x + r, y + r, r, 0, Math.PI * 2); g.stroke();
    g.font = "800 15px 'Big Shoulders Display'"; g.textAlign = 'center'; g.fillStyle = '#f7e2a8';
    g.fillText(fighter(d.id).ticker, x + r, y + r * 2 + 14);
    g.font = "700 13px 'Barlow Condensed'"; g.fillStyle = d.live ? (d.bps > 0 ? '#2fd39a' : d.bps < 0 ? '#ff8da2' : '#a3bcb7') : '#6f8c87';
    g.fillText(d.live ? pct(d.bps) : 'neutral', x + r, y + r * 2 + 30);
    g.textAlign = 'left';
  });

  g.font = "800 26px 'Big Shoulders Display'"; g.fillStyle = '#f7e2a8'; g.textAlign = 'right';
  g.fillText('YOUR PORTFOLIO IS YOUR DECK.', 1150, 520);
  g.fillText("TODAY'S MARKET DECIDES WHO HITS HARDER.", 1150, 552);
  g.fillStyle = '#ffb067'; g.fillText('EVERY POT BURNS $WIF.', 1150, 584);
  g.font = "500 13px 'Barlow'"; g.fillStyle = '#6f8c87'; g.fillText(`settlement tx ${s.tx.slice(0, 18)}…`, 1150, 608);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the share card'))), 'image/png'));
}

export async function downloadShareCard(s: ShareInput) {
  const blob = await renderShareCard(s);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `mempire-match-${s.matchId}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
