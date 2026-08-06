import * as path from 'path';

// %PROGRAMDATA% (machine-wide, not per-user) so the agent's identity survives a user
// profile reset and is visible regardless of which Windows account is logged in.
function programDataDir(): string {
  return process.env.PROGRAMDATA ?? 'C:\\ProgramData';
}

export function agentDir(): string {
  return path.join(programDataDir(), 'KioskAgent');
}

export function deviceIdentityFilePath(): string {
  return path.join(agentDir(), 'device.json');
}

export function tokenFilePath(): string {
  return path.join(agentDir(), 'token.enc');
}

export function nativeMessagingManifestPath(): string {
  return path.join(agentDir(), 'native-messaging-host.json');
}

export function announcementStateFilePath(): string {
  return path.join(agentDir(), 'announcement-state.json');
}

export function agentStatusStateFilePath(): string {
  return path.join(agentDir(), 'status-state.json');
}
