import { readdirSync, readlinkSync, statSync, lstatSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getCLIs, getSources, cliProjectDir } from './config.js';
import { listSkills, findSkillPath } from './scanner.js';
import { applyProjectPath, createSymlink } from './linker.js';

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
      dir: applyProjectPath(e.name, e.dir, projectRoot, cliProjectDir(e.name)),
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

export interface DoctorOptions {
  /** Remove dangling (target-missing) symlinks instead of only reporting them. */
  fix?: boolean;
  /** With fix: re-link skills that moved to a new source location instead of removing the link. */
  relink?: boolean;
  /** Preview fix actions without modifying anything. */
  dryRun?: boolean;
}

export function doctor(
  cliFilter?: string,
  projectRoot?: string,
  verbose?: boolean,
  options: DoctorOptions = {},
): number {
  const { fix = false, relink = false, dryRun = false } = options;
  let issueCount = 0;
  let fixedCount = 0;

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
        // Distinguish a truly-missing target (ENOENT) from other stat
        // failures (EACCES, ELOOP, ...). Only ENOENT links are safe to
        // auto-remove: anything else may be a healthy link we simply cannot
        // verify right now (permissions, loops, ...).
        let statErr: string | undefined;
        try {
          statSync(fullPath);
        } catch (err: any) {
          statErr = err?.code ?? 'UNKNOWN';
        }
        if (statErr === undefined) continue; // live symlink

        let target: string;
        try {
          target = readlinkSync(fullPath);
        } catch {
          target = '(unreadable)';
        }

        const cleanable = statErr === 'ENOENT';
        // If the skill merely moved and was re-registered, it can be re-linked.
        const newLocation = cleanable ? findSkillPath(entry) : undefined;

        if (fix && cleanable) {
          if (newLocation && relink) {
            if (dryRun) {
              process.stdout.write(`[DRY-RUN] relink ${fullPath} -> ${newLocation}\n`);
              fixedCount++;
            } else {
              const res = createSymlink(newLocation, fullPath, { force: true });
              process.stdout.write(`${res.message}\n`);
              if (res.status === 'ok') {
                fixedCount++;
              } else {
                issueCount++;
              }
            }
          } else {
            // Removal only ever unlinks the symlink itself — never a real
            // directory — so this is safe and idempotent.
            if (dryRun) {
              process.stdout.write(`[DRY-RUN] rm ${fullPath} (dangling)\n`);
            } else {
              unlinkSync(fullPath);
              const hint = newLocation
                ? ` (skill now at ${newLocation}; rerun with --relink to re-link instead)`
                : '';
              process.stdout.write(`[FIXED] removed dangling link: ${fullPath}${hint}\n`);
            }
            fixedCount++;
          }
        } else {
          const note = cleanable ? '' : ` (stat: ${statErr}, not auto-fixable)`;
          process.stdout.write(`[BROKEN] ${fullPath} -> ${target}${note}\n`);
          if (newLocation) {
            process.stdout.write(
              `[HINT] '${entry}' found at ${newLocation}; rerun with --fix --relink to re-link\n`,
            );
          }
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

  if (fixedCount > 0 && issueCount === 0) {
    process.stdout.write(`\n${fixedCount} issue(s) fixed. All checks passed.\n`);
  } else if (fixedCount > 0) {
    process.stdout.write(`\n${fixedCount} fixed, ${issueCount} issue(s) remaining.\n`);
  } else if (issueCount === 0) {
    process.stdout.write('All checks passed.\n');
  } else {
    process.stdout.write(`\n${issueCount} issue(s) found.\n`);
  }

  return issueCount;
}
