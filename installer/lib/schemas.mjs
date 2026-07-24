import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const installerRoot = path.dirname(fileURLToPath(import.meta.url));
const schemaRoot = path.resolve(installerRoot, "../../framework/schemas");
const v1SchemaNames = [
  "artifact.schema.json",
  "check-result.schema.json",
  "finding.schema.json",
  "flow.schema.json",
  "lock.schema.json",
  "manifest.schema.json",
  "permission-policy.schema.json",
  "prototype.schema.json",
  "skill.schema.json",
];
const v2SchemaNames = [
  "common.schema.json",
  "lock.schema.json",
];

let validatorPromise;

function formatAjvErrors(errors = []) {
  return errors.map((error) => {
    const location = error.instancePath || "<root>";
    return `${location}: ${error.message}`;
  });
}

async function createValidators() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);

  const entries = [
    ...v1SchemaNames.map((name) => ({
      key: name,
      path: path.join(schemaRoot, "v1", name),
    })),
    ...v2SchemaNames.map((name) => ({
      key: `v2/${name}`,
      path: path.join(schemaRoot, "v2", name),
    })),
  ];
  const schemas = await Promise.all(
    entries.map(async ({ path: schemaPath }) =>
      JSON.parse(await readFile(schemaPath, "utf8")),
    ),
  );
  for (const schema of schemas) {
    ajv.addSchema(schema);
  }

  return new Map(
    schemas.map((schema, index) => [
      entries[index].key,
      ajv.getSchema(schema.$id),
    ]),
  );
}

async function validators() {
  validatorPromise ??= createValidators();
  return validatorPromise;
}

export async function validateSchema(schemaName, value) {
  const validate = (await validators()).get(schemaName);
  if (!validate) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }
  const valid = validate(value);
  return {
    valid,
    errors: valid ? [] : formatAjvErrors(validate.errors),
  };
}
