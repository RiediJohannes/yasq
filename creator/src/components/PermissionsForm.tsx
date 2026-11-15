import { useEffect, useState } from 'preact/hooks';

import type { Track } from '@yasq/shared';

import type { DiscordUser, PermissionRule } from '../types';

interface DiscordGuild {
  id: string;
  name: string;
}

interface PermissionsFormProps {
  isEditing: boolean;
  indexedRule?: { rule: PermissionRule; originalIndex: number };
  tracks: Track[];
  onSuccess: () => Promise<void>;
  onCancel: () => void;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status}).`);
  }
  return result as T;
}

export function PermissionsForm({ isEditing, indexedRule, tracks, onSuccess, onCancel }: PermissionsFormProps) {
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [guildId, setGuildId] = useState('');
  const [users, setUsers] = useState<DiscordUser[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [trackQuery, setTrackQuery] = useState('');
  const [ruleType, setRuleType] = useState<PermissionRule['type']>('whitelist');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [manualUserId, setManualUserId] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isLoadingGuilds, setIsLoadingGuilds] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadGuilds = async () => {
      try {
        setGuilds(await fetchJson<DiscordGuild[]>('/api/discord-guilds'));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load Discord servers.');
      } finally {
        setIsLoadingGuilds(false);
      }
    };

    void loadGuilds();
  }, []);

  useEffect(() => {
    setRuleType(indexedRule?.rule.type ?? 'whitelist');
    setSelectedUserIds(indexedRule?.rule.userIds ?? []);
    setSelectedFiles(indexedRule?.rule.files ?? []);
  }, [isEditing, indexedRule?.originalIndex, indexedRule?.rule]);

  const selectGuild = async (id: string) => {
    setGuildId(id);
    setUsers([]);
    setError('');
    if (!id) return;

    setIsLoadingMembers(true);
    try {
      const params = new URLSearchParams({ guildId: id });
      setUsers(await fetchJson<DiscordUser[]>(`/api/discord-users?${params}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load server members.');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const submitRule = async (event: Event) => {
    event.preventDefault();
    if (selectedUserIds.length === 0 || selectedFiles.length === 0) {
      setError('Select at least one user and one track file for the rule.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const rule: PermissionRule = {
        type: ruleType,
        userIds: selectedUserIds,
        files: selectedFiles,
      };
      const index = indexedRule?.originalIndex;
      if (isEditing && index === undefined) {
        throw new Error('Permission rule no longer exists.');
      }

      const response = await fetch(isEditing ? `/api/permissions/${index}` : '/api/permissions', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || `Failed to save permission rule (${response.status}).`);
      }

      await onSuccess();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save permission rule.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredUsers = users.filter(user =>
    `${user.displayName} ${user.username} ${user.id}`.toLowerCase().includes(userQuery.toLowerCase())
  );
  const filteredTracks = tracks.filter(track =>
    `${track.game} ${track.title} ${track.audio}`.toLowerCase().includes(trackQuery.toLowerCase())
  );
  const manualUserIds = selectedUserIds.filter(userId => !users.some(user => user.id === userId));
  const showManualUserIdInput = !guildId || guilds.length === 0 || (!isLoadingMembers && users.length === 0);

  const toggleUser = (userId: string) => {
    setSelectedUserIds(current =>
      current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId]
    );
  };

  const addManualUserId = () => {
    const userId = manualUserId.trim();
    if (!userId) return;

    setSelectedUserIds(current => (current.includes(userId) ? current : [...current, userId]));
    setManualUserId('');
  };

  const toggleTrack = (audio: string) => {
    setSelectedFiles(current =>
      current.includes(audio) ? current.filter(file => file !== audio) : [...current, audio]
    );
  };

  return (
    <>
      <div className="tab-actions">
        <button
          type="button"
          onClick={onCancel}
          className="secondary-btn"
        >
          ← Back to Permissions
        </button>
      </div>

      <form
        className="card creator-form"
        onSubmit={submitRule}
      >
        <h3>{isEditing ? 'Edit Permission Rule' : 'Add Permission Rule'}</h3>

        <div className="field">
          <label htmlFor="permission-guild">Discord Server</label>
          <select
            id="permission-guild"
            value={guildId}
            disabled={isLoadingGuilds || guilds.length === 0}
            onChange={event => void selectGuild((event.target as HTMLSelectElement).value)}
          >
            <option value="">
              {isLoadingGuilds ? 'Loading servers...' : guilds.length ? 'Select a server' : 'No servers available'}
            </option>
            {guilds.map(guild => (
              <option
                key={guild.id}
                value={guild.id}
              >
                {guild.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="permission-type">Rule Type</label>
          <select
            id="permission-type"
            value={ruleType}
            onChange={event => setRuleType((event.target as HTMLSelectElement).value as PermissionRule['type'])}
          >
            <option value="whitelist">Whitelist</option>
            <option value="blacklist">Blacklist</option>
          </select>
        </div>

        <div className="field">
          <div className="tag-filter-header">
            <label htmlFor={showManualUserIdInput ? 'permission-manual-user-id' : 'permission-user-search'}>
              Users ({selectedUserIds.length} selected)
            </label>
            {selectedUserIds.length > 0 && (
              <button
                type="button"
                className="secondary-btn"
                aria-label="Clear selected users"
                onClick={() => setSelectedUserIds([])}
              >
                Clear All
              </button>
            )}
          </div>
          <small>
            {isLoadingMembers
              ? 'Loading all server members...'
              : guildId
                ? users.length > 0
                  ? `${users.length} server members loaded.`
                  : 'No server members found. Add user IDs manually.'
                : guilds.length > 0
                  ? 'Select a server to load its members, or add user IDs manually.'
                  : 'No servers available. Add user IDs manually.'}
          </small>
          {!showManualUserIdInput && (
            <>
              <div className="search-input-wrapper">
                <input
                  id="permission-user-search"
                  type="text"
                  placeholder="Search users by name or ID"
                  value={userQuery}
                  disabled={!guildId || isLoadingMembers || users.length === 0}
                  onInput={event => setUserQuery((event.target as HTMLInputElement).value)}
                />
                {userQuery && (
                  <button
                    type="button"
                    className="secondary-btn clear-search-btn"
                    aria-label="Clear user search"
                    onClick={() => setUserQuery('')}
                  >
                    &times;
                  </button>
                )}
              </div>
              <div className="playlist-track-selector">
                {filteredUsers.map(user => (
                  <label
                    key={user.id}
                    className="playlist-track-item"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                    />
                    <span>
                      <strong>{user.displayName}</strong> (@{user.username}) <small>({user.id})</small>
                    </span>
                  </label>
                ))}
                {!isLoadingMembers && guildId && filteredUsers.length === 0 && <small>No matching users.</small>}
              </div>
            </>
          )}
          {showManualUserIdInput && (
            <div className="permission-manual-user-entry">
              <label htmlFor="permission-manual-user-id">Add Discord User ID</label>
              <div className="permission-manual-user-controls">
                <input
                  id="permission-manual-user-id"
                  type="text"
                  value={manualUserId}
                  placeholder="Discord user ID"
                  onInput={event => setManualUserId((event.target as HTMLInputElement).value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addManualUserId();
                    }
                  }}
                />
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={!manualUserId.trim()}
                  onClick={addManualUserId}
                >
                  Add ID
                </button>
              </div>
            </div>
          )}
          {manualUserIds.length > 0 && (
            <ul className="permission-manual-user-list">
              {manualUserIds.map(userId => (
                <li key={userId}>
                  <span>{userId}</span>
                  <button
                    type="button"
                    className="secondary-btn"
                    aria-label={`Remove user ${userId}`}
                    onClick={() => toggleUser(userId)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="field">
          <div className="tag-filter-header">
            <label htmlFor="permission-track-search">Tracks ({selectedFiles.length} selected)</label>
            {selectedFiles.length > 0 && (
              <button
                type="button"
                className="secondary-btn"
                aria-label="Clear selected tracks"
                onClick={() => setSelectedFiles([])}
              >
                Clear All
              </button>
            )}
          </div>
          <div className="search-input-wrapper">
            <input
              id="permission-track-search"
              type="text"
              placeholder="Search tracks by game, title, or filename"
              value={trackQuery}
              disabled={tracks.length === 0}
              onInput={event => setTrackQuery((event.target as HTMLInputElement).value)}
            />
            {trackQuery && (
              <button
                type="button"
                className="secondary-btn clear-search-btn"
                aria-label="Clear track search"
                onClick={() => setTrackQuery('')}
              >
                &times;
              </button>
            )}
          </div>
          <div className="playlist-track-selector">
            {filteredTracks.map((track, index) => (
              <label
                key={`${track.audio}-${index}`}
                className="playlist-track-item"
              >
                <input
                  type="checkbox"
                  checked={selectedFiles.includes(track.audio)}
                  onChange={() => toggleTrack(track.audio)}
                />
                <span>
                  <strong>{track.game}</strong> - {track.title} <small>({track.audio})</small>
                </span>
              </label>
            ))}
            {tracks.length === 0 && <small>Add tracks before creating permission rules.</small>}
            {tracks.length > 0 && filteredTracks.length === 0 && <small>No matching tracks.</small>}
          </div>
        </div>

        {error && <p role="alert">{error}</p>}
        <div className="form-actions">
          <button
            type="submit"
            className="primary-btn"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : isEditing ? 'Update Rule' : 'Add Rule'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
        <small>The bot must be in the server to load its members.</small>
      </form>
    </>
  );
}
