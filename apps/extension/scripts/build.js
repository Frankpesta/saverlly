const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

const entryPoints = [
  'src/background/service-worker.ts',
  'src/content-scripts/checkout-detector.ts',
  'src/content-scripts/coupon-applier.ts',
  'src/popup/popup.ts',
];

function copyStatic() {
  fs.mkdirSync(dist, { recursive: true });
  fs.copyFileSync(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
  fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });
  for (const file of fs.readdirSync(path.join(root, 'icons'))) {
    fs.copyFileSync(path.join(root, 'icons', file), path.join(dist, 'icons', file));
  }
  fs.mkdirSync(path.join(dist, 'popup'), { recursive: true });
  fs.copyFileSync(path.join(root, 'src/popup/popup.html'), path.join(dist, 'popup/popup.html'));
  fs.copyFileSync(path.join(root, 'src/popup/popup.css'), path.join(dist, 'popup/popup.css'));
}

const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: dist,
  outbase: 'src',
  format: 'iife',
  target: 'chrome116',
  platform: 'browser',
  sourcemap: true,
  logLevel: 'info',
};

async function run() {
  copyStatic();
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log(`Built extension -> ${dist}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
