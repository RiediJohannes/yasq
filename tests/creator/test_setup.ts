import { expect, test as base } from '@playwright/test';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { PermissionsPage } from './pages/PermissionsPage';
import { PlaylistPage } from './pages/PlaylistPage';
import { SettingsPage } from './pages/SettingsPage';
import { TrackPage } from './pages/TrackPage';

const testDataDirectory = resolve(process.cwd(), 'tests/creator/data');
const fixturesDirectory = resolve(process.cwd(), 'tests/creator/fixtures');

type CreatorFixtures = {
  creatorData: void;
  creatorDataFixture: string | undefined;
  trackPage: TrackPage;
  playlistPage: PlaylistPage;
  permissionsPage: PermissionsPage;
  settingsPage: SettingsPage;
};

async function emptyTestDataDirectory() {
  await rm(testDataDirectory, { recursive: true, force: true });
  await mkdir(testDataDirectory, { recursive: true });
}

export const test = base.extend<CreatorFixtures>({
  creatorDataFixture: [undefined, { option: true }],
  creatorData: [
    async ({ creatorDataFixture }, use) => {
      await emptyTestDataDirectory();
      try {
        if (creatorDataFixture) {
          const fixtureDirectory = resolve(fixturesDirectory, creatorDataFixture);
          const fixturePath = relative(fixturesDirectory, fixtureDirectory);
          if (fixturePath.startsWith('..') || isAbsolute(fixturePath)) {
            throw new Error(`Creator data fixture must be inside tests/creator/fixtures: ${creatorDataFixture}`);
          }

          const fixtureStats = await stat(fixtureDirectory);
          if (!fixtureStats.isDirectory()) {
            throw new Error(`Creator data fixture is not a directory: ${creatorDataFixture}`);
          }
          await cp(fixtureDirectory, testDataDirectory, { recursive: true });
        }

        await use();
      } finally {
        await emptyTestDataDirectory();
      }
    },
    { auto: true },
  ],
  trackPage: async ({ page }, use) => use(new TrackPage(page)),
  playlistPage: async ({ page }, use) => use(new PlaylistPage(page)),
  permissionsPage: async ({ page }, use) => use(new PermissionsPage(page)),
  settingsPage: async ({ page }, use) => use(new SettingsPage(page)),
});

export { expect };
