# Context Handoff: Side-Scroller Milsim Game (Personal Project)

> Paste this into a new Claude session. It's a summary of a design conversation I had in ChatGPT. I want to keep designing and building this game with you. **I want to write the code myself** (vibe coding), with you as a dev partner/tutor, not someone who hands me finished projects.

---

## 1. The pitch

A **team-based tactical capture game** that plays like a **side-scroller** but is built in **3D**. The core idea is **limited information**:

> **"The map is known. The battlefield is not."**

- You only see **non-persistent / dynamic things** (enemies, dropped gear, deployables, movable objects) when they're inside your **vision cone**.
- **Persistent things** (terrain, buildings, walls, doors, map layout) are always visible. Areas you aren't observing can be desaturated or darkened, maybe slightly distorted.
- **Gadgets** (cameras, drones, sensors) let you see what's blocked or outside your own view.
- The goal is that information warfare matters as much as shooting. A great scout should be as valuable as a great shot.

## 2. Locked-in design decisions

| System | Decision |
|---|---|
| Genre / mode | Team-based capture / territorial control. Suggested start: **asymmetric attack vs. defend** instead of CTF |
| Visual style | **Stylized realism** with 3D models: realistic proportions and military gear, simplified geometry and textures, muted colors, strong silhouettes, atmospheric lighting |
| Visual inspiration | **INSIDE** (3D world, silhouettes, lighting, side-scroll readability) |
| Camera | **Fixed, head-on, perpendicular side view.** I specifically do NOT want INSIDE's slight angle |
| Movement feel | **Grounded and realistic with some fluidity.** Philosophy: *"Realistic tactical decisions, forgiving mechanical execution"* |
| World / depth | It's a real **3D tactical shooter seen through a fixed side camera**. Players *can* move along the depth axis (in/out of screen), but **map design keeps depth engagements rare and contextual** (doorways, cover, set paths). 2D combat is the default; depth is a situational tactical edge |
| Vision | **Vision cone comes from the character's head/face position.** Static geometry blocks it |
| Collision / ballistics | Use **real 3D collision geometry** for bullets and cover so outcomes match what you see |
| Engine | **Godot 4 (standard build, GDScript, not .NET)**. I considered Unreal and decided to stay with Godot |
| Dev rule | **Gameplay first, visuals second, multiplayer third** |

## 3. Core mechanics

### 3.1 Visibility (three layers)
1. **Persistent environment**: always visible, dimmed when not observed.
2. **Dynamic objects**: visible only when they're inside visible space (head-origin cone, not blocked).
3. **External intel**: cameras, drones, sensors, and teammates reveal things temporarily. All of them can be destroyed, jammed, or avoided.

Extras: **last-known enemy positions** (uncertainty without total blindness), **audio cues** (rough activity, no exact positions), **smoke** (denies intel), and shared team vision.

Things to watch:
- A cone that's too binary feels gamey. Use soft edges, partial-visibility thresholds, and smoothing when entering a peek.
- Keep **gameplay visibility logic separate from the 3D rendering**, so decorative mesh detail doesn't change sightlines.

### 3.2 Physical cover and exposure
Rule: **if your eyes clear the obstacle, you can see. If they don't, you can't.**

Waist-high cover states:
1. **Hidden**: head below the top edge. No vision, and you're mostly unseen. Blind fire only, or no fire.
2. **Peek / observe**: head just above the edge. Cone opens, small body exposure. Good for scouting.
3. **Aim over cover**: head and weapon up. Can fight, bigger profile.

- Peeks are **discrete mechanical states** (left / right / up-over), not just animation. Each one moves the head origin.
- **Sight line ≠ firing line.** Vision comes from the head and the weapon line comes from the muzzle. You can see a target while your muzzle is still blocked.
- There are two kinds of cover under the same rule:
  - **Vertical cover** (waist-high): raise your head or body.
  - **Depth cover** (walls next to doorways): move along the depth axis to get a sightline.

### 3.3 Depth-sway aiming (my idea)
- The mouse sets the aim direction on screen.
- The reticle has a **dot that oscillates side to side in a circle**. Where it is when you click sets the shot's **depth (Y-axis) offset**.
- If the dot is off, the shot goes in front of or behind the target, or clips the doorframe.
- Suggested hybrid: the player picks a target depth and the dot oscillates **around** it.
- Sway is **predictable, not random**:

