# Legacy JavaScript

These are the original JavaScript implementations of the game scripts. They have
been superseded by the TypeScript codebase in
[`../TypeScript Codebase/`](../TypeScript%20Codebase/), which is what the live
scene and the active room-object prefabs use.

They are kept here for historical reference only.

## Do not attach these to scene objects

When adding or wiring a component, always use the TypeScript version in
`TypeScript Codebase/`. The older `*.D1` and similarly named prefabs still point
at these scripts by asset ID, but those prefabs are no longer spawned by the game
(the procedural spawner uses the `_Remake Objects` prefabs, which are wired to the
TypeScript components).

## One active dependency

`Helpers/PositionBasedDynamicsModule.js` and `Helpers/JSMathLibraryModule.js` are
untyped vendor math libraries with no TypeScript port. The active
`TypeScript Codebase/Helpers/ChainController.ts` still requires them from this
folder at runtime, so they must stay here.
