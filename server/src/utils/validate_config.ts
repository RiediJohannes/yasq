import { stringify } from './helper.js';

export interface ValidationIssue {
  propertyPath: string;
  errorMessage: string;
  inputValue: unknown;
  itemIndex?: number;
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly exitCode?: number
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Resolves the given path of property keys on an initial object. That is, this function follows nested properties
 * within `root` according to the property keys listed in `path` and returns the **value of the property** reached at the end
 * of this path.
 *
 * If resolving the path fails at any point, the function simply returns the `root` object/value.
 */
export const resolveProperty = (root: unknown, path: readonly PropertyKey[] | undefined): unknown => {
  let current: unknown = root;

  if (path?.length) {
    for (const key of path) {
      if (typeof current !== 'object' || current === null) return root; // Failure: Current has no properties

      current = (current as Record<PropertyKey, unknown>)[key];
      if (current === undefined) return root; // Failure: Property [key] did not exist
    }
  }

  return current;
};

export const formatValidationError = (issue: ValidationIssue, issueIndex: number): string => {
  const itemLabel: string = `  ${issueIndex + 1}.`;
  const indexText = issue.itemIndex !== -1 ? `Item ${issue.itemIndex}: ` : '';

  if (
    issue.errorMessage.includes('received undefined') ||
    (typeof issue.inputValue === 'object' && issue.inputValue !== null)
  ) {
    return `${itemLabel} ${indexText}Property '${issue.propertyPath}' is missing (Required).`;
  }

  return (
    `${itemLabel} ${indexText}Property '${issue.propertyPath}' received invalid value ${stringify(issue.inputValue)} ` +
    `(${issue.errorMessage}).`
  );
};
