import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  VERSION,
  EXIT_USAGE,
  EXIT_SKILL_NOT_FOUND,
  EXIT_TARGET_CONFLICT,
  EXIT_LINK_FAILED,
} from './constants.js';
import {
  getCLIs,
  getSources,
  cliTargetDir,
  allCliNames,
  defaultSource,
  resolveSource,
} from './config.js';
import { listSkills, findSkillPath, sourceEntries, collectAllSkills, isSkillDir } from './scanner.js';
import {
  createSymlink,
  removeSymlink,
  ensureDir,
  applyProjectPath,
  LinkResult,
} from './linker.js';
import { doctor } from './doctor.js';
import { addSources, removeSources, listSources } from './source-manager.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('skill-link')
    .description(
      'Bridge skills from configured sources into AI CLI tools via symlinks — no central store, no copies.',
    )
    .version(VERSION)
    .usage('<skill_name...> --cli <name> [options]')
    .option('-c, --cli <name>', 'Target AI CLI name (use "all" to target every supported CLI)')
    .option('-a, --all', 'Link all available skills')
    .option('-f, --force', 'Replace existing destination entry')
    .option('-n, --dry-run', 'Show planned actions without modifying files')
    .option('-s, --source <dir>', 'Skills source directory (name or path)')
    .option('-u, --unlink', 'Remove symlinks instead of creating them')
    .option('-l, --list', 'List available skills and exit')
    .option('--list-clis', 'List supported CLI names and target paths')
    .option('--relative', 'Create relative symlinks instead of absolute symlinks')
    .option('-p, --project <dir>', 'Target project-level skills dir instead of global')
    .option('-D, --doctor', 'Run health checks')
    .option('--add-source <paths...>', 'Register skills directories as named sources in the user config')
    .option('--remove-source <names...>', 'Remove named sources from the user config')
    .option('--list-sources', 'List configured sources and exit')
    .option('-v, --verbose', 'Print extra logs')
    .addHelpText(
      'after',
      `
Arguments:
  <skill_name...>       One or more skill names (directory names)

Exit codes:
  0  All OK
  1  Usage error (e.g. missing --cli)
  2  Skill not found or invalid SKILL.md
  3  Target conflict (exists and no --force)
  4  Other link failure
`,
    );

  return program;
}

function fail(msg: string, code: number): never {
  process.stderr.write(`[ERR] ${msg}\n`);
  process.exit(code);
}

function verbose(opts: any, msg: string): void {
  if (opts.verbose) process.stderr.write(`[VERBOSE] ${msg}\n`);
}

interface SkillPair {
  name: string;
  path: string;
}

interface Counters {
  success: number;
  skipped: number;
  failed: number;
  conflicts: number;
  missing: number;
}

function handleResult(result: LinkResult, counters: Counters, isUnlink: boolean): void {
  switch (result.status) {
    case 'ok':
      process.stdout.write(`${result.message}\n`);
      counters.success++;
      break;
    case 'skip':
      process.stdout.write(`${result.message}\n`);
      counters.skipped++;
      break;
    case 'conflict':
      process.stderr.write(`${result.message}\n`);
      counters.failed++;
      counters.conflicts++;
      break;
    case 'error':
      process.stderr.write(`${result.message}\n`);
      counters.failed++;
      if (!isUnlink) counters.missing++;
      break;
  }
}

/** Handle --list and --list-clis modes. Returns 0 on success. */
function runList(opts: any): number {
  if (opts.list) {
    if (opts.source) {
      const skills = listSkills(resolveSource(opts.source));
      for (const s of skills) process.stdout.write(`${s}\n`);
    } else {
      const sources = sourceEntries();
      if (sources.length === 0) {
        const def = defaultSource();
        if (def) {
          for (const s of listSkills(def)) process.stdout.write(`${s}\n`);
        }
      } else {
        const showHeader = sources.length > 1;
        for (const src of sources) {
          if (showHeader) process.stdout.write(`[${src.name}]\n`);
          for (const s of listSkills(src.path)) process.stdout.write(`${s}\n`);
        }
      }
    }
    return 0;
  }

  if (opts.listClis) {
    const clis = getCLIs();
    for (const [name, dir] of Object.entries(clis).sort((a, b) => a[0].localeCompare(b[0]))) {
      process.stdout.write(`${name.padEnd(12)} -> ${dir}\n`);
    }
    return 0;
  }

  return -1; // not a list mode
}

