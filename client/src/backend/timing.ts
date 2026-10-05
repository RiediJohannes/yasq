import { emitGameEvent, socketConnected } from './connections';
import { GameEvent } from '@yasq/shared';

let serverClockOffset = 0; // (Server Time - Client Time) in milliseconds
let latency = 0; // One-way communication delay to server in milliseconds

/**
 * Returns the current timestamp synchronized with the server clock.
 */
export const getSyncedServerTime = (): number => {
  return Date.now() + serverClockOffset;
};

/**
 * Measures the offset of the client's device clock to the server's internal clock (accounting for both clock inaccuracy
 * and network latency) in order to calculate a server-synced current time.
 * **Hint:** Use {@link getSyncedServerTime} to obtain the server-synced time.
 */
export const syncClockWithServer = async (sampleCount = 8): Promise<number> => {
  if (!socketConnected.value) return serverClockOffset;

  const samples: Array<{ clientOffset: number; roundTripTime: number }> = [];

  // Cristian's Algorithm (https://en.wikipedia.org/wiki/Cristian%27s_algorithm)
  for (let i = 0; i < sampleCount && socketConnected.value; i++) {
    await new Promise<void>(resolve => {
      const sendTime = Date.now();

      emitGameEvent(GameEvent.REQUEST_TIME, (serverTime: number) => {
        const receiveTime = Date.now();
        const roundTripTime = receiveTime - sendTime;

        const estimatedServerTimeAtReceive = serverTime + roundTripTime / 2;
        const offset = estimatedServerTimeAtReceive - receiveTime;

        samples.push({ clientOffset: offset, roundTripTime });
        resolve();
      });
    });

    // Small delay between sampling pings
    if (i < sampleCount - 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Sort by round-trip time (ascending)
  samples.sort((a, b) => a.roundTripTime - b.roundTripTime);

  // Use offset from the fastest packet exchange
  serverClockOffset = samples[0]!.clientOffset;
  latency = samples[0]!.roundTripTime / 2;
  console.log(`[TimeSync] Clock synced. Offset: ${serverClockOffset.toFixed(2)}ms, latency: ${latency}ms)`);

  emitGameEvent(GameEvent.TIME_SYNCED, -serverClockOffset, latency);

  return serverClockOffset;
};
