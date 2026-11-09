import { formatUnits } from 'viem';
export function formatWif(value: bigint, maximumFractionDigits = 4) { return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number(formatUnits(value,18))); }
export function marketLabel(ticker: string, bps: number, status: number) {
  if (status === 1) return `${ticker}: House fighter: neutral`;
  if (status === 2) return `${ticker}: Stale feed: neutral`;
  if (status === 3) return `${ticker}: Paused feed: neutral`;
  if (status === 4) return `${ticker}: No 24 h history: neutral`;
  const sign = bps >= 0 ? '+' : '';
  return `${ticker} ${sign}${(bps / 100).toFixed(1)}%`;
}
