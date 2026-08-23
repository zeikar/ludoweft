#!/usr/bin/env node

import { main } from '../../../src/cli.mjs';

main(process.argv.slice(2)).catch((error) => {
  console.error(`ludoweft: ${error.message}`);
  if (process.env.LUDOWEFT_DEBUG === '1' && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
