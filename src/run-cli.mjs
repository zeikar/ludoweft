import { main } from './cli.mjs';

// Shared by the npm bin and the plugin-bundled entrypoint so error handling lives in one place.
export function runCli(argv) {
  main(argv).catch((error) => {
    console.error(`ludoweft: ${error.message}`);
    if (process.env.LUDOWEFT_DEBUG === '1' && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
