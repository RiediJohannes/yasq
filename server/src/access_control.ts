import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const isMockMode = process.env.VITE_MOCK_MODE === 'true'

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const permissionsPath = isMockMode
  ? path.join(__dirname, '..', '..', 'mock_data', 'mockPermissions.json')
  : path.join(__dirname, '..', 'data', 'permissions.json');

// Internal lookup tables
const WHITELISTS = new Map<string, Set<string>>(); // Filename -> Set of UserIDs
const BLACKLISTS = new Map<string, Set<string>>();

export function loadPermissions() {
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
      console.error(`Error parsing JSON from ${permissionsPath}:`, err);
    }
  } else {
    console.log(`Permissions file not found at ${permissionsPath}. Starting with no restrictions.`);
  }
}

loadPermissions();

export function isAllowed(userId: string, filename: string): boolean {
  if (WHITELISTS.has(filename)) {
    return WHITELISTS.get(filename)!.has(userId);
  }

  if (BLACKLISTS.has(filename)) {
    return !BLACKLISTS.get(filename)!.has(userId);
  }

  return true;
}