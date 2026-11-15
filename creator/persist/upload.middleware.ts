import fs from 'fs';
import path from 'path';
import { paths } from './paths.js';

export function registerUploadMiddleware(server: any) {
  server.middlewares.use('/api/upload', async (req: any, res: any) => {
    if (req.method !== 'POST') return;

    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const type = url.searchParams.get('type');

    let targetDir: string;
    switch (type) {
      case 'cover':
        targetDir = paths.coversDir;
        break;
      case 'sound':
        targetDir = paths.soundsDir;
        break;
      default:
        targetDir = paths.musicDir;
    }

    const defaultName = type === 'cover' ? 'cover.jpg' : 'audio.mp3';
    const filename = decodeURIComponent((req.headers['x-file-name'] as string) || defaultName);

    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, filename);

    const writeStream = fs.createWriteStream(targetPath);
    req.pipe(writeStream);

    req.on('end', () => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ filename }));
    });

    req.on('error', () => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to upload file' }));
    });
  });
}
