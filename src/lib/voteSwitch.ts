// The player-facing vote is off (Garo, 2026-11-17: "the voting option which needs to go away"). With it off the game shows no vote
// dots, Vote buttons, vote card, vote toasts or "then vote" note. The ballot code, /api/vote, /results and /privacy are kept, so the
// vote can come back for the official ship by setting this to true. The vote browser specs skip while it is false.
export const VOTE_UI: boolean = false;
