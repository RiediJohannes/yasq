export interface PermissionRule {
  type: 'whitelist' | 'blacklist';
  userIds: string[];
  files: string[];
}

export interface DiscordUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}
