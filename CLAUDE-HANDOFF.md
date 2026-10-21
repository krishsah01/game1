# Claude implementation handoff: side-scroller milsim concept demonstrator

Prepared 20 October 2026. This document is a standalone build brief. Read it before implementing. Reference images and original design context are included in the package.

## 1. What to build

Build a runnable, interactive browser prototype that lets someone **see and manipulate the central ideas of a 3D tactical shooter viewed through a fixed perpendicular side camera**. Use **GraphQL for scenario and configuration data** and a **3D browser renderer for visualization**. The result should explain the concept to developers and let me evaluate it before building the real game.

The pitch is:

> The map is known. The battlefield is not.

The persistent environment is always visible. Enemies, dropped gear and other dynamic entities are visible only through valid observation or temporary external intel. Gathering information requires exposing yourself or using a vulnerable recon tool.

The prototype must answer five questions through interaction:

1. What does a readable, genuinely 3D battlefield look like from a perfectly side-on camera?
2. How does hiding, observing and aiming over cover change what I can see and hit?
3. How can the entire map remain readable while enemy presence stays uncertain?
4. How do recon, stale intel and smoke change the information available?
5. How can predictable depth sway make narrow shots meaningful without adding random accuracy penalties?

Build a focused visual sandbox, not a marketing website, slide deck, GraphQL dashboard or complete shooter. The primary artifact is the interactive scene. A reference gallery and explanatory controls support it.

## 2. Scope and authority

The original project targets **Godot 4 standard with GDScript**, and the owner intends to build that game personally with a tutor/dev partner. This request authorizes Claude to implement a **separate throwaway web visualization**. It does not replace the Godot project or change that long-term learning preference. Do not import or depend on the old v0.1/v0.2 prototype ZIPs mentioned in the source context; they are not supplied or needed.

Resolve conflicts in this order: this current build brief, locked decisions in the original context, concept-board annotations, then visual interpretation of the generated images. New instructions from the owner override the brief.

### Locked concept

| Area | Requirement |
|---|---|
| Core experience | Team-based tactical territory/capture concept; information matters as much as shooting. |
| Main camera | Fixed, head-on, exactly perpendicular side view. No yaw, pitch, orbit or perspective drift. |
| World | Actual 3D positions and collision. Left/right combat dominates; depth is contextual. |
| Vision | Originates at the character's head/eyes and is blocked by gameplay geometry. |
| Visibility | Static map remains visible; dynamic presence requires valid observation. |
| Cover | Head position determines sight; muzzle position independently determines firing clearance. |
| Movement | Grounded and responsive: realistic tactical choices, forgiving execution. |
| Aiming | Predictable depth sway; geometry determines hits and misses. |
| Art | Stylized realism, realistic proportions, simplified surfaces, muted colors, strong silhouettes. |
| Development | Gameplay first, visuals second, multiplayer third. |

### Proposed defaults for this demonstrator

Use an orthographic camera, one industrial training-room map, contextual continuous depth movement inside marked doorway zones, one controllable soldier, two scripted target actors, one camera, one smoke volume and one capture terminal. Use a hybrid selected-depth-plus-sway reticle. These are reversible prototype choices, not new final game decisions.

Attack/defend rules, final controls, free-versus-limited depth traversal, gadget balance, overlap readability and production networking remain open design questions. Label choices that explore them.

## 3. Deliverable and technology

GraphQL is an API query language and execution system, not a graphics renderer. Implement the request literally with this division:

| Layer | Proposed implementation | Responsibility |
|---|---|---|
| App shell | TypeScript + Vite + React | Controls, scenario selection, guided tour, accessibility and status. |
| 3D scene | Three.js with WebGL rendering | Models, fixed orthographic camera, lighting and visual overlays. |
| Simulation | Plain TypeScript modules | Movement, cover, visibility, shots, scripted actors, recon and objective state. |
| API | Node.js + GraphQL Yoga, in memory | Scenario catalogue, configuration, session creation/reset. |
| Client API calls | Small typed fetch wrapper | Actual GraphQL queries and mutations; loading and error handling. |
| Assets | Procedural geometry and supplied PNG references | Self-contained demo without external asset dependencies. |

Direct Three.js in a lifecycle-managed canvas component is sufficient. React Three Fiber is acceptable if it makes the implementation clearer, but do not add it merely to add another layer. Avoid an unnecessary full-stack framework, heavyweight GraphQL cache, ORM or database.

Choose compatible stable dependency versions available in the implementation environment and commit the lockfile. Do not assume package versions from this document. Consult current official docs for exact API syntax.

