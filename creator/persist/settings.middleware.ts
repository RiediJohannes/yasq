import { Connect } from 'vite';
import fs from 'fs';
import http from 'http';

import { type AppSettings, DEFAULT_SETTINGS, GameSettings, Joker } from '@yasq/shared';

import { paths } from './paths.js';

interface Settings {
  gameSettings: GameSettings<Joker[]>;
  appSettings: AppSettings;
}

const readSettings = (): Settings => {
  if (!fs.existsSync(paths.settingsFile)) return DEFAULT_SETTINGS;
  try {
    const data = fs.readFileSync(paths.settingsFile, 'utf-8');
    return data.trim() ? (JSON.parse(data) as Settings) : DEFAULT_SETTINGS;
  } catch (err) {
    console.error('Failed to parse settings file, using defaults', err);
    return DEFAULT_SETTINGS;
  }
};

const writeSettings = (settings: Settings) => {
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
          const updatedSettings = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Settings;

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
    } catch (error) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to access settings file.' })
      );
    }
  });
}
