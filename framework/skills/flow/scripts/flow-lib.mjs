import path from "node:path";

export const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const flowKinds = new Set([
  "user-flow",
  "interaction-flow",
  "component-flow",
]);
export const flowScopes = new Set(["product", "prototype"]);

export function safeRelativePath(value, label) {
  if (
    !value ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`${label} must be a safe workspace-relative path.`);
  }
  return value;
}

export function validDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    datePattern.test(value) &&
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function parseArguments(args, booleanOptions = new Set()) {
  const values = { positional: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      values.positional.push(argument);
      continue;
    }
    const key = argument.slice(2);
    if (booleanOptions.has(key)) {
      values[key] = true;
      continue;
    }
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    values[key] = next;
    index += 1;
  }
  return values;
}

export function workspaceRelative(root, absolutePath) {
  const relative = path.relative(root, absolutePath).split(path.sep).join("/");
  return relative.startsWith("../") ? undefined : relative;
}
