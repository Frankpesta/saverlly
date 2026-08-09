import { execFileSync } from 'child_process';

// Real Chrome enterprise policy location — list-type policies (Forcelist/Allowlist) are
// represented in the registry as a key whose value names are "1", "2", "3", ... and whose
// values are the list entries. Chrome re-reads this fresh on every launch, so it's not part
// of the (resettable) Chrome user profile.
export const CHROME_POLICY_KEY_BASE = 'HKLM\\SOFTWARE\\Policies\\Google\\Chrome';
export const CHROME_WEB_STORE_UPDATE_URL = 'https://clients2.google.com/service/update2/crx';

function regExe(args: string[]): void {
  execFileSync('reg', args, { stdio: 'ignore' });
}

function regExeIgnoringErrors(args: string[]): void {
  try {
    regExe(args);
  } catch {
    // e.g. "reg delete" on a key that doesn't exist yet — fine, that's the desired end state anyway.
  }
}

/**
 * Overwrites a list-type registry policy key with exactly these values (as "1", "2", ...),
 * deleting anything already there first. Re-running this unconditionally on every agent
 * startup — rather than diffing first — is what makes it self-healing against a registry-level
 * reset: there's no "already correct, skip" branch to accidentally skip past a tampered value.
 */
function writeListPolicy(keyPath: string, values: string[]): void {
  regExeIgnoringErrors(['delete', keyPath, '/f']);
  values.forEach((value, index) => {
    regExe(['add', keyPath, '/v', String(index + 1), '/t', 'REG_SZ', '/d', value, '/f']);
  });
}

/** Reads back a list-type policy key's current values, in "1","2",... order. Used for verification/debugging. */
export function readListPolicy(keyPath: string): string[] {
  let output: string;
  try {
    output = execFileSync('reg', ['query', keyPath], { encoding: 'utf8' });
  } catch {
    return [];
  }

  const entries: { index: number; value: string }[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(\d+)\s+REG_SZ\s+(.*)$/.exec(line);
    if (match) {
      entries.push({ index: Number(match[1]), value: match[2].trim() });
    }
  }
  return entries.sort((a, b) => a.index - b.index).map((e) => e.value);
}

export interface ChromePolicyOptions {
  /** Defaults to the real Chrome policy path — override only for isolated testing. */
  keyBase?: string;
}

/**
 * Force-installs and locks the Saverlly extension via Chrome's ExtensionInstallForcelist +
 * ExtensionInstallAllowlist enterprise policies. Call unconditionally on every agent startup
 * (see writeListPolicy) so a registry-level reset self-heals without needing the setup code
 * again — see 04-PHASE-4-desktop-agent.md §2.
 */
export function applyChromeForceInstallPolicy(
  extensionId: string,
  updateUrl: string,
  options: ChromePolicyOptions = {},
): void {
  if (!extensionId) {
    throw new Error('extensionId is required to apply the Chrome force-install policy');
  }
  const keyBase = options.keyBase ?? CHROME_POLICY_KEY_BASE;

  writeListPolicy(`${keyBase}\\ExtensionInstallForcelist`, [`${extensionId};${updateUrl}`]);
  // Force-installed extensions are already non-removable/non-disableable by Chrome's own
  // policy semantics; the allowlist entry is redundant belt-and-braces per spec, harmless to set.
  writeListPolicy(`${keyBase}\\ExtensionInstallAllowlist`, [extensionId]);
}
