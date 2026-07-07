import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { listSkills, findSkillPath, sourceEntries, collectAllSkills } from '../src/scanner.js';
import { clearConfigCache } from '../src/config.js';
import { writeFileSync as fsWriteFile, mkdirSync as fsMkdir } from 'node:fs';

describe('listSkills', () => {
  const testDir = join(tmpdir(), 'skill-link-test-scanner');
  const nested = join(testDir, 'nested');

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('finds directories containing SKILL.md', () => {
    mkdirSync(join(testDir, 'skill-a'), { recursive: true });
    writeFileSync(join(testDir, 'skill-a', 'SKILL.md'), '# Skill A');
    mkdirSync(join(testDir, 'skill-b'), { recursive: true });
    writeFileSync(join(testDir, 'skill-b', 'SKILL.md'), '# Skill B');

    mkdirSync(join(testDir, 'not-a-skill'), { recursive: true });

    const skills = listSkills(testDir);
    expect(skills).toEqual(['skill-a', 'skill-b']);
  });

  it('ignores files at top level', () => {
    writeFileSync(join(testDir, 'README.md'), '# Readme');
    mkdirSync(join(testDir, 'skill-a'), { recursive: true });
    writeFileSync(join(testDir, 'skill-a', 'SKILL.md'), '# Skill A');

    const skills = listSkills(testDir);
    expect(skills).toEqual(['skill-a']);
  });

  it('returns empty array for non-existent path', () => {
    const skills = listSkills('/nonexistent/path/12345');
    expect(skills).toEqual([]);
  });
});

describe('collectAllSkills', () => {
  const source1 = join(tmpdir(), 'skill-link-source1');
  const source2 = join(tmpdir(), 'skill-link-source2');

  beforeEach(() => {
    rmSync(source1, { recursive: true, force: true });
    rmSync(source2, { recursive: true, force: true });
    mkdirSync(source1, { recursive: true });
    mkdirSync(source2, { recursive: true });
  });

  afterEach(() => {
    rmSync(source1, { recursive: true, force: true });
    rmSync(source2, { recursive: true, force: true });
  });

  it('deduplicates skills by name (first source wins)', () => {
    mkdirSync(join(source1, 'skill-a'), { recursive: true });
    writeFileSync(join(source1, 'skill-a', 'SKILL.md'), '# Source1 Skill A');
    mkdirSync(join(source1, 'skill-b'), { recursive: true });
    writeFileSync(join(source1, 'skill-b', 'SKILL.md'), '# Source1 Skill B');

    mkdirSync(join(source2, 'skill-a'), { recursive: true });
    writeFileSync(join(source2, 'skill-a', 'SKILL.md'), '# Source2 Skill A (duplicate)');
    mkdirSync(join(source2, 'skill-c'), { recursive: true });
    writeFileSync(join(source2, 'skill-c', 'SKILL.md'), '# Source2 Skill C');

    const skills = collectAllSkills([
      { name: 'source1', path: source1 },
      { name: 'source2', path: source2 },
    ]);

    expect(Object.keys(skills)).toEqual(['skill-a', 'skill-b', 'skill-c']);
    expect(skills['skill-a']).toBe(join(source1, 'skill-a'));
  });
});
