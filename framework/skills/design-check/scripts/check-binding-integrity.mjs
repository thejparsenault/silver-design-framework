import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkBindingIntegrity = (options = {}) => checkRepresentationRule({ ...options, checker: "binding-integrity" });
