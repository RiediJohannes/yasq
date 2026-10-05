import { describe, expect, it } from 'vitest';
import { LogLevel } from '@yasq/shared/constants.js';
import type { Guard } from './guards.js';
import * as g from './guards.js';

/* ---------------- Test Value Pools ---------------- */

export const STRINGS = ['hello', '', '0', 'false'];
export const NON_STRINGS = [0, 1, NaN, true, false, null, undefined, {}, [], ['a'], Symbol('sym')];

export const FINITE_NUMBERS = [0, -1, 3.14, 1e308];
export const ALL_NUMBERS = [NaN, Infinity, -Infinity, ...FINITE_NUMBERS];
export const NON_NUMBERS = [...STRINGS, true, false, null, undefined, {}, [], () => {}];

export const BOOLEANS = [true, false];
export const NON_BOOLEANS = [0, 1, -0, '', 'true', 'false', null, undefined, {}, []];

/* ---------------- Helper Utilities ---------------- */

const format = (value: unknown): string => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (typeof value === 'bigint' || typeof value === 'symbol') return String(value);
  try {
    return value instanceof Object ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
};

export interface GuardCases {
  valid: unknown[];
  invalid: unknown[];
}

/**
 * Generates a sequence of accept/reject tests for the given guard and test cases.
 */
export function describeGuard(guard: Guard<unknown>, cases: GuardCases): void {
  describe(`Guard assertion '${guard.description}'`, () => {
    for (const value of cases.valid) {
      it(`should accept ${format(value)}`, () => {
        expect(guard(value)).toBe(true);
      });
    }
    for (const value of cases.invalid) {
      it(`should reject ${format(value)}`, () => {
        expect(guard(value)).toBe(false);
      });
    }
  });
}

class CustomError extends Error {}

/* ====================================================
   GUARD TESTS
   ==================================================== */

describe('Primitive Guards', () => {
  describeGuard(g.isString, { valid: STRINGS, invalid: NON_STRINGS });
  describeGuard(g.isNumber, { valid: ALL_NUMBERS, invalid: NON_NUMBERS });
  describeGuard(g.isBoolean, { valid: BOOLEANS, invalid: NON_BOOLEANS });
});

describe('Number-related Guards', () => {
  describeGuard(g.isNumber.andFinite(), {
    valid: FINITE_NUMBERS,
    invalid: [NaN, Infinity, -Infinity, ...NON_NUMBERS],
  });

  describeGuard(g.isInteger, {
    valid: [0, -10, 42, Number.MAX_SAFE_INTEGER],
    invalid: [3.14, NaN, Infinity, ...NON_NUMBERS],
  });

  describeGuard(g.isNumber.andPositive(), {
    valid: [0.0001, 1, 100],
    invalid: [0, -1, -3.14, NaN, ...NON_NUMBERS],
  });

  describeGuard(g.isInteger.andPositive(), {
    valid: [1, 100, Number.MAX_SAFE_INTEGER],
    invalid: [0, -1, 1.5, NaN, ...NON_NUMBERS],
  });

  describeGuard(g.isNumber.andNonNegative(), {
    valid: [0, 0.0001, 1, 100],
    invalid: [-0.0001, -1, -3.14, NaN, ...NON_NUMBERS],
  });

  describeGuard(g.isInteger.andNonNegative(), {
    valid: [0, 1, 100, Number.MAX_SAFE_INTEGER],
    invalid: [-1, -100, 1.5, NaN, ...NON_NUMBERS],
  });

  describeGuard(g.isNumber.inRange(1, 5), {
    valid: [1, 5, 3, 2.5],
    invalid: [0.999, 5.001, NaN, ...NON_NUMBERS],
  });

  describeGuard(g.isInteger.inRange(1, 5), {
    valid: [1, 5, 3],
    invalid: [2.5, 0.999, 5.001, NaN, ...NON_NUMBERS],
  });
});

describe('String-related Guards', () => {
  describeGuard(g.isString.andNonEmpty(), {
    valid: ['a', 'hello'],
    invalid: ['', ' ', ...NON_STRINGS],
  });
  describeGuard(g.isString.ofLength(2, 4), {
    valid: ['ab', 'abcd', '123', ' 234 '],
    invalid: ['a', 'abcde', '', '   ', ...NON_STRINGS],
  });
  describeGuard(g.isUrl, {
    valid: ['https://example.com', 'http://domain.com/some/path?query=1#fragment', 'ftp://files.example.com'],
    invalid: ['example.com', 'http://', 'not a url', '', ...NON_STRINGS],
  });
});