Provide `npm install` and one `npm run dev` command that starts the browser app and local GraphQL endpoint. Bind local services to loopback by default. Proxy `/graphql` through the frontend development server so the browser uses a same-origin URL. Include typecheck, focused test and production-build commands. Explain how to preview the build with its API.

### Constrained artifact environments

If the environment can render a browser artifact but cannot run a Node server, execute the same schema and resolvers in process using the GraphQL execution library. Clearly show `GraphQL: in-process demo` instead of claiming an HTTP connection. Keep this behind the same transport interface, and still supply the runnable Node server variant. Do not silently replace GraphQL with arbitrary direct function calls. A transport fallback must not change the game mechanics.

## 4. Reference images and their limits

Inspect these files before building:

| File | Apply it to |
|---|---|
| `reference-images/01-gameplay-direction.png` | Atmosphere, military silhouettes, muted industrial environment and restrained HUD. |
| `reference-images/02-visibility-and-recon.png` | Direct sight, camera reveal, last-known information, signal loss and imprecise sound cues. |
| `reference-images/03-cover-and-exposure.png` | Three distinct cover states and separate sight/firing lines. |
| `reference-images/04-depth-aiming-study.png` | Reticle behavior and an explanatory top-view inset separate from gameplay. |

These are generated concept art, not exact collision diagrams, shader specifications or final assets. Do not trace incorrect line origins, perspective hints or inconsistent cover intersections. The cover-state board is the clearest mechanical reference. Sight always starts at the eyes, even if an illustration makes the origin look close to the rifle.

The final visuals may be much simpler than the boards. Match composition, silhouettes, material grouping and light/dark hierarchy before adding texture detail. The title and image gallery may say `SIDE-SCROLLER MILSIM / CONCEPT LAB`; treat that as a working descriptor, not a new game brand.

Include a small reference drawer with the four images and captions. Do not use the images as flat backgrounds pretending to be interactive 3D levels.

## 5. The small playable scene

Create one reusable compact test map with three adjacent stations on one horizontal floor. Reposition/reset the player and actors through presets instead of building multiple separate levels.

| Station | Required geometry | Demonstration |
|---|---|---|
| A: exposure | One waist-high concrete barrier and a target beyond it | Hidden, observe and aim states; eye clearance versus muzzle clearance. |
| B: intelligence | Opaque partition, adjacent room, one remote camera, dropped bag | Hidden dynamic objects, camera reveal, lost signal, last-known marker and smoke. |
| C: depth | A narrow aperture with actual 3D jamb geometry and a target at selectable depth | Depth movement, muzzle obstruction, bracing and shot-depth sampling. |

Place a small capture terminal in a reachable observed part of the room. One optional background walkway may establish the art direction, but do not build climbing or a second playable floor until the core demonstration works. Stations must be reachable or selectable in one click.

Use simple box/capsule collision proxies derived from the same dimensions as visible cover. Show recognizable soldiers using assembled low-poly shapes: helmet, head, torso, plate carrier, arms, legs, boots and rifle. A primitive figure is acceptable if the head, muzzle and stance are readable. Avoid loose pill-shaped placeholders that cannot communicate exposure.

No asset purchases, credentials, remote model downloads, paid APIs or external services should be needed.

## 6. Coordinate convention and camera

Use the browser engine's conventional Y-up coordinates throughout code:

| Concept | Code axis |
|---|---|
| Left/right screen travel | World X |
| Up/down screen height | World Y |
| Into/out of screen depth | World Z |

The original discussion and fourth board use Y to mean depth. That is conceptual notation only. In this implementation depth is Z; document this mapping prominently and do not mix conventions.

Place the main camera on positive Z looking straight along negative Z. Camera and look-at target have the same X and Y. Use an orthographic projection with world Y as up. Changing entity depth must not change its rendered size. A resize updates the orthographic frustum while preserving scene proportions. Fit the compact room or use translation-only horizontal follow; never tilt or rotate the camera to make depth easier.

Do not place a visually hidden solid front wall between the main camera and the whole room. Author the scene as an intentional open-front cutaway. Rear walls, side partitions, apertures and cover are explicit gameplay geometry. Visibility occlusion is evaluated from actor/sensor origins independently of what the presentation camera can see. Any render-only shell must be marked decorative and excluded from gameplay collision.

### Depth readability

Try subtle local depth labels, consistent contact shadows, overlap ordering, doorway lighting and an explicit selected-depth indicator near the reticle. Use text such as `NEAR / MID / FAR` as a conceptual depth control, not a horizontal ruler painted across the world. Do not shrink a distant soldier or introduce camera angle to fake perspective.

