const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
// Temporary live origin explicitly selected for reviewer testing.
const reviewerDefaultOrigin = 'http://56.228.62.8:3000';
const reviewerApiUrl = process.env.SAVERLLY_REVIEWER_API_URL ??
  (process.argv.includes('--reviewers') ? reviewerDefaultOrigin : '');
if (process.argv.includes('--reviewers') && !reviewerApiUrl) {
  throw new Error('SAVERLLY_REVIEWER_API_URL cannot be empty when building reviewer access.');
}
if (reviewerApiUrl) {
  const url = new URL(reviewerApiUrl);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  const approvedTemporaryOrigin = url.origin === reviewerDefaultOrigin;
  if ((!local && !approvedTemporaryOrigin && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('SAVERLLY_REVIEWER_API_URL must be an HTTPS origin, localhost, or the approved temporary reviewer backend.');
  }
}

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
  fs.mkdirSync(path.join(dist, 'popup/assets'), { recursive: true });
  for (const file of fs.readdirSync(path.join(root, 'src/popup/assets'))) {
    fs.copyFileSync(path.join(root, 'src/popup/assets', file), path.join(dist, 'popup/assets', file));
  }
  fs.mkdirSync(path.join(dist, 'popup/fonts'), { recursive: true });
  for (const file of fs.readdirSync(path.join(root, 'src/popup/fonts'))) {
    fs.copyFileSync(path.join(root, 'src/popup/fonts', file), path.join(dist, 'popup/fonts', file));
  }
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
  define: { __REVIEWER_API_BASE_URL__: JSON.stringify(reviewerApiUrl.replace(/\/$/, '')) },
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
