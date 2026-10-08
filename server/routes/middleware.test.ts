import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { z } from 'zod';
import { defineSchema, SanitizationMode, type UntypedObject, validateRequest } from './middleware.js';
import { ApiError } from './errors.js';

interface MockRequestOptions {
  body?: UntypedObject;
  params?: UntypedObject;
  query?: UntypedObject;
}

/** Creates a mock express {@link Request} object with optional body, path params, and query params */
const mockRequest = ({ body = {}, params = {}, query = {} }: MockRequestOptions = {}): Request =>
  ({
    body,
    headers: {},
    params,
    query,
    method: 'POST',
    url: '/test',
  }) as Request;

describe('validateRequest', () => {
  describe('Single Schema (Body) Validation', () => {
    it('should validate a single body schema and return the parsed data', () => {
      const bodySchema = z.object({
        isReady: z.boolean(),
        rounds: z.number().int().positive(),
      });

      const payload = { isReady: true, rounds: 5 };
      const req = mockRequest({ body: payload });

      const result = validateRequest(req, bodySchema);

      expect(result).toEqual(payload);
    });

    it('should throw ApiError 400 with "Missing body property" when a required field is absent', () => {
      const schema = z.object({ title: z.string() });
      const req = mockRequest({ body: {} });

      expect(() => validateRequest(req, schema)).toThrow(ApiError);
      expect(() => validateRequest(req, schema)).toThrow('Missing body property: title');
    });

    it('should throw ApiError 400 when a body property fails type validation', () => {
      const schema = z.object({ isReady: z.boolean() });
      const req = mockRequest({ body: { isReady: 'yes' } });

      expect(() => validateRequest(req, schema)).toThrow(ApiError);
      expect(() => validateRequest(req, schema)).toThrow(/Invalid body property 'isReady'/);
    });
  });

  describe('Multi-Component Request Validation', () => {
    it('should validate and flatten body, params, and query schemas into a single object', () => {
      const schemas = {
        params: z.object({ id: z.string() }),
        query: z.object({ includeDetails: z.boolean() }),
        body: z.object({ title: z.string() }),
      };

      const req = mockRequest({
        params: { id: 'abc-123' },
        query: { includeDetails: true },
        body: { title: 'Soundtrack Quiz' },
      });

      const result = validateRequest(req, schemas);

      expect(result).toEqual({
        id: 'abc-123',
        includeDetails: true,
        title: 'Soundtrack Quiz',
      });
    });

    it('should correctly format missing property errors for parameters and query components', () => {
      const schemas = {
        params: z.object({ roundId: z.string() }),
        query: z.object({ filter: z.string() }),
      };

      const reqMissingParam = mockRequest({ params: {}, query: { filter: 'all' } });
      expect(() => validateRequest(reqMissingParam, schemas)).toThrow('Missing params parameter: roundId');

      const reqMissingQuery = mockRequest({ params: { roundId: '1' }, query: {} });
      expect(() => validateRequest(reqMissingQuery, schemas)).toThrow('Missing query parameter: filter');
    });

    it('should throw a plain Error when a property name collision occurs across components', () => {
      const schemas = {
        params: z.object({ id: z.string() }),
        body: z.object({ id: z.number() }), // Collision on 'id'
      };

      const req = mockRequest({
        params: { id: '123' },
        body: { id: 456 },
      });

      expect(() => validateRequest(req, schemas)).toThrow(Error);
      expect(() => validateRequest(req, schemas)).toThrow(
        "Property collision detected: Key 'id' exists in multiple request component schemas."
      );
    });
  });

  describe('Sanitization Modes & defineSchema', () => {
    it('should throw an ApiError under strict sanitization when unknown properties are present', () => {
      const strictSchema = defineSchema({ name: z.string() }, SanitizationMode.ERROR_ON_UNKNOWN_PROPERTIES);

      const req = mockRequest({ body: { name: 'Player 1', unknownField: true } });

      expect(() => validateRequest(req, strictSchema)).toThrow(ApiError);
    });

    it('should strip unknown properties by default (normal sanitization mode)', () => {
      const normalSchema = defineSchema({ name: z.string() }, SanitizationMode.STRIP_UNKNOWN_PROPERTIES);

      const req = mockRequest({ body: { name: 'Player 1', unknownField: true } });
      const result = validateRequest(req, normalSchema);

      expect(result).toEqual({ name: 'Player 1' });
      expect(result).not.toHaveProperty('unknownField');
    });
  });
});
