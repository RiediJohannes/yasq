import { startDiscordBot } from './bot.js';
import { setupServer } from './server.js';

const port = 3001;

const httpServer = setupServer();

startDiscordBot();

httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
