const esbuild = require('esbuild');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

// Every real kiosk install of the packaged exe needs the SAME extension id / API origin —
// there's no per-machine env var for a kiosk owner to set. So instead of reading these at
// runtime (which only works for local dev, where you control the environment), bake whatever
// is set in *this* build's environment directly into the bundle via esbuild's `define`, which
// literally substitutes the process.env.X expression with the value at build time.
//
// SAVERLLY_SETUP_CODE is deliberately excluded — that one really is per-install/per-location
// and must stay a genuine runtime read (env var or the interactive prompt), never baked.
const BAKED_AT_BUILD_TIME = ['SAVERLLY_EXTENSION_ID', 'SAVERLLY_API_BASE_URL', 'SAVERLLY_EXTENSION_UPDATE_URL'];

function buildDefine() {
  const define = {};
  const baked = [];
  for (const key of BAKED_AT_BUILD_TIME) {
    if (process.env[key]) {
      define[`process.env.${key}`] = JSON.stringify(process.env[key]);
      baked.push(key);
    }
  }
  if (baked.length > 0) {
    console.log(`Baking build-time config into the bundle: ${baked.join(', ')}`);
  } else {
    console.warn(
      'No SAVERLLY_EXTENSION_ID/SAVERLLY_API_BASE_URL/SAVERLLY_EXTENSION_UPDATE_URL set in this build\'s ' +
        'environment — the bundle will fall back to runtime env vars / defaults, which is fine for local ' +
        'dev but NOT what you want for a real exe handed to kiosk owners. Set them before `npm run package`.',
    );
  }
  return define;
}

const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: path.join(dist, 'main.js'),
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  logLevel: 'info',
  define: buildDefine(),
  // esbuild's built-in node-core-module detection doesn't recognize this newer subpath
  // import; mark it external explicitly so it resolves via the real Node runtime instead.
  external: ['readline/promises'],
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log(`Built agent -> ${dist}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
