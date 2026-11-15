import { Connect } from 'vite';
import fs from 'fs';
import http from 'http';
import path from 'path';

import { paths } from './paths.js';

export function registerStaticMiddlewares(server: { middlewares: Connect.Server }) {
  server.middlewares.use(
    '/music',
    (req: http.IncomingMessage, res: http.ServerResponse, next: Connect.NextFunction) => {
      const filePath = path.join(paths.musicDir, req.url || '');
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return fs.createReadStream(filePath).pipe(res);
      }
      next();
    }
  );

  server.middlewares.use(
    '/covers',
    (req: http.IncomingMessage, res: http.ServerResponse, next: Connect.NextFunction) => {
      const filePath = path.join(paths.coversDir, req.url || '');
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return fs.createReadStream(filePath).pipe(res);
      }
      next();
    }
  );
}
