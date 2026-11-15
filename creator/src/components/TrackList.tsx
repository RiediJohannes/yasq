import { useState } from 'preact/hooks';

import type { Track } from '@yasq/shared';

interface TrackListProps {
  tracks: { track: Track; originalIndex: number }[];
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

export function TrackList({
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
}: TrackListProps) {
  const [sortBy, setSortBy] = useState<'title' | 'game' | 'original'>('original');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Sort tracks before pagination
  const sortedTracks = [...tracks].sort((a, b) => {
    if (sortBy === 'title') {
      const cmp = a.track.title.localeCompare(b.track.title);
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    if (sortBy === 'game') {
      const cmp = a.track.game.localeCompare(b.track.game);
      return sortOrder === 'asc' ? cmp : -cmp;
    }
    return sortOrder === 'asc' ? a.originalIndex - b.originalIndex : b.originalIndex - a.originalIndex;
  });

  const paginatedTracks = sortedTracks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <div className="tab-actions">
        <button
          onClick={() => onNavigate('/tracks/new', currentPage)}
          className="primary-btn"
        >
          + Add Track
        </button>

        <div className="tab-controls-group">
          <span className="track-count-info">{tracks.length} tracks found</span>
          <div className="sort-selector">
            <label htmlFor="sort-select">Sort by:</label>
            <select
              id="sort-select"
              value={`${sortBy}-${sortOrder}`}
              onChange={e => {
                const [newSortBy, newSortOrder] = (e.currentTarget as HTMLSelectElement).value.split('-') as [
                  'title' | 'game' | 'original',
                  'asc' | 'desc',
                ];
                setSortBy(newSortBy);
                setSortOrder(newSortOrder);
                // Reset page to 1 on sort change so the user sees the newly sorted top items
                onNavigate('/tracks?page=1');
              }}
            >
              <option value="original-asc">Default (Oldest-Newest)</option>
              <option value="original-desc">Default (Newest-Oldest)</option>
              <option value="game-asc">Game (A-Z)</option>
              <option value="game-desc">Game (Z-A)</option>
              <option value="title-asc">Title (A-Z)</option>
              <option value="title-desc">Title (Z-A)</option>
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

      <div className="tracks-container">
        <div className="tracks-list">
          {tracks.length === 0 ? (
            <p>{hasActiveFilters ? 'No tracks match the selected filters.' : 'No tracks saved yet.'}</p>
          ) : (
            paginatedTracks.map(({ track, originalIndex }) => {
              const isThisPlaying = activeTrack?.audio === track.audio && isPlaying;

              return (
                <div
                  key={originalIndex}
                  className="card"
                >
                  <img
                    loading="lazy"
                    src={track.cover ? `/covers/${track.cover}` : '/default.svg'}
                    alt={`Cover of ${track.game}`}
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).src = '/default.svg';
                    }}
                  />
                  <div className="track-info">
                    <p>
                      <strong>{track.game}</strong>
                    </p>
                    <p>
                      <i>{track.title}</i>
                    </p>
                  </div>
                  <div className="card-actions">
                    <button
                      onClick={() => onPlayTrack(track)}
                      className="secondary-btn"
                    >
                      {isThisPlaying ? '⏸ Pause' : '▶ Play'}
                    </button>
                    <button
                      onClick={() => onNavigate(`/tracks/${originalIndex}/edit`, currentPage)}
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
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="secondary-btn"
              disabled={currentPage === 1}
              onClick={() => onNavigate(`/tracks?page=${currentPage - 1}`)}
            >
              ← Prev
            </button>

            <div className="page-numbers">
              {getPageNumbers(currentPage, totalPages).map((page, index) =>
                typeof page === 'number' ? (
                  <button
                    key={index}
                    className={`secondary-btn page-btn ${currentPage === page ? 'active' : ''}`}
                    onClick={() => onNavigate(`/tracks?page=${page}`)}
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
              onClick={() => onNavigate(`/tracks?page=${currentPage + 1}`)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
