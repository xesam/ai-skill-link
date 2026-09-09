import {
  symlinkSync,
  unlinkSync,
  readlinkSync,
  mkdirSync,
  existsSync,
  lstatSync,
  rmSync,
  statSync,
} from 'node:fs';
import { relative, dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';

export interface LinkResult {
  status: 'ok' | 'skip' | 'error' | 'conflict';
  message: string;
  source?: string;
  destination?: string;
}

export function relpathSync(from: string, to: string): string {
  const r = relative(from, to);
  return r || '.';
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function applyProjectPath(
  cliName: string,
  targetDir: string,
  projectRoot: string,
  projectDirOverride?: string,
): string {
  if (projectDirOverride) {
    return join(projectRoot, projectDirOverride);
  }
  const home = homedir();
  if (targetDir.startsWith(home + '/') || targetDir === home) {
    return join(projectRoot, targetDir.slice(home.length + 1));
  }
  throw new Error(
    `Cannot derive project-level path for CLI '${cliName}': configured path '${targetDir}' is not home-relative`,
  );
}

/**
 * Check whether an existing symlink's target matches the expected source.
 * Handles both relative and absolute symlinks correctly by resolving
 * relative links against the symlink's own directory.
 */
function isSameLinkTarget(symlinkPath: string, linkText: string, targetSrc: string): boolean {
  if (linkText === targetSrc) return true;
  const currentResolved = resolve(dirname(symlinkPath), linkText);
  return currentResolved === resolve(targetSrc);
}

export function createSymlink(
  src: string,
  dst: string,
  options: { force?: boolean; dryRun?: boolean; useRelative?: boolean },
): LinkResult {
  const { force = false, dryRun = false, useRelative = false } = options;
  const dstDir = dirname(dst);
  const linkSrc = useRelative ? relpathSync(dstDir, src) : src;

  const lst = lstatSync(dst, { throwIfNoEntry: false });

  if (lst !== undefined) {
    if (lst.isSymbolicLink()) {
      const current = readlinkSync(dst);
      if (isSameLinkTarget(dst, current, linkSrc) || isSameLinkTarget(dst, current, src)) {
        return {
          status: 'skip',
          message: `[SKIP] already linked: ${dst} -> ${current}`,
          source: src,
          destination: dst,
        };
      }
      if (!force) {
        return {
          status: 'conflict',
          message: `[ERR] destination exists with different symlink: ${dst}`,
          destination: dst,
        };
      }
      if (dryRun) {
        return {
          status: 'ok',
          message: `[DRY-RUN] remove existing symlink: ${dst}`,
          destination: dst,
        };
      }
      unlinkSync(dst);
    } else {
      if (!force) {
        return {
          status: 'conflict',
          message: `[ERR] destination exists and is not a symlink: ${dst}`,
          destination: dst,
        };
      }
      if (dryRun) {
        return {
          status: 'ok',
          message: `[DRY-RUN] remove existing path: ${dst}`,
          destination: dst,
        };
      }
      rmSync(dst, { recursive: true, force: true });
    }
  }

  if (dryRun) {
    return {
      status: 'ok',
      message: `[DRY-RUN] ln -s ${linkSrc} ${dst}`,
      source: linkSrc,
      destination: dst,
    };
  }

  try {
    symlinkSync(linkSrc, dst);
    return {
      status: 'ok',
      message: `[OK] linked: ${dst} -> ${linkSrc}`,
      source: linkSrc,
      destination: dst,
    };
  } catch (err: any) {
    return {
      status: 'error',
      message: `[ERR] failed to link: ${dst} -> ${linkSrc}: ${err.message}`,
      source: linkSrc,
      destination: dst,
    };
  }
}

export function removeSymlink(
  dst: string,
  expectedSrc: string,
  options: { force?: boolean; dryRun?: boolean },
): LinkResult {
  const { force = false, dryRun = false } = options;

  const lst = lstatSync(dst, { throwIfNoEntry: false });

  if (lst === undefined) {
    return {
      status: 'skip',
      message: `[SKIP] not linked: ${dst}`,
      destination: dst,
    };
  }

  if (lst.isSymbolicLink()) {
    const current = readlinkSync(dst);

    // A dangling symlink (its target no longer exists — the source was moved,
    // renamed, or deleted) can always be removed without --force: the link
    // itself is the only thing being deleted, and it is dead weight anyway.
    // This is exactly the state users end up in after moving a skill source.
    let live = true;
    try {
      statSync(dst);
    } catch {
      live = false;
    }

    if (live) {
      // The link still resolves. Only remove it without --force when we can
      // verify it points at the expected source. An empty expectedSrc means
      // the skill was not found in any source, so we cannot verify ownership.
      const verified = !!expectedSrc && isSameLinkTarget(dst, current, expectedSrc);
      if (!verified) {
        if (!force) {
          const reason = expectedSrc
            ? `symlink points elsewhere (${current})`
            : `cannot verify symlink target (${current}); skill not found in sources`;
          return {
            status: 'conflict',
            message: `[ERR] ${reason}, use --force to remove: ${dst}`,
            destination: dst,
          };
        }
      }
    }

    if (dryRun) {
      return {
        status: 'ok',
        message: `[DRY-RUN] rm ${dst}${live ? '' : ' (dangling)'}`,
        destination: dst,
      };
    }
    unlinkSync(dst);
    return {
      status: 'ok',
      message: `[OK] unlinked: ${dst}${live ? '' : ' (dangling)'}`,
      destination: dst,
    };
  }

  // Not a symlink
  if (!force) {
    return {
      status: 'conflict',
      message: `[ERR] not a symlink: ${dst}, use --force to remove`,
      destination: dst,
    };
  }

  if (dryRun) {
    return {
      status: 'ok',
      message: `[DRY-RUN] rm -rf ${dst}`,
      destination: dst,
    };
  }
  rmSync(dst, { recursive: true, force: true });
  return {
    status: 'ok',
    message: `[OK] removed: ${dst}`,
    destination: dst,
  };
}
