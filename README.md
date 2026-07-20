# YASQ (Yet Another Soundtrack Quiz)

A Multiplayer Soundtrack Quiz built as a Discord Activity.

## Setup

### Prerequisites

- **Node.js** (v22 or higher recommended)
- **npm**
- **Discord Developer Account**
- **cloudflared** (or other tunnel service)

### Installation

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Discord**
- Go to the [Discord Developer Portal](https://discord.com/developers/applications).
- Follow the Steps in the [Tutorial](https://docs.discord.com/developers/activities/building-an-activity):
  - Create a new Application.
  - Set Redirect URI in OAuth2 settings to `https://127.0.0.1`.
  - Make sure to add all additional test players as `App Testers`.
- (Optional) Turn on `iOS` and `Android` under `Supported Platforms` in Activity settings to allow users to open the activity on mobile devices
- (Optional) If you want to be able to export your game results directly to Discord:
  - Generate a Bot Token in the Bot settings section
  - Generate Invite Link in OAuth2 settings:
    - Set scope to `bot`
    - Set bot permissions to `Send Messages`, `Attach Files` and `Read Message History`
    - Add bot to server via the invite link

3. **Set up Environment Variables**\
Create a `.env` file in the root directory:
```env
VITE_DISCORD_CLIENT_ID=<Copy Client ID from Discord Developer Portal>
DISCORD_CLIENT_SECRET=<Copy Client Secret from Discord Developer Portal>
VITE_URL_MAPPING=<Fill Later>
DISCORD_BOT_TOKEN=<Copy Bot Token from Discord Developer Portal> (Optional)
LOG_LEVEL=<options: debug, info, warn, error> (Optional, defaults to 'info')
```

### Local Development

1. **Start Client and Server** (Terminal window 1)
```bash
npm run dev
```

2. **Setup Tunnel** (Terminal window 2)
```bash
# Example using cloudflared
cloudflared tunnel --url http://localhost:5173
```

3. **Update Tunnel URL**
- Set `VITE_URL_MAPPING` in `.env` to the tunnel URL **without** `https://`.
- Follow these steps in the Discord Developer Portal:
  - Create URL Mapping under the Activities tab.
  - Turn on `Enable Activities` in Activity settings.

### Game Setup

1. Copy track audio files into `server/data/music`
2. Copy game cover image files into `server/data/game_covers`
3. Create `tracks.json` in `server/data` with the following format:

    ```json
    [
        {
            "game": "Game Title 1",
            "title": "Track Title 1",
            "audio": "File Name 1",
            "cover": "File Name 1",
            "tags": [
                { "type": "X", "value": "Y" },
                ...
            ]
        },
        {
            "game": "Game Title 2",
            "title": "Track Title 2",
            "audio": "File Name 2",
            "cover": "File Name 2",
            "tags": [
                { "type": "X", "value": "Y" },
                ...
            ]
        },
        ...
    ]
    ```
    Tags can be used to provide more information about a specific game (e.g. Release, Platform, Developer)
4. (Optional) Create `playlists.json` in `server/data` with the following format:
    ```json
    [
        {
            "name": "Playlist 1",
            "tracks": ["File Name 1", "File Name 2", "File Name 3", ...]
        },
        {
            "name": "Playlist 2",
            "tracks": ["File Name 1", "File Name 4", "File Name 5", ...]
        },
        ...
    ]
    ```
5. (Optional) Create `permissions.json` in `server/data` to restrict specific tracks to certain Discord User IDs:
    ```json
    [
        {
            "type": "whitelist",
            "userIds": ["Discord User ID 1", ...],
            "files": [
                "File Name 1", "File Name 2", ...
            ]
        }
    ]
    ```
    - `whitelist`: Only users in `userIds` can see/play these files.
    - `blacklist`: Everyone except users in `userIds` can see/play these files.
    - Default: Files not listed in any set are public to everyone.

## Testing

The project contains various unit tests for the server component using vitest, as well as end-to-end (E2E) tests to verify correct integration between client and server using Playwright. To run the tests, execute the respective `npm` script in the project root:

### Unit Tests

```bash
npm run test:unit
npm run test:unit:coverage # with coverage report
```

### Integration Tests

```bash
npm run test:integration
```

### E2E Tests

```bash
npx playwright install  # for first execution

npm run test:e2e        # headless mode
npm run test:e2e:ui     # ui mode
```

### CI Pipeline

In addition, the repo contains the `.yml` file for a GitHub Action CI Pipeline. For pushes on `main` and pull requests to `main` the unit, integration, and e2e tests are executed.

## Authors

- **Yannick Adler** - [GitHub Profile](https://github.com/yadler97)
- **Johannes Riedmann** - [GitHub Profile](https://github.com/RiediJohannes)

### Special Thanks

A huge thanks to my beta testers for helping me break the game so I could actually fix it:
- Deniz
- Josch
- Matthi
- Noel
