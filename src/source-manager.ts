import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { parse as iniParse, stringify as iniStringify } from 'ini';
import { basename, dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { getUserConfigFile, EXIT_USAGE } from './constants.js';
import { expandHome, clearConfigCache, getSources } from './config.js';

/**
 * Source management: register/remove/list skills source directories in the
 * user config file (~/.config/ai-skill-link/config.conf) without hand-editing.
 *
 * Sources are written as independent named entries under [source]. The
 * special `default` entry keeps its single-value fallback semantics; new
 * sources get their own names and are picked up by the existing multi-source
 * aggregation (--all / --list / by-name lookup).
 */

export interface AddResult {
  added: { name: string; path: string }[];
  skipped: { path: string; reason: string }[];
  errors: { path: string; reason: string }[];
}

export interface RemoveResult {
  removed: string[];
  skipped: { name: string; reason: string }[];
}

/** Resolve a user-supplied source path to an absolute, ~-expanded path. */
function resolveSourcePath(input: string): string {
  return resolve(expandHome(input));
}

/** Convert an absolute path back to ~-style when it lives under home, for readability. */
function contractHome(absPath: string): string {
  const home = homedir();
  if (home && (absPath === home || absPath.startsWith(home + '/'))) {
    return '~' + absPath.slice(home.length);
  }
  return absPath;
}

/**
 * Derive a human-readable source name from the directory path.
 * Heuristic: if the leaf directory is literally `skills`/`skill`, use the
 * parent directory's name (the project name); otherwise use the leaf name.
 *   ~/work/project-x/skills  -> project-x
 *   ~/oss/awesome-tools/skills -> awesome-tools
 *   ~/my-skills              -> my-skills
 */
function deriveSourceName(absPath: string): string {
  const leaf = basename(absPath);
  if (leaf === 'skills' || leaf === 'skill') {
    return basename(dirname(absPath));
  }
  return leaf;
}

type ConfigObject = Record<string, Record<string, string> | undefined>;

function readUserConfig(file: string): ConfigObject {
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = iniParse(raw) as ConfigObject;
    return parsed || {};
  } catch {
    return {};
  }
}

function writeUserConfig(file: string, config: ConfigObject): void {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // whitespace: true -> "key = value" to match the style of the built-in config.conf.
  writeFileSync(file, iniStringify(config, { whitespace: true }) + '\n', 'utf-8');
  clearConfigCache();
}

function existingSourceEntries(config: ConfigObject): { name: string; path: string }[] {
  const section = config['source'];
  if (!section) return [];
  return Object.entries(section).map(([name, path]) => ({ name, path }));
}

/** Generate a non-conflicting name by appending -2, -3, ... when taken. */
function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/**
 * Register one or more skills directories as named sources in the user config.
 * - Validates each directory exists (ENOENT → error, not written).
 * - Skips paths already registered under any name.
 * - Auto-names via deriveSourceName, suffixing on name conflict.
 */
export function addSources(
  inputs: string[],
  opts: { dryRun?: boolean } = {},
): AddResult {
  const file = getUserConfigFile();
  const config = readUserConfig(file);
  const existing = existingSourceEntries(config);

  const result: AddResult = { added: [], skipped: [], errors: [] };

  // Track names and paths currently in the config plus the ones we add this run.
  const takenNames = new Set(existing.map((e) => e.name));
  const takenPaths = new Set(existing.map((e) => resolveSourcePath(e.path)));

  config['source'] = config['source'] || {};

  for (const input of inputs) {
    const absPath = resolveSourcePath(input);

    if (takenPaths.has(absPath)) {
      const owner = existing.find((e) => resolveSourcePath(e.path) === absPath);
      result.skipped.push({
        path: absPath,
        reason: `already registered as ${owner?.name ?? '(unknown)'}`,
      });
      continue;
    }

    try {
      if (!statSync(absPath).isDirectory()) {
        result.errors.push({ path: absPath, reason: 'not a directory' });
        continue;
      }
    } catch {
      result.errors.push({ path: absPath, reason: 'directory does not exist' });
      continue;
    }

    const name = uniqueName(deriveSourceName(absPath), takenNames);
    takenNames.add(name);
    takenPaths.add(absPath);

    result.added.push({ name, path: absPath });
    if (!opts.dryRun) {
      config['source']![name] = contractHome(absPath);
    }
  }

  if (!opts.dryRun && result.added.length > 0) {
    writeUserConfig(file, config);
  }

  return result;
}

/** Remove one or more named sources from the user config. */
export function removeSources(
  names: string[],
  opts: { dryRun?: boolean } = {},
): RemoveResult {
  const file = getUserConfigFile();
  const config = readUserConfig(file);
  const section = config['source'] || {};

  const result: RemoveResult = { removed: [], skipped: [] };

  for (const name of names) {
    if (!(name in section)) {
      result.skipped.push({ name, reason: 'not found' });
      continue;
    }
    result.removed.push(name);
    if (!opts.dryRun) {
      delete section[name];
    }
  }

  if (!opts.dryRun && result.removed.length > 0) {
    config['source'] = section;
    writeUserConfig(file, config);
  }

  return result;
}

/** List all configured sources (merged: built-in + user), name -> path. */
export function listSources(): { name: string; path: string }[] {
  return Object.entries(getSources())
    .map(([name, path]) => ({ name, path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export { EXIT_USAGE };
