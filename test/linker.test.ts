import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  readlinkSync,
  existsSync,
  lstatSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  relpathSync,
  applyProjectPath,
  createSymlink,
  removeSymlink,
  ensureDir,
} from '../src/linker.js';
import { homedir } from 'node:os';

describe('relpathSync', () => {
  it('computes relative path between directories', () => {
    const result = relpathSync('/a/b/c', '/a/b/d/e');
    expect(result).toBe('../d/e');
  });

  it('returns dot for same directory', () => {
    const result = relpathSync('/a/b', '/a/b');
    expect(result).toBe('.');
  });

  it('computes relative with child path', () => {
    const result = relpathSync('/a/b/c', '/a/b/c/d');
    expect(result).toBe('d');
  });
});

describe('applyProjectPath', () => {
  it('replaces $HOME prefix with project root', () => {
    const home = homedir();
    const result = applyProjectPath('claude-code', join(home, '.claude/skills'), '/my-project');
    expect(result).toBe('/my-project/.claude/skills');
  });

  it('uses projectDirOverride when provided', () => {
    const home = homedir();
    const result = applyProjectPath(
      'pi',
      join(home, '.pi/agent/skills'),
      '/my-project',
      '.pi/skills',
    );
    expect(result).toBe('/my-project/.pi/skills');
  });

  it('throws for non-home-relative path without override', () => {
    expect(() =>
      applyProjectPath('claude-code', '/usr/local/skills', '/my-project'),
    ).toThrow(/Cannot derive project-level path/);
  });

  it('uses override even for non-home-relative global path', () => {
    const result = applyProjectPath('custom', '/usr/local/skills', '/my-project', '.custom/skills');
    expect(result).toBe('/my-project/.custom/skills');
  });
});