When bodies overlap on screen, a currently observed actor may have a restrained outline; an unobserved actor may never receive an outline. This prototype should explicitly demonstrate the remaining ambiguity rather than pretending it is solved.

A toggleable developer top-view inset may show true geometry and axes. Label it `DEVELOPER VIEW — OMNISCIENT`. Keep it separate from the main scene and off by default in player view. It is not a player minimap.

## 7. Movement, cover and controls

Drive gameplay transforms from simulation state. Let animation interpolate toward those transforms without determining collision or visibility. Head and muzzle anchors must reflect the current mechanical state. Do not cosmetically raise a head while retaining its hidden-state sight origin.

Use a fixed-step simulation, for example 60 Hz, with rendering interpolation if needed. Pause on focus loss and clear held inputs to prevent stuck movement. Clamp elapsed catch-up time after tab suspension. Speed values are tunable demo defaults.

### Proposed keyboard/mouse controls

| Input | Action |
|---|---|
| A / D or left/right arrows | Move horizontally. |
| W / S | Move away/toward camera within a contextual depth zone. |
| 1 / 2 / 3 | Select walk / combat move / sprint. |
| C | Toggle crouch. |
| Hold Space near cover while crouched | Observe above cover. |
| Hold right mouse | Aim; from crouched cover, raise head and muzzle into aim-over state. |
| Left mouse | Fire a demonstrator shot when permitted. |
| Q / E | Adjust selected target depth; never auto-lock to an unseen enemy. |
| B | Toggle brace when close enough to valid cover and not moving. |
| V | Toggle developer sight/firing overlays. |
| Escape | Pause/open help. |

Provide buttons for all key demonstration states so users can inspect the scene without mastering controls. Prevent browser scrolling/context menus only when the canvas owns the relevant input. Inputs must not fire while typing in controls or manipulating sliders. Releasing aim/peek returns to the underlying crouch/standing state; moving out of cover cancels its special state safely. Show a concise control legend.

Walking is quiet, combat movement moderately noisy, sprinting loud and unstable. Use three speed tiers; no stamina bar. Crouch and bracing improve sway. Sprinting cancels bracing and aiming. Prone, free jumping, vault animation, climbing and sophisticated movement blending are deferred.

### Cover state requirements

| State | Eye anchor | Muzzle anchor | Result |
|---|---|---|---|
| Hidden | Below barrier top | Below barrier top | No view through barrier. Disable blind fire for this demo. |
| Observe | Just clears top | Still below top | Can reveal target; shot path remains obstructed. |
| Aim over | Clears top | Clears top | Target may be visible and a valid shot becomes possible. |

The muzzle test should still demonstrate blockage in observe state: allow a deliberate test shot or `Test firing line` button that strikes the barrier rather than creating a target hit. Never silently teleport the muzzle above cover to make aiming succeed.

Use separate position anchors for eyes and muzzle, not a shared ray. In developer mode, mark the eye cyan and muzzle amber; lines stop at their actual first obstruction. Keep the rifle and head outside solid collision volumes. Model exposure by head/body sample positions, not an arbitrary invulnerability flag.

Depth cover obeys the same rule: stepping around a doorway along Z changes the actual head and muzzle sightlines. Collision prevents walking through a wall to obtain the reveal. Limit depth travel to a marked local zone as a proposed initial constraint, not a permanent lane-system decision.

## 8. Visibility model

Separate **simulation truth**, **observed knowledge** and **rendered presentation**. The local demo necessarily knows hidden actors to simulate them; normal player UI must not expose that knowledge. This is not a secure multiplayer visibility implementation.

### Entity categories

| Category | Visibility rule |
|---|---|
| Persistent structure | Floor, fixed cover, walls, fixed crates, doors and architecture remain readable. Dim/desaturate unobserved regions. |
| Dynamic presence | Enemy actors, movable crates, dropped gear and physical gadgets require current direct or external observation. |
| Knowledge record | A timestamped last-known position may remain as a historical indicator after sight is lost. |
| Player-owned UI | Player state and the camera's known command/link status may be shown without asserting the device's current physical visibility. |

Mark crates explicitly fixed or movable; appearance alone must not decide the rule. Doors can remain closed and fixed in this prototype. If adding opening doors, their collision and sight obstruction must update with the same state.

### Direct observation

For each candidate dynamic entity, test several representative body points such as head, chest and pelvis. For each point:

1. Confirm it is in range and in the head-origin field of view.
2. Cast from the head to the sample against sight-blocking gameplay geometry.
3. Test whether active smoke obstructs that segment.
4. Count valid observed samples and apply a documented visibility threshold.

