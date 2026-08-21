import { readFileSync, existsSync } from 'node:fs';
import { parse as iniParse } from 'ini';
import { homedir } from 'node:os';
import { resolve as pathResolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getUserConfigFile } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ConfigMap {
  [key: string]: string;
}

const BUILTIN_CONFIG_NAME = 'config.conf';

export function expandHome(filepath: string): string {
  if (filepath === '~') {
    return homedir();
  }
  if (filepath.startsWith('~/')) {
    return join(homedir(), filepath.slice(2));
  }
  return filepath;
}

export function builtinConfigPath(): string {
  // In production: __dirname is dist/, package root is one level up.
  // In dev (tsx): __dirname is src/, package root is one level up.
  const candidates = [
    pathResolve(__dirname, '..', BUILTIN_CONFIG_NAME),
    pathResolve(__dirname, '..', '..', BUILTIN_CONFIG_NAME),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return pathResolve(process.cwd(), BUILTIN_CONFIG_NAME);
}

function readMergedConfig(builtinPath: string, userPath: string): Map<string, ConfigMap> {
  const merged = new Map<string, ConfigMap>();

  try {
    const builtinRaw = readFileSync(builtinPath, 'utf-8');
    const builtin = iniParse(builtinRaw);
    for (const [section, entries] of Object.entries(builtin)) {
      if (entries && typeof entries === 'object') {
        merged.set(section, entries as ConfigMap);
      }
    }
  } catch {
    // builtin not found — no defaults
  }

  try {
    const userRaw = readFileSync(userPath, 'utf-8');
    const user = iniParse(userRaw);
    for (const [section, entries] of Object.entries(user)) {
      if (entries && typeof entries === 'object') {
        const existing = merged.get(section) || {};
        merged.set(section, { ...existing, ...(entries as ConfigMap) });
      }
    }
  } catch {
    // user config not found — use builtin only
  }

  // Backward compat: merge [repo] into [source], [source] wins on conflict
  const repoEntries = merged.get('repo');
  if (repoEntries) {
    const sourceEntries = merged.get('source') || {};
    merged.set('source', { ...repoEntries, ...sourceEntries });
  }

  return merged;
}

function expandConfigPaths(source: ConfigMap): ConfigMap {
  const result: ConfigMap = {};
  for (const [name, path] of Object.entries(source)) {
    result[name] = expandHome(path);
  }
  return result;
}

let cachedConfig: { sources: ConfigMap; clis: ConfigMap; clisProject: ConfigMap } | null = null;

function loadConfigs(): void {
  const builtin = builtinConfigPath();
  const merged = readMergedConfig(builtin, getUserConfigFile());

  cachedConfig = {
    sources: expandConfigPaths(merged.get('source') || {}),
    clis: expandConfigPaths(merged.get('clis') || {}),
    // Project-level paths are relative (e.g. ".pi/skills"), so no ~-expansion.
    clisProject: merged.get('clis-project') || {},
  };
}

/** @deprecated Use getSources() instead. */
export function getRepos(): ConfigMap {
  return getSources();
}

export function getSources(): ConfigMap {
  if (cachedConfig === null) loadConfigs();
  return cachedConfig!.sources;
}

export function getCLIs(): ConfigMap {
  if (cachedConfig === null) loadConfigs();
  return cachedConfig!.clis;
}

/** @deprecated Use resolveSource() instead. */
export function resolveRepo(input: string): string {
  return resolveSource(input);
}

export function resolveSource(input: string): string {
  const sources = getSources();
  if (sources[input]) return sources[input];
  return expandHome(input);
}

/** @deprecated Use defaultSource() instead. */
export function defaultRepo(): string | undefined {
  return defaultSource();
}

export function defaultSource(): string | undefined {
  return getSources()['default'];
}

export function cliTargetDir(cli: string): string | undefined {
  return getCLIs()[cli];
}

export function allCliNames(): string[] {
  return Object.keys(getCLIs()).sort();
}

export function getProjectCLIs(): ConfigMap {
  if (cachedConfig === null) loadConfigs();
  return cachedConfig!.clisProject;
}

export function cliProjectDir(cli: string): string | undefined {
  return getProjectCLIs()[cli];
}

export function clearConfigCache(): void {
  cachedConfig = null;
}
