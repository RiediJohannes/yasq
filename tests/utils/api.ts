import { API_ROOT, GamePhase, Joker, Playback, TEST_PREFIX } from '@yasq/shared';
import { setBaseUrl } from '../../client/src/utils/backend';
import { Player } from './helper';

export interface TestGameState {
  phase: GamePhase;
  game?: number;
  round?: number;
  playback?: Playback | null;
}

export class TestApi {
  private readonly baseUrl: string;
  private readonly instanceId: string;

  constructor(baseUrl: string, instanceId: string, isIntegration: boolean = false) {
    this.baseUrl = baseUrl;
    this.instanceId = instanceId;

    if (isIntegration) setBaseUrl(baseUrl);
  }

  private async http(method: string, path: string, options: { data?: any; headers?: any } = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...(options.data && { body: JSON.stringify(options.data) }),
    });
  }

  async setupSession(players: Player[], state: TestGameState, extraData = {}) {
    return this.http('POST', `/${API_ROOT}/${TEST_PREFIX}/instance/${this.instanceId}`, {
      data: {
        ...extraData,
        instanceId: this.instanceId,
        registeredUsers: players,
        hostId: players[0].id,
        state: state,
      },
    });
  }

  async deleteSession() {
    return this.http('DELETE', `/${API_ROOT}/${TEST_PREFIX}/instance/${this.instanceId}`);
  }

  async setReady(player: Player, isReady: boolean) {
    return this.http('PATCH', `/${API_ROOT}/instance/${this.instanceId}/ready`, {
      data: {
        ready: isReady,
      },
      headers: {
        Authorization: `Bearer token_${player.id}`,
      },
    });
  }

  async startPlayback(startTime: number, endTime: number, game: number = 1, round: number = 1) {
    return this.http('PATCH', `/${API_ROOT}/${TEST_PREFIX}/instance/${this.instanceId}`, {
      data: {
        state: {
          playback: {
            game,
            round,
            startTime,
            endTime,
          },
        },
      },
      headers: {
        Authorization: `Bearer token_${0}`, // 0 = hostID
      },
    });
  }

  async submitGuess(playerId: string, guess: string) {
    return this.http('POST', `/${API_ROOT}/instance/${this.instanceId}/guesses`, {
      data: {
        guess,
        clientTimestamp: Date.now(),
      },
      headers: {
        Authorization: `Bearer token_${playerId}`,
      },
    });
  }

  async patchLeaderboard(entries: { userId: string; roundHistory: any[] }[]) {
    return this.http('PATCH', `/${API_ROOT}/${TEST_PREFIX}/instance/${this.instanceId}`, {
      data: {
        leaderboard: { entries },
      },
    });
  }

  async patchEnabledJokers(jokers: Joker[]) {
    return this.http('PATCH', `/${API_ROOT}/${TEST_PREFIX}/instance/${this.instanceId}`, {
      data: {
        settings: {
          enabledJokers: [...jokers],
        },
      },
    });
  }
}
