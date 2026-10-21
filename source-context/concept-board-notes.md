# Side-scroller milsim — developer concept pack

Based on the supplied Context Handoff. These images explore the intended presentation; they are not screenshots of an implementation or collision-accurate engineering diagrams.

## Boards

1. **01-gameplay-direction.png** — stylized realism, military silhouettes, industrial capture environment, persistent map readability, proposed minimal HUD.
2. **02-visibility-and-recon.png** — direct sight, external camera intel, stale last-known positions, and signal loss. Cone overlays communicate visibility for developers; displaying these overlays in normal gameplay is not a locked decision.
3. **03-cover-and-exposure.png** — hidden, observe, and aim states. The middle state demonstrates that eyes can clear an obstacle while the muzzle remains blocked.
4. **04-depth-aiming-study.png** — predictable depth sway, bracing and movement, and shot-time sampling. The top-view inset is explanatory, not a proposed gameplay camera or omniscient minimap.

## Implementation constraints from the brief

- Fixed perpendicular side camera. The world is 3D. Horizontal travel and into-screen depth are separate axes. The illustrated axis convention is X horizontal, Y depth, Z vertical; Godot normally uses Y-up, so map this deliberately to the project's coordinate system.
- Static map geometry remains visible. Unobserved dynamic objects must not appear as live silhouettes or markers.
- Sight originates at the head; firing originates at the muzzle. Resolve both against gameplay geometry separately.
- Treat drawn cone edges, line endpoints and cutaways as explanatory art. Exact origins, partial visibility thresholds, occlusion, doorframe collisions and depth projection must be validated in the prototype.
- A last-known marker represents a historical observation, never a current hidden position. Offline camera symbols in the board are schematic status indicators, not proof that the device is currently visible.
- Reticle displacement maps to depth offset. It is predictable rather than random dispersion. Amplitudes and settling time remain untuned.

## Proposed art choices

Industrial setting, charcoal/olive palette, warm practical lights, cyan/orange explanation overlays, HUD placement, team markers, capture terminal styling and intel indicator styling are concepts. These do not settle map theme, depth-lane restrictions, capture rules, gadget balance or final controls. Some material detail in these renders is richer than the intended simplified production assets; prioritize silhouettes and readable value separation.

## Scope

These boards illustrate the longer-term game direction. The immediate build remains one room, one soldier and one cover object: movement/camera, collision, crouch and peek, followed by head-based visibility. Gameplay first, visuals second, multiplayer third.

Created with the built-in image generation tool. Exact generation and refinement prompts are in generation-prompts.md.
