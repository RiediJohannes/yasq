/**
 * Guard-based request body validation.
 *
 * A `Guard<T>` is a callable object (function with attached data) that **checks** an unknown runtime value for its
 * type and other invariants (e.g. non-empty string, positive integer) and ensures the compiler that the value is
 * of type T if the check passes.
 *
 * Use `validateBody(req, schema)` given a request `req` and an {@link ObjectSchema} (`schema`) to validate the structure of an
 * HTTP request's payload by specifying property names and their expected invariants.
 *
 * @example
 * import * as g from './guards.js';
 *
 * const { userName, age, title } = validateBody(req, {
 *   userName: g.isString.andNonEmpty(),
 *   age: g.isInteger.andPositive(),
 *   title: g.isString.orUndefined(),
 * });
 *
 * // Resulting variables are typed as:
 * {
 *   userName: string,          // (guaranteed non-empty)
 *   age: number,               // (guaranteed >0)
 *   title: string | undefined  // (optional property)
 * }
 */

// ====================================== CORE TYPES =========================================

/** A function which takes the concrete `value` that was passed for a given property `key` and formats them in a
 * message string (usually an error message). */
export type MessageFormatter = (value: unknown, key: string) => string;

/**
 * A type guard: When called with a `value` of an initially unknown type, the guard checks the value for certain
 * invariants based on the specific implementation of the guard. If this check passed, the `value`'s type is narrowed
 * down to type `T` using a _type predicate_ (`value is T`). `description` is a human-readable rendering of the
 * expected value, used to build validation error messages.
 */
export interface Guard<T> {
  /** The guard's call signature: The specific implementation of the guard check. */
  (value: unknown): value is T;
  /** Human-readable description of the invariants expected from type `T` (e.g. is a string, is a positive number, etc.). */
  readonly description: string;
  /** An optional formatter that explains the reason for a guard-check failure given the property key and value encountered. */
  readonly errorFormatter?: MessageFormatter | undefined;
  /** Allows specifying a custom error message if this guard fails. */
  else(message: MessageFormatter | string): Guard<T>;
  /** Makes a guard optional: The respective property is also allowed to be absent (undefined) */
  orUndefined(): Guard<T | undefined>;
  /** Makes this guard accept `null` in addition to its guarded type `T`. */
  orNull(): Guard<T | null>;
  /** Makes this guard accept both `null` or `undefined` in addition to its guarded type `T`. */
  orNullish(): Guard<T | null | undefined>;
}

/**
 * Extracts the type `T` a guard protects: `Guarded<Guard<T>>` resolves to `T`
 * @example Guarded<typeof isString> = string
 */
export type Guarded<G> = G extends Guard<infer T> ? T : never;

/**
 * A {@link Record} defining the expected structure of a request body (JSON payload), where _keys_ represent **property
 * names** and _values_ are **{@link Guard Guards}**, which put restrictions on the type and set of values allowed for
 * this property. We say, this record defines a _schema_ for the expected request body.
 *
 * @example
 * {
 *   userName: isString.andNonEmpty(),
 *   age: isInteger.andPositive(),
 *   title: isString.orUndefined(),
 * };
 */
export type ObjectSchema = Record<string, Guard<unknown>>;

/** A yet untyped request body object. */
export type RawObject = Record<string, unknown>;

/**
 * Infers the type of expected payloads from an {@link ObjectSchema} object.<br/>
 * @example
 *   const readyBodySchema = { isReady: isBoolean, setupDuration: isInteger.andPositive() };
 *   type ReadyBody = InferType<typeof readyBodySchema>;   // { isReady: boolean; setupDuration: number }
 */
export type InferType<S extends ObjectSchema> = { [K in keyof S]: Guarded<S[K]> };

// ================================== INTERNAL HELPER FUNCTIONS =======================================

/** Internal guard constructor */
function makeGuard<T>(
  description: string,
  check: (value: unknown) => boolean,
  errorFormatter?: (value: unknown, key: string) => string
): Guard<T> {
  const fn = (value: unknown): value is T => check(value);

  fn.description = description;
  if (errorFormatter !== undefined) {
    fn.errorFormatter = errorFormatter;
  }

  // Calling `.else()` constructs a copy of this guard with a new custom error formatter.
  fn.else = (message: MessageFormatter | string) => {
    const formatter = typeof message === 'function' ? message : () => message;
    return makeGuard(description, check, formatter);
  };

  fn.orUndefined = () =>
    makeGuard(
      `${description} (optional)`,
      val => val === undefined || check(val),
      (val, key) => (errorFormatter ? errorFormatter(val, key) : `Property '${key}' must be ${description}`)
    );

  fn.orNull = () =>
    makeGuard(
      `${description} or null`,
      val => val === null || check(val),
      (val, key) => (errorFormatter ? errorFormatter(val, key) : `Property '${key}' must be ${description}`)
    );

  fn.orNullish = () =>
    makeGuard(
      `${description} (optional or null)`,
      val => val == null || check(val),
      (val, key) => (errorFormatter ? errorFormatter(val, key) : `Property '${key}' must be ${description}`)
    );

  return fn as Guard<T>;
}

