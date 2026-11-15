import { useState } from 'preact/hooks';

import type { Playlist, Track } from '@yasq/shared';

interface PlaylistListProps {
  playlists: { playlist: Playlist; originalIndex: number }[];
  tracks: Track[];
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onNavigate: (url: string, returnPage?: number) => void;
  onDelete: (absoluteIndex: number) => void;
  onPlayTrack: (track: Track) => void;
  activeTrack: Track | null;
  isPlaying: boolean;
  hasActiveFilters: boolean;
  getPageNumbers: (current: number, total: number) => (number | string)[];
}

export function PlaylistList({
  playlists,
  tracks,
  currentPage,
  totalPages,
  pageSize,
  onPageSizeChange,
  onNavigate,
  onDelete,
  onPlayTrack,
  activeTrack,
  isPlaying,
  hasActiveFilters,
  getPageNumbers,
}: PlaylistListProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const [sortBy, setSortBy] = useState<'name' | 'original'>('original');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Sort playlists before pagination
  const sortedPlaylists = [...playlists].sort((a, b) => {
    if (sortBy === 'name') {
      const cmp = a.playlist.name.localeCompare(b.playlist.name);
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    return sortOrder === 'asc' ? a.originalIndex - b.originalIndex : b.originalIndex - a.originalIndex;
  });

  const paginatedPlaylists = sortedPlaylists.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleExpand = (absoluteIndex: number) => {
    setExpandedIndex(expandedIndex === absoluteIndex ? null : absoluteIndex);
  };

  return (
    <>
      <div className="tab-actions">
        <button
          onClick={() => onNavigate('/playlists/new', currentPage)}
          className="primary-btn"
        >
          + Add Playlist
        </button>

        <div className="tab-controls-group">
          <span className="track-count-info">{playlists.length} playlists found</span>
          <div className="sort-selector">
            <label htmlFor="sort-select">Sort by:</label>
            <select
              id="sort-select"
              value={`${sortBy}-${sortOrder}`}
              onChange={e => {
                const [newSortBy, newSortOrder] = (e.currentTarget as HTMLSelectElement).value.split('-') as [
                  'name' | 'original',
                  'asc' | 'desc',
                ];
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
                // Reset page to 1 on sort change so the user sees the newly sorted top items
                onNavigate('/playlists?page=1');
              }}
            >
              <option value="original-asc">Default (Oldest-Newest)</option>
              <option value="original-desc">Default (Newest-Oldest)</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
            </select>
          </div>

          <div className="page-size-selector">
            <label htmlFor="page-size-select">Per page:</label>
            <select
              id="page-size-select"
              value={pageSize}
              onChange={e => onPageSizeChange(Number((e.target as HTMLSelectElement).value))}
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
        {playlists.length === 0 ? (
          <p>{hasActiveFilters ? 'No playlists match the selected filters.' : 'No playlists saved yet.'}</p>
        ) : (
          paginatedPlaylists.map(({ playlist, originalIndex }) => {
            const isExpanded = expandedIndex === originalIndex;

            return (
              <div
                key={originalIndex}
                className="card playlist-card"
              >
                <div className="playlist-card-header">
                  <div className="track-info">
                    <p>
                      <strong>{playlist.name}</strong>
                    </p>
                    <p>
                      <i>{playlist.tracks.length} tracks included</i>
                    </p>
                  </div>
                  <div className="card-actions">
                    <button
                      onClick={() => toggleExpand(originalIndex)}
                      className="secondary-btn"
                    >
                      <span>{isExpanded ? 'Hide Tracks ' : 'View Tracks '}</span>
                      <span className={`arrow-indicator ${isExpanded ? 'open' : ''}`} />
                    </button>
                    <button
                      onClick={() => onNavigate(`/playlists/${originalIndex}/edit`, currentPage)}
                      className="secondary-btn"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(originalIndex)}
                      className="danger-btn"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="playlist-tracks-dropdown">
                    {playlist.tracks.length === 0 ? (
                      <p className="empty-text">No tracks in this playlist.</p>
                    ) : (
                      <ul className="playlist-tracks-list">
                        {playlist.tracks.map((audioFilename, tIdx) => {
                          const matchedTrack = tracks.find(t => t.audio === audioFilename);
                          const isThisPlaying = activeTrack?.audio === matchedTrack?.audio && isPlaying;

                          return (
                            <li
                              key={tIdx}
                              className="card"
                            >
                              {matchedTrack ? (
                                <>
                                  <img
                                    loading="lazy"
                                    src={matchedTrack.cover ? `/covers/${matchedTrack.cover}` : '/default.svg'}
                                    alt={`Cover of ${matchedTrack.game}`}
                                    onError={e => {
                                      (e.currentTarget as HTMLImageElement).src = '/default.svg';
                                    }}
                                  />
                                  <div className="track-info">
                                    <p>
                                      <strong>{matchedTrack.game}</strong>
                                    </p>
                                    <p>
                                      <i>{matchedTrack.title}</i>
                                    </p>
                                  </div>
                                  {matchedTrack && (
                                    <button
                                      onClick={() => onPlayTrack(matchedTrack)}
                                      className="secondary-btn"
                                    >
                                      {isThisPlaying ? '⏸ Pause' : '▶ Play'}
                                    </button>
                                  )}
                                </>
                              ) : (
                                <i>{audioFilename} (Unknown track)</i>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="secondary-btn"
              disabled={currentPage === 1}
              onClick={() => onNavigate(`/playlists?page=${currentPage - 1}`)}
            >
              ← Prev
            </button>

            <div className="page-numbers">
              {getPageNumbers(currentPage, totalPages).map((page, index) =>
                typeof page === 'number' ? (
                  <button
                    key={index}
                    className={`secondary-btn page-btn ${currentPage === page ? 'active' : ''}`}
                    onClick={() => onNavigate(`/playlists?page=${page}`)}
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
              onClick={() => onNavigate(`/playlists?page=${currentPage + 1}`)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
