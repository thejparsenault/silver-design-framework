import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkStaleProposals = (options = {}) => checkRepresentationRule({ ...options, checker: "stale-proposals" });
