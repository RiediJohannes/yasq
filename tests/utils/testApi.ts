import { GamePhase, Joker, Playback, TEST_PREFIX } from '@yasq/shared';
import { Player } from './helper';
import { AuthenticationResult, BackendApiFacade } from '@yasq/client/src/backend/apiFacade';

export interface TestGameState {
  phase: GamePhase;
  game?: number;
  round?: number;
  playback?: Playback | null;
}

const MINIMAL_TEST_AUTH = {
  access_token: 'test_token',
  user: {
    id: 'test_user_id',
    username: 'TestUser',
  },
  expires: 'never',
} as AuthenticationResult;

/**
 * Subclass of {@link BackendApiFacade} with additional request methods for imperatively modifying the current game state,
 * provided that the server component is running in **mock mode**.
 */
export class TestBackendApi extends BackendApiFacade {
  constructor(instanceId: string, auth?: AuthenticationResult) {
    super(instanceId, auth ?? MINIMAL_TEST_AUTH);
  }

  async setupSession(players: Player[], state: TestGameState, extraData = {}) {
    return BackendApiFacade.apiFetch(`/${TEST_PREFIX}/instance/${this.instanceId}`, {
      method: 'POST',
      body: {
        ...extraData,
        instanceId: this.instanceId,
        registeredUsers: players,
        hostId: players[0].id,
        state,
      },
    });
  }

  async deleteSession() {
    return BackendApiFacade.apiFetch(`/${TEST_PREFIX}/instance/${this.instanceId}`, {
      method: 'DELETE',
    });
  }

  async setReady(player: Player, isReady: boolean) {
    return BackendApiFacade.apiFetch(`/instance/${this.instanceId}/ready`, {
      method: 'PATCH',
      token: `token_${player.id}`,
      body: { ready: isReady },
    });
  }

  async startPlayback(startTime: number, endTime: number, game = 1, round = 1) {
    return BackendApiFacade.apiFetch(`/${TEST_PREFIX}/instance/${this.instanceId}`, {
      method: 'PATCH',
      token: 'token_0', // 0 = hostId
      body: {
        state: { playback: { game, round, startTime, endTime } },
      },
    });
  }

  async submitGuessAs(playerId: string, guess: string) {
    return BackendApiFacade.apiFetch(`/instance/${this.instanceId}/guesses`, {
      method: 'POST',
      token: `token_${playerId}`,
      body: { guess, clientTimestamp: Date.now() },
    });
  }

  async patchLeaderboard(entries: { userId: string; roundHistory: any[] }[]) {
    return BackendApiFacade.apiFetch(`/${TEST_PREFIX}/instance/${this.instanceId}`, {
      method: 'PATCH',
      body: { leaderboard: { entries } },
    });
  }

  async patchEnabledJokers(jokers: Joker[]) {
    return BackendApiFacade.apiFetch(`/${TEST_PREFIX}/instance/${this.instanceId}`, {
      method: 'PATCH',
      body: { settings: { enabledJokers: [...jokers] } },
    });
  }
}
