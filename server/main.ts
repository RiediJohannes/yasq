import { startDiscordBot } from './bot.js';
import { setupServer } from './server.js';
import { closeDatabase } from './src/db.js';

const port = 3001;
const httpServer = setupServer();

startDiscordBot();

httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

const shutdown = () => {
  console.log('Shutting down server...');
  closeDatabase();
  httpServer.close(() => process.exit(0));
  httpServer.closeAllConnections();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