An exposed head should be sufficient to communicate a peek; do not require the target's full body to clear cover. Keep a simple, reproducible rule rather than testing every decorative triangle. Prototype FOV and range may be adjusted in a developer panel.

Use short confirmation/hysteresis for marginal partial-visibility transitions to prevent flicker. This must not become live tracking through solid cover: on fully blocked sight, stop publishing current target transforms to the player presentation immediately. If using a cosmetic fade-out, freeze it at the last observed transform, keep it very brief and then leave only the historical marker. No smoothing may invent sight through a wall.

Outside observation, hide dynamic meshes and their associated shadows, labels, particle effects and target-specific outlines. Keep simulation colliders active even when render objects are hidden. Never rely on mesh `visible` state to determine whether it blocks a bullet.

Keep static architecture visible and darken it gently. Global blackout/fog-of-war tiles are wrong for this concept. A coarse shader mask or spatially grouped materials is sufficient for the prototype; static-geometry brightness may be approximate, while dynamic-entity visibility must follow the observation logic. Label debug cone volumes as explanations, not the authoritative visibility algorithm.

### External intel and knowledge

Use one preplaced friendly camera as the implemented recon tool. It contributes a separate position, direction, FOV and range, with the same occlusion checks. The player's observed set is the union of direct observation and active camera observations. Track source IDs so a revealed enemy can be labeled `DIRECT` or `CAM 01` in developer mode.

Add developer controls for `Camera online`, `Camera jammed` and `Camera destroyed`. Jammed and destroyed sources contribute no observation. If the player directly sees a target after camera loss, the target remains visible through direct sight. Do not globally hide all enemies when a sensor is disabled.

When an observed actor becomes unobserved, save an immutable record of its last observed position and simulation timestamp. Display a hollow, non-humanoid marker, age label and gradual uncertainty/fade. Move the hidden actor on a scripted route to prove the marker stays put. Expire it after a configurable demo duration. Pausing the simulation must also pause its age.

A destroyed/offline camera status icon is a status record. Do not show its live world mesh through walls just because it is owned. The original design also mentions drones, sensors and teammate vision; keep the observer-source interface extensible but implement only the one camera for this build. Do not add fake nonfunctional gadget buttons.

### Smoke and audio

Provide one toggled smoke volume that blocks visual observation for both the player and camera. Smoke denies intel but does not become a solid ballistic wall. Static architecture remains dimly readable; dynamic targets behind smoke disappear unless another valid unblocked observer sees them.

Represent enemy movement/noise as a coarse, transient directional pulse or broad screen-edge arc. A pulse communicates rough activity, not an exact enemy position, identity, current outline or tracking dot. Rate-limit pulses and avoid encoding precise distance. Actual audio is optional and must begin only after user interaction; the visual cue is required. Walk/combat/sprint should change coarse noise feedback in a way a viewer can compare.

## 9. Depth-sway aiming and shots

Implement the proposed hybrid: mouse chooses screen-space aim; the user explicitly selects intended depth; a predictable oscillating dot samples a small offset around that depth at firing time. The reticle's horizontal oscillation encodes **world Z depth**, not horizontal world X spread.

Use named variables such as `selectedDepth`, `swayPhase`, `swayAmplitude`, `headAnchor` and `muzzleAnchor`. Avoid carrying the original Y-depth notation into Y-up code.

One concrete implementation:

1. Unproject the mouse through the orthographic camera and intersect its picking ray with the plane at `z = selectedDepth`. This yields an intended point `P0` whose X/Y match the screen aim.
2. Advance a continuous deterministic sway phase from simulation time. Compute `depthOffset = amplitude * sin(phase)` as a first prototype model.
3. Smooth amplitude/frequency changes when movement or stance changes; do not randomly reset phase on each shot.
4. Construct `P = (P0.x, P0.y, selectedDepth + depthOffset)`.
5. On firing, sample the current offset once and cast a ray/segment from the **muzzle** toward P, up to a sensible maximum range. Avoid division/normalization errors if P is at the muzzle.
6. Resolve the nearest collision against geometry and actor hit proxies. Cover hits win if cover is closer. Never force the result based on a UI reticle color.

This chooses a world-space offset at the aim-point distance, not a constant angular error. Document that it is a proposed demonstrator mapping, with no claim that the final game must use it.

| Situation | Intended sway relationship |
|---|---|
| Still standing | Small and slow. |
| Walking | Moderate. |
| Sprinting | Large and unstable in amplitude, still deterministic. |
| Crouching | Reduced relative to standing/moving. |
| Aiming | Reduced amplitude and improved control. |
| Repeated fire | Temporary amplitude increase with recovery. |
| Braced | Smallest stable amplitude. |
| Just stopped | Brief settling transition rather than instant perfect aim. |

