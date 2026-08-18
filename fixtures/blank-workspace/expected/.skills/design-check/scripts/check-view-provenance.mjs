import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkViewProvenance = (options = {}) => checkRepresentationRule({ ...options, checker: "view-provenance" });
