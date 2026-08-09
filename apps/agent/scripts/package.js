// Packages the esbuild output (dist/main.js) into a single Windows exe via @yao-pkg/pkg —
// a maintained fork of the now-archived vercel/pkg, same CLI/behavior. The bundle is already
// fully self-contained (esbuild inlined all deps), so pkg only needs to snapshot the Node
// runtime + that one file, no node_modules walk required.
//
// After pkg builds the raw exe, rcedit (the electron project's PE-resource editor) stamps in
// a "requireAdministrator" execution-level manifest — without it, double-clicking the exe as
// a standard kiosk user silently fails every HKLM/scheduled-task write instead of prompting
// for elevation, since a plain Node/pkg exe has no manifest requesting UAC at all.
const { execFileSync } = require('child_process');
const { rcedit } = require('rcedit');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');
const outputExe = path.join(release, 'saverlly-agent.exe');

async function run() {
  if (!fs.existsSync(path.join(dist, 'main.js'))) {
    console.error('dist/main.js not found — run "npm run build" first');
    process.exit(1);
  }

  fs.mkdirSync(release, { recursive: true });

  const pkgBin = require.resolve('@yao-pkg/pkg/lib-es5/bin.js');
  execFileSync(
    process.execPath,
    [pkgBin, path.join(dist, 'main.js'), '--targets', 'node22-win-x64', '--output', outputExe],
    { stdio: 'inherit' },
  );

  await rcedit(outputExe, {
    'requested-execution-level': 'requireAdministrator',
    'version-string': {
      ProductName: 'Saverlly Kiosk Agent',
      FileDescription: 'Saverlly Kiosk Agent',
      CompanyName: 'Saverlly',
    },
  });

  console.log(`Packaged -> ${outputExe} (requireAdministrator manifest embedded)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
