#!/usr/bin/env node

// The plugin ships the whole repository, so the core CLI sits above this skill directory.
// Verified against an installed plugin root; a narrower packaging would break this path.
import { runCli } from '../../../src/run-cli.mjs';

runCli(process.argv.slice(2));
