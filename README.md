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
  - Create a new Application
  - Set Redirect URI in OAuth2 settings to `https://127.0.0.1`
  - Make sure to add all additional test players as `App Testers`
- (Optional) Turn on `iOS` and `Android` under `Supported Platforms` in Activity settings to allow users to open the activity on mobile devices
- (Optional) If you want to be able to export your game results directly to Discord:
  - Generate a Bot Token in the Bot settings section
  - Generate Invite Link in OAuth2 settings:
    - Set scope to `bot`
    - Set bot permissions to `Send Messages`, `Attach Files` and `Read Message History`
    - Add bot to server via the invite link

3. **Set up Environment Variables**\
   Create a `.env` file in the root directory:

```dotenv
# Required variables
VITE_DISCORD_CLIENT_ID=<Copy Client ID from Discord Developer Portal>
DISCORD_CLIENT_SECRET=<Copy Client Secret from Discord Developer Portal>
VITE_URL_MAPPING=<Fill Later>
# Optional variables
DISCORD_BOT_TOKEN=<Copy Bot Token from Discord Developer Portal>
LOG_LEVEL=<options: debug, info, warn, error> (defaults to 'info')
DATA_SOURCE=<Relative path to quiz data> (see "Game Setup")
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
  - Create URL Mapping under the Activities tab
  - Turn on `Enable Activities` in Activity settings

4. (Optional) Run `npx playwright install chromium` to allow exporting of final results as image

### Game Setup

To create your own quiz game, you need to provide the respective static data files (audio files of the soundtracks and
_optionally_ images of the game covers) as well as a JSON file to add the necessary metadata.

#### Data Location

YASQ always expects quiz data to be placed in a **subdirectory** of `server/data`. The project provides a tiny sample quiz
in `server/data/sample`, which will be loaded by default. When you create your own quiz, you can either replace the files
in the `sample` directory or create a new subdirectory.

If `server/data` contains _more than one_ subdirectory, you must specify
which one to load via the `DATA_SOURCE` environment variable, given as a path relative to `server/data`.
Otherwise, the system will fall back to look for the `sample` directory.

**Examples:**

```dotenv
DATA_SOURCE=my_quiz    # loads data from server/data/my_quiz
DATA_SOURCE=nested/example/quiz    # loads data from server/data/nested/example/quiz
```

#### Data Format

In the following, we assume a custom quiz is set up in `server/data/my_quiz` and we call this location `quizDir` for short.
Within a given quiz directory (`quizDir`), data must be structured in the following way:

1. Track audio files in `quizDir/music`
2. Game cover image files in `quizDir/game_covers`
3. A `tracks.json` file directly in `quizDir` with the following format:

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

   Tags can be used to provide more information about a specific game (e.g. Release, Platform, Developer), and the specific choice and number of tags is up to the user.
   Nevertheless, each game should have at least one tag for the Trivia joker to make sense.

4. (Optional) A `playlists.json` file in `quizDir` with the following format:
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
   This file can be used to bundle certain tracks in playlists, which is just a way to organize tracks to make them easier to find for the quiz host.
5. (Optional) A `permissions.json` in `quizDir` to restrict access to specific tracks to certain Discord User IDs:
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

The project contains various unit tests for the client and the server using vitest, integration tests to verify client-server communication, as well as end-to-end (E2E) and component-specific tests using Playwright to test the full app including correct behaviour of the client UI. To run the tests, execute the respective `npm` script in the project root:

### Unit Tests

```bash
npm run test:unit
npm run test:unit:coverage # with coverage report

npm run test:unit:client   # only client tests
npm run test:unit:server   # only server tests
```

### Integration Tests

```bash
npm run test:integration
```

### UI Tests

The user interface tests consist of end-to-end (E2E) tests and more fine-grained single-component tests.
Furthermore, all the UI tests offer `npm` scripts for both a headless execution mode as well as an interactive mode through the Playwright Test Runner (`ui` mode).

```bash
npx playwright install        # install test devices (required for first execution)

npm run test:e2e              # E2E tests - headless mode
npm run test:e2e:ui           # E2E tests - ui mode
npm run test:components       # component tests - headless mode
npm run test:components:ui    # component tests - ui mode
npm run test:gui              # all UI tests - headless mode
npm run test:gui:ui           # all UI tests - ui mode
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
