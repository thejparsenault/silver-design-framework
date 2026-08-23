// The payload locator lives in `framework/runtime/` so the runtime mirror at
// `.silver/runtime/` gets a copy of it as a sibling. This re-export keeps the
// installer's own callers importing it from where they always have.
export {
  nativeExecutablePath,
  payloadPath,
  payloadRoot,
} from "../framework/runtime/payload.mjs";
