import { Connect } from 'vite';
import fs from 'fs';
import http from 'http';

import { Track } from '@yasq/shared';

import { paths } from './paths.js';

const readTracks = (): Track[] => {
  if (!fs.existsSync(paths.tracksFile)) return [];
  return JSON.parse(fs.readFileSync(paths.tracksFile, 'utf-8'));
};

const writeTracks = (tracks: Track[]) => {
  fs.mkdirSync(paths.baseDir, { recursive: true });
  fs.writeFileSync(paths.tracksFile, JSON.stringify(tracks, null, 2));
};

export function registerTracksMiddleware(server: { middlewares: Connect.Server }) {
  server.middlewares.use('/api/tracks', async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const indexParam = pathSegments[0] !== undefined ? parseInt(pathSegments[0], 10) : NaN;

    res.setHeader('Content-Type', 'application/json');

    try {
      // GET /api/tracks -> List all tracks
      if (req.method === 'GET' && Number.isNaN(indexParam)) {
        return res.end(JSON.stringify(readTracks()));
      }

      // GET /api/tracks/:index -> Get single track by index
      if (req.method === 'GET' && !Number.isNaN(indexParam)) {
        const tracks = readTracks();
        if (indexParam < 0 || indexParam >= tracks.length) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Track not found' }));
        }
        return res.end(JSON.stringify(tracks[indexParam]));
      }

      // POST /api/tracks -> Create a new track
      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString()) as Track;
            const tracks = readTracks();

            tracks.push(body);
            writeTracks(tracks);

            res.statusCode = 201;
            return res.end(JSON.stringify(body));
          } catch {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // PUT /api/tracks/:index -> Update a existing track
      if (req.method === 'PUT' && !Number.isNaN(indexParam)) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString()) as Track;
            const tracks = readTracks();

            if (indexParam < 0 || indexParam >= tracks.length) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Track not found' }));
            }

            tracks[indexParam] = body;
            writeTracks(tracks);

            return res.end(JSON.stringify(tracks[indexParam]));
          } catch {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // DELETE /api/tracks/:index -> Delete a track
      if (req.method === 'DELETE' && !Number.isNaN(indexParam)) {
        const tracks = readTracks();

        if (indexParam < 0 || indexParam >= tracks.length) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Track not found' }));
        }

        tracks.splice(indexParam, 1);
        writeTracks(tracks);

        res.statusCode = 204;
        return res.end();
      }

      // Fallthrough for unhandled HTTP methods or paths
      res.statusCode = 405; // Method Not Allowed
      res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
    } catch (error) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to access tracks file.' })
      );
    }
  });
}
