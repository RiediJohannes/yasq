import fs from 'fs';
import { z } from 'zod';

import { LogCategory, logger } from '../utils/logger.js';
import {
  formatListItemValidationIssue,
  type ListItemValidationIssue,
  resolveProperty,
  ValidationError,
} from './validate_config.js';

// Define Zod schemas for validation
const permissionRuleSchema = z.object({
  type: z.enum(['whitelist', 'blacklist']),
  userIds: z.array(z.string()),
  files: z.array(z.string()),
});

const permissionsFileSchema = z.array(permissionRuleSchema);

// Internal lookup tables
const WHITELISTS = new Map<string, Set<string>>(); // Filename -> Set of UserIDs
const BLACKLISTS = new Map<string, Set<string>>();

/**
 * Loads permissions from a given JSON config path.
 * Throws a ValidationError if the file is missing, invalid JSON, or fails schema validation.
 */
export function loadPermissions(permissionsPath: string): void {
  if (!fs.existsSync(permissionsPath)) {
    throw new ValidationError(`Permissions file not found at '${permissionsPath}'.`, 30);
  }

  let parsedConfig: unknown;
  try {
    const fileContent = fs.readFileSync(permissionsPath, 'utf-8');
    parsedConfig = JSON.parse(fileContent);
  } catch (err) {
    throw new ValidationError(`Error parsing JSON from permissions file '${permissionsPath}': ${err}`, 31);
  }

  logger.debug(`Loading permissions from '${permissionsPath}'.`, LogCategory.SETUP);

  const result = permissionsFileSchema.safeParse(parsedConfig);

  if (!result.success) {
    const issues: ListItemValidationIssue[] = [];

    for (const issue of result.error.issues) {
      const pathArr = issue.path;
      const itemIndex = typeof pathArr[0] === 'number' ? pathArr[0] + 1 : -1;
      const propertySubPath = pathArr.slice(1);
      const propertyPath = propertySubPath.length ? propertySubPath.join('.') : 'root';

      issues.push({
        itemIndex,
        propertyPath,
        errorMessage: issue.message,
        inputValue: resolveProperty(parsedConfig, pathArr),
      });
    }

    const pluralized = issues.length === 1 ? 'property' : 'properties';
    const errorMessage =
      `Found ${issues.length} invalid configuration ${pluralized} in permissions file '${permissionsPath}':\n` +
      issues.map(formatListItemValidationIssue).join('\n');

    throw new ValidationError(errorMessage, 32);
  }

  WHITELISTS.clear();
  BLACKLISTS.clear();

  for (const rule of result.data) {
    const userSet = new Set<string>(rule.userIds);

    for (const file of rule.files) {
      if (rule.type === 'whitelist') {
        WHITELISTS.set(file, userSet);
      } else {
        BLACKLISTS.set(file, userSet);
      }
    }
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