const stripArticle = (text: string) => {
  return text.replace(/^(a|an|the)\s+/, '');
};

// ===================================== IMPLEMENTED GUARDS =========================================

/* ---------------- Primitives ---------------- */

export const isBoolean: Guard<boolean> = makeGuard('a boolean', val =>
  typeof val === 'string' ? false : typeof val === 'boolean'
);

export const isString: StringGuard = makeStringGuard('a string', val => typeof val === 'string');

export const isNumber: NumberGuard = makeNumberGuard('a number', val => typeof val === 'number');
export const isInteger: NumberGuard = makeNumberGuard(
  'an integer',
  val => typeof val === 'number' && Number.isInteger(val)
);

/* ---------------- Refined Numbers ---------------- */

export interface NumberGuard extends Guard<number> {
  /** Ensures that the number is finite (neither +/-Infinity nor NaN). */
  andFinite(): NumberGuard;
  /** Ensures that the number is positive (strictly greater than 0). */
  andPositive(): NumberGuard;
  /** Ensures that the number is non-negative (>=0). */
  andNonNegative(): NumberGuard;
  /** Ensures that the number lies within the specified range [min, max] (inclusive range). */
  inRange(minInclusive: number, maxInclusive: number): NumberGuard;
}

function makeNumberGuard(
  description: string,
  check: (value: unknown) => boolean,
  errorMessage?: (value: unknown, key: string) => string
): NumberGuard {
  const guard = makeGuard<number>(description, check, errorMessage) as NumberGuard;

  guard.andFinite = () =>
    makeNumberGuard(
      `a finite ${stripArticle(description)} (neither +/-Infinity nor NaN)`,
      val => guard(val) && Number.isFinite(val)
    );

  guard.andPositive = () =>
    makeNumberGuard(`a positive ${stripArticle(description)} (greater than 0)`, val => guard(val) && val > 0);

  guard.andNonNegative = () =>
    makeNumberGuard(`a non-negative ${stripArticle(description)} (>=0)`, val => guard(val) && val >= 0);

  guard.inRange = (minInclusive, maxInclusive) =>
    makeNumberGuard(
      `${description} between ${minInclusive} and ${maxInclusive} (inclusive)`,
      val => guard(val) && val >= minInclusive && val <= maxInclusive
    );

  return guard;
}

/* ---------------- Refined Strings ---------------- */

export interface StringGuard extends Guard<string> {
  /** Explicitly rejects the empty string and strings consisting only of whitespace. */
  andNonEmpty(): StringGuard;
  /** Ensures that the string is of a certain length within [min, max] (inclusive range) after trimming excess whitespace. */
  ofLength(min: number, max: number): StringGuard;
}

function makeStringGuard(
  description: string,
  check: (value: unknown) => boolean,
  errorMessage?: (value: unknown, key: string) => string
): StringGuard {
  const guard = makeGuard<string>(description, check, errorMessage) as StringGuard;

  guard.andNonEmpty = () =>
    makeStringGuard(`a non-empty ${stripArticle(description)}`, val => guard(val) && val.trim().length > 0);

  guard.ofLength = (min: number, max: number) =>
    makeStringGuard(
      min === max
        ? `a ${stripArticle(description)} of length ${min}`
        : `a ${stripArticle(description)} of ${min} to ${max} characters`,
      val => guard(val) && val.trim().length >= min && val.trim().length <= max
    );

  return guard;
}

export const isUrl: Guard<string> = makeGuard('a valid URL', val => {
  if (!isString(val)) return false;
  try {
    new URL(val);
    return true;
  } catch {
    return false;
  }
});

/* ---------------- Enums & Unions ---------------- */

function enumMemberValues<E extends Record<string, string | number>>(enumObject: E): (string | number)[] {
  return Object.values(enumObject).filter(
    value => !(typeof value === 'string' && value in enumObject && typeof enumObject[value as keyof E] === 'number')
  );
}

/**
 * Guard factory for TypeScript enums: Accepts precisely the enum's member values.
 * Works for both string enums and numeric enums.
 */
export const isEnumValue = <E extends Record<string, string | number>>(enumObject: E): Guard<E[keyof E]> => {
  const allowedValues = enumMemberValues(enumObject);
  return makeGuard(`one of: ${allowedValues.map(String).join(', ')}`, val => allowedValues.includes(val as E[keyof E]));
};

