// Post-package sanity check: confirms saverlly-agent-host.exe can actually be launched the
// same way Chrome launches a native messaging host — a plain, non-elevating child-process
// spawn. Node's child_process uses CreateProcess on Windows (same as Chrome's native-messaging
// launcher), not ShellExecute, which is the only path that would honor a requireAdministrator
// manifest via a UAC prompt. This is the exact check that caught the real "Native host has
// exited" bug: an exe whose manifest requests elevation fails outright here
// (ERROR_ELEVATION_REQUIRED), never even starting, with zero output — and nothing in the unit
// test suite can catch that, since it's OS process-launch semantics, not application logic.
//
// This only checks that the process starts and exits cleanly, not that it returns a real
// device token — on a machine with no agent installed yet (e.g. CI), loadDeviceToken() finds
// nothing and respondWithDeviceToken() writes an 'error' native message instead, which is a
// normal, successful (exit 0) run. That's deliberate: this check validates launchability, not
// runtime device state.
const { spawnSync } = require('child_process');
const path = require('path');

const hostExe = path.join(__dirname, '..', 'release', 'saverlly-agent-host.exe');

// A spawn attempt on a Windows exe that was just written moments ago by pkg can transiently
// fail with a generic "UNKNOWN" spawn error — most likely Defender/AV real-time scanning
// briefly locking the freshly-created (large, unsigned) file. Same class of flaky-freshly-
// written-file issue documented elsewhere in this project; a short retry rides it out without
// masking a real elevation-required failure, which fails identically and immediately on every
// attempt rather than clearing up.
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const MAX_ATTEMPTS = 10;
let result;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  result = spawnSync(hostExe, ['chrome-extension://verify-host-launch-check/'], { timeout: 5000 });
  if (!result.error) break;
  if (attempt < MAX_ATTEMPTS) {
    console.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} failed to spawn ${path.basename(hostExe)} (${result.error.message}), retrying...`);
    sleep(1000);
  }
}

if (result.error) {
  console.error(
    `FAILED: ${path.basename(hostExe)} could not be launched unprivileged — this is exactly what breaks ` +
      `native messaging in a real Chrome install. Cause: ${result.error.message}`,
  );
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`FAILED: ${path.basename(hostExe)} exited with code ${result.status}`);
  if (result.stderr?.length) console.error(result.stderr.toString());
  process.exit(1);
}

console.log(`OK: ${path.basename(hostExe)} launches unprivileged, exactly as Chrome's native-messaging launcher does.`);
