import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { payloadPath } from "../../installer/payload.mjs";

const defaultSchemaRoot = payloadPath("framework/schemas/v2", import.meta.url);
const validatorsByRoot = new Map();

function formatErrors(errors = []) {
  return errors.map((error) => {
    const location = error.instancePath || "<root>";
    return `${location}: ${error.message}`;
  });
}

async function loadValidators(schemaRoot) {
  const resolvedRoot = path.resolve(schemaRoot);
  if (validatorsByRoot.has(resolvedRoot)) {
    return validatorsByRoot.get(resolvedRoot);
  }
  const names = (await readdir(resolvedRoot))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
  const schemas = await Promise.all(
    names.map(async (name) =>
      JSON.parse(await readFile(path.join(resolvedRoot, name), "utf8")),
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }
  const validators = new Map(
    schemas.map((schema, index) => [
      names[index],
      ajv.getSchema(schema.$id),
    ]),
  );
  validatorsByRoot.set(resolvedRoot, validators);
  return validators;
}

export async function validateV2(schemaName, value, options = {}) {
  const validators = await loadValidators(
    options.schemaRoot ?? defaultSchemaRoot,
  );
  const validate = validators.get(schemaName);
  if (!validate) {
    throw new Error(`Unknown Silver v2 schema: ${schemaName}`);
  }
  const valid = validate(value);
  return {
    valid,
    errors: valid ? [] : formatErrors(validate.errors),
  };
}

export async function assertV2(schemaName, value, options = {}) {
  const result = await validateV2(schemaName, value, options);
  if (!result.valid) {
    throw new Error(
      `${schemaName} validation failed:\n${result.errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }
  return value;
}