describe('Enums & Unions', () => {
  describe('g.isEnumValue', () => {
    describeGuard(g.isEnumValue(LogLevel), {
      valid: [LogLevel.DEBUG, LogLevel.INFO, LogLevel.ERROR],
      invalid: ['DEBUG', 99, 'not-a-level'],
    });
  });

  describeGuard(g.isLiteral('active'), {
    valid: ['active'],
    invalid: ['inactive', 'ACTIVE', 123, null, undefined],
  });

  describeGuard(g.isOneOf(['red', 'green', 'blue'] as const), {
    valid: ['red', 'green', 'blue'],
    invalid: ['yellow', 'RED', null, undefined],
  });

  describeGuard(g.isEither(g.isString, g.isNumber), {
    valid: ['hello', 42, 0, ''],
    invalid: [true, false, null, undefined, {}, []],
  });

  describeGuard(g.isUnionOf([g.isString, g.isBoolean]), {
    valid: ['hello', true, false],
    invalid: [42, null, undefined, {}, []],
  });
});

describe('Optional or Nullable Properties', () => {
  describeGuard(g.isString.orUndefined(), {
    valid: [...STRINGS, undefined],
    invalid: NON_STRINGS.filter(v => v !== undefined),
  });

  describeGuard(g.isNumber.orNull(), {
    valid: [...ALL_NUMBERS, null],
    invalid: NON_NUMBERS.filter(v => v !== null),
  });

  describeGuard(g.isBoolean.orNullish(), {
    valid: [...BOOLEANS, null, undefined],
    invalid: NON_BOOLEANS.filter(v => v !== null && v !== undefined),
  });
});

describe('Combinators & Guard Methods', () => {
  describeGuard(g.isArrayOf(g.isString), {
    valid: [[], ['a'], ['a', 'b', '']],
    invalid: [['a', 1], ['a', null], 'not an array', {}, NON_STRINGS.filter(v => !Array.isArray(v))],
  });

  describeGuard(g.isRecordOf(g.isNumber), {
    valid: [{}, { a: 1, b: 2 }],
    invalid: [{ a: '1' }, 'not a record', [], null, undefined],
  });

  describeGuard(g.isInstanceOf(CustomError), {
    valid: [new CustomError('test')],
    invalid: [new Error('test'), {}, 'error', null, undefined],
  });
});

describe('Object Guards', () => {
  const userGuard = g.isObjectWith({
    id: g.isInteger.andPositive(),
    name: g.isString.andNonEmpty(),
  });

  describeGuard(userGuard, {
    valid: [{ id: 1, name: 'Alice' }],
    invalid: [{ id: 0, name: 'Alice' }, { id: 1, name: '' }, { id: 1 }, 'not an object', null, undefined],
  });
});

/* ====================================================
   CUSTOM ERROR MESSAGE & PROPAGATION TESTS
   ==================================================== */

describe('Custom Error Messages (.else)', () => {
  it('overrides default error message on primitive guard', () => {
    const customGuard = g.isInteger.andPositive().else('Must be greater than 0');
    expect(customGuard(0)).toBe(false);
    expect(customGuard.errorFormatter?.(0, 'rounds')).toBe('Must be greater than 0');
  });

  it('supports custom error message callback function', () => {
    const customGuard = g.isInteger.andPositive().else((val, key) => `${key} was ${val}, but must be > 0`);
    expect(customGuard(-5)).toBe(false);
    expect(customGuard.errorFormatter?.(-5, 'rounds')).toBe('rounds was -5, but must be > 0');
  });
});

describe('Nested Error Propagation', () => {
  it('propagates child error through g.isObjectWith', () => {
    const schema = g.isObjectWith({
      maxGuessTime: g.isInteger.inRange(1, 10).else('Guess time out of range'),
    });

    expect(schema({ maxGuessTime: 99 })).toBe(false);
    expect(schema.errorFormatter?.({ maxGuessTime: 99 }, 'settings')).toBe('Guess time out of range');
  });

  it('propagates child error with array index through g.isArrayOf', () => {
    const schema = g.isArrayOf(g.isInteger.andPositive().else((_val, key) => `Element ${key} must be positive`));

    expect(schema([1, -5, 3])).toBe(false);
    expect(schema.errorFormatter?.([1, -5, 3], 'items')).toBe('Element [1] must be positive');
  });

  it('propagates child error with key through g.isRecordOf', () => {
    const schema = g.isRecordOf(g.isString.andNonEmpty().else((_, key) => `Key '${key}' cannot be empty`));

    expect(schema({ name: 'Alice', bio: '' })).toBe(false);
    expect(schema.errorFormatter?.({ name: 'Alice', bio: '' }, 'data')).toBe("Key 'bio' cannot be empty");
  });
});
