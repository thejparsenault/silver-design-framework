import { checkRepresentationRule } from "./check-representation-lib.mjs";
export const checkProviderRevisionPins = (options = {}) => checkRepresentationRule({ ...options, checker: "provider-revision-pins" });
