import fs from 'fs';
import { LogCategory, logger } from './utils/logger.js';

// Internal lookup tables
const WHITELISTS = new Map<string, Set<string>>(); // Filename -> Set of UserIDs
const BLACKLISTS = new Map<string, Set<string>>();

export function loadPermissions(permissionsPath: string) {
  if (fs.existsSync(permissionsPath)) {
    try {
      const rawData = fs.readFileSync(permissionsPath, 'utf-8');
      const data = JSON.parse(rawData);

      WHITELISTS.clear();
      BLACKLISTS.clear();

      if (Array.isArray(data)) {
        for (const set of data) {
          const userSet = new Set<string>(set.userIds as string[]);

          for (const file of set.files) {
            if (set.type === 'whitelist') {
              WHITELISTS.set(file, userSet);
            } else {
              BLACKLISTS.set(file, userSet);
            }
          }
        }
      }
    } catch (err) {
      logger.error(`Error parsing JSON from '${permissionsPath}'.`, LogCategory.SETUP, null, err as Error);
    }
  } else {
    logger.warn(
      `Permissions file not found at '${permissionsPath}'. Starting with no restrictions.`,
      LogCategory.SETUP,
      null
    );
  }
}

export function isAllowed(userId: string, filename: string): boolean {
  if (WHITELISTS.has(filename)) {
    return WHITELISTS.get(filename)!.has(userId);
  }

  if (BLACKLISTS.has(filename)) {
    return !BLACKLISTS.get(filename)!.has(userId);
  }

  return true;
}