/** A specific value (literal) */
export const isLiteral = <const T extends string | number | boolean | null | undefined>(literal: T): Guard<T> =>
  makeGuard(String(literal), (val): val is T => val === literal);

/** Allows for specifying an explicit list of allowed values (literals). */
export const isOneOf = <const T extends readonly unknown[]>(allowedValues: T): Guard<T[number]> =>
  makeGuard(`one of: ${allowedValues.map(String).join(', ')}`, val => allowedValues.includes(val));

/** Builds a disjunction of two guards: Passes if the value satisfies at least one of the two guards. */
export const isEither = <A, B>(guardA: Guard<A>, guardB: Guard<B>): Guard<A | B> =>
  makeGuard(`${guardA.description} or ${guardB.description}`, (val): val is A | B => guardA(val) || guardB(val));

/** Accepts a value that satisfies at least one of the given guards. */
export const isUnionOf = <const T extends readonly Guard<unknown>[]>(guards: T): Guard<Guarded<T[number]>> =>
  makeGuard(guards.map(g => g.description).join(' or '), val => guards.some(g => g(val)));

/* ---------------- Combinators ---------------- */

/** An array in which every element satisfies the given guard. */
export const isArrayOf = <T>(guard: Guard<T>): Guard<T[]> => {
  let lastElementError: string | undefined = undefined;

  return makeGuard(
    `an array of ${guard.description}`,
    val => {
      lastElementError = undefined;
      if (!Array.isArray(val)) return false;

      for (let i = 0; i < val.length; i++) {
        const item = val[i];
        if (!guard(item)) {
          lastElementError = guard.errorFormatter
            ? guard.errorFormatter(item, `[${i}]`)
            : `Array element at index ${i} must be ${guard.description}`;
          return false;
        }
      }
      return true;
    },
    (_val, _key) => lastElementError ?? `must be an array of ${guard.description}`
  );
};

/** A record of a type `Record<string, T>`, where the value of every key-value pair must satisfy the guard `Guard<T>`. */
export const isRecordOf = <T>(guard: Guard<T>): Guard<Record<string, T>> => {
  let lastEntryError: string | undefined = undefined;

  return makeGuard(
    `a record of ${guard.description}`,
    val => {
      lastEntryError = undefined;
      if (typeof val !== 'object' || val === null || Array.isArray(val)) return false;

      for (const [key, entry] of Object.entries(val)) {
        if (!guard(entry)) {
          lastEntryError = guard.errorFormatter
            ? guard.errorFormatter(entry, key)
            : `Property '${key}' must be ${guard.description}`;
          return false;
        }
      }
      return true;
    },
    (_val, _key) => lastEntryError ?? `must be a record of ${guard.description}`
  );
};

/** Must be a constructable object (classes work, interfaces don't, because interfaces are erased at runtime) */
export type Constructor<T> = abstract new (...args: any[]) => T;

/** Ensures that the property value is an instance of the given class `T`. */
export const isInstanceOf = <T>(cls: Constructor<T>): Guard<T> =>
  makeGuard(`an instance of ${cls.name || 'class'}`, (val): val is T => val instanceof cls);

/**
 * A nested object with per-property guards — the recursive generalization of an {@link ObjectSchema}, so nested schemas compose:
 *
 * @example
 * const userSchema = {
 *   name: isString.andNonEmpty(),
 *   bankAccount: isObjectWith({
 *     holder: isString.andNonEmpty(),
 *     iban: isInteger.andPositive(),
 *     isDomestic: isBoolean,
 *   })
 * }
 */
export const isObjectWith = <S extends ObjectSchema>(spec: S): Guard<InferType<S>> => {
  let lastNestedError: string | undefined = undefined;

  return makeGuard(
    `an object with: ${Object.entries(spec)
      .map(([key, guard]) => `${key} (${guard.description})`)
      .join(', ')}`,
    val => {
      lastNestedError = undefined;

      if (typeof val !== 'object' || val === null || Array.isArray(val)) {
        return false;
      }

      const body = val as RawObject;

      for (const [key, guard] of Object.entries(spec)) {
        const propValue = body[key];

        if (!guard(propValue)) {
          if (guard.errorFormatter) {
            lastNestedError = guard.errorFormatter(propValue, key);
          } else if (propValue === undefined) {
            lastNestedError = `Missing property: ${key}`;
          } else {
            lastNestedError = `Property '${key}' must be ${guard.description}`;
          }
          return false;
        }
      }

      return true;
    },
    (_val, key) => lastNestedError ?? `Property '${key}' must be an object`
  );
};
