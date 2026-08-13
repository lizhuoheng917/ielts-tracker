# Cross-product smart vocabulary planning — managed AI gate

## Outcome

Tracker can now build a compact, numeric-only comparison snapshot from the selected vocabulary plan, recent Tracker workload and the on-demand Words cloud planning context, then request one managed, read-only recommendation.

The result is an exact `WordsPlanRecommendationV2`: target date, study mode, total count, review/new split, estimated minutes, confidence, evidence, risks and limitations. It is never treated as a command and cannot mutate Tracker or Words.

## Safety and storage

- No word, meaning, wordbook title, plan title, description, note, diary or prior AI text enters the snapshot.
- Client and server independently validate scopes, all nested counts, derived recommendation bounds and the returned result.
- No recommendation or snapshot is persisted. Only the existing gateway's compact quota and request receipt metadata is used.
- The recommendation is rejected if it changes the requested date, rolls back completed work or exceeds current Words capacity.

## Current boundary

This gate deliberately does not change the current Send to Words dialog. The next step will add a visible “AI 分析” action and review card while preserving manual edit and explicit send confirmation.

## Release state

Local implementation is complete. Tracker's full local release gate and the coordinated Formal/Tracker contract-parity suite pass. No Supabase migration, Edge Function, Lexi Control or Tracker build has been deployed.
