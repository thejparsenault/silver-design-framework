import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkSynchronizationStatus = (options = {}) => checkRepresentationRule({ ...options, checker: "synchronization-status" });
