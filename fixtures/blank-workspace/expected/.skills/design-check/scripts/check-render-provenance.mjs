import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkRenderProvenance = (options = {}) => checkRepresentationRule({ ...options, checker: "render-provenance" });
