import * as os from 'os';
import { createInterface } from 'readline/promises';
import { registerDevice } from './api-client';
import { getOrCreateDeviceIdentifier } from './identity';
import { loadDeviceToken, saveDeviceToken } from './token-storage';

function osVersionString(): string {
  return `${os.type()} ${os.release()}`;
}

async function promptForSetupCode(): Promise<string> {
  // Escape hatch for scripted/unattended installs — avoids needing an interactive
  // console session just to provision a kiosk computer.
  if (process.env.SAVERLLY_SETUP_CODE) {
    return process.env.SAVERLLY_SETUP_CODE.trim();
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Enter this location's setup code: ");
    return answer.trim();
  } finally {
    rl.close();
  }
}

/**
 * Ensures this machine has a valid device token, registering with the backend only on
 * first run. Every later agent startup finds the token already on disk and returns it
 * immediately — registration never re-runs unless %PROGRAMDATA%/KioskAgent is gone
 * (e.g. a full machine reimage), per 04-PHASE-4-desktop-agent.md.
 */
export async function ensureRegistered(): Promise<string> {
  const existingToken = loadDeviceToken();
  if (existingToken) {
    return existingToken;
  }

  const deviceIdentifier = getOrCreateDeviceIdentifier();
  const setupCode = await promptForSetupCode();
  if (!setupCode) {
    throw new Error('No setup code provided — cannot register this device');
  }

  const hostname = os.hostname();
  const response = await registerDevice({
    setupCode,
    label: hostname,
    hostname,
    deviceIdentifier,
    osVersion: osVersionString(),
  });

  saveDeviceToken(response.token);
  return response.token;
}