/** Handle --add-source / --remove-source / --list-sources modes. Returns >=0 on handling, -1 otherwise. */
function runSourceManagement(opts: any): number {
  if (opts.listSources) {
    const sources = listSources();
    if (sources.length === 0) {
      process.stdout.write('No sources configured. Use --add-source <path...> to register one.\n');
    } else {
      for (const s of sources) {
        process.stdout.write(`${s.name.padEnd(16)} -> ${s.path}\n`);
      }
    }
    return 0;
  }

  if (opts.addSource && opts.addSource.length > 0) {
    const dryRun = !!opts.dryRun;
    const res = addSources(opts.addSource, { dryRun });

    for (const a of res.added) {
      process.stdout.write(`${dryRun ? '[DRY-RUN] ' : ''}added source: ${a.name} -> ${a.path}\n`);
    }
    for (const s of res.skipped) {
      process.stdout.write(`[SKIP] ${s.path} (${s.reason})\n`);
    }
    for (const e of res.errors) {
      process.stderr.write(`[ERR] ${e.path}: ${e.reason}\n`);
    }

    if (res.errors.length > 0) return EXIT_USAGE;
    return 0;
  }

  if (opts.removeSource && opts.removeSource.length > 0) {
    const dryRun = !!opts.dryRun;
    const res = removeSources(opts.removeSource, { dryRun });

    for (const n of res.removed) {
      process.stdout.write(`${dryRun ? '[DRY-RUN] ' : ''}removed source: ${n}\n`);
    }
    for (const s of res.skipped) {
      process.stdout.write(`[SKIP] ${s.name} (${s.reason})\n`);
    }

    if (res.removed.length === 0 && res.skipped.length > 0) return EXIT_USAGE;
    return 0;
  }

  return -1; // not a management action
}

/**
 * Resolve the source root directory from CLI options. Returns resolved absolute path.
 *
 * A `default` source is no longer required when other named sources are
 * configured: in that case we return an empty root and let `collectSkills`
 * find skills across all sources via `findSkillPath` / `collectAllSkills`
 * (multi-source by-name lookup). We only fail when NO source is configured
 * at all, or when an explicit `--source` / `default` points at a missing dir.
 */
function resolveSourceRoot(opts: any): string {
  let root: string | undefined;
  if (opts.source) {
    root = resolveSource(opts.source);
  } else {
    root = defaultSource();
  }

  if (!root) {
    // No `--source` and no `default`. Fall back to multi-source aggregation
    // when named sources exist; only hard-fail when there are none at all.
    if (Object.keys(getSources()).length > 0) {
      verbose(opts, 'no default source; using multi-source by-name lookup');
      return '';
    }
    fail(
      'No source configured. Register one with `skill-link --add-source <path>` or set [source] default in ~/.config/ai-skill-link/config.conf',
      EXIT_USAGE,
    );
  }

  try {
    if (!statSync(root).isDirectory()) {
      fail(`Source directory does not exist: ${root}`, EXIT_USAGE);
    }
  } catch {
    fail(`Source directory does not exist: ${root}`, EXIT_USAGE);
  }

  root = resolve(root);
  verbose(opts, `source root resolved to: ${root}`);
  return root;
}

/** Collect skill pairs from positional args or --all across all sources. */
function collectSkills(
  opts: any,
  positionalSkills: string[],
  sourceRoot: string,
): { skillPairs: SkillPair[]; totalMissing: number } {
  const skillPairs: SkillPair[] = [];
  let totalMissing = 0;

  if (opts.all) {
    if (opts.source) {
      for (const name of listSkills(sourceRoot)) {
        skillPairs.push({ name, path: join(sourceRoot, name) });
        verbose(opts, `found skill '${name}' in source '${sourceRoot}'`);
      }
    } else {
      const skillMap = collectAllSkills(sourceEntries());
      for (const [name, path] of Object.entries(skillMap)) {
        skillPairs.push({ name, path });
        verbose(opts, `found skill '${name}' at '${path}'`);
      }
    }
  } else {
    for (const skill of positionalSkills) {
      if (!opts.source) {
        const found = findSkillPath(skill);
        if (found) {
          skillPairs.push({ name: skill, path: found });
        } else {
          const fallback = join(sourceRoot, skill);
          if (isSkillDir(fallback)) {
            skillPairs.push({ name: skill, path: fallback });
          } else {
            process.stderr.write(`[ERR] skill not found or invalid: ${skill}\n`);
            totalMissing++;
          }
        }
      } else {
        const path = join(sourceRoot, skill);
        if (!opts.unlink && !isSkillDir(path)) {
          process.stderr.write(`[ERR] skill not found or invalid: ${skill}\n`);
          totalMissing++;
        } else {
          skillPairs.push({ name: skill, path });
        }
      }
    }
  }

  return { skillPairs, totalMissing };
}

