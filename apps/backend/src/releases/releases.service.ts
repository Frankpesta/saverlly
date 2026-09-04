import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AgentReleaseMeta {
  /** False when neither a local installer nor a remote URL is configured. */
  available: boolean;
  version: string;
  filename: string;
  sizeBytes: number | null;
  /** Hex SHA-256 of the installer, so an operator can verify what they downloaded. Null for a
   * remote release, whose bytes this server never sees. */
  sha256: string | null;
  /** ISO timestamp of the installer's mtime. Null for a remote release. */
  builtAt: string | null;
  /** Set when the release is served from object storage rather than this server's disk. */
  remoteUrl: string | null;
}

const INSTALLER_FILENAME = 'SaverllyAgentSetup.exe';

/**
 * Where the Windows agent installer comes from.
 *
 * Two deployment shapes, in priority order:
 *   1. `AGENT_DOWNLOAD_URL` set: the installer lives in object storage and the download endpoint
 *      redirects there. This is what DEPLOYMENT.md's S3 step configures.
 *   2. Otherwise: the installer is on this server's disk, at `AGENT_RELEASE_DIR` (defaulting to
 *      the agent workspace's own release output, which is where `npm run package` writes it).
 *
 * The dashboard used to read a build-time `NEXT_PUBLIC_AGENT_DOWNLOAD_URL` instead, which meant
 * the button silently did nothing until someone rebuilt the frontend with the var set. Resolving
 * it here makes the button work off runtime configuration, and lets it state the version and
 * size it is about to hand over.
 */
@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);
  /** SHA-256 is a full read of a ~32MB file, so it is computed once per (path, mtime, size). */
  private hashCache: { key: string; sha256: string } | null = null;

  constructor(private readonly configService: ConfigService) {}

  get remoteUrl(): string | null {
    return this.configService.get<string>('AGENT_DOWNLOAD_URL') ?? null;
  }

  get installerPath(): string {
    const configured = this.configService.get<string>('AGENT_RELEASE_DIR');
    if (configured) return path.join(configured, INSTALLER_FILENAME);
    // Default to the agent workspace's build output, relative to the backend's cwd.
    return path.join(
      process.cwd(),
      '..',
      'agent',
      'release',
      INSTALLER_FILENAME,
    );
  }

  getMeta(): AgentReleaseMeta {
    const version =
      this.configService.get<string>('AGENT_RELEASE_VERSION') ?? '0.1.0';

    if (this.remoteUrl) {
      return {
        available: true,
        version,
        filename: INSTALLER_FILENAME,
        sizeBytes: null,
        sha256: null,
        builtAt: null,
        remoteUrl: this.remoteUrl,
      };
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(this.installerPath);
    } catch {
      // Not an error worth logging on every poll: a deployment that distributes the agent from
      // S3 but hasn't set AGENT_DOWNLOAD_URL yet lands here legitimately.
      return {
        available: false,
        version,
        filename: INSTALLER_FILENAME,
        sizeBytes: null,
        sha256: null,
        builtAt: null,
        remoteUrl: null,
      };
    }

    return {
      available: true,
      version,
      filename: INSTALLER_FILENAME,
      sizeBytes: stats.size,
      sha256: this.sha256(this.installerPath, stats),
      builtAt: stats.mtime.toISOString(),
      remoteUrl: null,
    };
  }

  private sha256(filePath: string, stats: fs.Stats): string | null {
    const key = `${filePath}:${stats.mtimeMs}:${stats.size}`;
    if (this.hashCache?.key === key) return this.hashCache.sha256;
    try {
      const sha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');
      this.hashCache = { key, sha256 };
      return sha256;
    } catch (error) {
      this.logger.warn(
        `Could not hash the agent installer at ${filePath}`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }
}
