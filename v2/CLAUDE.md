# CLAUDE.md — v2 ("חוסמים או מפנים")

Rebuilt from scratch in this folder. **Read `docs/STATUS.md` first** (state, how to run tests, known issues, next steps)
and `docs/VISION.md` (design). The root `CLAUDE.md` describes the OLD game — not this one.

Rules:
- Offline only. `index.html` has a CSP with `connect-src 'none'`. No CDNs, no network.
- Must work from `file://` and inside Electron → classic `<script>` files on the global `HM`, no ES modules.
- `src/sim/*` must not touch DOM/three (runs in Node tests). UI gets everything via `world.events`.
- Both sides act only through `world.cmd(side, {...})` (human, AI, tests).
- Balance numbers live in `src/sim/balance.js`. Use `tools/batch.js`, `tools/sweep.js`, `tools/batchpol.js` to measure.
- Haredi audience: no female figures, no real brand names, no graphic violence. User-facing replies to Benjamin: simple Hebrew, no English terms — this includes short interim progress notes during work, not only stage reports.
- After changes: `node --test v2/tests/*.test.js` and `node v2/tools/uitest.js <dir>` (needs Playwright; present in the cloud env).
- Anything the cloud cannot do (testing on Benjamin's real Windows computer, building the EXE, real GPU / sound checks): send a request to his local Claude session named "סימולטור הפגנות" (ListAgents / list_sessions → SendMessage / send_message), and tell it that it may use Chrome if needed. Ask it to report results back, not to push or change branches.
