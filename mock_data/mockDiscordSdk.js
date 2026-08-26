export const mockDiscordSdk = {
  instanceId: window.__MOCK_INSTANCE_ID__ || '123456789',
  guildId: '',
  // Mocking the ready promise
  ready: () => Promise.resolve(),

  // Mocking the subscribe/unsubscribe system
  subscribe: (_event, _callback) => {},
  unsubscribe: (_event, _callback) => {},

  commands: {
    // Mock Authorize
    authorize: async () => ({ code: 'mock_code' }),

    // Mock Authenticate
    authenticate: async () => ({
      access_token: `token_${window.__MOCK_USER_ID__ || '0'}`,
      user: {
        id: window.__MOCK_USER_ID__ || '0',
        username: window.__MOCK_USER_NAME__ || 'MockPlayer1',
        avatar: null,
      },
      scopes: ['identify', 'guilds'],
      expires: 'never',
      application: { id: 'mock_app_id' },
    }),

    // Mock Participants
    getInstanceConnectedParticipants: async () => ({
      participants: window.__MOCK_PARTICIPANTS__ || [
        { id: '0', username: 'MockPlayer1' },
        { id: '1', username: 'MockPlayer2' },
        { id: '2', username: 'MockPlayer3' },
        { id: '3', username: 'MockPlayer4' },
      ],
    }),
  },
};
