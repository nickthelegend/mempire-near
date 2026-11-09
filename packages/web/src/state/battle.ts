import { create } from 'zustand';
import type { SimState } from '@mempire/sim';
interface MatchState { sim: SimState | null; perspective: 0 | 1; set: (sim: SimState, perspective: 0 | 1) => void; reset: () => void }
export const useMatch = create<MatchState>(set => ({ sim: null, perspective: 0, set: (sim, perspective) => set({ sim, perspective }), reset: () => set({ sim: null, perspective: 0 }) }));