Show a circular reticle with a center marker and one oscillating dot. A separate small label indicates selected depth. Keep sway modest for ordinary shots and noticeably relevant at a narrow aperture. Sliders should let a developer exaggerate it for explanation without making the exaggerated mode the default.

Use a hitscan shot with a brief tracer for visualization; simulate neither detailed exterior ballistics nor random bullet spread. In the narrow-aperture station, the same screen aim must produce a clear hit, doorframe hit or depth miss depending on the actual 3D ray. Put all blocker and target proxies in the query explicitly and take the closest intersection. Disable inappropriate backface omissions or use analytic box/capsule intersections.

Observed hits may briefly flash the visible target. A hidden enemy hit must not reveal an exact position through an omniscient hit marker, damage number or event log in player mode. Detailed hit/occlusion reports belong to developer mode. No gore or death animation is necessary.

## 10. Simple capture illustration

Include one terminal labeled `CONTROL A`. Treat the player as attacker and a scripted actor as defender. Show capture progress while the attacker is inside a small 3D zone and no defender is inside it. A defender in the zone pauses progress and shows `CONTESTED`; leaving the zone pauses progress. Completion displays `CONTROL SECURED`. Reset restores the starting state.

This is a proposed communication model, not the final ruleset. A public contested state reveals objective occupancy by design; call out this limited information exception rather than leaking precise defender location. Do not show an unseen defender's identity or marker. No team selection screen, respawn loop, match timer, score economy or multiplayer is needed.

## 11. Guided scenarios

Provide these seven presets against the shared map. Each has a short purpose, reproducible initial conditions, reset button and a clear observable success state. UI presets manipulate the real simulation; do not fake outcomes with slideshow swaps.

| Preset | Starting state and action | What the viewer learns |
|---|---|---|
| 1. Hidden battlefield | Static room visible, enemy behind opaque partition, camera off. | Map remains known while enemy and dropped gear are absent. |
| 2. Exposure ladder | Crouched player at cover; step through hidden, observe, aim. | Eyes clearing cover reveal; muzzle clearance is separate. |
| 3. Camera intel | Enemy behind partition; toggle remote camera online. | Another valid sight source reveals otherwise unseen presence. |
| 4. Lost contact | Camera initially reveals enemy; cut link and advance scripted enemy. | Enemy disappears and historical marker stays at the old location. |
| 5. Smoke and sound | Visible enemy path, toggle smoke and motion speed. | Smoke removes visual intel; sound supplies only rough activity. |
| 6. Depth shot | Player at aperture with target at known depth; vary sway/brace/depth. | Same screen aim can intersect cover, hit, or miss in 3D. |
| 7. Control point | Attacker outside zone; enter, then move scripted defender into zone. | Illustrative capture and contested behavior. |

Add a guided-tour button that advances through these presets with short captions and explicit `Next` controls. A pause/step control is useful for examining transitions. Deterministic scripted routes should restart with the preset. Do not require combat AI or generative agents.

## 12. Interface and presentation

Make the 3D scene the dominant area, ideally at least 70% of a desktop layout. Use a compact header, narrow scenario selector and collapsible inspector. Avoid large cards crowding out the room. Maintain a restrained charcoal/gray/olive palette with cyan observation overlays and amber firing/uncertainty overlays. Use readable text and labels in addition to color.

### Player view

Show stance, speed mode, selected depth, small ammo/shot feedback, capture status, known camera link status and compact controls. Do not show all enemy locations, hidden transforms, per-target visibility scores or a debug event log.

### Developer view

Use an explicit toggle and persistent `DEVELOPER VIEW` badge. Expose eye/muzzle anchors, clipped sight rays, firing rays, colliders, observer-source tags, the top-view inset, relevant tuning controls and a short bounded event log. Full simulation truth may be displayed here for learning. The switch back to player view must remove every omniscient overlay immediately.

Suggested inspector sections: scenario, stance and exposure, direct visibility, camera status, smoke/noise, aim/depth, capture, and API status. Use numeric controls only where they help demonstrate cause and effect; no enormous generic property editor.

Show loading, empty/error states and retry if the API cannot load a preset. Once a session is running, temporary API loss must not stop the local movement loop. Display the disconnected state honestly. On a small screen, stack controls below the canvas and retain aspect ratio; desktop keyboard/mouse is the primary target, so a full mobile shooter control system is not required.

## 13. GraphQL boundary and contract

