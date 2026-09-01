import { computed, signal, useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

import { auth, discordSdk, socket } from '../main';
import * as backend from '../utils/backend';
import { Track } from '../utils/types';
import { NonDraggableImg } from '../components/NonDraggableImg';
import { TagFilterDropdown } from '../components/TagFilterComponent';
import { SimpleDropdown } from '../components/SimpleDropdown';
import {
  getAvailableTagsByType,
  getBaseFilteredTracks,
  getFilteredAndSortedTracks,
  getRandomEligibleTrack,
  getReachableTags,
  SortOption,
} from '../utils/trackFiltering';
import { Playlist } from '@yasq/shared';

const selectedPlaylistName = signal<string>('All playlists');
const selectedTags = signal<Record<string, string[]>>({});
const searchTerm = signal('');
const hidePlayed = signal(false);
const sortOrder = signal<SortOption>('Default Order');

export const TrackSelectionView = ({ isHost }: { isHost: boolean }) => {
  const tracks = useSignal<Track[] | null>(null);
  const playlists = useSignal<Playlist[]>([]);

  const fetchTracksAndPlaylists = () => {
    backend.getTrackList(auth.value.access_token, discordSdk.instanceId).then(data => {
      tracks.value = data.tracks.map((t: Track, i: number) => ({
        ...t,
        originalIndex: i,
      }));
      playlists.value = data.playlists;
    });
  };

  useEffect(() => {
    if (!isHost) return;

    // Initial fetch
    fetchTracksAndPlaylists();

    // Setup socket listeners
    socket.on('tracks-updated', fetchTracksAndPlaylists);
    socket.on('playlists-updated', fetchTracksAndPlaylists);

    // Cleanup
    return () => {
      socket.off('tracks-updated', fetchTracksAndPlaylists);
      socket.off('playlists-updated', fetchTracksAndPlaylists);
    };
  }, [isHost]);

  // Computed signal: This automatically re-filters whenever tracks,
  // selectedPlaylistName, searchTerm, or hidePlayed changes.
  const baseFilteredTracks = computed(() =>
    getBaseFilteredTracks(tracks.value, playlists.value, selectedPlaylistName.value, searchTerm.value, hidePlayed.value)
  );

  const filteredTracks = computed(() =>
    getFilteredAndSortedTracks(
      baseFilteredTracks.value,
      playlists.value,
      selectedPlaylistName.value,
      sortOrder.value,
      selectedTags.value
    )
  );

  const selectRandom = async () => {
    const randomTrack = getRandomEligibleTrack(filteredTracks.value);
    if (!randomTrack) return;

    await backend.playTrack(auth.value.access_token, randomTrack.audio, discordSdk.instanceId);
  };

  const availableTagsByType = computed(() => getAvailableTagsByType(tracks.value));

  const reachableTags = computed(() =>
    getReachableTags(
      tracks.value,
      playlists.value,
      selectedPlaylistName.value,
      searchTerm.value,
      hidePlayed.value,
      selectedTags.value
    )
  );

  if (!isHost) {
    return (
      <div className="centered">
        <h2>Waiting for host to select a track...</h2>
      </div>
    );
  }

  if (tracks.value === null) {
    return (
      <div className="centered">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div id="track-picker-container">
      <h2>Select the next track to challenge players:</h2>
      <div className="controls">
        <SimpleDropdown
          options={['Default Order', 'A-Z', 'Z-A']}
          value={sortOrder.value}
          onChange={val => (sortOrder.value = val as SortOption)}
        />

        {playlists.value.length > 0 && (
          <SimpleDropdown
            options={['All playlists', ...playlists.value.map(p => p.name)]}
            value={selectedPlaylistName.value}
            onChange={val => (selectedPlaylistName.value = val)}
          />
        )}

        {Object.keys(availableTagsByType.value).length > 0 && (
          <TagFilterDropdown
            availableTags={availableTagsByType.value}
            selectedTags={selectedTags}
            reachableTags={reachableTags.value}
          />
        )}

        <div className="search-wrapper">
          <input
            type="text"
            id="track-search"
            className={`track-search ${searchTerm.value ? 'active' : ''}`}
            placeholder="Search game or track name..."
            value={searchTerm.value}
            onInput={e => (searchTerm.value = (e.currentTarget as HTMLInputElement).value)}
          />
          {searchTerm.value && (
            <button
              onClick={() => (searchTerm.value = '')}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <button
          disabled={filteredTracks.value.filter(t => !t.played).length === 0}
          onClick={selectRandom}
          title="Select a random track from the current list"
        >
          🎲 Random
        </button>

        <label>
          <input
            type="checkbox"
            id="hide-played"
            className="hide-played-checkbox"
            checked={hidePlayed.value}
            onChange={e => (hidePlayed.value = (e.currentTarget as HTMLInputElement).checked)}
            onKeyDown={e => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                hidePlayed.value = !hidePlayed.value;
              }
            }}
          />
          Hide played tracks
        </label>
      </div>

      <div
        className="grid-container"
        id="track-selection-grid"
      >
        {filteredTracks.value.length === 0 ? (
          <p className="no-results">No tracks found matching your search.</p>
        ) : (
          filteredTracks.value.map(track => (
            <div
              key={track.audio}
              className={`track-card ${track.played ? 'played' : ''}`}
            >
              <div className="cover-wrapper">
                <NonDraggableImg
                  src={track.cover ? `/game_covers/${track.cover}` : '/default.svg'}
                  alt={`Cover of ${track.game}`}
                  onError={e => {
                    (e.currentTarget as HTMLImageElement).src = '/default.svg';
                  }}
                />
                {track.played && <span className="played-overlay">PLAYED</span>}
              </div>

              <div className="track-info">
                <span className="game-name">
                  <HighlightText
                    text={track.game}
                    highlight={searchTerm.value}
                  />
                </span>
                <span className="track-title">
                  <i>
                    <HighlightText
                      text={track.title}
                      highlight={searchTerm.value}
                    />
                  </i>
                </span>
              </div>

              <button
                className="track-select-btn"
                disabled={track.played}
                onClick={async e => {
                  // Preact's way of preventing double-clicks:
                  // The button becomes disabled because tracks.value will update
                  // or the state will change to 'PLAYING' via the backend call.
                  (e.currentTarget as HTMLButtonElement).disabled = true;
                  await backend.playTrack(auth.value.access_token, track.audio, discordSdk.instanceId);
                }}
              >
                {track.played ? 'Already Played' : 'Select Track'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const HighlightText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) return <span>{text}</span>;

  // Split text by the highlight term, keeping the delimiter for case sensitivity
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));

  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark
            key={i}
            className="search-highlight"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
};
