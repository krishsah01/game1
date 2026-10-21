# Give this package to Claude

Attach the ZIP or extract its contents into Claude Code's workspace. If your Claude interface cannot inspect ZIPs, upload `CLAUDE-HANDOFF.md` and the four PNGs in `reference-images/` individually. The original context and image-generation prompts are included under `source-context/` for reference.

Copy the following prompt:

---

Build the interactive browser visualization described in the attached `CLAUDE-HANDOFF.md`. Read that document completely, then inspect all four reference images. The written mechanics take precedence over illustrative errors in the images. The original source context is background; the current handoff defines this request's scope.

This is an executable concept demonstrator for my side-scroller milsim, with GraphQL as its working scenario/configuration API and Three.js as its 3D renderer. It is not the production Godot game. For this separate visualization I want you to implement the prototype, rather than only tutor me. I still intend to build the real game myself in Godot 4.

Keep the main camera perfectly perpendicular. Demonstrate persistent map visibility, head-origin observation, occluded dynamic objects, hidden/observe/aim cover states, real 3D firing-line obstruction, camera intel and stale last-known markers, smoke/audio information limits, predictable depth sway, and a simple illustrative capture objective. Prioritize these mechanics over asset detail.

Use the handoff's proposed defaults without pausing over routine implementation choices. Start with a short implementation plan and then build and verify the runnable result. Use actual local GraphQL operations; do not merely include a schema file or fake a successful API connection. If your environment cannot host a server, implement the documented in-process GraphQL fallback, clearly label it, and also provide the local server entry point and instructions.

Provide all source files, dependency lockfile, launch instructions, a guided demonstration, screenshots where your environment supports them, and an honest acceptance-test report. Keep modules small enough for me to learn from. Do not expand into multiplayer, a database, account management, realistic combat AI, or a full game. Do not finish with only a plan, static screenshots, or placeholder interactions.

---
