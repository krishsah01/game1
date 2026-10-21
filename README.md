# Side-Scroller Milsim / Concept Lab

> The map is known. The battlefield is not.

An executable concept demonstrator for a team-based tactical shooter that is
built in 3D but viewed through a **fixed, perfectly perpendicular side
camera**. It exists to let you see and manipulate the core ideas before
building the real game in Godot 4: head-origin visibility, persistent map
readability, hidden/observe/aim cover states, real 3D firing-line obstruction,
camera intel with stale last-known markers, smoke and audio information limits,
predictable depth sway, and a simple capture objective.

This is a throwaway web visualization. It is **not** the production Godot game
and does not replace it. The design brief is `CLAUDE-HANDOFF.md`; the original
context and the four concept boards are preserved under `source-context/` and
`reference-images/`.

## 1. Run it

Requirements: Node.js 20.19+ (tested on 22). No secrets, accounts, asset
downloads or external services.

```bash
npm install
npm run dev
```

| URL | What |
| --- | --- |
| http://127.0.0.1:5173 | the app (Vite dev server; proxies `/graphql`) |
| http://127.0.0.1:4000/graphql | local GraphQL Yoga API, with GraphiQL in the browser |

Both services bind to loopback only. The browser always talks to the
same-origin `/graphql` URL. Ports are strict: if 5173 or 4000 is already in
use the command fails with a clear message instead of silently moving to
another port. To run a second checkout beside the first, move both ports:
`API_PORT=4001 WEB_PORT=5174 npm run dev` (the Vite proxy follows
`API_PORT`). If the browser shows a 404 for `/`, check that you are running
`npm run dev` in the folder that contains `index.html` and `package.json`,
and that the terminal's `Local:` line shows the URL you opened.

