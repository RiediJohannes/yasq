# YASQ (Yet Another Soundtrack Quiz)

A Multiplayer Soundtrack Quiz built as a Discord Activity.

## Table of Contents

1. [Setup](#setup)
   1. [Prerequisites](#prerequisites)
   2. [Installation](#installation)
   3. [Local Development](#local-development)
   4. [Game Setup](#game-setup)
      - [Data Location](#data-location)
      - [Data Format](#data-format)
      - [Settings Configuration](#settings-configuration-optional) (optional)
      - [Bot Commands](#bot-commands-optional) (optional)
      - [Database](#database-optional) (optional)
2. [Authors](#authors)
   1. [Special Thanks](#special-thanks)

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
- (Optional) If you want to be able to export your game results directly to Discord or use bot functionality:
  - Generate a Bot Token in the Bot settings section
  - Generate Invite Link in OAuth2 settings:
    - Set scope to `bot`
    - Set bot permissions to `Send Messages`, `Attach Files` and `Read Message History`
    - Add bot to server via the invite link (Permissions Integer should be `100352`)
  - Activate `Server Members Intent` under `Privileged Gateway Intents` in the Bot settings if you want the bot to be able to use the server nicknames for image generation

3. **Set up Environment Variables**\
   Create a `.env` file in the root directory:

```dotenv
# Required variables
VITE_DISCORD_CLIENT_ID=<Copy Client ID from Discord Developer Portal>
DISCORD_CLIENT_SECRET=<Copy Client Secret from Discord Developer Portal>
VITE_URL_MAPPING=<Fill Later>
# Optional variables
DISCORD_BOT_TOKEN=<Copy Bot Token from Discord Developer Portal>
DATABASE_URL=<Relative path to quiz database file> (See "Database")
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

#### Settings Configuration (Optional)

In addition to the in-game setup mask that enables the host to customize the rule set for their quiz while the activity
is running, users can also provide a JSON file to predefine default game settings before starting the application.
Furthermore, this method also allows you to manage various other global application presets.

In particular, the application looks for a file named `settings.json` within the active data source directory
(previously referred to as `quizDir`). This JSON file (if given) may contain the following main sections for customization:

```json
{
  "gameSettings": {
    // ...
  },
  "appSettings": {
    // ...
  }
}
```

The expected structure for each section is detailed below.

##### Game Settings

The `gameSettings` enable the user to override the _default_ settings that a new quiz game is initialized with. Note
that it will still be possible to change the settings in the usual in-game setup mask - this config only affects the
values initially prefilled on this setup screen.

```json
{
  "gameSettings": {
    "rounds": <number of rounds in a quiz> (default: 5),
    "maxGuessTime": <duration in seconds until a round ends automatically> (default: 60),
    "enabledJokers": <list of jokers available to players while guessing> (default: all),
    "firstBonusMultiplier": <bonus awarded to the fastest (partially) correct player as a fraction of the base points> (default: 0.2),
    "streakBonusMultiplier": <bonus awarded based on the player's current streak as a fraction of the base points per streak level> (default: 0.1),
    "timeBonus": [*] <the name of the time bonus decay function to use (LINEAR/EXPONENTIAL/LOGISTIC)> (default: "LINEAR"),
    "achievementBonuses": [*] {
      "mode": <mode of how to select achievement bonuses (manual/random)> (default: "manual"),
      "enabledTypes": <list of achievement bonuses enabled for the quiz (only if mode = manual)> (default: all),
      "randomCount": <number of unique achievement bonuses to select at random (only if mode = random)> (default: 1)
    }
  }
}
```

`[*]`: Properties that also accept the string value `"off"` to disable the respective feature entirely.

##### App Settings

In contrast, `appSettings` govern global presets that affect the entire application rather than individual quiz sessions.
These options _cannot_ be modified from the in-game setup screen.

Currently, this section only supports customizing of a few sound effects, allowing you to supply your own audio files
to replace the default sounds:

```json
{
  "appSettings": {
    "sounds": {
      "finalResultsJingle": [?] <file name of jingle to be played when final results are revealed, or null>,
      "finalResultsLoop": [?] <file name of looping music to play on final results screen after the jingle, or null>
    }
  }
}
```

`[?]`: Explicitly set the value `null` to replace the current audio track with nothing, thus silencing the sound effect.

##### Additional Notes

A reference `settings.json` file demonstrating a full, valid configuration can be found in `server/data/sample/`.
As a sidenote, this file simply lists all properties set to their default values.

Importantly, you **do not need** to provide the _complete_ JSON structure when giving a `settings.json` file.
Any properties you omit will automatically fall back to their defaults.

#### Bot Commands (Optional)

You can register commands to allow players to access some functionality via a bot.

```bash
cd server
node commands.ts
```

This requires a valid `DISCORD_BOT_TOKEN` to be set in the `.env` file.

The following commands exist:

| Command         | Description                           | Requirements        | Parameters                                                     |
| :-------------- | :------------------------------------ | :------------------ | :------------------------------------------------------------- |
| **`/test`**     | Test Command                          | None                | None                                                           |
| **`/top`**      | View the top 5 YASQ players           | `DATABASE_PATH` set | None                                                           |
| **`/rank`**     | View your YASQ rank                   | `DATABASE_PATH` set | `player` (User, Optional): Check another player's rank         |
| **`/play`**     | Play your favourite YASQ track        | None                | `track` (String, Required): Search by track title or game name |
| **`/playlist`** | Play your favourite YASQ playlist     | None                | `name` (String, Required): Search by playlist                  |
| **`/skip`**     | Skip current track on YASQ playlist   | None                | None                                                           |
| **`/leave`**    | Kick the bot out of the voice channel | None                | None                                                           |

This also allows players to launch the activity directly from the chat interface via an Entry Point Command.

#### Database (Optional)

A local database can be set up to persist leaderboard data. For this, you need to set a local environment variable in your `.env` file:

```dotenv
DATABASE_PATH=<Relative path to quiz database file> (must end with `.db`)
```

The database file will be stored in `server/data/db/<DATABASE_PATH>`.

Alternatively, you can keep the data in memory by setting:

```dotenv
DATABASE_PATH=:memory:
```

Once the database is set up, the activity will write the final results to the database after every game, allowing users to query historic data via the bot.

## Authors

- **Yannick Adler** - [GitHub Profile](https://github.com/yadler97)
- **Johannes Riedmann** - [GitHub Profile](https://github.com/RiediJohannes)

### Special Thanks

A huge thanks to my beta testers for helping me break the game so I could actually fix it:

- Deniz
- Josch
- Matthi
- Noel
