import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../src/cli.js';
import { clearConfigCache } from '../src/config.js';

describe('cli integration', () => {
  const testBase = join(tmpdir(), `skill-link-cli-test-${Date.now()}`);
  const sourceDir = join(testBase, 'skills');
  const testConfigFile = join(testBase, 'config');

  beforeEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    mkdirSync(sourceDir, { recursive: true });
    process.env.SKILL_LINK_CONFIG = testConfigFile;
    writeFileSync(
      testConfigFile,
      `[source]\ndefault = ${sourceDir}\n\n[clis]\ntest-cli = ${join(testBase, '.test-cli', 'skills')}\n`,
    );
    clearConfigCache();
  });

  afterEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    clearConfigCache();
  });

  it('--source flag is recognized for --list', async () => {
    mkdirSync(join(sourceDir, 'skill-a'), { recursive: true });
    writeFileSync(join(sourceDir, 'skill-a', 'SKILL.md'), '# Skill A');

    const result = await main(['--source', sourceDir, '--list']);
    expect(result).toBe(0);
  });

  it('--source flag links skill to CLI', async () => {
    mkdirSync(join(sourceDir, 'skill-a'), { recursive: true });
    writeFileSync(join(sourceDir, 'skill-a', 'SKILL.md'), '# Skill A');

    const result = await main(['--source', sourceDir, 'skill-a', '--cli', 'test-cli']);
    expect(result).toBe(0);
  });

  it('--repo flag is backward compatible (treated as --source)', async () => {
    mkdirSync(join(sourceDir, 'skill-a'), { recursive: true });
    writeFileSync(join(sourceDir, 'skill-a', 'SKILL.md'), '# Skill A');

    const result = await main(['--repo', sourceDir, 'skill-a', '--cli', 'test-cli']);
    expect(result).toBe(0);
  });

  it('--list-clis outputs supported CLIs', async () => {
    const result = await main(['--list-clis']);
    expect(result).toBe(0);
  });

  it('--doctor runs without error', async () => {
    const result = await main(['--doctor', '--cli', 'test-cli', '--verbose']);
    expect(result).toBe(0);
  });

  it('--add-source registers a source and --list-sources shows it', async () => {
    const newSrc = join(testBase, 'extra-skills');
    mkdirSync(newSrc, { recursive: true });

    const add = await main(['--add-source', newSrc]);
    expect(add).toBe(0);
    clearConfigCache();

    const list = await main(['--list-sources']);
    expect(list).toBe(0);
  });

  it('--add-source errors on missing directory', async () => {
    const result = await main(['--add-source', join(testBase, 'no-such')]);
    expect(result).toBe(1); // EXIT_USAGE
  });

  it('--remove-source removes a previously added source', async () => {
    const newSrc = join(testBase, 'extra-skills');
    mkdirSync(newSrc, { recursive: true });

    await main(['--add-source', newSrc]);
    clearConfigCache();
    const result = await main(['--remove-source', 'extra-skills']);
    expect(result).toBe(0);
  });
});

describe('cli integration — named source without default', () => {
  const testBase = join(tmpdir(), `skill-link-nodefault-${Date.now()}`);
  const namedSrc = join(testBase, 'my-skills');
  const testConfigFile = join(testBase, 'config');
  const cliDir = join(testBase, '.test-cli', 'skills');

  beforeEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    mkdirSync(namedSrc, { recursive: true });
    process.env.SKILL_LINK_CONFIG = testConfigFile;
    // Note: a named source `mine` is configured but NO `default` entry.
    writeFileSync(
      testConfigFile,
      `[source]\nmine = ${namedSrc}\n\n[clis]\ntest-cli = ${cliDir}\n`,
    );
    clearConfigCache();
  });

  afterEach(() => {
    rmSync(testBase, { recursive: true, force: true });
    clearConfigCache();
  });

  it('links a named skill when only named (non-default) sources are configured', async () => {
    mkdirSync(join(namedSrc, 'skill-a'), { recursive: true });
    writeFileSync(join(namedSrc, 'skill-a', 'SKILL.md'), '# Skill A');

    const result = await main(['skill-a', '--cli', 'test-cli']);
    expect(result).toBe(0);
  });

  it('--all links across named sources without a default', async () => {
    mkdirSync(join(namedSrc, 'skill-a'), { recursive: true });
    writeFileSync(join(namedSrc, 'skill-a', 'SKILL.md'), '# Skill A');

    const result = await main(['--all', '--cli', 'test-cli']);
    expect(result).toBe(0);
  });

  it('fails with usage error when no source is configured at all', async () => {
    writeFileSync(
      testConfigFile,
      `[clis]\ntest-cli = ${cliDir}\n`,
    );
    clearConfigCache();

    // `fail()` calls process.exit; spy on it so the test can observe the code.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`EXIT_${code}`);
    });
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(main(['skill-a', '--cli', 'test-cli'])).rejects.toThrow('EXIT_1');

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
