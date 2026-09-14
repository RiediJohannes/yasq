const urlParams = new window.URLSearchParams(window.location.search);
const urlUserId = urlParams.get('user_id');
const urlUserName = urlParams.get('user_name');

const activeUserId = window.__MOCK_USER_ID__ || urlUserId || '0';
const activeUserName = window.__MOCK_USER_NAME__ || urlUserName || `MockPlayer${activeUserId}`;

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
      access_token: `token_${activeUserId}`,
      user: {
        id: activeUserId,
        username: activeUserName,
        avatar: null,
      },
      scopes: ['identify', 'guilds'],
      expires: 'never',
      application: { id: 'mock_app_id' },
    }),

    // Mock Participants
    getInstanceConnectedParticipants: async () => ({
      participants: window.__MOCK_PARTICIPANTS__ || [
        { id: '0', username: 'MockPlayer0' },
        { id: '1', username: 'MockPlayer1' },
        { id: '2', username: 'MockPlayer2' },
        { id: '3', username: 'MockPlayer3' },
      ],
    }),

    // Mock Opening External Links (e.g., downloading results image)
    openExternalLink: async ({ url }) => {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank');
      }
      return { success: true };
    },
  },
};
