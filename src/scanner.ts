import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getSources } from './config.js';

/** The marker file that identifies a directory as a skill. */
export const SKILL_MARKER = 'SKILL.md';

/**
 * Check whether a directory contains a valid SKILL.md file.
 */
export function isSkillDir(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory() && statSync(join(dirPath, SKILL_MARKER)).isFile();
  } catch {
    return false;
  }
}

export function listSkills(sourcePath: string): string[] {
  const skills: string[] = [];
  let entries;
  try {
    entries = readdirSync(sourcePath, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (isSkillDir(join(sourcePath, entry.name))) {
      skills.push(entry.name);
    }
  }
  return skills.sort();
}

export function findSkillPath(skillName: string): string | undefined {
  const sources = getSources();
  for (const [, sourcePath] of Object.entries(sources)) {
    const candidate = join(sourcePath, skillName);
    if (isSkillDir(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export interface SourceEntry {
  name: string;
  path: string;
}

/** @deprecated Use sourceEntries() instead. */
export function repoEntries(): SourceEntry[] {
  return sourceEntries();
}

export function sourceEntries(): SourceEntry[] {
  const sources = getSources();
  return Object.entries(sources).map(([name, path]) => ({ name, path }));
}

export interface SkillMap {
  [skillName: string]: string;
}

export function collectAllSkills(sources: SourceEntry[]): SkillMap {
  const seen = new Set<string>();
  const skills: SkillMap = {};

  for (const src of sources) {
    const skillNames = listSkills(src.path);
    for (const name of skillNames) {
      if (!seen.has(name)) {
        seen.add(name);
        skills[name] = join(src.path, name);
      }
    }
  }

  return skills;
}
