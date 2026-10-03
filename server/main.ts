import { setupServer } from './server.js';

const port = 3001;
const httpServer = setupServer();

httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

const shutdown = () => {
  console.log('Shutting down server...');
  httpServer.close(() => process.exit(0));
  httpServer.closeAllConnections();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
