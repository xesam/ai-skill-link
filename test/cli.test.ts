import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
});