Other commands:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | strict TypeScript check of app, server, tests and scripts |
| `npm test` | 89 focused vitest tests (geometry, cover, depth-cover peek, visibility, recon, aiming, shots, movement, stance/vault/arm-aim, information boundary, objective, GraphQL contract, session controller, camera projection) |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serves `dist/` on http://127.0.0.1:4173 **with** the API (`vite preview` proxies `/graphql` to the Yoga server it starts alongside) |
| `npm run check` | typecheck + tests + build |
| `npm run screenshots` | drives every preset headless with Playwright and writes `docs/screenshots/*.png` (needs `npm run dev` running; set `PW_CHROMIUM=/path/to/chromium` if Playwright's own browser is not installed) |

### Static / in-process variant

If you cannot run a Node server (static hosting, or opening the build as a
file), the app executes the **same schema and resolvers inside the browser**
with the GraphQL execution library. It is a real GraphQL execution (documents
are parsed, validated and resolved), just without HTTP, and the header chip
says `GraphQL: in-process demo` so nobody mistakes it for a server connection.

- Dev/preview: append `?transport=inprocess` to the URL.
- Static single-file bundle: `VITE_TRANSPORT=inprocess VITE_INLINE_ASSETS=1 npx vite build --base ./ --outDir dist-artifact && node scripts/build-artifact.mjs dist-artifact` produces `dist-artifact/artifact.html` (a self-contained fragment used for claude.ai artifact hosting) next to a normal static `dist-artifact/index.html`.
- On localhost, a failed probe of `/graphql` shows an error screen with **Retry HTTP** and **Use in-process demo**; on any other host it falls back automatically.

In-memory sessions vanish when the API restarts; the API panel offers
**New session** when that happens.

## 2. What is implemented

One compact industrial training room with three stations on a single floor,
plus the CONTROL A terminal, all generated from the same collider seeds that
drive gameplay (`src/shared/scenarios.ts`):

| Station | Geometry | Demonstrates |
| --- | --- | --- |
| A / Exposure (x −19…−6) | 1.10 m concrete barrier, standing target 3.8 m beyond | hidden, observe, aim-over; eye clearance vs muzzle clearance |
| B / Intelligence (x −6…10) | full-height opaque partition with a doorway reachable only by stepping FAR in a depth zone, far room with CAM 01, patrol, dropped bag, tall crate (camera blind spot), smoke volume | hidden dynamic objects, camera reveal, lost signal, last-known marker, smoke, sound |
| C / Depth (x 10…14.8) | partition with a 0.7 m slot (real 3D jambs), target at selectable depth | depth movement, muzzle obstruction, bracing, shot-depth sampling |
| CONTROL A (x 14.8…19) | capture terminal, zone, tall crate stack the defender can hide behind | illustrative capture and CONTESTED |

Seven guided presets reposition the player, actors and configuration on that
shared map; each is a real GraphQL session. A guided-tour button walks through
them with captions. Player view and Developer view (`V`) are separate
presentations of the same simulation.

### New in prototype v0.2 (Linear 2DS-2)

- **On/off depth.** There is no continuous depth axis any more. Inside a marked depth zone, `W` glides the body to the zone's far edge and `S` glides it back to the z = 0 lane (3.5 m/s, collision-checked up front so the body is never stranded between lanes). Nothing ever moves toward the camera. Outside a zone `W` is refused with a HUD message.
- **Prone (`Z`)** is a third stance: 0.5 m collider, eye at 0.42 m, slow crawl at a fixed speed, steadiest sway after bracing, cannot vault. `C` from prone rises to a crouch.
- **Vault (`Space`)** goes over an `isVaultable` obstacle directly ahead (standing or crouched, not prone): a 0.7 s scripted move whose landing spot and headroom are collision-checked first. Both low walls (`barrier-a` at station A, the new `barrier-ab` between A and B) are vaultable and **span the entire depth axis**, so over the top is the only way past. Mid-vault the head is up: the target beyond the wall is observed; firing is disabled.
- **Arms follow the aim point.** The rifle swings around a per-stance pivot by the pitch from the pivot to the pointer (clamped: ±70° standing, 65°/60° crouched, 25°/8° prone). The mechanical muzzle anchor moves with the visible barrel tip, so the firing line starts where the barrel ends. Hidden and observe keep the rifle lowered. A barrel that would enter a solid is pulled back to that face (`muzzleClamped`), so a rifle pressed against cover can no longer fire from inside it.
- **Keys moved to make room:** `F` (hold) observes over cover (was Space); `Tab` cycles walk → combat → sprint (was 1/2/3).

### New in prototype v0.2.1 (Linear 2DS-3)

- **Peek from depth cover with the observe key.** Off the lane (FAR in a depth zone) with full-height cover directly ahead, such as the far jamb at station C, the body is in *depth cover* and the HUD offers `F peek`. Holding `F` leans the head toward the lane until the eye clears the cover's lane-side edge by 0.10 m (at most 1.0 m of lean; cover whose edge is farther away is not depth cover). Only the eye and the head sample move: the body collider stays put and the rifle stays lowered behind the cover, so the firing line still ends on the jamb, the same split as observe over a low wall. Standing or crouched, not prone; moving or aiming cancels it. The lean is stopped short of any solid the head would enter. Tuning: `PEEK` in `src/shared/tuning.ts`.

Mechanics (all in plain TypeScript under `src/simulation/`, independent of
React and Three.js):

- **Fixed-step simulation** at 60 Hz with clamped catch-up, pause/step, pause on focus loss, held inputs cleared on blur.
- **Movement** with per-axis box collision against every movement-blocking collider; three speed tiers; crouch and prone; on/off depth (lane ↔ far edge) only inside marked zones, with horizontal travel confined to the zone while off the default lane; scripted vault over flagged obstacles.
- **Cover**: `hidden` / `observe` / `aimOver` are mechanical states with separate eye and muzzle anchors (`src/shared/tuning.ts` → `ANCHORS`). Observe raises the eye above the 1.10 m wall while the muzzle stays at 0.86 m; aim-over raises both. Blind fire is disabled while hidden. "Test firing line" fires a no-ammo probe that stops on the wall. In the free and aim-over states the muzzle additionally swings around the rifle pivot by the aim pitch, and is clamped to the first solid face along the pivot→muzzle segment.
- **Visibility**: each dynamic entity exposes head/chest/pelvis samples (gear: top/mid). A sample is observed when it is in range, inside the observer's field of view, not blocked by any sight-blocking collider and not behind active smoke. One clear sample publishes the entity (an exposed head is enough), after 3 confirmation ticks on the way in; loss of sight is published immediately. Static architecture is always drawn and only dimmed by a coarse probe-based "lit" factor.
- **Knowledge**: observed set with source ids (`DIRECT`, `CAM 01`); frozen, immutable last-known records for enemy actors with simulation-time age, configurable expiry, pause-aware; hollow non-humanoid marker.
- **Recon**: one pre-placed camera with its own position, direction, 70° FOV and 11 m range, same occlusion tests; `ONLINE` contributes, `JAMMED` / `DESTROYED` / `OFFLINE` contribute nothing. Its device mesh is drawn only when it is itself observed; the HUD link status is player-owned UI.
- **Smoke**: one toggled volume that blocks every visual source and no bullet.
- **Audio cue**: rate-limited pulses from moving enemies that encode direction (left/right) and a loudness bucket by movement mode, never a position. Rendered as broad amber arcs at the screen edge.
- **Depth-sway aiming**: `aimPoint = (mouseX, mouseY, selectedDepth + amplitude·sin(phase))`. The phase is continuous and deterministic from simulation time and the scenario seed; firing never rerolls it. Amplitude follows the situation (still / walk / combat / sprint × crouch × aim × braced), plus recoil heat with recovery and a settling period after stopping. The reticle's horizontal dot encodes world-Z offset in pixels (1 m ≈ pixels-per-metre at the current zoom).
- **Shots**: hitscan ray from the muzzle toward the aim point, analytic ray-vs-box against every shot-blocking collider and every actor proxy; closest intersection wins. Brief tracer. In player view a tracer never stops on an unobserved actor (it continues to the next static obstruction) and no player-mode hit marker is produced for hidden targets.
- **Objective**: progress only while the attacker is inside the zone and no defender is; `CONTESTED` while a defender is inside; `PAUSED` when the attacker leaves; `SECURED` at 100 % until reset. CONTESTED reveals occupancy by design and never the defender's position.

### Explicit simplifications

- Actors are box collision proxies (0.5 × height × 0.5 m); scripted actors follow authored routes and do not collide.
- The rifle pitches around a single pivot per stance; the eye does not pitch, and the mechanical muzzle is exactly the visible barrel tip. Anchors are never cosmetically moved.
- The prone collider keeps the 0.5 × 0.5 m footprint (covering head and shoulders, 0.5 m tall); the trailing legs are visual only. The vault is a canned 0.7 s move, not physics: its landing spot and headroom are checked before it starts, not every tick.
- Static-geometry dimming is a coarse per-object probe test, refreshed every 6 ticks; dynamic-entity visibility is the authoritative per-sample test.
- Doors are closed and fixed; the station-B doorway is an opening in the partition.
- One observer source besides the player (the camera). Drones, sensors, teammates, climbing, networking and server authority are deliberately not built.
- Decorative meshes (ceiling beams, pipe, wall stripe, light fixtures, slot outline) carry no collision. The near-side door jamb is rendered as a translucent section cut so the slot stays readable; its collider is solid.
- Audio is visual-only (no sound files).

## 3. Two-minute tour

1. **Hidden battlefield** (preset 1). The whole room is readable, including the far room behind the partition, but no enemy or bag is drawn there. Press `V`: developer view shows the magenta wireframe truth (patrol + bag), the sight rays stopping at the partition and the omniscient top view below the stage. Press `V` again: everything omniscient disappears at once.
2. **Exposure ladder** (preset 2, developer view). Hidden: eye 0.98 m and muzzle 0.80 m, every ray ends on the wall. Hold `F` (or click **Observe**): eye 1.24 m clears the 1.10 m top, the target's head and chest become visible, the amber firing line still ends on concrete. Click **Test firing line**: the probe strikes `barrier-a` at 0.12 m. Hold the right mouse button (or click **Aim over**): eye 1.36 m and muzzle 1.24 m both clear; fire and the tracer reaches the target.
3. **Lost contact** (preset 4). CAM 01 is live and reveals the enemy in the far room. Click **JAMMED** (a real `updateConfig` mutation, revision 2). The enemy vanishes immediately and a hollow `LAST SEEN n s` marker stays where contact was lost while the enemy, as the developer view shows, walks away into the camera blind spot. Pause (`P`): the age stops.
4. **Depth shot** (preset 6). Put the mouse on the target through the slot. Press `E` or click **FAR**: the same screen aim now strikes the far jamb. Click **MID** and fire: a hit. Watch the reticle dot swing left and right: that is the world-Z offset that will be sampled when you click. Sprint, then stop: the amplitude settles back over about a second. `B` braces on the door frame for the smallest amplitude.

## 4. Controls and tuning

| Input | Action |
| --- | --- |
| A / D, ← → | move left / right |
| W / ↑ | depth ON: glide to the far edge of the depth zone you stand in (refused outside a zone) |
| S / ↓ | depth OFF: glide back to the z = 0 lane; nothing ever moves toward the camera |
| Space | vault the `isVaultable` low wall directly ahead (standing or crouched) |
| Tab | cycle walk (quiet) → combat move (moderate) → sprint (loud, unstable; cancels brace and aim) |
| C | toggle crouch (crouched at waist-high cover = hidden); from prone, rise to a crouch |
| Z | toggle prone (slow crawl, lowest profile, steadiest aim, cannot vault) |
| F (hold) | observe above waist-high cover; off the lane behind full-height depth cover, peek around its edge toward the lane |
| Right mouse (hold) | aim; from crouched cover: aim over |
| Left mouse | fire (disabled while hidden or vaulting) |
| Mouse height | the arms and rifle swing toward the pointer; the shot leaves the barrel tip |
| Q / E | selected aim depth − / + (0.25 m steps, −1.5…+1.0 m); never auto-locks to an enemy |
| B | brace on cover within reach (not while moving or sprinting) |
| V | developer view |
| P / . | pause / step one tick |
| R | reload |
| Esc | help (pauses) |

Every demonstration state also has an inspector button, so the scene can be
inspected without the keyboard. Keys are honoured only while the canvas owns
input (focused, or hovered with no form control focused); the context menu and
page scrolling are suppressed only then.

Where to tune:

- `src/shared/tuning.ts`: anchors per stance (including the rifle pivot), aim-pitch limits, speeds, prone crawl factor, lane width and depth glide speed, cover and vault reach, body samples, visibility threshold and confirmation ticks, sway multipliers, recoil, depth range, noise profiles.
- `src/shared/scenarios.ts`: the map (every collider, zone, smoke and capture bounds, the camera) and the seven presets with their default configuration.
- `DemoConfig` (vision range/FOV, last-known expiry, camera status, smoke, sway amplitude/frequency, settle time, capture time) lives in the GraphQL session and is changed through the inspector sliders and buttons (`updateConfig`), validated by `server/resolvers.ts` (`CONFIG_RANGES`).

## 5. GraphQL and the local simulation

| GraphQL store (server or in-process) | Browser simulation |
| --- | --- |
| scenario catalogue and authored seed data (`scenarios`, `scenario`) | actor transforms, movement, collision |
| session id, scenario id, seed, revision (`createSession`, `session`) | sight queries, observation union, knowledge records |
| validated configuration mutations (`updateConfig`, `resetSession`) | cover state, head/muzzle anchors, sway phase, shots, noise, capture, animation |

Rules the client follows (`src/app/sessionController.ts`):

- A scenario is fetched and a session created when a preset is selected; nothing is sent per frame, per raycast or per reticle update. Sliders commit after 350 ms of quiet.
- Every selection bumps an epoch; a late response from an earlier selection is discarded (tested).
- Mutations are serialised and carry `expectedRevision`; a `REVISION_CONFLICT` re-reads the session once and retries (tested).
- API loss after a session exists marks the UI disconnected but never stops the local loop; **Reset locally** rebuilds from the cached seed.
- `resetSession` restores defaults and bumps the revision; the client rebuilds runtime state from the cached scene seed. The server never tracks moving actors.
- Sessions are in memory, capped at 64 with least-recently-used eviction.

Error codes: `BAD_USER_INPUT` (out of range, non-finite, unknown field, explicit `null` → reason `NULL_PATCH_FIELD`), `NOT_FOUND` (scenario or session), `REVISION_CONFLICT` (`extensions.currentRevision`). The developer API panel lists every operation with status, revision and duration, and has buttons that deliberately send an invalid patch and a stale revision. Example documents: `docs/graphql-examples.graphql` and `src/graphql/documents.ts`. The SDL is in `server/schema.ts`.

The real game's future requirement is server-authoritative visibility so hidden
enemy state is never delivered to clients. This local visualization
intentionally does not satisfy that: the browser simulates hidden actors and
the presentation layer filters them.

## 6. Coordinate convention and where to read first

In code, always Three.js Y-up:

| Concept | Axis |
| --- | --- |
| left / right travel | **X** |
| up / down | **Y** (floor at 0) |
| depth into / out of the screen | **Z** (+Z toward the camera = NEAR, −Z = FAR) |

The original notes and concept board 04 call depth "Y". That is conceptual
notation only; nothing in this code base uses Y for depth. The camera sits at
+Z and looks straight down −Z (`src/scene/cameraRig.ts`); depth never changes
projected size (tested).

Read these four first:

1. `src/simulation/world.ts` — the fixed-step tick, the truth/knowledge/presentation split, commands, the mode-filtered snapshot.
2. `src/simulation/visibility.ts` + `knowledge.ts` — sample-based observation against proxies and smoke; confirmation, immediate loss, frozen last-known records.
3. `src/simulation/cover.ts` + `src/shared/tuning.ts` — the three mechanical cover states and their anchors.
4. `src/simulation/aiming.ts` + `shots.ts` — selected depth, deterministic sway, first-hit ray queries.

Then `src/shared/scenarios.ts` (the map and presets), `server/resolvers.ts`
(the API contract) and `src/scene/sceneView.ts` (presentation).

## 7. Acceptance results

Automated evidence is `npm test` (89 tests, all passing at the time of
writing) and the headless walkthrough `npm run screenshots` (32 frames in
`docs/screenshots/`, 0 console or page errors). Manual checks were done in
headless Chromium with SwiftShader WebGL.

### Scene and movement

| Item | Result | Evidence |
| --- | --- | --- |
| Launch works with the documented command, no secrets or external services | verified | `npm install && npm run dev`; `scripts/probe.ts` reports WebGL active and `GraphQL: HTTP /graphql` |
| Scene is interactive 3D, not an image | verified | Three.js scene with procedural meshes; keyboard movement in `scripts/screenshots.ts` (preset 7 walks into the zone) |
| Main camera strictly perpendicular through movement, resize, reset and preset switching | verified | `fitOrthographic` is the only camera mutation; position/look-at share X and Y; `tests/camera-projection.test.ts` |
| Equal-size actors at different depths project equally | verified | `tests/camera-projection.test.ts` |
| Player cannot walk through cover or jambs; depth constrained | verified | `tests/movement.test.ts` (low wall, slot on-lane vs FAR, zone confinement, doorway lane, refused/blocked depth moves) |
| Focus loss clears controls; UI interactions do not fire or move | verified | `InputController.clear` on blur/visibility change; keys ignored unless the canvas owns input; `tests/movement.test.ts` (clearHeld) |

### Observation and cover

| Item | Result | Evidence |
| --- | --- | --- |
| Hidden actors and gear disappear outside observation; architecture stays readable | verified | `tests/visibility.test.ts`; screenshots 01, 03a |
| Hidden enemy shadow/label/outline/particles do not reveal it in player mode | verified | unobserved entities are not in `snapshot('player')` at all; the renderer hides the object (and therefore its shadow); labels/outline only for observed entities (`sceneView.ts`) |
| Eye below cover cannot observe; eye just above reveals the exposed target | verified | `tests/cover.test.ts`; screenshots 02a, 02b |
| Observe sees the target while the muzzle ray hits concrete | verified | `tests/cover.test.ts`, `tests/shots.test.ts` (foreground cover wins); screenshot 02c |
| Aim-over clears both rays when geometry permits | verified | `tests/cover.test.ts`; screenshot 02d |
| Decorative mesh detail does not change sight or collision | verified | proxies come only from `ColliderSeed`; decor is flagged `decorative` and never enters the blocker lists |
| Fully blocked sight stops live updates immediately despite smoothing | verified | `tests/visibility.test.ts` ("published immediately"); the cosmetic fade is frozen at the last transform for 150 ms |

### Intel

| Item | Result | Evidence |
| --- | --- | --- |
| Camera reveal uses its own sightlines, not a global toggle | verified | `tests/recon.test.ts` (target behind the tall crate stays hidden from CAM 01) |
| Camera loss removes only that source | verified | `tests/recon.test.ts` |
| Historical marker stays while the hidden enemy moves | verified | `tests/recon.test.ts`; screenshots 04b, 04c |
| Marker age/expiry follows simulation time and resets | verified | `tests/recon.test.ts` (pause freezes age, expiry, reset) |
| Smoke blocks all visual sources, bullets pass | verified | `tests/visibility.test.ts`; screenshot 05b |
| Audio cues: rough activity, no exact position | verified | `NoisePulse` carries direction and loudness only (`tests/visibility.test.ts`); screenshot 05b |
| Developer mode off removes inset, rays and logs | verified | `snapshot('player')` has `dev: null`; overlays, top view and log are gated on mode; screenshot 01 player vs dev |

### Shots and objective

| Item | Result | Evidence |
| --- | --- | --- |
| Reticle phase deterministic and continuous; clicks do not reroll | verified | `tests/aiming.test.ts` |
| Brace/crouch/aim reduce sway; movement/fire increase; settling on stop | verified | `tests/aiming.test.ts` |
| Selected depth changes real Z aim only | verified | `tests/shots.test.ts` (MID hit / FAR jamb / NEAR jamb / depth miss); projected size unchanged by construction |
| Foreground cover wins over a target behind it | verified | `tests/shots.test.ts` |
| A shot can miss in depth despite on-screen overlap | verified | `tests/shots.test.ts` |
| Hidden target produces no omniscient player-mode hit marker | verified | `tests/visibility.test.ts` (smoke shot: `publicEnd` not on the actor, entity absent from player snapshot) |
| Capture advances/pauses/contests/resets correctly | verified | `tests/objective.test.ts`; screenshots 07a–07c |

### Prototype v0.2 (2DS-2)

| Item | Result | Evidence |
| --- | --- | --- |
| Depth is on/off: W glides to the zone's far edge, S back to the lane, never toward the camera; refused outside a zone or when the path is blocked | verified | `tests/movement.test.ts`; screenshots 10e, 10f |
| Prone (Z): anchors, collider height, fixed crawl speed, lower sway than crouch, C rises to crouch | verified | `tests/stance-vault.test.ts`; screenshot 10a |
| Vault (Space) over flagged full-depth walls; head exposed mid-vault, no firing, lands beyond; refused when prone, nothing ahead or landing blocked | verified | `tests/stance-vault.test.ts`; screenshots 10b, 10c |
| Both vaultable walls span the entire depth axis and are served with `isVaultable` over GraphQL | verified | `tests/stance-vault.test.ts`, `tests/api.test.ts` |
| Arms follow the aim point; muzzle = barrel tip; stance pitch limits; hidden/observe lowered; muzzle never inside a solid | verified | `tests/stance-vault.test.ts`; screenshot 10d |

### Prototype v0.2.1 (2DS-3)

| Item | Result | Evidence |
| --- | --- | --- |
| FAR behind the station-C far jamb counts as depth cover; target unseen, player unexposed | verified | `tests/peek.test.ts`; screenshot 11a |
| Hold F in depth cover peeks: eye leans past the jamb edge, target observed, only the head exposed, body and muzzle stay behind the jamb (firing line ends on it) | verified | `tests/peek.test.ts`; screenshots 11b, 11c |
| Releasing F, aiming or moving ends the peek; works standing and crouched, not prone; no depth cover on the lane; observe over low walls unchanged | verified | `tests/peek.test.ts` |

### GraphQL and application state

| Item | Result | Evidence |
| --- | --- | --- |
| Scenario UI loads from a real GraphQL operation with typed fields | verified | `tests/api.test.ts`; API panel shows `Scenarios` / `Scenario` queries (screenshot 08) |
| Config mutation changes behaviour and increments revision | verified | `tests/api.test.ts`, `tests/sessionController.test.ts`; screenshot 03b (`rev 2`, CAM 01 LIVE) |
| Invalid config, unknown id, revision conflict → understandable errors | verified | `tests/api.test.ts`; screenshot 08 |
| Reset restores scene, scripts, intel records, sway phase, capture deterministically | verified | `World.reset` rebuilds every runtime structure from seeds; `tests/recon.test.ts`, `tests/objective.test.ts`, `tests/sessionController.test.ts` |
| Stale response cannot overwrite the new preset | verified | `tests/sessionController.test.ts` |
| Two sessions isolated | verified | `tests/api.test.ts` |
| Local simulation responsive while API slow/disconnected | verified | `tests/sessionController.test.ts` |
| In-process fallback labelled and really executes the schema | verified | `InProcessTransport` calls `graphql()` on the same executable schema; header chip `GraphQL: in-process demo` (verified headless on a static wrapper) |
| Typecheck, tests and build pass | verified | `npm run check` at the time of writing |

Not measured: frame rate on real hardware (headless SwiftShader is not
representative). The renderer caps the pixel ratio at 2 and uses no
post-processing.

## 8. Open design questions and the next Godot step

Still open (labelled as proposals in the UI):

- **Depth readability on a perpendicular camera.** Overlap ordering, wall shadows from a front-top key light, depth labels and the selected-depth readout help, but two actors at the same X and different Z still overlap exactly. The prototype shows the ambiguity rather than solving it.
- **Free vs. lane-limited depth traversal.** v0.2 makes depth binary (lane ↔ far edge of a zone, W/S). Whether a third position or free traversal ever returns is open.
- **Exact controls and state machine** for move / crouch / peek / aim / depth step (the hold-to-observe, hold-to-aim scheme here is one option).
- **Attack/defend capture rules** beyond the illustrative progress bar.
- **Gadget balance** (camera placement, jamming, destruction, counterplay) and further observer sources (drone, sensor, teammate vision).
- **Server-authoritative visibility** for multiplayer: clients must never receive hidden enemy transforms; this demo filters only at the presentation layer.

A small next step for the Godot 4 build: port `src/simulation/cover.ts` and
`visibility.ts` as GDScript. Give the player two `Marker3D` nodes (eye and
muzzle) driven by a stance state machine with the same anchor table, and test
observation with `PhysicsDirectSpaceState3D.intersect_ray` from the eye marker
to three body-sample points on the target, against a collision layer that holds
gameplay proxies only. The numbers in `ANCHORS` and the barrier height of
1.10 m are a tested starting point: hidden stays blind, observe exposes the
head, aim-over exposes head and chest.
