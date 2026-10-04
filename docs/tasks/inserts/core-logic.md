# Core logic

- The code lives in `packages/core`, which imports no DOM, network or UI framework code.
- Write each rule's test against `fixtures/` before its code. Every row of "Columns that need special handling" that this task touches gets at least one test.
- Run the identities in Knowledge Base › Import contract › Invariants as property tests over every fixture, skipping pitcher rows with G = 0, which carry no data.
- Map columns by header through the synonym table, never by position, and never depend on CSV row order.
- Thresholds, weights, scales, floors and gates are settings with a default, a one-line description and their source. Don't hard-code them.
- No logic keyed to a player, team or league; names appear only in tests.
- Take expected values from the fixtures or the Basis's Seattle reference data, never from memory.
- Importer output carries `importer_version`, so re-reading raw files stays deterministic.
