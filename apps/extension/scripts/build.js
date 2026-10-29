const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');
// Setting SAVERLLY_REVIEWER_API_URL has always meant a reviewer build too.
const reviewers = process.argv.includes('--reviewers') || !!process.env.SAVERLLY_REVIEWER_API_URL;
const local = watch || process.argv.includes('--local');
// The live backend, baked into every build so the extension works with no agent to supply it
// (the agent's address still wins when there is one). Temporary live origin explicitly approved
// by the user; switch to HTTPS when the backend has a domain. `npm run dev` and
// `npm run build:local` use a local backend instead. SAVERLLY_API_URL overrides either.
const liveOrigin = 'http://56.228.62.8:3000';
const apiUrl = process.env.SAVERLLY_API_URL ?? process.env.SAVERLLY_REVIEWER_API_URL ??
  (local ? 'http://localhost:3000' : liveOrigin);
{
  let url;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new Error(`SAVERLLY_API_URL is not a valid URL: "${apiUrl}"`);
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  const approvedTemporaryOrigin = url.origin === liveOrigin;
  if ((!local && !approvedTemporaryOrigin && url.protocol !== 'https:') || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('SAVERLLY_API_URL must be an HTTPS origin, localhost, or the approved temporary live backend.');
  }
}

const entryPoints = [
  'src/background/service-worker.ts',
  'src/content-scripts/checkout-detector.ts',
  'src/content-scripts/coupon-applier.ts',
  'src/content-scripts/store-setup.ts',
  'src/popup/popup.ts',
  'src/options/options.ts',
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
  // Start from an empty assets folder so assets removed from src don't linger in the build.
  fs.rmSync(path.join(dist, 'popup/assets'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dist, 'popup/assets'), { recursive: true });
  for (const file of fs.readdirSync(path.join(root, 'src/popup/assets'))) {
    fs.copyFileSync(path.join(root, 'src/popup/assets', file), path.join(dist, 'popup/assets', file));
  }
  fs.mkdirSync(path.join(dist, 'options'), { recursive: true });
  for (const file of ['options.html', 'options.css']) {
    fs.copyFileSync(path.join(root, 'src/options', file), path.join(dist, 'options', file));
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
  define: {
    __API_BASE_URL__: JSON.stringify(apiUrl.replace(/\/$/, '')),
    // Only the reviewer build offers "Have a reviewer code?".
    __REVIEWER_ACCESS__: JSON.stringify(reviewers),
  },
};

async function run() {
  copyStatic();
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log(`Built extension -> ${dist} (backend ${apiUrl}${reviewers ? ', reviewer access on' : ''})`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
