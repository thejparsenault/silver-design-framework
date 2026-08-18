// Native entrypoint. The compiled executable lives at <payload>/bin/silver;
// everything that Silver installs into a workspace remains as ordinary,
// inspectable files under that same versioned payload directory.
import path from "node:path";
import { runCli } from "../installer/cli.mjs";

async function main() {
  globalThis.__silverNativeExecutable = process.execPath;
  globalThis.__silverPayloadRoot = path.resolve(path.dirname(process.execPath), "..");

  // The executable bundles the CLI and dependencies. The framework payload is
  // external so workspace packages remain inspectable and byte-identical to
  // their npm equivalents.
  process.exitCode = await runCli(process.argv.slice(2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
