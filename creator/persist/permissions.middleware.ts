import { Connect } from 'vite';
import fs from 'fs';
import http from 'http';

import { paths } from './paths.js';

interface PermissionRule {
  type: 'whitelist' | 'blacklist';
  userIds: string[];
  files: string[];
}

function isPermissionRule(value: unknown): value is PermissionRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule = value as Record<string, unknown>;
  return (
    (rule.type === 'whitelist' || rule.type === 'blacklist') &&
    Array.isArray(rule.userIds) &&
    rule.userIds.every((userId: unknown) => typeof userId === 'string') &&
    Array.isArray(rule.files) &&
    rule.files.every((file: unknown) => typeof file === 'string')
  );
}

function isPermissionRules(value: unknown): value is PermissionRule[] {
  return Array.isArray(value) && value.every(isPermissionRule);
}

function readPermissions(): PermissionRule[] {
  if (!fs.existsSync(paths.permissionsFile)) return [];

  const permissions: unknown = JSON.parse(fs.readFileSync(paths.permissionsFile, 'utf-8'));
  if (!isPermissionRules(permissions)) {
    throw new Error('Permissions file must contain an array of valid permission rules.');
  }
  return permissions;
}

function writePermissions(permissions: PermissionRule[]): void {
  fs.mkdirSync(paths.baseDir, { recursive: true });
  fs.writeFileSync(paths.permissionsFile, JSON.stringify(permissions, null, 2));
}

export function registerPermissionsMiddleware(server: { middlewares: Connect.Server }) {
  server.middlewares.use('/api/permissions', (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const indexParam = pathSegments[0] !== undefined ? parseInt(pathSegments[0], 10) : NaN;

    res.setHeader('Content-Type', 'application/json');

    try {
      // GET /api/permissions -> List all permission rules
      if (req.method === 'GET') {
        return res.end(JSON.stringify(readPermissions()));
      }

      // POST /api/permissions -> Create a new permission rule
      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            if (!isPermissionRule(body)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Invalid permission rule.' }));
            }

            const permissions = readPermissions();
            permissions.push(body);
            writePermissions(permissions);

            res.statusCode = 201;
            return res.end(JSON.stringify(body));
          } catch {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // PUT /api/permissions/:index -> Update an existing permission rule
      if (req.method === 'PUT' && !Number.isNaN(indexParam)) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            if (!isPermissionRule(body)) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: 'Invalid permission rule.' }));
            }

            const permissions = readPermissions();
            if (indexParam < 0 || indexParam >= permissions.length) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Permission rule not found.' }));
            }

            permissions[indexParam] = body;
            writePermissions(permissions);
            return res.end(JSON.stringify(permissions[indexParam]));
          } catch {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // DELETE /api/permissions/:index -> Delete a permission rule
      if (req.method === 'DELETE' && !Number.isNaN(indexParam)) {
        const permissions = readPermissions();
        if (indexParam < 0 || indexParam >= permissions.length) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Permission rule not found.' }));
        }

        permissions.splice(indexParam, 1);
        writePermissions(permissions);
        res.statusCode = 204;
        return res.end();
      }

      // Fallthrough for unhandled HTTP methods or paths
      res.statusCode = 405;
      return res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
    } catch (error) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to access permissions file.' })
      );
    }
  });
}
