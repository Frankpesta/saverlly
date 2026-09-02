// Packages the esbuild output (dist/main.js) into TWO Windows exes via @yao-pkg/pkg — a
// maintained fork of the now-archived vercel/pkg, same CLI/behavior. The bundle is already
// fully self-contained (esbuild inlined all deps), so pkg only needs to snapshot the Node
// runtime + that one file, no node_modules walk required. Both exes run the exact same
// dist/main.js (its own argv-based isNativeMessagingInvocation check decides which role to
// play) — they differ only in their embedded PE manifest's requested execution level:
//
// - saverlly-agent.exe: requireAdministrator, needed for the background-agent role's own
//   HKLM/scheduled-task writes, and for the interactive first-run bootstrap double-click.
// - saverlly-agent-host.exe: no elevation requested (asInvoker, the default) — this is what
//   native-messaging-host.ts's manifest ends up pointing Chrome at (see
//   nativeMessagingHostExePath's doc comment). Chrome launches a native messaging host via a
//   plain, non-elevating CreateProcess call, which fails outright (ERROR_ELEVATION_REQUIRED,
//   no UAC prompt, no message ever written) against an exe whose manifest requests elevation —
//   confirmed by hand: shipping only the requireAdministrator exe meant the extension's
//   connectNative() call could never receive a token in the first place, in any build, ever.
//
// rcedit (the electron project's PE-resource editor) stamps in the "requireAdministrator"
// execution-level manifest for the first exe only — without it, double-clicking the exe as a
// standard kiosk user silently fails every HKLM/scheduled-task write instead of prompting for
// elevation, since a plain Node/pkg exe has no manifest requesting UAC at all.
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
const archiver = require('archiver');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const release = path.join(root, 'release');
const installerDir = path.join(root, 'installer');
const outputExe = path.join(release, 'saverlly-agent.exe');
const hostOutputExe = path.join(release, 'saverlly-agent-host.exe');
const bundleZip = path.join(release, 'saverlly-agent-bundle.zip');
const installerExe = path.join(release, 'SaverllyAgentSetup.exe');

// ISCC.exe's install location varies (winget puts it under %LOCALAPPDATA%, the official
// installer defaults to Program Files (x86)) — check the common spots before falling back to
// PATH, so a missing install fails with a clear message instead of an opaque ENOENT.
function findIscc() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return 'ISCC.exe';
}

// Both exes must land in the same folder on the kiosk owner's machine — main.ts resolves the
// host exe as a sibling of whatever exe is currently running (nativeMessagingHostExePath), not
// an absolute/configured path. A single-file download (what apps/dashboard's "Download Agent"
// button used to point at) can only ever deliver one of the two, silently breaking native
// messaging for anyone who isn't manually told to fetch the second file too. Zipping them
// together so there's exactly one download artifact to distribute.
function zipBundle() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(bundleZip);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.file(outputExe, { name: path.basename(outputExe) });
    archive.file(hostOutputExe, { name: path.basename(hostOutputExe) });
    // Mirrors the installer's layout: overlay.ts looks for these in a `webview2` folder beside
    // the exe, so a manual zip extraction has to reproduce that or the overlay quietly falls
    // back to the legacy dialog.
    archive.directory(path.join(root, 'vendor', 'webview2'), 'webview2');
    archive.finalize();
  });
}

function pkgBuild(outputPath, nodeBinaryPath, extraArgs = []) {
  const pkgBin = require.resolve('@yao-pkg/pkg/lib-es5/bin.js');
  execFileSync(
    process.execPath,
    [
      pkgBin,
      path.join(dist, 'main.js'),
      '--targets',
      'node22-win-x64',
      '--output',
      outputPath,
      // Normally pkg spawns the base binary as a subprocess to precompile dist/main.js to V8
      // bytecode. When that base binary requires elevation to even launch (the main exe's
      // patched copy), that internal spawn fails with EACCES. Two things tried and rejected
      // before this: leaving bytecode generation on produces a packaged exe that fails at
      // runtime ("no source or bytecode for ...main.js" — the silent fallback pkg's warning
      // implied doesn't actually happen); `--no-bytecode` alone is refused outright by pkg's
      // own pre-flight check ("--no-bytecode and no source breaks final executable").
      // `--fallback-to-source` is pkg's own suggested fix for exactly this failure mode — ship
      // dist/main.js as plain JS only for the file(s) where bytecode generation actually
      // failed, not disabling bytecode globally.
      '--fallback-to-source',
      ...extraArgs,
    ],
    // PKG_NODE_PATH points pkg-fetch straight at the given binary instead of its own cache —
    // it also skips pkg-fetch's own hash check against the stock binary, which would otherwise
    // notice the (main exe's) patch, discard it, and silently re-fetch a clean copy.
    { stdio: 'inherit', env: { ...process.env, PKG_NODE_PATH: nodeBinaryPath } },
  );
}