GraphQL must do useful work without becoming a real-time simulation transport.

### Ownership

| Server/in-process GraphQL store | Browser simulation |
|---|---|
| Scenario descriptors and authored seed data | Current actor transforms and movement |
| Tunable preset configuration | Sight queries, observation union and knowledge records |
| Session ID, scenario ID, seed and revision | Cover state and head/muzzle transforms |
| Configuration mutations and explicit reset results | Sway phase, shots, noise, capture and animation |

Do not send mutations for mouse movement, each frame, every raycast or each reticle update. Fetch a scenario at selection/session start; apply configuration changes on commit or debounce. Reset/load operations are explicit. A client-local runtime snapshot is not an authoritative server world state and must not be presented as one.

Use session IDs to isolate two browser tabs. In-memory sessions may vanish on server restart; explain that in the UI/README and offer a clean new session. No persistence requirement.

### Minimum operation contract

The following SDL is a starting contract; refinements are allowed if the same behavior remains demonstrable. Definitions are deliberately typed rather than an unstructured JSON blob.

```graphql
enum ScenarioKind {
  HIDDEN_BATTLEFIELD
  EXPOSURE_LADDER
  CAMERA_INTEL
  LOST_CONTACT
  SMOKE_SOUND
  DEPTH_SHOT
  CONTROL_POINT
}

enum EntityKind { PLAYER ENEMY DROPPED_GEAR CAMERA }
enum Team { FRIENDLY OPPOSING NEUTRAL }
enum ScriptKind { STATIC PATROL LOST_CONTACT_ROUTE OBJECTIVE_CONTEST }
enum CameraStatus { ONLINE OFFLINE JAMMED DESTROYED }

type Vec3 { x: Float!, y: Float!, z: Float! }
type Bounds { center: Vec3!, size: Vec3! }

type ColliderSeed {
  id: ID!
  bounds: Bounds!
  blocksMovement: Boolean!
  blocksSight: Boolean!
  blocksShots: Boolean!
  visualRole: String!
}

type EntitySeed {
  id: ID!
  kind: EntityKind!
  team: Team!
  position: Vec3!
  facingX: Int!
  script: ScriptKind!
  waypoints: [Vec3!]!
}

type SceneSeed {
  mapId: ID!
  colliders: [ColliderSeed!]!
  entities: [EntitySeed!]!
  depthZones: [Bounds!]!
  smokeBounds: Bounds!
  captureBounds: Bounds!
}

type DemoConfig {
  visionRange: Float!
  visionFovDegrees: Float!
  lastKnownSeconds: Float!
  cameraStatus: CameraStatus!
  smokeEnabled: Boolean!
  baseSwayAmplitude: Float!
  swayFrequencyHz: Float!
  settleSeconds: Float!
  captureSeconds: Float!
}

input DemoConfigPatch {
  visionRange: Float
  visionFovDegrees: Float
  lastKnownSeconds: Float
  cameraStatus: CameraStatus
  smokeEnabled: Boolean
  baseSwayAmplitude: Float
  swayFrequencyHz: Float
  settleSeconds: Float
  captureSeconds: Float
}

type Scenario {
  id: ID!
  kind: ScenarioKind!
  title: String!
  description: String!
  seed: Int!
  initialScene: SceneSeed!
  defaultConfig: DemoConfig!
}

type DemoSession {
  id: ID!
  scenarioId: ID!
  seed: Int!
  revision: Int!
  config: DemoConfig!
}

type Query {
  scenarios: [Scenario!]!
  scenario(id: ID!): Scenario
  session(id: ID!): DemoSession
}

type Mutation {
  createSession(scenarioId: ID!): DemoSession!
  updateConfig(
    sessionId: ID!
    expectedRevision: Int!
    patch: DemoConfigPatch!
  ): DemoSession!
  resetSession(sessionId: ID!, expectedRevision: Int!): DemoSession!
}
```

Define units: geometry and sway amplitude in world meters, FOV in degrees, time in seconds, frequency in cycles/second. Require facingX to be -1 or +1. Validate finite values and sensible ranges in resolvers. Mutation omission means unchanged; reject explicit null for optional patch fields or document a consistent equivalent policy. Reject unknown session/scenario IDs and revision conflicts with clear error codes. Never silently substitute a different scenario.

Keep initial mechanical setup and scripted timing in scenario seed definitions keyed by `ScenarioKind`; extend `SceneSeed` with typed fields if needed. Avoid a second unrelated hardcoded map in the renderer. The same seed should create visible geometry and collision proxies.

### Operation behavior

