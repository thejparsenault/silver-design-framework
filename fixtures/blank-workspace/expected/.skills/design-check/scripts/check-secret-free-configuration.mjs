import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkSecretFreeConfiguration = (options = {}) => checkRepresentationRule({ ...options, checker: "secret-free-configuration" });