async function run() {
  if (!fs.existsSync(path.join(dist, 'main.js'))) {
    console.error('dist/main.js not found — run "npm run build" first');
    process.exit(1);
  }

  fs.mkdirSync(release, { recursive: true });

  // The installer's [Files] section reads apps/agent/vendor/, which isn't committed — fetch it
  // before ISCC runs, or the compile fails on a missing Source.
  execFileSync(process.execPath, [path.join(__dirname, 'fetch-webview2.js')], { stdio: 'inherit' });

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

  // `--no-bytecode` (with `--public` to satisfy pkg's "no bytecode and no source" pre-flight)
  // because bytecode generation for THIS exe has never actually succeeded: pkg would have to
  // spawn the patched base binary to produce it, and that binary is unlaunchable by design —
  // it carries the requireAdministrator manifest, and rcedit's edit also invalidates the base
  // binary's signature, which leaves it a brand-new unknown hash.
  //
  // `--fallback-to-source` alone was enough while that spawn failed with EACCES, which pkg
  // catches and falls back on. It is NOT enough on a machine running Windows Smart App Control
  // (`HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState = 1`):
  // SAC blocks the freshly-rcedited copy on reputation grounds, the spawn fails with an
  // uncaught `UNKNOWN` (errno -4094) instead, and the whole package aborts. Not attempting the
  // doomed step is both faster and deterministic, and it changes nothing about the artifact —
  // this exe already shipped as plain source via the fallback.
  pkgBuild(outputExe, patchedBasePath, ['--no-bytecode', '--public']);
  fs.rmSync(patchedBasePath, { force: true });
  console.log(`Packaged -> ${outputExe} (requireAdministrator manifest embedded pre-payload)`);

  // Deliberately no rcedit here — the stock base binary's default (asInvoker, no elevation
  // request) is exactly what this one needs.
  pkgBuild(hostOutputExe, baseBinaryPath);
  console.log(`Packaged -> ${hostOutputExe} (no elevation — must ship alongside ${path.basename(outputExe)} in the same folder)`);

  // Verifies the host exe can actually be launched the way Chrome launches it — this is the
  // exact check that caught the real "requireAdministrator breaks native messaging" bug, and
  // nothing else in this package's automated checks would catch a regression of it.
  execFileSync(process.execPath, [path.join(__dirname, 'verify-host-launch.js')], { stdio: 'inherit' });

  await zipBundle();
  console.log(`Bundled -> ${bundleZip} (manual/troubleshooting artifact — the installer below is the real distributable)`);

  // The branded GUI installer (apps/agent/installer/saverlly-agent.iss) — this, not the raw
  // zip, is what apps/dashboard's Download Agent button links to. Compiles both exes plus the
  // wizard branding assets (apps/agent/installer/assets/, generated by generate-assets.js) into
  // one self-contained SaverllyAgentSetup.exe.
  try {
    execFileSync(findIscc(), ['saverlly-agent.iss'], { stdio: 'inherit', cwd: installerDir });
  } catch (err) {
    console.error(
      'Failed to compile the installer. If Inno Setup is not installed, get it from ' +
        'https://jrsoftware.org/isdl.php or `winget install JRSoftware.InnoSetup`.',
    );
    throw err;
  }
  console.log(`Installer -> ${installerExe} (this is the artifact to upload/distribute)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
