import { startDiscordBot } from './bot.js';
import { setupServer } from './server.js';
import { closeDatabase } from './src/db.js';
import { LogCategory, logger } from './src/utils/logger.js';

const port = 3001;
const httpServer = setupServer();

void startDiscordBot();

httpServer.listen(port, () => {
  logger.info(`Server listening at http://localhost:${port}`, LogCategory.SETUP);
});

const shutdown = () => {
  logger.info('Shutting down server...', LogCategory.GENERAL);
  closeDatabase();
  httpServer.close(() => process.exit(0));
  httpServer.closeAllConnections();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