export async function main(args: string[]): Promise<number> {
  // Backward compat: treat --repo as --source
  const argv = args.map((a, i) => {
    if (a === '--repo' || a === '-r') return '--source';
    return a;
  });

  const program = createProgram();
  program.parse(argv, { from: 'user' });
  const opts = program.opts();
  const positionalSkills: string[] = program.args;

  if (opts.doctor) {
    try {
      const issueCount = doctor(opts.cli, opts.project, opts.verbose);
      return Math.min(issueCount, 255);
    } catch (err: any) {
      fail(err.message, EXIT_USAGE);
    }
  }

  const listResult = runList(opts);
  if (listResult >= 0) return listResult;

  // Source management actions: take over and exit, no --cli required.
  const mgmtResult = runSourceManagement(opts);
  if (mgmtResult >= 0) return mgmtResult;

  if (opts.all && positionalSkills.length > 0) {
    fail('--all cannot be used with explicit skill names', EXIT_USAGE);
  }

  if (!opts.cli) {
    fail('--cli is required', EXIT_USAGE);
  }

  let cliNames: string[];
  if (opts.cli === 'all') {
    cliNames = allCliNames();
  } else {
    if (!cliTargetDir(opts.cli)) {
      fail(`Unsupported CLI: ${opts.cli} (use --list-clis)`, EXIT_USAGE);
    }
    cliNames = [opts.cli];
  }
  verbose(opts, `target CLI(s): ${cliNames.join(' ')}`);

  const sourceRoot = resolveSourceRoot(opts);

  let projectRoot = '';
  if (opts.project) {
    try {
      projectRoot = resolve(opts.project);
      verbose(opts, `project root resolved to: ${projectRoot}`);
    } catch {
      fail(`Project directory does not exist: ${opts.project}`, EXIT_USAGE);
    }
  }

  const { skillPairs, totalMissing } = collectSkills(opts, positionalSkills, sourceRoot);

  if (skillPairs.length === 0 && totalMissing === 0) {
    fail('No skills specified. Provide skill names or use --all', EXIT_USAGE);
  }

  if (totalMissing > 0 && skillPairs.length === 0) {
    return EXIT_SKILL_NOT_FOUND;
  }

  verbose(
    opts,
    `collected ${skillPairs.length} skill(s): ${skillPairs.map((s) => s.name).join(' ')}`,
  );

  let totalFailed = 0;
  let totalConflicts = 0;

  for (const cliName of cliNames) {
    let targetDir = cliTargetDir(cliName);
    if (!targetDir) continue;

    if (projectRoot) {
      targetDir = applyProjectPath(cliName, targetDir, projectRoot);
    }

    if (cliNames.length > 1) {
      process.stdout.write(`\n==> ${cliName} (${targetDir})\n`);
    }

    if (opts.dryRun) {
      process.stdout.write(`[DRY-RUN] ensure target dir: ${targetDir}\n`);
    } else {
      ensureDir(targetDir);
    }

    const counters: Counters = { success: 0, skipped: 0, failed: 0, conflicts: 0, missing: 0 };

    for (const skill of skillPairs) {
      const src = skill.path;
      const dst = join(targetDir, skill.name);

      if (opts.unlink) {
        handleResult(
          removeSymlink(dst, src, { force: !!opts.force, dryRun: !!opts.dryRun }),
          counters,
          true,
        );
      } else {
        handleResult(
          createSymlink(src, dst, {
            force: !!opts.force,
            dryRun: !!opts.dryRun,
            useRelative: !!opts.relative,
          }),
          counters,
          false,
        );
      }
    }

    process.stdout.write(
      `Summary: success=${counters.success} skipped=${counters.skipped} failed=${counters.failed}\n`,
    );

    totalFailed += counters.failed;
    totalConflicts += counters.conflicts;
  }

  totalFailed += totalMissing;

  if (totalFailed > 0) {
    if (totalConflicts > 0) return EXIT_TARGET_CONFLICT;
    if (totalMissing > 0) return EXIT_SKILL_NOT_FOUND;
    return EXIT_LINK_FAILED;
  }

  return 0;
}