| Action | Sway |
|---|---|
| Standing still | Small, slow |
| Walking | Moderate |
| Sprinting | Large, unstable |
| Crouching | Reduced |
| ADS | Lower amplitude, more control |
| Repeated fire | More instability |
| Bracing on cover | Much more stable |

- Add a short **stabilization period after moving**.
- Keep sway **subtle for normal shots and decisive for precision shots** (narrow gaps, firing while moving). The geometry decides the outcome, so there are no artificial accuracy penalties.
- Open question: how to show depth on a flat perpendicular view (scale, floor shadows, lighting, environmental cues) when characters at different depths overlap.

### 3.4 Movement
| Ability | Notes |
|---|---|
| Walk | Quiet, precise |
| Combat move | Medium noise and aim control |
| Sprint | Loud, poor aim |
| Crouch | Smaller profile, better accuracy |
| Prone | Maybe later |
| Vault | Smooth over waist-high obstacles |
| Lean / peek | Around cover with minimal exposure |
| Climb | Ladders and set surfaces |
| Jump | Very limited or context-only (avoid bunny-hopping) |

- Use 3 speed tiers instead of a stamina system. **Speed affects noise, and noise affects info.**
- Don't over-animate: instant direction changes, short readable crouch transitions, some weapon inertia but never sluggish.

## 4. Design pillars
1. **Physical visibility**: sight comes from real head-position sightlines.
2. **Intentional exposure**: to gather intel or fight, you have to expose part of yourself.
3. **Information asymmetry**: the map is known, enemy presence isn't.
4. **Reconnaissance tools**: cameras, drones, and sensors extend vision.

## 5. Roadmap
1. **Movement and camera**: 3D blockout, perpendicular camera, walk/crouch/depth move, cover interactions. *(started)*
2. **Visibility**: full cones, occlusion, static vs. dynamic rules.
3. **Combat**: depth-sway aiming, 3D bullet collision, weapon handling, damage.
4. **Recon**: cameras, drones, shared vision, counter-surveillance.
5. **Multiplayer and objectives**: two teams, capture point, networking, **server-authoritative visibility** (so clients never receive hidden enemy data).
6. **Visual polish**: stylized soldiers, weapons, buildings, animation, lighting, sound.

Original MVP scope: one small map with cover and elevation, basic move/aim/shoot, directional vision with occlusion, enemy visibility plus last-known positions, one capture objective, one deployable camera, and two teams (local or bots).

## 6. Where things stand
- Godot 4 standard is installed (I'm probably on Windows).
- ChatGPT generated two throwaway prototype ZIPs:
  - **v0.1**: blockout scene, perpendicular camera, movement, crouch, peek, rough visibility, experimental depth-sway reticle. I ran it and saw basic movement and the sway mechanic working.
  - **v0.2** (not tested yet): wall/cover collision, head-based visibility, crouch/peek affecting sight, vision cone debug view (V), two enemy targets, 3D shot collision. Controls: Ctrl = crouch, Ctrl+Space = peek over cover, W/S = depth.
- **Then I decided I want to build it myself from a clean Godot project** instead of importing generated projects.

## 7. What I want from you next
- Act as a **dev partner and tutor**: give me small pieces of code, tell me where they go (nodes, scenes, scripts), explain why they work, and help me debug.
- **First milestone:** in a fresh Godot 4 project, get one character moving through a 3D room with a fixed perpendicular camera, proper collisions, crouching, and peeking. Then build head-based visibility from scratch.
- Scope: **one room, one soldier, one piece of cover**. No multiplayer or real models yet.
- I prefer direct tradeoff analysis and paste-ready outputs over long explanations.

## 8. Open questions to work through
- How do I make depth readable on a perfectly perpendicular camera?
- Is depth traversal free, or limited to set lanes and positions?
- Exact controls and state machine for move, crouch, peek, aim, and depth step.
- Details of attack/defend capture rules.
- Gadget balance (camera, drone, sensor counterplay).
- How visibility networking should work later (server-side culling).