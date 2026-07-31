// The index renderer lives in the runtime because an accepted invocation now
// regenerates design/INDEX.md in the same transaction that activates an
// artifact. Re-exported here so `repair` and `doctor` keep their import path.
export { renderIndex } from "../../framework/runtime/index-view.mjs";
