# levelsim — simulate players, search for the level

Owner's brief: *"run simulations to figure out the best level design — if the player were to move
in swerving lines around the level, what's the optimal placement for rails, obstacles, etc.? More
spacious, and invite the user to do tricks off of things, go off of jumps."*

- `sim.mjs` — the chair model (calibrated to feel.mjs / ramp-probe.mjs / GrindSystem) and the
  swerving player agents; `evaluate(layout)` returns per-minute metrics and the objective.
- `optimize.mjs` — evolutionary search over feature layouts with hard buildability constraints
  (landing lanes, run-ups, spacing, footprint, ceiling height for quarter pipes).
- `import-dump.mjs` — turns a physics dump of the live level into a layout, so the shipped level
  is scored on the same terms (`layouts/cubicle-chaos-previous.json`).
- `to-ts.mjs` — writes the winner to `src/world/CubicleChaosLayout.ts`.
- `plot.py` — top-down plot of a layout with agent paths.

Validate in the real game with `node tools/probe.mjs --snippet tools/probes/swerve-play.js`
(the same swerving agent, driving the actual game).

```
node tools/levelsim/eval.mjs tools/levelsim/layouts/cubicle-chaos-chosen.json
node tools/levelsim/optimize.mjs --gens 200 --pop 48 --seed 33 --gap 2.5 --footprint 0.14 --minFeatures 16 --out best.json
node tools/levelsim/to-ts.mjs best.json previous-metrics.json > src/world/CubicleChaosLayout.ts
```
