+# Cross-product smart vocabulary planning — context gate

## Outcome

This gate adds the minimum read-only Words context needed for a later AI recommendation while preserving Words/Tracker product independence and low storage usage.

- Tracker requests the context only when the learner starts a recommendation; it does not poll or persist it.
- The shared backend derives numeric inventory, seven-day capability and target-day progress from existing Words cloud rows.
- No word text, meaning, mnemonic, wordbook name, plan prose or event row crosses the boundary.
- No snapshot table, cache row, history entity, materialized view or index is created.
- The Tracker client rejects product/date/time-zone drift, negative or inconsistent counts, and every unsupported field before AI can receive the value.

## Current boundary

This gate deliberately does not connect the context to Managed AI and does not change the existing Send to Words dialog. Those are separate reviewable steps. The current frontend remains a manually reviewed date/count/mode handoff.

The context is cloud-only. Local-only Words content stays local and is not uploaded merely to improve a recommendation.

## Release state

Local implementation and focused tests only. The new RPC has not been applied to remote Supabase, and no learner, Control or Tracker deployment has occurred.
