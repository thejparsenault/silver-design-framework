import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkSemanticMapping = (options = {}) => checkRepresentationRule({ ...options, checker: "semantic-mapping" });
