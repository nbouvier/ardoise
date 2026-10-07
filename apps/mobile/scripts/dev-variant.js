// Runs a command with `APP_VARIANT=development`, unless `APP_VARIANT` is already set.
//
// Local development builds get their own application id and name ("Ardoise (dev)", see
// `app.config.ts`), so they install next to the production and staging apps instead of
// replacing them. Every local command that resolves the id needs the variant: `expo run`
// and `expo prebuild` build under it, `expo start` launches the installed app by it.
// It is set here rather than defaulted in `app.config.ts`, so that a release build or an
// update published without a variant stays the production app.
const { spawnSync } = require('node:child_process');

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node scripts/dev-variant.js <command> [args...]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  env: { ...process.env, APP_VARIANT: process.env.APP_VARIANT ?? 'development' },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
