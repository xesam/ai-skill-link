import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { addSources, removeSources, listSources } from '../src/source-manager.js';
import { clearConfigCache } from '../src/config.js';

describe('source-manager', () => {
  const testBase = join(tmpdir(), `skill-link-src-mgr-${Date.now()}`);
  const configFile = join(testBase, 'config');

  beforeEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    mkdirSync(testBase, { recursive: true });
    process.env.SKILL_LINK_CONFIG = configFile;
    clearConfigCache();
  });

  afterEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    clearConfigCache();
    delete process.env.SKILL_LINK_CONFIG;
  });

  it('adds a source with basename-derived name (~/my-skills -> my-skills)', () => {
    const dir = join(testBase, 'my-skills');
    mkdirSync(dir, { recursive: true });

    const res = addSources([dir]);
    expect(res.added).toEqual([{ name: 'my-skills', path: dir }]);
    expect(res.skipped).toEqual([]);
    expect(res.errors).toEqual([]);

    const raw = readFileSync(configFile, 'utf-8');
    expect(raw).toContain('[source]');
    expect(raw).toContain(`my-skills = ${dir}`);
  });

  it('uses parent dir name when leaf is skills (project-x/skills -> project-x)', () => {
    const dir = join(testBase, 'work', 'project-x', 'skills');
    mkdirSync(dir, { recursive: true });

    const res = addSources([dir]);
    expect(res.added[0].name).toBe('project-x');
  });

  it('auto-suffixes on name conflict', () => {
    const a = join(testBase, 'awesome-tools', 'skills');
    const b = join(testBase, 'elsewhere', 'awesome-tools', 'skills');
    mkdirSync(a, { recursive: true });
    mkdirSync(b, { recursive: true });

    const res = addSources([a, b]);
    expect(res.added.map((x) => x.name)).toEqual(['awesome-tools', 'awesome-tools-2']);
  });

  it('skips an already-registered path and reports owner name', () => {
    const dir = join(testBase, 'my-skills');
    mkdirSync(dir, { recursive: true });

    addSources([dir]);
    clearConfigCache();
    const again = addSources([dir]);
    expect(again.added).toEqual([]);
    expect(again.skipped[0].reason).toContain('already registered as my-skills');
  });

  it('errors when directory does not exist', () => {
    const res = addSources([join(testBase, 'no-such')]);
    expect(res.added).toEqual([]);
    expect(res.errors[0].reason).toBe('directory does not exist');
    // nothing written
    expect(existsSync(configFile)).toBe(false);
  });

  it('dry-run adds nothing to disk', () => {
    const dir = join(testBase, 'my-skills');
    mkdirSync(dir, { recursive: true });

    const res = addSources([dir], { dryRun: true });
    expect(res.added).toEqual([{ name: 'my-skills', path: dir }]);
    expect(existsSync(configFile)).toBe(false);
  });

  it('contracts path to ~ when under home', () => {
    const home = homedir();
    const dir = join(home, '.skill-link-test-dir-' + Date.now());
    mkdirSync(dir, { recursive: true });
    try {
      addSources([dir]);
      const raw = readFileSync(configFile, 'utf-8');
      // Value stored with ~ contraction since the path is under home.
      expect(raw).toContain(`= ~/${basename(dir)}`);
      expect(raw).not.toContain(`= ${dir}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('removes an existing source', () => {
    const dir = join(testBase, 'my-skills');
    mkdirSync(dir, { recursive: true });
    addSources([dir]);
    clearConfigCache();

    const res = removeSources(['my-skills']);
    expect(res.removed).toEqual(['my-skills']);
    const raw = readFileSync(configFile, 'utf-8');
    expect(raw).not.toContain('my-skills =');
  });

  it('remove skips unknown names', () => {
    const res = removeSources(['ghost']);
    expect(res.removed).toEqual([]);
    expect(res.skipped[0].name).toBe('ghost');
  });

  it('preserves other sections (e.g. [clis]) when writing', () => {
    writeFileSync(configFile, `[clis]\ntest-cli = ${join(testBase, '.tc')}\n`);
    clearConfigCache();
    const dir = join(testBase, 'my-skills');
    mkdirSync(dir, { recursive: true });

    addSources([dir]);
    const raw = readFileSync(configFile, 'utf-8');
    expect(raw).toContain('[clis]');
    expect(raw).toContain('test-cli');
    expect(raw).toContain('[source]');
  });

  it('listSources returns merged sources including default', () => {
    writeFileSync(
      configFile,
      `[source]\ndefault = ${join(testBase, 'def')}\nwork = ${join(testBase, 'work-skills')}\n`,
    );
    clearConfigCache();
    const sources = listSources();
    const names = sources.map((s) => s.name);
    expect(names).toContain('default');
    expect(names).toContain('work');
  });
});
