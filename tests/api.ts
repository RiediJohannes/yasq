import { APIRequestContext } from '@playwright/test';
import { Player } from './helper';

export class TestApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly instanceId: string
  ) {}

  async setupSession(players: Player[], state: string, extraData = {}) {
    return await this.request.post('http://localhost:3001/api/test/setup-session', {
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
    return await this.request.delete(`http://localhost:3001/api/test/instance/${this.instanceId}`);
  }

  async setReady(player: Player, isReady: boolean) {
    return await this.request.post('http://localhost:3001/api/ready', {
      data: { instanceId: this.instanceId, ready: isReady },
      headers: {
        'Authorization': `Bearer token_${player.id}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async submitGuess(playerId: string, guess: string) {
    return await this.request.post('http://localhost:3001/api/submit-guess', {
      data: { instanceId: this.instanceId, guess },
      headers: {
        'Authorization': `Bearer token_${playerId}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async patchLeaderboard(entries: { userId: string, roundHistory: any[] }[]) {
    return await this.request.patch(`/api/test/instance/${this.instanceId}`, {
      data: {
        leaderboard: { entries }
      }
    });
  }
}