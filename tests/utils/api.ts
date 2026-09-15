import { API_ROOT, GameState, Joker, TEST_PREFIX } from '@yasq/shared';
import { setBaseUrl } from '../../client/src/utils/backend';
import { Player } from './helper';

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

  async setupSession(players: Player[], state: GameState, extraData = {}) {
    return this.http('POST', `/${API_ROOT}/${TEST_PREFIX}/instance/${this.instanceId}`, {
      data: {
        ...extraData,
        instanceId: this.instanceId,
        registeredUsers: players,
        hostId: players[0].id,
        state,
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
