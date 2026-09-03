import * as fs from 'fs';
import * as path from 'path';
import { agentStatusStateFilePath } from './paths';

interface AgentStatusState {
  active: boolean;
  checkedAt: string;
}

function isAgentStatusState(value: unknown): value is AgentStatusState {
  return typeof value === 'object' && value !== null && typeof (value as AgentStatusState).active === 'boolean';
}

export function writeAgentActiveState(active: boolean, filePath: string = agentStatusStateFilePath()): void {
  const state: AgentStatusState = { active, checkedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Last known "should this device be serving its token" verdict from the periodic status
 * sync. Defaults to true only when no status check has ever completed yet (a brief window
 * right after first install). Once any check has run, this always reflects its real result,
 * with no grace period: unlike the extension's own direct status polling (which rides out a
 * short network blip before going dormant), this is a secondary/redundant signal path, so
 * failing closed immediately here is the safer default per 00-PROJECT-OVERVIEW.md §4.
 */
export function isAgentActive(filePath: string = agentStatusStateFilePath()): boolean {
  if (!fs.existsSync(filePath)) {
    return true;
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (isAgentStatusState(parsed)) {
      return parsed.active;
    }
  } catch {
    // corrupt file. No reliable prior signal, fall through to the same "never checked" default
  }
  return true;
}
