import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkAuthority = (options = {}) => checkRepresentationRule({ ...options, checker: "authority" });
