import { useSignal, computed, signal } from "@preact/signals";
import { useEffect } from "preact/hooks";

import { auth } from "../main";
import { discordSdk } from "../main";
import * as backend from "../utils/backend";
import { Track, Playlist } from "../utils/types";
import { NonDraggableImg } from "../components/NonDraggableImg";
import { TagFilterDropdown } from "../components/TagFilterComponent";
import { SimpleDropdown } from "../components/SimpleDropdown";

const selectedPlaylistName = signal<string>("All playlists");
const selectedTags = signal<Record<string, string[]>>({});
const searchTerm = signal("");
const hidePlayed = signal(false);
type SortOption = "Default Order" | "A-Z" | "Z-A";
const sortOrder = signal<SortOption>("Default Order");

export const SelectionView = ({ isHost }: { isHost: boolean }) => {
  const tracks = useSignal<Track[] | null>(null);
  const playlists = useSignal<Playlist[]>([]);

  useEffect(() => {
    if (!isHost) return;

    backend.getTrackList(auth.value.access_token, discordSdk.instanceId).then((data) => {
      tracks.value = data.tracks.map((t: Track, i: number) => ({ ...t, originalIndex: i }));
      playlists.value = data.playlists;
    });
  }, [isHost]);

  // Computed signal: This automatically re-filters whenever tracks,
  // selectedPlaylistName, searchTerm, or hidePlayed changes.
  const baseFilteredTracks = computed(() => {
    if (!tracks.value) return [];

    return tracks.value.filter(track => {
      // Filter playlist
      let matchesPlaylist = true;
      if (selectedPlaylistName.value !== "All playlists") {
        const activePlaylist = playlists.value.find(p => p.name === selectedPlaylistName.value);
        matchesPlaylist = activePlaylist ? activePlaylist.tracks.includes(track.audio) : false;
      }

      // Filter search
      const matchesSearch =
        track.game.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
        track.title.toLowerCase().includes(searchTerm.value.toLowerCase());

      // Filter played status
      const matchesPlayed = hidePlayed.value ? !track.played : true;

      return matchesPlaylist && matchesSearch && matchesPlayed;
    });
  });

  const filteredTracks = computed(() => {
    const activeCategories = Object.entries(selectedTags.value)
      .filter(([_, vals]) => vals.length > 0);

    let results = [...baseFilteredTracks.value];

    if (activeCategories.length > 0) {
      results = results.filter(track =>
        activeCategories.every(([type, selectedVals]) =>
          track.tags?.some(t => t.type === type && selectedVals.includes(t.value))
        )
      );
    }

    // Apply Sorting (Default Order, A-Z, or Z-A)
    return results.sort((a, b) => {
      if (sortOrder.value === "Default Order") {
        // Maintain playlist order if playlist is selected
        const activePlaylist = playlists.value.find(p => p.name === selectedPlaylistName.value);
        if (activePlaylist) {
          return activePlaylist.tracks.indexOf(a.audio) - activePlaylist.tracks.indexOf(b.audio);
        }
        // Otherwise use standard order
        return (a.originalIndex ?? 0) - (b.originalIndex ?? 0);
      }

      // Sort by Game Name
      const gameComp = a.game.localeCompare(b.game);

      // Secondary Sort: If games are the same, sort by Track Title
      if (gameComp === 0) {
        const titleComp = a.title.localeCompare(b.title);
        return sortOrder.value === "A-Z" ? titleComp : -titleComp;
      }

      return sortOrder.value === "A-Z" ? gameComp : -gameComp;
    });
  });

  const selectRandom = async () => {
    // Only pick from tracks that are currently visible and NOT played
    const eligibleTracks = filteredTracks.value.filter(t => !t.played);
    if (eligibleTracks.length === 0) return;

    const randomTrack = eligibleTracks[Math.floor(Math.random() * eligibleTracks.length)];
    await backend.playTrack(auth.value.access_token, randomTrack.audio, discordSdk.instanceId);
  };

  const availableTagsByType = computed(() => {
    const groups: Record<string, string[]> = {};
    tracks.value?.forEach(track => {
      track.tags?.forEach(tag => {
        if (!groups[tag.type]) groups[tag.type] = [];
        if (!groups[tag.type].includes(tag.value)) groups[tag.type].push(tag.value);
      });
    });
    return groups;
  });

  const reachableTags = computed(() => {
    const currentFilters = selectedTags.value;
    const categories = Object.keys(availableTagsByType.value);
    const validTags = new Map<string, number>();

    categories.forEach(catToSkip => {
      const otherFilters = Object.entries(currentFilters)
        .filter(([type, vals]) => type !== catToSkip && vals.length > 0);

      const reachableInCat = baseFilteredTracks.value.filter(track =>
        otherFilters.every(([type, selectedVals]) =>
          track.tags.some(t => t.type === type && selectedVals.includes(t.value))
        )
      );

      reachableInCat.forEach(track => {
        track.tags?.forEach(tag => {
          if (tag.type === catToSkip) {
            validTags.set(tag.value, (validTags.get(tag.value) || 0) + 1);
          }
        });
      });
    });

    return validTags;
  });

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
          options={["Default Order", "A-Z", "Z-A"]}
          value={sortOrder.value}
          onChange={(val) => (sortOrder.value = val as SortOption)}
        />

        {playlists.value.length > 0 && (
          <SimpleDropdown
            options={["All playlists", ...playlists.value.map(p => p.name)]}
            value={selectedPlaylistName.value}
            onChange={(val) => (selectedPlaylistName.value = val)}
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
          <input type="text" id="track-search" className={`track-search ${searchTerm.value ? 'active' : ''}`} placeholder="Search game or track name..."
            value={searchTerm.value} onInput={(e) => (searchTerm.value = (e.currentTarget as HTMLInputElement).value)} />
          {searchTerm.value && (
            <button
              onClick={() => (searchTerm.value = "")}
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
            onChange={(e) => (hidePlayed.value = (e.currentTarget as HTMLInputElement).checked)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                hidePlayed.value = !hidePlayed.value;
              }
            }}
          />
          Hide played tracks
        </label>
      </div>

      <div className="grid-container" id="track-selection-grid">
        {filteredTracks.value.length === 0 ? (
          <p className="no-results">No tracks found matching your search.</p>
        ) : (
          filteredTracks.value.map(track => (
            <div key={track.audio} className={`track-card ${track.played ? 'played' : ''}`}>
              <div className="cover-wrapper">
                <NonDraggableImg
                  src={`/game_covers/${track.cover}` || '/game_covers/default.svg'}
                  alt={`Cover of ${track.game}`}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/game_covers/default.svg'; }}
                />
                {track.played && <span className="played-overlay">PLAYED</span>}
              </div>

              <div className="track-info">
                <span className="game-name">
                  <HighlightText text={track.game} highlight={searchTerm.value} />
                </span>
                <span className="track-title">
                  <i>
                    <HighlightText text={track.title} highlight={searchTerm.value} />
                  </i>
                </span>
              </div>

              <button
                className="track-select-btn"
                disabled={track.played}
                onClick={async (e) => {
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
  const parts = text.split(new RegExp(`(${highlight})`, "gi"));

  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="search-highlight">{part}</mark>
        ) : (
          part
        )
      )}
    </span>
  );
};