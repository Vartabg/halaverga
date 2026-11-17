# Independent design review

Gemini 3.8 Flash High reviewed revision 1 against `edfb2838` in a fresh Antigravity plan session. The run reported success in about 26 seconds with the requested model and no tool calls. The reviewer received the plan, project instructions, and bounded excerpts from `dronePatrols`, `drones`, `banish`, `Shooter`, `Player`, `Battle`, `BattleHud`, `celestialBattle`, `Suit`, and the gorge tests.

- Retry currently restores the player while leaving the patrol simulation alive. The reviewer overlooked the existing reset in `stepBanish`; the underlying patrol finding holds. Shooter will replace its simulation and reset encounter state before advancing either system. Exercise the same reset path through the retry button.
- Generic respawns and victory by a lifetime counter allow one Watcher to satisfy the whole objective. The proposed seal mask guards respawn and determines progress by identity. The verification must cover both a sealed Watcher and an unsealed fly-in.
- The existing gorge visibility test assumes one arena. Preserve the rock cover and low corridor assertions and check every moved patrol from an approach in its own sector. The reviewer could not verify the new geometry in the supplied excerpts, so the implementation must exercise real production colliders.
- Immediate defeat pause is a separate lifecycle change. The battle stops advancing on defeat and this pass reuses the existing modal and pause timing.
