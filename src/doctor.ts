import { readdirSync, readlinkSync, statSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { getCLIs, getSources } from './config.js';
import { listSkills, isSkillDir } from './scanner.js';
import { applyProjectPath } from './linker.js';

interface CliEntry {
  name: string;
  dir: string;
}

interface SourceScan {
  name: string;
  path: string;
  skills: string[];
  skillDirs: Map<string, string>;
}

function resolveCliEntries(cliFilter: string | undefined, projectRoot?: string): CliEntry[] {
  const clis = getCLIs();
  let entries: CliEntry[] = [];

  if (cliFilter) {
    const dir = clis[cliFilter];
    if (!dir) {
      throw new Error(`Unsupported CLI: ${cliFilter} (use --list-clis)`);
    }
    entries = [{ name: cliFilter, dir }];
  } else {
    entries = Object.entries(clis)
      .map(([name, dir]) => ({ name, dir }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (projectRoot) {
    entries = entries.map((e) => ({
      name: e.name,
      dir: applyProjectPath(e.name, e.dir, projectRoot),
    }));
  }

  return entries;
}

/** Pre-scan all sources, returning structured results with source names. */
function scanAllSources(): SourceScan[] {
  const sources = getSources();
  const results: SourceScan[] = [];

  for (const [sname, spath] of Object.entries(sources)) {
    try {
      if (!statSync(spath).isDirectory()) continue;
    } catch {
      continue;
    }
    const skillNames = listSkills(spath);
    const skillDirs = new Map<string, string>();
    for (const name of skillNames) {
      skillDirs.set(name, join(spath, name));
    }
    results.push({ name: sname, path: spath, skills: skillNames, skillDirs });
  }

  return results;
}

export function doctor(cliFilter?: string, projectRoot?: string, verbose?: boolean): number {
  let issueCount = 0;

  const cliEntries = resolveCliEntries(cliFilter, projectRoot);
  const sourceScans = scanAllSources();

  // Check 1: Broken symlinks + orphans in CLI target dirs
  for (const cli of cliEntries) {
    let dirEnts: string[];
    try {
      dirEnts = readdirSync(cli.dir);
    } catch {
      continue;
    }

    for (const entry of dirEnts) {
      const fullPath = join(cli.dir, entry);
      let lst;
      try {
        lst = lstatSync(fullPath);
      } catch {
        continue;
      }

      if (lst.isSymbolicLink()) {
        try {
          statSync(fullPath);
        } catch {
          let target: string;
          try {
            target = readlinkSync(fullPath);
          } catch {
            target = '(unreadable)';
          }
          process.stdout.write(`[BROKEN] ${fullPath} -> ${target}\n`);
          issueCount++;
        }
      } else if (lst.isDirectory()) {
        process.stdout.write(`[ORPHAN] ${fullPath} (not a symlink, may be stale copy)\n`);
        issueCount++;
      }
    }
  }

  // Check 2: Duplicate skill names across sources (uses scan data directly)
  if (sourceScans.length > 1) {
    const skillSourceList: { skill: string; source: string }[] = [];

    for (const scan of sourceScans) {
      for (const skill of scan.skills) {
        skillSourceList.push({ skill, source: scan.name });
      }
    }

    skillSourceList.sort((a, b) =>
      a.skill.localeCompare(b.skill) || a.source.localeCompare(b.source)
    );

    for (let i = 1; i < skillSourceList.length; i++) {
      const prev = skillSourceList[i - 1];
      const curr = skillSourceList[i];
      if (prev.skill === curr.skill) {
        process.stdout.write(
          `[DUPLICATE] ${curr.skill} found in: ${prev.source}, ${curr.source}\n`,
        );
        issueCount++;
      }
    }
  }

  // Check 3: Invalid SKILL.md in sources
  for (const scan of sourceScans) {
    for (const skillName of scan.skills) {
      const skillMdPath = join(scan.path, skillName, 'SKILL.md');
      try {
        if (statSync(skillMdPath).size === 0) {
          process.stdout.write(`[INVALID] ${join(scan.path, skillName)}: SKILL.md missing or empty\n`);
          issueCount++;
        }
      } catch {
        process.stdout.write(`[INVALID] ${join(scan.path, skillName)}: SKILL.md missing or empty\n`);
        issueCount++;
      }
    }
  }

  // Check 4 (verbose): Unlinked skills
  if (verbose) {
    for (const scan of sourceScans) {
      for (const skillName of scan.skills) {
        let linked = false;
        for (const cli of cliEntries) {
          const linkPath = join(cli.dir, skillName);
          try {
            if (lstatSync(linkPath).isSymbolicLink()) {
              linked = true;
              break;
            }
          } catch {
            // doesn't exist
          }
        }
        if (!linked) {
          process.stdout.write(
            `[UNLINKED] ${skillName} exists in source but not linked to any CLI\n`,
          );
          issueCount++;
        }
      }
    }
  }

  if (issueCount === 0) {
    process.stdout.write('All checks passed.\n');
  } else {
    process.stdout.write(`\n${issueCount} issue(s) found.\n`);
  }

  return issueCount;
}
