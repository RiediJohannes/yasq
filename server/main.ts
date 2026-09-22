import { setupServer } from './server.js';

const port = 3001;
const httpServer = setupServer();

httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

process.on('SIGINT', () => httpServer.closeAllConnections());
process.on('SIGTERM', () => httpServer.closeAllConnections());
