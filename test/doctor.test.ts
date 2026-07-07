import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
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
});
