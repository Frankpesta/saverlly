// Packages the esbuild output (dist/main.js) into a single Windows exe via @yao-pkg/pkg —
// a maintained fork of the now-archived vercel/pkg, same CLI/behavior. The bundle is already
// fully self-contained (esbuild inlined all deps), so pkg only needs to snapshot the Node
// runtime + that one file, no node_modules walk required.
//
// rcedit (the electron project's PE-resource editor) stamps in a "requireAdministrator"
// execution-level manifest — without it, double-clicking the exe as a standard kiosk user
// silently fails every HKLM/scheduled-task write instead of prompting for elevation, since a
// plain Node/pkg exe has no manifest requesting UAC at all.
//
// Critically, rcedit runs on pkg's *base Node binary* BEFORE pkg appends its payload, not on
// the final packaged exe. Running rcedit after pkg builds the exe corrupts pkg's own appended
// payload/virtual-filesystem — confirmed by hand (see this file's git history/PR): the packaged
// exe would launch, pass the UAC elevation prompt, then die with pkg's native bootstrap error
// "Pkg: Error reading from file" trying to read its own payload back out. Patching the base
// binary first sidesteps this — rcedit only ever touches a clean, unmodified Node.exe, and pkg
// appends its payload on top of an already-correct manifest afterward.
const { execFileSync } = require('child_process');
const { rcedit } = require('rcedit');
const { need } = require('@yao-pkg/pkg-fetch');
const fs = require('fs');
const os = require('os');
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

  const baseBinaryPath = await need({ nodeRange: 'node22', platform: 'win32', arch: 'x64' });
  const patchedBasePath = path.join(os.tmpdir(), 'saverlly-agent-base-patched.exe');
  fs.copyFileSync(baseBinaryPath, patchedBasePath);

  await rcedit(patchedBasePath, {
    'requested-execution-level': 'requireAdministrator',
    'version-string': {
      ProductName: 'Saverlly Kiosk Agent',
      FileDescription: 'Saverlly Kiosk Agent',
      CompanyName: 'Saverlly',
    },
  });

  const pkgBin = require.resolve('@yao-pkg/pkg/lib-es5/bin.js');
  execFileSync(
    process.execPath,
    [
      pkgBin,
      path.join(dist, 'main.js'),
      '--targets',
      'node22-win-x64',
      '--output',
      outputExe,
      // Normally pkg spawns the base binary as a subprocess to precompile dist/main.js to V8
      // bytecode. Our base binary now requires elevation to even launch (see above), so that
      // internal spawn fails with EACCES. Two things tried and rejected before this: leaving
      // bytecode generation on produces a packaged exe that fails at runtime ("no source or
      // bytecode for ...main.js" — the silent fallback pkg's warning implied doesn't actually
      // happen); `--no-bytecode` alone is refused outright by pkg's own pre-flight check
      // ("--no-bytecode and no source breaks final executable"). `--fallback-to-source` is
      // pkg's own suggested fix for exactly this failure mode — ship dist/main.js as plain JS
      // only for the file(s) where bytecode generation actually failed, not disabling bytecode
      // globally.
      '--fallback-to-source',
    ],
    // PKG_NODE_PATH points pkg-fetch straight at our pre-patched binary instead of its own
    // cache — it also skips pkg-fetch's own hash check against the stock binary, which would
    // otherwise notice the patch, discard it, and silently re-fetch a clean copy.
    { stdio: 'inherit', env: { ...process.env, PKG_NODE_PATH: patchedBasePath } },
  );

  fs.rmSync(patchedBasePath, { force: true });

  console.log(`Packaged -> ${outputExe} (requireAdministrator manifest embedded pre-payload)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
