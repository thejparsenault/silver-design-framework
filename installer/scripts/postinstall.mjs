// Installing the package is not the same as having a Silver workspace.
//
// `npm install silver-design-framework` succeeds, writes a package.json with a
// single dependency, and leaves no `.skills`, `.silver`, `design`, or launcher
// behind. Everything looks finished while the product is not yet usable, and
// nothing on screen says what to do next. This prints the safe next command.
//
// It stays quiet in CI, in non-interactive shells, and when Silver is installed
// as a transitive dependency of something else.
const quiet =
  process.env.CI === "true" ||
  process.env.npm_config_loglevel === "silent" ||
  !process.stdout.isTTY;

if (!quiet) {
  const lines = [
    "",
    "  Silver is installed. This folder is not a Silver workspace yet.",
    "",
    "  Next, inspect what setup would do. This reads only:",
    "",
    "    npx silver setup inspect . --json",
    "",
    "  It returns a plan with plain-language questions to answer, then:",
    "",
    "    npx silver setup inspect . --answers '{\"team_shape\":\"solo\",\"topology\":\"integrated\"}' --json | npx silver setup apply -",
    "",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}
