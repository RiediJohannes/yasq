import { useState } from 'preact/hooks';

import type { Track } from '@yasq/shared';

import type { DiscordUser, PermissionRule } from '../types';

interface PermissionsListProps {
  permissions: { rule: PermissionRule; originalIndex: number }[];
  tracks: Track[];
  userProfiles: Record<string, DiscordUser>;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onNavigate: (url: string, returnPage?: number) => void;
  onDelete: (index: number) => void;
  onPlayTrack: (track: Track) => void;
  activeTrack: Track | null;
  isPlaying: boolean;
  getPageNumbers: (current: number, total: number) => (number | string)[];
  hasActiveFilters: boolean;
}

export function PermissionsList({
  permissions,
  tracks,
  userProfiles,
  currentPage,
  totalPages,
  pageSize,
  onPageSizeChange,
  onNavigate,
  onDelete,
  onPlayTrack,
  activeTrack,
  isPlaying,
  getPageNumbers,
  hasActiveFilters,
}: PermissionsListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const pagePermissions = permissions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const tracksByAudio = new Map(tracks.map(track => [track.audio, track]));

  return (
    <>
      <div className="tab-actions">
        <button
          type="button"
          onClick={() => onNavigate('/permissions/new', currentPage)}
          className="primary-btn"
        >
          + Add Permission
        </button>

        <div className="tab-controls-group">
          <span className="track-count-info">{permissions.length} rules found</span>
          <div className="page-size-selector">
            <label htmlFor="permission-page-size">Per page:</label>
            <select
              id="permission-page-size"
              value={pageSize}
              onChange={event => onPageSizeChange(Number((event.target as HTMLSelectElement).value))}
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      <div className="playlists-container">
        {permissions.length === 0 ? (
          <p>
            {hasActiveFilters ? 'No permission rules match the selected filters.' : 'No permission rules configured.'}
          </p>
        ) : (
          pagePermissions.map(({ rule, originalIndex }) => {
            const isExpanded = expandedIndex === originalIndex;

            return (
              <div
                key={originalIndex}
                className="card permission-rule-card"
              >
                <div className="permission-rule-header">
                  <span className={`permission-rule-type ${rule.type}`}>{rule.type}</span>
                  <div className="card-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => onNavigate(`/permissions/${originalIndex}/edit`, currentPage)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => onDelete(originalIndex)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="permission-rule-detail">
                  <strong>Users</strong>
                  <ul className="permission-rule-users">
                    {rule.userIds.map(userId => {
                      const user = userProfiles[userId];
                      return (
                        <li
                          key={userId}
                          className="permission-rule-user"
                        >
                          {user ? (
                            <img
                              src={user.avatarUrl}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span
                              className="permission-rule-user-avatar-fallback"
                              aria-hidden="true"
                            >
                              ?
                            </span>
                          )}
                          <span>
                            <strong>{user?.displayName || 'Unknown Discord user'}</strong>
                            <small>{user ? `@${user.username} · ${userId}` : userId}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="permission-rule-detail">
                  <strong>Tracks</strong>
                  <div>
                    <div className="permission-rule-tracks-header">
                      <span>{rule.files.length} tracks included</span>
                      <button
                        type="button"
                        onClick={() => setExpandedIndex(isExpanded ? null : originalIndex)}
                        className="secondary-btn"
                        aria-expanded={isExpanded}
                      >
                        <span>{isExpanded ? 'Hide Tracks ' : 'View Tracks '}</span>
                        <span className={`arrow-indicator ${isExpanded ? 'open' : ''}`} />
                      </button>
                    </div>
                    {isExpanded && (
                      <ul className="permission-rule-files">
                        {rule.files.map(file => {
                          const track = tracksByAudio.get(file);
                          const isThisPlaying = Boolean(track && activeTrack?.audio === track.audio && isPlaying);

                          return (
                            <li
                              key={file}
                              className="permission-rule-file"
                            >
                              <img
                                className="permission-rule-file-cover"
                                src={track?.cover ? `/covers/${track.cover}` : '/default.svg'}
                                alt=""
                                loading="lazy"
                                onError={event => {
                                  event.currentTarget.src = '/default.svg';
                                }}
                              />
                              <span className="permission-rule-file-info">
                                <span>
                                  <strong>{track?.game ?? 'Unknown track'}</strong>
                                  {track && ` — ${track.title}`}
                                </span>
                                <small>{file}</small>
                              </span>
                              {track && (
                                <button
                                  type="button"
                                  onClick={() => onPlayTrack(track)}
                                  className="secondary-btn"
                                >
                                  {isThisPlaying ? '⏸ Pause' : '▶ Play'}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="secondary-btn"
              disabled={currentPage === 1}
              onClick={() => onNavigate(`/permissions?page=${currentPage - 1}`)}
            >
              ← Prev
            </button>
            <div className="page-numbers">
              {getPageNumbers(currentPage, totalPages).map((page, index) =>
                typeof page === 'number' ? (
                  <button
                    key={index}
                    className={`secondary-btn page-btn ${currentPage === page ? 'active' : ''}`}
                    onClick={() => onNavigate(`/permissions?page=${page}`)}
                  >
                    {page}
                  </button>
                ) : (
                  <span
                    key={index}
                    className="page-dots"
                  >
                    {page}
                  </span>
                )
              )}
            </div>
            <button
              className="secondary-btn"
              disabled={currentPage === totalPages}
              onClick={() => onNavigate(`/permissions?page=${currentPage + 1}`)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
