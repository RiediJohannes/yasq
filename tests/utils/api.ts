import { Joker } from '@yasq/shared';
import { setBaseUrl } from '../../client/src/utils/backend';
import { Player } from './helper';

export class TestApi {
  private baseUrl: string;
  private instanceId: string;

  constructor(baseUrl: string, instanceId: string, isIntegration: boolean = false) {
    this.baseUrl = baseUrl;
    this.instanceId = instanceId;

    if (isIntegration) setBaseUrl(baseUrl);
  }

  private async http(method: string, path: string, options: { data?: any; headers?: any } = {}) {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...(options.data && { body: JSON.stringify(options.data) })
    });
  }

  async setupSession(players: Player[], state: string, extraData = {}) {
    return this.http('POST', '/api/test/setup-session', {
      data: {
        instanceId: this.instanceId,
        registeredUsers: players,
        hostId: players[0].id,
        state,
        ...extraData
      }
    });
  }

  async deleteSession() {
    return this.http('DELETE', `/api/test/instance/${this.instanceId}`);
  }

  async setReady(player: Player, isReady: boolean) {
    return this.http('POST', '/api/ready', {
      data: { instanceId: this.instanceId, ready: isReady },
      headers: { 'Authorization': `Bearer token_${player.id}` }
    });
  }

  async submitGuess(playerId: string, guess: string) {
    return this.http('POST', '/api/submit-guess', {
      data: { instanceId: this.instanceId, guess },
      headers: { 'Authorization': `Bearer token_${playerId}` }
    });
  }

  async patchLeaderboard(entries: { userId: string; roundHistory: any[] }[]) {
    return this.http('PATCH', `/api/test/instance/${this.instanceId}`, {
      data: { leaderboard: { entries } }
    });
  }

  async patchEnabledJokers(jokers: Joker[]) {
    return this.http('PATCH', `/api/test/instance/${this.instanceId}`, {
      data: { settings: { enabledJokers: jokers } }
    });
  }
}