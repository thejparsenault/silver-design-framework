#!/usr/bin/env node

import { runCli } from "../installer/cli.mjs";

process.exitCode = await runCli(process.argv.slice(2));
