import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { tmpdir } from 'node:os';
import {
  expandHome,
  getSources,
  getRepos,
  getCLIs,
  getProjectCLIs,
  cliProjectDir,
  resolveSource,
  resolveRepo,
  defaultSource,
  defaultRepo,
  cliTargetDir,
  allCliNames,
  clearConfigCache,
} from '../src/config.js';

// Use an isolated config file for tests to avoid race conditions
const testConfigFile = join(tmpdir(), `skill-link-config-test-${Date.now()}.conf`);
process.env.SKILL_LINK_CONFIG = testConfigFile;

describe('expandHome', () => {
  it('expands ~/path to home directory', () => {
    const result = expandHome('~/test');
    expect(result).toBe(join(homedir(), 'test'));
  });

  it('expands bare ~ to home directory', () => {
    const result = expandHome('~');
    expect(result).toBe(homedir());
  });

  it('does not modify paths without ~ prefix', () => {
    expect(expandHome('/absolute/path')).toBe('/absolute/path');
    expect(expandHome('relative/path')).toBe('relative/path');
  });
});

describe('config', () => {
  beforeEach(() => {
    try { unlinkSync(testConfigFile); } catch {}
    clearConfigCache();
  });

  afterEach(() => {
    try { unlinkSync(testConfigFile); } catch {}
    clearConfigCache();
  });

  it('loads builtin CLI config (no user overrides)', () => {
    clearConfigCache();
    const clis = getCLIs();
    expect(Object.keys(clis).length).toBeGreaterThan(0);
    expect(clis['claude-code']).toBe(join(homedir(), '.claude/skills'));
    expect(clis['cursor']).toBe(join(homedir(), '.cursor/skills'));
  });

  it('user config overrides builtin CLI entries', () => {
    writeFileSync(
      testConfigFile,
      `[clis]\ncursor = ~/.my-cursor/skills\nnewtool = ~/.newtool/skills\n`,
    );
    clearConfigCache();

    const clis = getCLIs();
    expect(clis['cursor']).toBe(join(homedir(), '.my-cursor/skills'));
    expect(clis['newtool']).toBe(join(homedir(), '.newtool/skills'));
    expect(clis['claude-code']).toBe(join(homedir(), '.claude/skills'));
  });

  it('user config provides source configuration', () => {
    writeFileSync(
      testConfigFile,
      `[source]\ndefault = ~/my-skills\nwork = ~/work-skills\n`,
    );
    clearConfigCache();

    const sources = getSources();
    expect(sources['default']).toBe(join(homedir(), 'my-skills'));
    expect(sources['work']).toBe(join(homedir(), 'work-skills'));
  });

  it('backward compat: user config uses [repo] section (deprecated)', () => {
    writeFileSync(
      testConfigFile,
      `[repo]\ndefault = ~/old-skills\n`,
    );
    clearConfigCache();

    const sources = getSources();
    expect(sources['default']).toBe(join(homedir(), 'old-skills'));
    // getRepos should still work (deprecated)
    const repos = getRepos();
    expect(repos['default']).toBe(join(homedir(), 'old-skills'));
  });

  it('[source] takes priority over [repo] on key conflict', () => {
    writeFileSync(
      testConfigFile,
      `[repo]\ndefault = ~/old-skills\nwork = ~/old-work\n[source]\ndefault = ~/new-skills\n`,
    );
    clearConfigCache();

    const sources = getSources();
    expect(sources['default']).toBe(join(homedir(), 'new-skills'));
    expect(sources['work']).toBe(join(homedir(), 'old-work'));
  });

  it('resolveSource returns config value for named source', () => {
    writeFileSync(testConfigFile, `[source]\nmysource = ~/my-skills\n`);
    clearConfigCache();

    expect(resolveSource('mysource')).toBe(join(homedir(), 'my-skills'));
  });

  it('resolveSource falls back to input path for unknown names', () => {
    clearConfigCache();
    const result = resolveSource('/some/custom/path');
    expect(result).toBe('/some/custom/path');
  });

  it('resolveSource expands ~ for unknown names that look like paths', () => {
    clearConfigCache();
    const result = resolveSource('~/test-dir');
    expect(result).toBe(join(homedir(), 'test-dir'));
  });

  it('defaultSource returns default entry from config', () => {
    writeFileSync(testConfigFile, `[source]\ndefault = ~/my-skills\n`);
    clearConfigCache();

    expect(defaultSource()).toBe(join(homedir(), 'my-skills'));
  });

  it('defaultSource returns undefined when no default configured', () => {
    clearConfigCache();
    expect(defaultSource()).toBeUndefined();
  });

  it('cliTargetDir returns path for known CLI', () => {
    clearConfigCache();
    expect(cliTargetDir('claude-code')).toBe(join(homedir(), '.claude/skills'));
  });

  it('cliTargetDir returns undefined for unknown CLI', () => {
    clearConfigCache();
    expect(cliTargetDir('nonexistent')).toBeUndefined();
  });

  it('allCliNames returns sorted list', () => {
    clearConfigCache();
    const names = allCliNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('claude-code');
    for (let i = 1; i < names.length; i++) {
      expect(names[i].localeCompare(names[i - 1])).toBeGreaterThanOrEqual(0);
    }
  });

  it('getProjectCLIs returns built-in project-level overrides', () => {
    clearConfigCache();
    const projectClis = getProjectCLIs();
    expect(projectClis['pi']).toBe('.pi/skills');
  });

  it('cliProjectDir returns path for CLI with override', () => {
    clearConfigCache();
    expect(cliProjectDir('pi')).toBe('.pi/skills');
  });

  it('cliProjectDir returns undefined for CLI without override', () => {
    clearConfigCache();
    expect(cliProjectDir('claude-code')).toBeUndefined();
  });

  it('user config can add custom [clis-project] entries', () => {
    writeFileSync(
      testConfigFile,
      `[clis-project]\nmy-tool = .my-tool/skills\n`,
    );
    clearConfigCache();
    expect(cliProjectDir('my-tool')).toBe('.my-tool/skills');
    // built-in entries still present
    expect(cliProjectDir('pi')).toBe('.pi/skills');
  });
});
