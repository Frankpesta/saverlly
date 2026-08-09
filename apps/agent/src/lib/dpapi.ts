import { spawnSync } from 'child_process';

// Scopes decryption to this machine (any user/SYSTEM), not the calling Windows user's
// profile — the agent may run under different accounts across logins/reimages, and the
// token must stay decryptable regardless of which one is active.
const DPAPI_SCOPE = 'LocalMachine';
// Extra ciphertext binding so a token.enc file can't be decrypted by copying it into some
// unrelated app's DPAPI call on the same machine.
const ENTROPY = 'Saverlly.KioskAgent.v1';

function powerShellScript(method: 'Protect' | 'Unprotect'): string {
  return `
Add-Type -AssemblyName System.Security
$ErrorActionPreference = 'Stop'
$inputBase64 = [Console]::In.ReadToEnd()
$inputBytes = [Convert]::FromBase64String($inputBase64)
$entropy = [System.Text.Encoding]::UTF8.GetBytes('${ENTROPY}')
$result = [System.Security.Cryptography.ProtectedData]::${method}($inputBytes, $entropy, [System.Security.Cryptography.DataProtectionScope]::${DPAPI_SCOPE})
[Console]::Out.Write([Convert]::ToBase64String($result))
`;
}

function runDpapi(method: 'Protect' | 'Unprotect', inputBase64: string): string {
  const encodedCommand = Buffer.from(powerShellScript(method), 'utf16le').toString('base64');
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
    { input: inputBase64, encoding: 'utf8' },
  );

  if (result.error) {
    throw new Error(`DPAPI ${method} failed to launch powershell: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`DPAPI ${method} failed (exit ${result.status}): ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

/** Encrypts a UTF-8 string with Windows DPAPI, returning base64 ciphertext safe to write to disk. */
export function dpapiProtect(plainText: string): string {
  const inputBase64 = Buffer.from(plainText, 'utf8').toString('base64');
  return runDpapi('Protect', inputBase64);
}

/** Reverses dpapiProtect. Throws if the ciphertext is corrupt or was encrypted on a different machine. */
export function dpapiUnprotect(encryptedBase64: string): string {
  const outputBase64 = runDpapi('Unprotect', encryptedBase64);
  return Buffer.from(outputBase64, 'base64').toString('utf8');
}
