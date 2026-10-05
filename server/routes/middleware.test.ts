import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { validateBody, validateParams } from './middleware.js';
import { ApiError } from './errors.js';
import type { RawObject } from './guards.js';
import * as g from './guards.js';

interface MockRequestOptions {
  body?: RawObject;
  params?: RawObject;
  query?: RawObject;
}

/** Creates a minimum-viable Express Request object with the specified body, path params and query params or empty placeholders */
const mockRequest = ({ body = {}, params = {}, query = {} }: MockRequestOptions = {}): Request =>
  ({
    body,
    headers: {},
    params,
    query,
    method: 'POST',
    url: '/test',
  }) as Request;

describe('validateBody', () => {
  it('should return an object with the given property values if the payload was valid', () => {
    const payload = { isReady: true, rounds: 5, user: { id: '123', name: 'Player 1' } };
    const req = mockRequest({ body: payload });

    const result = validateBody(req, {
      isReady: g.isBoolean,
      rounds: g.isInteger.andPositive(),
      user: g.isObjectWith({
        id: g.isString.andNonEmpty(),
        name: g.isString,
        age: g.isInteger.orUndefined(),
      }),
    });

    expect(result).toEqual(payload);
  });

  it('should throw ApiError 400 with "Missing property" when encountering a missing required field', () => {
    const schema = { isReady: g.isBoolean };
    const req = mockRequest();

    expect(() => validateBody(req, schema)).toThrow(ApiError);
    expect(() => validateBody(req, schema)).toThrow('Missing property: isReady');
  });

  it("should throw ApiError 400 with the guard's description for an invalid property", () => {
    const schema = { isReady: g.isBoolean };
    const req = mockRequest({ body: { isReady: 'yes' } });

    expect(() => validateBody(req, schema)).toThrow(ApiError);
    expect(() => validateBody(req, schema)).toThrow("Property 'isReady' must be a boolean");
  });

  it('should allow optional properties to be absent without throwing', () => {
    const schema = {
      joker: g.isString.andNonEmpty(),
      targetId: g.isString.orUndefined(),
    };

    const req1 = mockRequest({ body: { joker: 'someJoker' } });
    const result1 = validateBody(req1, schema);
    expect(result1.joker).toBe('someJoker');
    expect(result1.targetId).toBeUndefined();

    const req2 = mockRequest({ body: { joker: 'spyJoker', targetId: 'player2' } });
    const result2 = validateBody(req2, schema);
    expect(result2.joker).toBe('spyJoker');
    expect(result2.targetId).toBe('player2');
  });

  it('should prioritize custom error message when throwing ApiError', () => {
    const req = mockRequest({
      body: {
        settings: { maxGuessTime: 120 },
      },
    });

    const schema = {
      settings: g.isObjectWith({
        maxGuessTime: g.isInteger.inRange(1, 100).else('Guess time must not exceed 100'),
      }),
    };

    expect(() => validateBody(req, schema)).toThrow(ApiError);
    expect(() => validateBody(req, schema)).toThrow('Guess time must not exceed 100');
  });
});

describe('validateParams', () => {
  it('should successfully parse and coerce path parameters to their typed equivalents', () => {
    const req = mockRequest({
      params: {
        roundNumber: '3',
        isActive: 'true',
        instanceId: 'game-123',
      },
    });

    const result = validateParams(req, {
      roundNumber: g.isInteger.andPositive(),
      isActive: g.isBoolean,
      instanceId: g.isString.andNonEmpty(),
    });

    expect(result).toEqual({
      roundNumber: 3,
      isActive: true,
      instanceId: 'game-123',
    });
  });

  it('should throw ApiError 400 with "Missing path parameter" when encountering a missing required path parameter', () => {
    const schema = { roundNumber: g.isInteger.andPositive() };
    const req = mockRequest();

    expect(() => validateParams(req, schema)).toThrow(ApiError);
    expect(() => validateParams(req, schema)).toThrow('Missing path parameter: roundNumber');
  });

  it("should throw ApiError 400 with the guard's description for an invalid path parameter", () => {
    const schema = { roundNumber: g.isInteger.andPositive() };
    const req = mockRequest({ params: { roundNumber: 'invalid_number' } });

    expect(() => validateParams(req, schema)).toThrow(ApiError);
    expect(() => validateParams(req, schema)).toThrow("Path parameter 'roundNumber' must be a positive integer");
  });

  it('should prioritize custom error message when throwing ApiError on parameter validation failure', () => {
    const req = mockRequest({ params: { roundNumber: '99' } });

    const schema = {
      roundNumber: g.isInteger.inRange(1, 10).else('Round number must be between 1 and 10'),
    };

    expect(() => validateParams(req, schema)).toThrow(ApiError);
    expect(() => validateParams(req, schema)).toThrow('Round number must be between 1 and 10');
  });
});
