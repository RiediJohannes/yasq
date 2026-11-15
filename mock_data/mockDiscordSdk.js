function getActiveMockUser() {
  const urlParams = new window.URLSearchParams(window.location.search);
  const urlUserId = urlParams.get('user_id');
  const urlUserName = urlParams.get('user_name');

  const id = window.__MOCK_USER_ID__ || urlUserId || '0';
  const username = window.__MOCK_USER_NAME__ || urlUserName || `MockPlayer${id}`;
  return { id, username };
}

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
    authenticate: async () => {
      const user = getActiveMockUser();
      return {
        access_token: `token_${user.id}`,
        user: {
          id: user.id,
          username: user.username,
          avatar: null,
        },
        scopes: ['identify', 'guilds'],
        expires: 'never',
        application: { id: 'mock_app_id' },
      };
    },

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

    // Mock Opening Invite Dialog
    openInviteDialog: async () => ({}),

    // Mock Get Channel Permissions
    getChannelPermissions: async () => {
      const hasPermission = window.__MOCK_CAN_INVITE__ ?? true;

      if (!hasPermission) {
        throw { code: 4006, message: 'No invite permissions for mock channel' };
      }

      return {
        permissions: window.__MOCK_PERMISSIONS__ || '1n',
      };
    },
  },
};
