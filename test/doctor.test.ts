import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  lstatSync,
  readlinkSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { doctor } from '../src/doctor.js';
import { clearConfigCache } from '../src/config.js';

describe('doctor', () => {
  const testBase = join(tmpdir(), `skill-link-doctor-${Date.now()}`);
  const cliDir = join(testBase, 'claude-skills');
  const sourceDir = join(testBase, 'source');
  const testConfigFile = join(testBase, 'config');

  beforeEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    mkdirSync(cliDir, { recursive: true });
    mkdirSync(sourceDir, { recursive: true });

    process.env.SKILL_LINK_CONFIG = testConfigFile;
    writeFileSync(
      testConfigFile,
      `[source]\ndefault = ${sourceDir}\n\n[clis]\ntest-cli = ${cliDir}\n`,
    );

    clearConfigCache();
  });

  afterEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    clearConfigCache();
  });

  it('reports all checks passed when everything is clean', () => {
    mkdirSync(join(sourceDir, 'skill-a'), { recursive: true });
    writeFileSync(join(sourceDir, 'skill-a', 'SKILL.md'), '# Skill A');
    symlinkSync(join(sourceDir, 'skill-a'), join(cliDir, 'skill-a'));

    const issues = doctor('test-cli');
    expect(issues).toBe(0);
  });

  it('detects broken symlinks', () => {
    const brokenTarget = join(testBase, 'nonexistent');
    symlinkSync(brokenTarget, join(cliDir, 'broken-skill'));

    const issues = doctor('test-cli');
    expect(issues).toBeGreaterThan(0);
  });

  it('detects orphan directories', () => {
    mkdirSync(join(cliDir, 'orphan-dir'), { recursive: true });

    const issues = doctor('test-cli');
    expect(issues).toBeGreaterThan(0);
  });

  it('does not report valid symlinks as broken', () => {
    mkdirSync(join(sourceDir, 'skill-a'), { recursive: true });
    writeFileSync(join(sourceDir, 'skill-a', 'SKILL.md'), '# Skill A');
    symlinkSync(join(sourceDir, 'skill-a'), join(cliDir, 'skill-a'));

    const issues = doctor('test-cli');
    expect(issues).toBe(0);
  });

  it('reports unlinked skills in verbose mode', () => {
    mkdirSync(join(sourceDir, 'skill-a'), { recursive: true });
    writeFileSync(join(sourceDir, 'skill-a', 'SKILL.md'), '# Skill A');

    const normalIssues = doctor('test-cli');
    expect(normalIssues).toBe(0);

    const verboseIssues = doctor('test-cli', undefined, true);
    expect(verboseIssues).toBeGreaterThan(0);
  });

  // ------------------------------------------------------------------
  // --fix: dangling link cleanup
  // ------------------------------------------------------------------

  it('--fix removes dangling links but never touches orphan directories', () => {
    symlinkSync(join(testBase, 'gone'), join(cliDir, 'dangling-skill'));
    mkdirSync(join(cliDir, 'orphan-dir'), { recursive: true });

    const issues = doctor('test-cli', undefined, false, { fix: true });

    // Only the orphan remains (never auto-deleted)
    expect(issues).toBe(1);
    expect(lstatSync(join(cliDir, 'dangling-skill'), { throwIfNoEntry: false })).toBeUndefined();
    expect(lstatSync(join(cliDir, 'orphan-dir')).isDirectory()).toBe(true);
  });

  it('--fix returns 0 when all dangling links are cleaned', () => {
    symlinkSync(join(testBase, 'gone'), join(cliDir, 'dangling-skill'));

    const issues = doctor('test-cli', undefined, false, { fix: true });

    expect(issues).toBe(0);
    expect(lstatSync(join(cliDir, 'dangling-skill'), { throwIfNoEntry: false })).toBeUndefined();
  });

  it('--fix --dry-run previews removal without touching the link', () => {
    const link = join(cliDir, 'dangling-skill');
    symlinkSync(join(testBase, 'gone'), link);

    const issues = doctor('test-cli', undefined, false, { fix: true, dryRun: true });

    // Dry-run reflects the expected post-fix state: all clean
    expect(issues).toBe(0);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it('--fix does not remove non-ENOENT broken links (ELOOP)', () => {
    // A self-referencing symlink: stat() fails with ELOOP, not ENOENT.
    // It must be reported but never auto-removed.
    const link = join(cliDir, 'self-loop');
    symlinkSync(link, link);

    const issues = doctor('test-cli', undefined, false, { fix: true });

    expect(issues).toBeGreaterThan(0);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it('report mode hints when a broken link could be re-linked', () => {
    // The skill moved and now lives in the source; the link still points
    // to the old (nonexistent) location.
    mkdirSync(join(sourceDir, 'moved-skill'), { recursive: true });
    writeFileSync(join(sourceDir, 'moved-skill', 'SKILL.md'), '# Moved');
    symlinkSync(join(testBase, 'old-location', 'moved-skill'), join(cliDir, 'moved-skill'));

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const issues = doctor('test-cli');
      expect(issues).toBeGreaterThan(0);
      const out = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(out).toContain('[BROKEN]');
      expect(out).toContain('[HINT]');
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('--fix --relink re-points a moved skill to its new source location', () => {
    mkdirSync(join(sourceDir, 'moved-skill'), { recursive: true });
    writeFileSync(join(sourceDir, 'moved-skill', 'SKILL.md'), '# Moved');
    const link = join(cliDir, 'moved-skill');
    symlinkSync(join(testBase, 'old-location', 'moved-skill'), link);

    const issues = doctor('test-cli', undefined, false, { fix: true, relink: true });

    expect(issues).toBe(0);
    expect(readlinkSync(link)).toBe(join(sourceDir, 'moved-skill'));
    expect(statSync(link).isDirectory()).toBe(true);
  });

  it('--fix removes the dangling link when the skill cannot be relocated (no --relink)', () => {
    mkdirSync(join(sourceDir, 'moved-skill'), { recursive: true });
    writeFileSync(join(sourceDir, 'moved-skill', 'SKILL.md'), '# Moved');
    const link = join(cliDir, 'moved-skill');
    symlinkSync(join(testBase, 'old-location', 'moved-skill'), link);

    const issues = doctor('test-cli', undefined, false, { fix: true });

    // Without --relink the dangling link is removed (not re-pointed)
    expect(issues).toBe(0);
    expect(lstatSync(link, { throwIfNoEntry: false })).toBeUndefined();
  });
});