describe('createSymlink and removeSymlink', () => {
  const testBase = join(tmpdir(), 'skill-link-linker-test');
  const srcDir = join(testBase, 'src', 'my-skill');
  const dstDir = join(testBase, 'dst', 'skills');

  beforeEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'SKILL.md'), '# My Skill');
    mkdirSync(dstDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testBase, { recursive: true, force: true });
  });

  it('creates a symlink successfully', () => {
    const dst = join(dstDir, 'my-skill');
    const result = createSymlink(srcDir, dst, {});

    expect(result.status).toBe('ok');
    expect(existsSync(dst)).toBe(true);
    expect(lstatSync(dst).isSymbolicLink()).toBe(true);
    expect(readlinkSync(dst)).toBe(srcDir);
  });

  it('dry-run does not create symlink', () => {
    const dst = join(dstDir, 'my-skill');
    const result = createSymlink(srcDir, dst, { dryRun: true });

    expect(result.status).toBe('ok');
    expect(existsSync(dst)).toBe(false);
    expect(lstatSync(dst, { throwIfNoEntry: false })).toBeUndefined();
  });

  it('skips when already linked to same source', () => {
    const dst = join(dstDir, 'my-skill');
    createSymlink(srcDir, dst, {});
    const result = createSymlink(srcDir, dst, {});

    expect(result.status).toBe('skip');
    expect(result.message).toContain('already linked');
  });

  it('conflicts when destination exists with different target', () => {
    const dst = join(dstDir, 'my-skill');
    const otherSrc = join(testBase, 'src', 'other-skill');
    mkdirSync(otherSrc, { recursive: true });
    writeFileSync(join(otherSrc, 'SKILL.md'), '# Other');

    createSymlink(srcDir, dst, {});
    const result = createSymlink(otherSrc, dst, {});

    expect(result.status).toBe('conflict');
  });

  it('force overwrites existing different symlink', () => {
    const dst = join(dstDir, 'my-skill');
    const otherSrc = join(testBase, 'src', 'other-skill');
    mkdirSync(otherSrc, { recursive: true });
    writeFileSync(join(otherSrc, 'SKILL.md'), '# Other');

    createSymlink(srcDir, dst, {});
    const result = createSymlink(otherSrc, dst, { force: true });

    expect(result.status).toBe('ok');
    expect(readlinkSync(dst)).toBe(otherSrc);
  });

  it('removes a symlink successfully', () => {
    const dst = join(dstDir, 'my-skill');
    createSymlink(srcDir, dst, {});
    const result = removeSymlink(dst, srcDir, {});

    expect(result.status).toBe('ok');
    expect(existsSync(dst)).toBe(false);
  });

  it('removeSymlink skips when not linked', () => {
    const dst = join(dstDir, 'my-skill');
    const result = removeSymlink(dst, srcDir, {});

    expect(result.status).toBe('skip');
    expect(result.message).toContain('not linked');
  });

  it('removeSymlink conflicts when symlink points elsewhere without force', () => {
    const dst = join(dstDir, 'my-skill');
    const otherSrc = join(testBase, 'src', 'other-skill');
    mkdirSync(otherSrc, { recursive: true });
    writeFileSync(join(otherSrc, 'SKILL.md'), '# Other');

    createSymlink(srcDir, dst, {});
    const result = removeSymlink(dst, otherSrc, {});

    expect(result.status).toBe('conflict');
  });

  it('removeSymlink force removes symlink pointing elsewhere', () => {
    const dst = join(dstDir, 'my-skill');
    const otherSrc = join(testBase, 'src', 'other-skill');
    mkdirSync(otherSrc, { recursive: true });
    writeFileSync(join(otherSrc, 'SKILL.md'), '# Other');

    createSymlink(srcDir, dst, {});
    const result = removeSymlink(dst, otherSrc, { force: true });

    expect(result.status).toBe('ok');
    expect(existsSync(dst)).toBe(false);
  });

  it('force overwrites non-symlink destination on create', () => {
    const dst = join(dstDir, 'my-skill');
    mkdirSync(dst, { recursive: true });
    writeFileSync(join(dst, 'some-file.txt'), 'data');

    const result = createSymlink(srcDir, dst, { force: true });
    expect(result.status).toBe('ok');
    expect(lstatSync(dst).isSymbolicLink()).toBe(true);
  });

  it('createSymlink with relative path', () => {
    const dst = join(dstDir, 'my-skill');
    const result = createSymlink(srcDir, dst, { useRelative: true });

    expect(result.status).toBe('ok');
    const target = readlinkSync(dst);
    expect(target).not.toBe(srcDir); // should be relative
    expect(target).toBe(relpathSync(dstDir, srcDir));
  });

  it('dry-run does not remove symlink', () => {
    const dst = join(dstDir, 'my-skill');
    createSymlink(srcDir, dst, {});
    const result = removeSymlink(dst, srcDir, { dryRun: true });

    expect(result.status).toBe('ok');
    expect(existsSync(dst)).toBe(true);
  });

  // ------------------------------------------------------------------
  // Moved/removed source scenarios (dangling symlinks)
  // ------------------------------------------------------------------

  it('removes a dangling symlink without --force even when expected source moved elsewhere', () => {
    const dst = join(dstDir, 'my-skill');
    // The skill used to live under 'old-location'; the link now dangles.
    symlinkSync(join(testBase, 'src', 'old-location', 'my-skill'), dst);

    const result = removeSymlink(dst, join(testBase, 'src', 'new-location', 'my-skill'), {});

    expect(result.status).toBe('ok');
    expect(result.message).toContain('dangling');
    expect(lstatSync(dst, { throwIfNoEntry: false })).toBeUndefined();
  });

  it('removes a dangling symlink with unknown expected source (skill not found in any source)', () => {
    const dst = join(dstDir, 'my-skill');
    symlinkSync(join(testBase, 'gone'), dst); // target never existed

    const result = removeSymlink(dst, '', {});

    expect(result.status).toBe('ok');
    expect(result.message).toContain('dangling');
    expect(lstatSync(dst, { throwIfNoEntry: false })).toBeUndefined();
  });

  it('removes a dangling symlink whose target equals the expected source (source deleted)', () => {
    const dst = join(dstDir, 'my-skill');
    const removedSrc = join(testBase, 'src', 'removed-skill');
    symlinkSync(removedSrc, dst); // dir never created -> dangling

    const result = removeSymlink(dst, removedSrc, {});

    expect(result.status).toBe('ok');
    expect(lstatSync(dst, { throwIfNoEntry: false })).toBeUndefined();
  });

  it('conflicts for a live symlink with unknown expected source unless --force', () => {
    const dst = join(dstDir, 'my-skill');
    createSymlink(srcDir, dst, {}); // live link, target exists

    // expectedSrc is empty: skill not found in any source, cannot verify
    const conflict = removeSymlink(dst, '', {});
    expect(conflict.status).toBe('conflict');
    expect(lstatSync(dst).isSymbolicLink()).toBe(true);

    const forced = removeSymlink(dst, '', { force: true });
    expect(forced.status).toBe('ok');
    expect(lstatSync(dst, { throwIfNoEntry: false })).toBeUndefined();
  });

  it('dry-run previews dangling removal without touching the link', () => {
    const dst = join(dstDir, 'my-skill');
    symlinkSync(join(testBase, 'gone'), dst);

    const result = removeSymlink(dst, '', { dryRun: true });

    expect(result.status).toBe('ok');
    expect(result.message).toContain('[DRY-RUN]');
    expect(lstatSync(dst).isSymbolicLink()).toBe(true);
  });
});

describe('ensureDir', () => {
  const testBase = join(tmpdir(), 'skill-link-ensure-dir');

  beforeEach(() => {
    rmSync(testBase, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(testBase, { recursive: true, force: true });
  });

  it('creates directory and parents', () => {
    const deep = join(testBase, 'a', 'b', 'c');
    ensureDir(deep);
    expect(existsSync(deep)).toBe(true);
  });

  it('does not fail for existing directory', () => {
    mkdirSync(testBase, { recursive: true });
    expect(() => ensureDir(testBase)).not.toThrow();
  });
});
