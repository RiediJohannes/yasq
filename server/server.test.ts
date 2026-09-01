import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HttpServer } from 'http';
import { setupServer, validateDataSource } from './server.js';
import fs from 'fs';
import path from 'path';
import { STATIC_FILES_DIR } from '@yasq/shared';

async function queryServer(server: HttpServer, query: string): Promise<Response> {
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const requestUri = new URL(query, `http://localhost:${port}`);
  return await fetch(requestUri);
}

describe('DATA_SOURCE Validation', () => {
  const DATA_ROOT = path.join(process.cwd(), STATIC_FILES_DIR);

  let exitSpy: ReturnType<typeof vi.spyOn>;
  let activeServer: HttpServer | null = null;
  let tempDataDir: string | null = null;

  beforeEach(() => {
    // Prevent process.exit from killing the Vitest process, throw an artificial error instead
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
      throw new Error(`PROCESS_EXIT_${code}`);
    });

    // Suppress console.error output during intentional failure tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (activeServer) {
      activeServer.close();
      activeServer = null;
    }
    if (tempDataDir && fs.existsSync(tempDataDir)) {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should setup server with sample resource if DATA_SOURCE is not set', async () => {
    expect(() => {
      activeServer = setupServer();
    }).not.toThrow();

    expect(activeServer).toBeDefined();
    expect(exitSpy).not.toHaveBeenCalled();

    const response = await queryServer(activeServer!, '/music/track001.mp3');
    expect(response.status).toBe(200);
  });

  it('should setup server with static resources from DATA_SOURCE', async () => {
    const dataSourceValue = 'testDir';
    vi.stubEnv('DATA_SOURCE', dataSourceValue);

    const testDirPath: string = path.join(DATA_ROOT, dataSourceValue);
    const musicDirPath = path.join(testDirPath, 'music');

    // Ensure the test does not erase an existing directory
    expect(fs.existsSync(testDirPath)).toBe(false);
    fs.mkdirSync(musicDirPath, { recursive: true });

    try {
      // Create a minimal set of test files for successful server startup
      const testTrack = 'test_track.mp3';
      fs.writeFileSync(path.join(testDirPath, 'tracks.json'), JSON.stringify([]));

      const audioFilePath = path.join(musicDirPath, testTrack);
      const mockAudioContent = 'MOCK_AUDIO_BUFFER_DATA';
      fs.writeFileSync(audioFilePath, mockAudioContent);

      expect(fs.existsSync(testDirPath)).toBe(true);
      expect(fs.existsSync(audioFilePath)).toBe(true);

      // Start the server
      expect(() => {
        activeServer = setupServer();
      }).not.toThrow();

      expect(activeServer).toBeDefined();
      expect(exitSpy).not.toHaveBeenCalled();

      // Verify correct file serving
      const response = await queryServer(activeServer!, `/music/${testTrack}`);
      expect(response.status).toBe(200);

      const fileText = await response.text();
      expect(fileText).toBe(mockAudioContent);
    } finally {
      // Clean up generated test files
      if (fs.existsSync(testDirPath)) {
        fs.rmSync(testDirPath, { recursive: true, force: true });
      }
    }
  });

  it('should auto-fallback to the only existing subdirectory in dataRoot if DATA_SOURCE is unset', () => {
    delete process.env.DATA_SOURCE;
    const quizDirName = 'only_subdir';

    // Create a fake data root folder
    tempDataDir = fs.mkdtempSync('server-test-fallback-');
    const singleSubdir = path.join(tempDataDir, quizDirName);
    fs.mkdirSync(singleSubdir);
    fs.writeFileSync(path.join(singleSubdir, 'tracks.json'), JSON.stringify([]));

    expect(fs.existsSync(singleSubdir)).toBe(true);

    // Run validation against the temporary data directory
    const result = validateDataSource('', tempDataDir);
    expect(process.env.DATA_SOURCE).toBe(quizDirName);
    expect(result).toBe(singleSubdir);

    // No auto-fallback when DATA_SOURCE is explicitly set
    vi.stubEnv('DATA_SOURCE', 'imaginary_dir');
    expect(() => validateDataSource('', tempDataDir!)).toThrow('PROCESS_EXIT_12');
  });

  it('should forbid absolute paths for DATA_SOURCE', () => {
    vi.stubEnv('DATA_SOURCE', '/etc/forbidden');
    expect(() => setupServer()).toThrow('PROCESS_EXIT_10');

    vi.stubEnv('DATA_SOURCE', 'C:/forbidden');
    expect(() => setupServer()).toThrow('PROCESS_EXIT_10');
  });

  it('should prevent DATA_SOURCE from escaping the data root directory', () => {
    vi.stubEnv('DATA_SOURCE', '../');
    expect(() => setupServer()).toThrow('PROCESS_EXIT_11');

    vi.stubEnv('DATA_SOURCE', 'one/two/../../../');
    expect(() => setupServer()).toThrow('PROCESS_EXIT_11');
  });

  it('should abort server startup when DATA_SOURCE is not an existing directory', () => {
    // DATA_SOURCE does not exist
    vi.stubEnv('DATA_SOURCE', 'imaginary_dir');
    expect(() => setupServer()).toThrow('PROCESS_EXIT_12');

    // DATA_SOURCE is not a directory
    vi.stubEnv('DATA_SOURCE', 'sample/tracks.json');
    expect(() => setupServer()).toThrow('PROCESS_EXIT_13');
  });
});