- `scenarios`: request only list fields for selector UI.
- `scenario`: fetch the selected map seed, entity seeds and defaults.
- `createSession`: return a fresh ID, copied config, deterministic seed and revision 1.
- `updateConfig`: validate the expected revision, apply the patch atomically, increment revision and return the new configuration. The browser applies the returned settings without resetting player transforms unless explicitly requested.
- `resetSession`: restore that scenario's defaults and original seed, increment revision and instruct the client through its reset action to rebuild local runtime state from the cached/fetched initial scene. Do not imply the server tracked the moving actors.
- Scenario switching creates a new session; clean up old in-memory sessions with a simple documented cap/expiry if necessary.

Serialize configuration mutations or implement proper revision conflict handling. Prevent delayed responses from a previously selected session/scenario from overwriting the current runtime. Disable conflicting controls while a reset is in flight. A network retry must not accidentally create several active scenes or animation loops.

Supply example query and mutation documents in the repo and show successful operation names in a small developer API panel. A real query, a real successful mutation and a visible error state must be demonstrated. Use the standard GraphQL `data`/`errors` response handling; HTTP success alone is not application success.

No subscriptions, WebSockets, live match synchronization or production server authority are needed. The real game's future requirement remains server-authoritative visibility so hidden enemy state is not delivered to unauthorized clients. This local visualization intentionally does not satisfy that requirement.

## 14. Suggested module structure

Keep boundaries clear without turning this into an enterprise architecture:

```text
src/
  app/                    # App shell, scenario selection, panels, tour
  scene/                  # Three.js scene, camera, procedural models, overlays
  simulation/
    world.ts              # Runtime state + fixed-step update
    movement.ts           # Collision-aware movement and contextual depth
    cover.ts              # Mechanical stance + head/muzzle anchors
    visibility.ts         # Observer tests against proxy geometry and smoke
    knowledge.ts          # Observed set + immutable last-known records
    aiming.ts             # Selected depth + deterministic sway
    shots.ts              # First-hit 3D collision queries
    recon.ts              # Camera observation-source state
    objective.ts          # Illustrative capture behavior
  graphql/                # Client transport + operation documents
  shared/                 # Shared types, units, tuning and seed definitions
server/
  index.ts                # Local HTTP entry point
  schema.ts               # Executable GraphQL schema
  resolvers.ts            # In-memory scenarios/sessions
  store.ts
reference-images/
tests/                    # Focused mechanical and API tests
README.md
```

The exact tree may differ. Keep simulation independent of React components and graphical object instances where practical. React manages UI state, not every per-frame transform. Use stable runtime objects and dispose Three.js resources, event listeners and animation loops on unmount/reset. Resetting ten times must not create ten cameras or duplicate input handlers.

## 15. Build sequence

1. **Foundation:** working local app/API, typed scenario data, one fixed-camera room, procedural soldier and collision-aware movement. Verify actual 3D depth and camera constraints first.
2. **Cover and sight:** implement the three mechanical states, separate anchors, dynamic visibility and static map readability. This is the first vertical slice.
3. **Intel:** camera-source union, loss of contact, frozen last-known records and smoke/noise examples.
4. **Depth aiming:** selectable depth, deterministic sway, settling/bracing and real first-hit ray queries.
5. **Presentation:** guided presets, illustrative objective, restrained art pass, reference gallery and player/developer modes.
6. **Verification:** focused tests, manual walkthrough, build check, screenshots and concise explanation of limitations.

If time or runtime limits force a tradeoff, reduce asset detail, decorative architecture and animation first. Preserve the camera, visibility, cover distinction and actual 3D shot outcomes. Report missing required mechanics; do not quietly label a partial mockup complete.

## 16. Acceptance criteria

Complete the following checklist and report each item as verified, failed or not tested, with brief evidence. Automated geometry/state tests should cover high-risk rules; visual behavior should also be checked in the running app.

### Scene and movement

- [ ] Launch works with the documented command and requires no secrets or external services.
- [ ] The scene is interactive 3D, not an image with click overlays.
- [ ] Main camera remains strictly perpendicular through movement, resize, reset and preset switching.
- [ ] Two equal-size actors at different depths retain equal projected size under orthographic projection.
- [ ] Player cannot walk through cover or solid door jambs; depth travel is constrained as documented.
- [ ] Focus loss clears controls; UI interactions do not fire weapons or move the player.

### Observation and cover

