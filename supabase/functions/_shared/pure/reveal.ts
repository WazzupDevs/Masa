// The "Tanışalım mı?" window's length (MVP_SPEC §4.6), still an argument of rooms_end and
// close_idle_rooms. Since step 23.3's client PR nothing opens the window, so the value is unused;
// step 23.4b's migration drops the argument and this file (docs/SPEC_V3.md §23.H).
export const REVEAL = { decisionSeconds: 30 } as const;
