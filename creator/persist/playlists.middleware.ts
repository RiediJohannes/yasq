import fs from 'fs';
import { Playlist } from '@yasq/shared';
import { paths } from './paths.js';

const readPlaylists = (): Playlist[] => {
  if (!fs.existsSync(paths.playlistsFile)) return [];
  return JSON.parse(fs.readFileSync(paths.playlistsFile, 'utf-8'));
};

const writePlaylists = (playlists: Playlist[]) => {
  fs.mkdirSync(paths.baseDir, { recursive: true });
  fs.writeFileSync(paths.playlistsFile, JSON.stringify(playlists, null, 2));
};

export function registerPlaylistsMiddleware(server: any) {
  server.middlewares.use('/api/playlists', (req: any, res: any) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const indexParam = pathSegments[0] !== undefined ? parseInt(pathSegments[0], 10) : NaN;

    res.setHeader('Content-Type', 'application/json');

    try {
      // GET /api/playlists -> List all playlists
      if (req.method === 'GET') {
        return res.end(JSON.stringify(readPlaylists()));
      }

      // POST /api/playlists -> Create a new playlist
      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Playlist;
            const playlists = readPlaylists();

            playlists.push(body);
            writePlaylists(playlists);

            res.statusCode = 201;
            res.end(JSON.stringify(body));
          } catch {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // PUT /api/playlists/:index -> Update an existing playlist
      if (req.method === 'PUT' && !isNaN(indexParam)) {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Playlist;
            const playlists = readPlaylists();

            if (indexParam < 0 || indexParam >= playlists.length) {
              res.statusCode = 404;
              return res.end(JSON.stringify({ error: 'Playlist not found' }));
            }

            playlists[indexParam] = body;
            writePlaylists(playlists);

            res.end(JSON.stringify(playlists[indexParam]));
          } catch {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
        return;
      }

      // DELETE /api/playlists/:index -> Delete a playlist
      if (req.method === 'DELETE' && !isNaN(indexParam)) {
        const playlists = readPlaylists();

        if (indexParam < 0 || indexParam >= playlists.length) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'Playlist not found' }));
        }

        playlists.splice(indexParam, 1);
        writePlaylists(playlists);

        res.statusCode = 204;
        return res.end();
      }

      // Fallthrough for unhandled HTTP methods or paths
      res.statusCode = 405; // Method Not Allowed
      return res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
    } catch (error) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to access playlists file.' })
      );
    }
  });
}
