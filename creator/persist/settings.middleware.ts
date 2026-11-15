import { Connect } from 'vite';
import fs from 'fs';
import http from 'http';

import { DEFAULT_SETTINGS } from '@yasq/shared';

import { paths } from './paths.js';

const readSettings = (): any => {
  if (!fs.existsSync(paths.settingsFile)) return DEFAULT_SETTINGS;
  try {
    const data = fs.readFileSync(paths.settingsFile, 'utf-8');
    return data.trim() ? JSON.parse(data) : DEFAULT_SETTINGS;
  } catch (err) {
    console.error('Failed to parse settings file, using defaults', err);
    return DEFAULT_SETTINGS;
  }
};

const writeSettings = (settings: any) => {
  fs.mkdirSync(paths.baseDir, { recursive: true });
  fs.writeFileSync(paths.settingsFile, JSON.stringify(settings, null, 2));
};

export function registerSettingsMiddleware(server: { middlewares: Connect.Server }) {
  server.middlewares.use('/api/settings', (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');

    try {
      // GET /api/settings -> Retrieve current settings
      if (req.method === 'GET') {
        return res.end(JSON.stringify(readSettings()));
      }

      // PUT /api/settings or POST /api/settings -> Update settings
      if (req.method === 'PUT' || req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const updatedSettings = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

          writeSettings(updatedSettings);
          res.end(JSON.stringify(updatedSettings));
        });
        return;
      }

      // DELETE /api/settings -> Reset settings to default
      if (req.method === 'DELETE') {
        try {
          if (fs.existsSync(paths.settingsFile)) {
            fs.unlinkSync(paths.settingsFile);
          }

          return res.end(JSON.stringify(DEFAULT_SETTINGS));
        } catch (err) {
          console.error('Failed to delete settings file', err);
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: 'Failed to delete settings file' }));
        }
      }

      // Fallthrough for unhandled HTTP methods or paths
      res.statusCode = 405; // Method Not Allowed
      return res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
    } catch (err: any) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  });
}
