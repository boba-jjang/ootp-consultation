# Handoff from the design chat (Front Office Command Center canvas)

Canvas: https://claude.ai/artifact/Q1MymJ7UG3qEdLxVXEq2D5 (11 boards). The Implementation Basis covers data and models in more depth than the design chat did; this covers what the design chat decided and where the canvas and the Basis disagree.

## Decisions (these answer three of the Basis's open questions)
- Exports get refreshed. The app is a persistent "Create a Team" model, not a one-shot upload. Each upload becomes a snapshot, and new exports add to a team's coverage over time. Game 42 is the first snapshot, labeled from the most games played by any hitter. This changes the Basis's v1 scope line, which assumes one snapshot. Roadmap unchanged: database-dump import, trade valuation, opponent advice.
- Where consultation appears: dashboard screens (Clubhouse, Talent radar, Lineup card, Bullpen & tactics, Dev lab), with an advisor drawer on the lineup screen. There's also a downloadable "manager's card" of settings to enter by hand in OOTP; no known way to import strategy files into OOTP (unverified). Advisor answers cite their numbers and say when data is missing (e.g., no platoon splits).
- DH: the original wireframe shows "DH: Active", so the design assumes DH on. Needs confirming.
- Never a broken screen. Each module degrades and names the export that unlocks it.
- The top-bar confidence badge measures data coverage: Low (stats views only), Moderate (+ superstats), High (+ both ratings views). It's separate from the estimator's per-recommendation confidence bands. Keep both, and name them so users can tell them apart.
- Team setup asks for:
  - team name (from file names)
  - league (LG column)
  - rating scale (1–10)
  - what the league shows (potentials only for batting and pitching)
  - DH
  - games per season (162, an assumption)
  - Dev Lab slots (4, from the wireframe; league range 1–30)

## Where the canvas and the Basis disagree
- The canvas was built from the design project's 9 CSVs: older superstats copies and no ratings views. The Clubhouse's "9 of 11 views" state and its column counts come from those. With the canonical 11 views the team is at High coverage, with one gap: staff work ethic, IQ and risk.
- Pitcher ages: the canvas says no pitching view has age. Per the Basis, age comes from cus_pitch_pot, so the canvas's "pitcher bio and contract" upload prompt should only be about contracts.
- The Dugout's alignment and batting order are placeholders from the original wireframe, not optimizer output (Yamanaka LF, Shinn DH, Obata CF, Geng RF). The Basis reads Yamanaka as DH-first.
- The diamond's position cards show DEF from each player's listed position even when he's playing elsewhere. Obata's DEF 8 is his RF rating and Geng's DEF 7 is his 2B rating. At non-listed positions the cards should show component ceilings, per the eligibility matrix.
- The regression monitor flags a pitcher when xERA and ERA are 1+ run apart, falling back to FIP without superstats. But the Basis found that pitchers' contact superstats don't track their contact ratings. So the signal should come from the estimator (FIP, SIERA, ratings), with xERA as only one input.
- The monitor's "small sample" tag kicks in under 20 IP. It should use the Basis's stabilization points instead.
- Luck reads on the canvas (ERA vs xERA, wOBA vs xwOBA) are judged against zero. The Basis judges contact luck against the league offset: expected contact quality runs .02–.03 above actual results.
- Tactical settings show one value per slider. The Basis's strategy model varies by inning band and score state, with per-player overrides. The design still needs a view for that.
- The Dev Lab card for Eng is a development-slider change, not a Lab program. The Basis also lists Gong (stuff 7, control 4) as an Improve Control candidate.

## What the design needs from the build
- Data model: team → snapshots → view files (type detected by headers; original file name kept to show where data came from) → per-player coverage across five data sets (bio, stats, batted ball/contact, swing decisions, ratings). The Clubhouse matrix and the confidence badge read from coverage.
- Import log: for each file, where it was routed, how many players matched, and the rejection reason if any (e.g., a pitching view that lists hitters).
- Column mapping: the Clubhouse shows how ambiguous headers were read (RA = relief appearances, GO% sent as a fraction). The importer needs to expose its synonym table for that.
- Degradation rules:
  - Defensive alignment needs custom_bat_pot. Without it: listed positions only, batting order from hitting alone, CF unassigned (nobody is listed there).
  - Regression monitor needs pitching_superstats_1 for xERA. Without it: ERA vs FIP.
  - Tactical settings need ratings and are locked without them.
  - Dev Lab needs both ratings views. Pitcher picks fall back to age, which comes with cus_pitch_pot.
- The top bar has a snapshot selector with previous/next buttons; trend views compare snapshots.

## Platform notes (hosting is undecided)
- The original wireframe named Antigravity and the Gemini API for the advisor.
- If the app is published as a claude.ai artifact instead:
  - outbound API calls, Gemini included, are blocked
  - the page can call Claude through the runtime's sample capability, which uses the viewer's own usage and asks permission first
  - teams and snapshots can be stored with the db capability
  - files can be saved with the downloads capability
- If self-hosted, none of the claude.ai constraints apply.

## Design system
- Colors:
  - navy #0A1118: base
  - slate #121D24: panels
  - #0D161D: drawer and inputs
  - chalk #F5F7FA: text
  - #9AA7B4 and #7D8A97: secondary text
  - #C9D2DB: body text on dark
  - gold #E5A93C: actions and attention
  - crimson #D9534F, with #E8706C for small text
  - emerald #2ECC71
  - #A9B8C4: "on file" cells in the completeness matrix
- Type: Chakra Petch for UI text, IBM Plex Mono for numbers and file names.
- Rules:
  - crimson ▼ = expected to decline, emerald ▲ = expected to improve, always with the arrow
  - dashed gold outline = empty, upload to fill
  - locked features stay visible with a lock icon and say what unlocks them
  - 44px minimum tap targets

## Not designed yet
- Talent radar: should show the estimator's prior vs. evidence, with confidence bands
- The situational (inning band and score state) strategy view
- Trends across snapshots

---

Notes added after review in the planning chat (3 October 2026):

- Import log: the pitching view run on hitters is not rejected. It is routed as a supplemental source for hitters' DEF Pot, which no batting view carries. See `CLAUDE.md`.
- Luck reads: the .02–.03 offset is Seattle's own BACON vs xBACON gap, standing in until league data exists. It does not carry over to wOBA vs xwOBA or ERA vs xERA, which run the other way in this data; each pair gets its own baseline.
- Hosting is now decided in `docs/implementation-plan.md` (Vercel, Supabase, Gemini free tier), pending the open questions listed there.
