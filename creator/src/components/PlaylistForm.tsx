import type { Playlist, Track } from '@yasq/shared';
import { useEffect, useState } from 'preact/hooks';

interface PlaylistFormProps {
  isEditing: boolean;
  indexedPlaylist?: { playlist: Playlist; originalIndex: number };
  tracks: Track[];
  onSuccess: () => Promise<void> | void;
  onCancel: () => void;
}

export function PlaylistForm({ isEditing, indexedPlaylist, tracks, onSuccess, onCancel }: PlaylistFormProps) {
  // Playlist Form State
  const [playlistName, setPlaylistName] = useState('');
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);

  useEffect(() => {
    if (isEditing) {
      const playlist = indexedPlaylist?.playlist;
      if (playlist) {
        setPlaylistName(playlist.name);
        setSelectedTracks(playlist.tracks);
      }
    } else {
      setPlaylistName('');
      setSelectedTracks([]);
    }
  }, [isEditing, indexedPlaylist]);

  const submitPlaylist = async (e: Event) => {
    e.preventDefault();
    const playlistData: Playlist = { name: playlistName, tracks: selectedTracks };
    const url = isEditing ? `/api/playlists/${indexedPlaylist?.originalIndex}` : '/api/playlists';
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playlistData),
    });

    if (res.ok) {
      await onSuccess();
    }
  };

  const toggleTrackInPlaylist = (audioFilename: string) => {
    if (selectedTracks.includes(audioFilename)) {
      setSelectedTracks(selectedTracks.filter(f => f !== audioFilename));
    } else {
      setSelectedTracks([...selectedTracks, audioFilename]);
    }
  };

  return (
    <>
      <div className="tab-actions">
        <button
          onClick={onCancel}
          className="secondary-btn"
        >
          ← Back to Playlists
        </button>
      </div>

      <form
        onSubmit={submitPlaylist}
        className="card creator-form"
      >
        <h3>{isEditing ? 'Edit Playlist' : 'Add New Playlist'}</h3>

        <div className="field">
          <label htmlFor="playlist-name-input">Playlist Name</label>
          <input
            id="playlist-name-input"
            type="text"
            required
            value={playlistName}
            onInput={e => setPlaylistName((e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="field">
          <label>Select Tracks ({selectedTracks.length} selected)</label>
          <div className="playlist-track-selector">
            {tracks.map((t, idx) => (
              <label
                key={idx}
                className="playlist-track-item"
              >
                <input
                  type="checkbox"
                  checked={selectedTracks.includes(t.audio)}
                  onChange={() => toggleTrackInPlaylist(t.audio)}
                />
                <span>
                  <strong>{t.game}</strong> - {t.title} <small>({t.audio})</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="primary-btn"
          >
            {isEditing ? 'Update Playlist' : 'Save Playlist'}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
