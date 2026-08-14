import { join } from 'node:path';

export const VERSION = '1.0.3';

export const EXIT_USAGE = 1;
export const EXIT_SKILL_NOT_FOUND = 2;
export const EXIT_TARGET_CONFLICT = 3;
export const EXIT_LINK_FAILED = 4;

export const USER_CONFIG_DIR = (() => {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    if (appData) return join(appData, 'ai-skill-link');
    // Fallback: use %USERPROFILE%\.config on Windows when APPDATA is missing
    const userProfile = process.env.USERPROFILE || process.env.HOME || '';
    if (userProfile) return join(userProfile, '.config', 'ai-skill-link');
    return '';
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, 'ai-skill-link');
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (!home) return '';
  return join(home, '.config', 'ai-skill-link');
})();

export function getUserConfigFile(): string {
  return process.env.SKILL_LINK_CONFIG || join(USER_CONFIG_DIR, 'config.conf');
}