- [ ] Hidden actors and gear disappear outside observation while persistent architecture remains readable.
- [ ] A hidden enemy's shadow, label, outline or particles do not reveal it in player mode.
- [ ] Eye below cover cannot observe through it; eye just above cover can reveal the exposed target.
- [ ] Observe state can see the target while its muzzle ray hits concrete.
- [ ] Aim-over clears both rays when geometry actually permits it.
- [ ] Changing decorative mesh detail does not change gameplay sight or collision proxies.
- [ ] Direct sight fully blocked by a wall stops live target updates even if transition smoothing is enabled.

### Intel

- [ ] Camera reveal uses its own blocked/unblocked sightlines; it is not a global reveal toggle.
- [ ] Camera loss removes only that source's contribution; direct observation still works.
- [ ] After contact loss, the historical marker remains at the observed location as the hidden enemy moves.
- [ ] Marker age/expiry follows simulation time and resets correctly.
- [ ] Smoke blocks all affected visual sources while allowing bullets through.
- [ ] Audio cues indicate rough activity without exact hidden enemy position.
- [ ] Turning developer mode off removes omniscient inset, rays and hidden-state logs.

### Shots and objective

- [ ] Reticle phase is deterministic and advances continuously; repeated clicks do not reroll accuracy.
- [ ] Bracing/crouching/aiming reduce sway; movement/repeated fire increase it; stopping produces a settling period.
- [ ] Selected depth changes actual Z aim, not X spread or projected character size.
- [ ] A first-hit test confirms foreground cover wins over a target behind it.
- [ ] A test confirms a shot can miss in depth despite an on-screen overlap.
- [ ] A hidden target does not produce omniscient player-mode hit markers.
- [ ] Capture advances only with attacker occupancy and no defender occupancy, pauses correctly and resets.

### GraphQL and application state

- [ ] Scenario UI loads from an actual GraphQL operation with the expected typed fields.
- [ ] A config mutation changes a visible behavior and returns an incremented revision.
- [ ] Invalid config, unknown ID and revision conflict produce understandable errors.
- [ ] Reset restores scene, scripts, intel records, sway phase and capture state deterministically.
- [ ] A stale response from a previous preset cannot overwrite the newly selected preset.
- [ ] Two sessions have isolated configuration.
- [ ] Local simulation stays responsive during slow/disconnected API conditions.
- [ ] In-process fallback, if used, is clearly labeled and really executes the schema.
- [ ] Typecheck, focused tests and build pass; failures are reported rather than hidden.

## 17. Required final delivery from Claude

Provide the runnable project and a short guide containing:

1. Exact install/run/build/test commands and the frontend/API URLs.
2. What has been implemented, with any explicit simplifications.
3. A two-minute tour through hidden battlefield, cover exposure, camera loss and depth shot.
4. Controls and where to adjust tuning.
5. How GraphQL and the local simulation divide responsibility.
6. The coordinate convention and the four main modules worth reading first.
7. Acceptance-test results and screenshots of the key states if browser tools are available. If screenshots/tests cannot be executed, state that plainly.
8. Remaining design questions and a small next step for the owner's later Godot implementation.

Preserve the source references in the project. Do not invent performance measurements, test results or claims of production readiness. Aim for smooth interaction on a typical desktop, limit pixel ratio and avoid heavy postprocessing; report measurements only if actually measured.

## 18. Explicit exclusions and deferred ideas

Do not add networking, accounts, a database, a multiplayer lobby, monetization, inventory progression, detailed weapon customization, real-world factions, procedural campaign generation, advanced tactical AI, realistic ballistics, extensive destruction, a full sound library or mobile touch-combat controls. Do not implement drones, sensors, prone, vaulting and climbing merely because they are mentioned in the long-term context. Keep the architecture able to grow without building these systems now.

Do not change the camera angle to solve depth readability. Do not replace visibility with simple distance fading. Do not show hidden silhouettes to make the scene look more populated. Do not treat GraphQL as a rendering engine or route the frame loop through HTTP. Do not use the ambitious art board as a requirement to build a multi-floor production map.

## 19. Technical references

These sources clarify the selected implementation tools; they do not supply or alter the game design:

- [GraphQL learning documentation](https://graphql.org/learn/) — schema, query, mutation and execution concepts.
- [Three.js OrthographicCamera documentation](https://threejs.org/docs/#api/en/cameras/OrthographicCamera) — fixed-size projection independent of depth.
- [Three.js Raycaster documentation](https://threejs.org/docs/#api/en/core/Raycaster) — ray-based intersections for picking/proxy queries.
- [GraphQL Yoga repository and setup](https://github.com/graphql-hive/graphql-yoga) — lightweight executable schema and local Node server setup.

Consult the currently installed package documentation for exact signatures. The architecture and defaults above are proposed for this visual demonstrator; the user's supplied context is the authority for the game concept.
