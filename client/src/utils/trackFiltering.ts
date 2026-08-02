import { Track, Playlist } from './types';

export type SortOption = 'Default Order' | 'A-Z' | 'Z-A';

/**
 * Filters tracks based on playlist, search keyword, and played status.
 */
export function getBaseFilteredTracks(
  tracks: Track[] | null,
  playlists: Playlist[],
  selectedPlaylistName: string,
  searchTerm: string,
  hidePlayed: boolean
): Track[] {
  if (!tracks) return [];

  return tracks.filter(track => {
    // Filter playlist
    let matchesPlaylist = true;
    if (selectedPlaylistName !== 'All playlists') {
      const activePlaylist = playlists.find(p => p.name === selectedPlaylistName);
      matchesPlaylist = activePlaylist ? activePlaylist.tracks.includes(track.audio) : false;
    }

    // Filter search
    const matchesSearch =
      track.game.toLowerCase().includes(searchTerm.toLowerCase()) ||
      track.title.toLowerCase().includes(searchTerm.toLowerCase());

    // Filter played status
    const matchesPlayed = hidePlayed ? !track.played : true;

    return matchesPlaylist && matchesSearch && matchesPlayed;
  });
}

/**
 * Applies tag filters and sorting logic to the base filtered tracks.
 */
export function getFilteredAndSortedTracks(
  baseTracks: Track[],
  playlists: Playlist[],
  selectedPlaylistName: string,
  sortOrder: SortOption,
  selectedTags: Record<string, string[]>
): Track[] {
  const activeCategories = Object.entries(selectedTags).filter(([_, vals]) => vals.length > 0);

  let results = [...baseTracks];

  if (activeCategories.length > 0) {
    results = results.filter(track =>
      activeCategories.every(([type, selectedVals]) =>
        track.tags?.some(t => t.type === type && selectedVals.includes(t.value))
      )
    );
  }

  // Apply Sorting (Default Order, A-Z, or Z-A)
  return results.sort((a, b) => {
    if (sortOrder === 'Default Order') {
      // Maintain playlist order if playlist is selected
      const activePlaylist = playlists.find(p => p.name === selectedPlaylistName);
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
      return sortOrder === 'A-Z' ? titleComp : -titleComp;
    }

    return sortOrder === 'A-Z' ? gameComp : -gameComp;
  });
}

/**
 * Selects a random eligible track from a filtered list of tracks.
 * Returns null if no eligible (unplayed) tracks are available.
 */
export function getRandomEligibleTrack(filteredTracks: Track[]): Track | null {
  const eligibleTracks = filteredTracks.filter(t => !t.played);
  if (eligibleTracks.length === 0) return null;

  return eligibleTracks[Math.floor(Math.random() * eligibleTracks.length)];
}

/**
 * Extracts available tag groups by type from the track list.
 */
export function getAvailableTagsByType(tracks: Track[] | null): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  tracks?.forEach(track => {
    track.tags?.forEach(tag => {
      if (!groups[tag.type]) groups[tag.type] = [];
      if (!groups[tag.type].includes(tag.value)) groups[tag.type].push(tag.value);
    });
  });
  return groups;
}

/**
 * Calculates reachable tag counts for dynamic filter UI hints.
 */
export function getReachableTags(
  tracks: Track[] | null,
  playlists: Playlist[],
  selectedPlaylistName: string,
  searchTerm: string,
  hidePlayed: boolean,
  selectedTags: Record<string, string[]>
): Map<string, number> {
  const baseTracks = getBaseFilteredTracks(tracks, playlists, selectedPlaylistName, searchTerm, hidePlayed);
  const availableTags = getAvailableTagsByType(tracks);
  const categories = Object.keys(availableTags);
  const validTags = new Map<string, number>();

  categories.forEach(catToSkip => {
    const otherFilters = Object.entries(selectedTags).filter(([type, vals]) => type !== catToSkip && vals.length > 0);

    const reachableInCat = baseTracks.filter(track =>
      otherFilters.every(([type, selectedVals]) =>
        track.tags?.some(t => t.type === type && selectedVals.includes(t.value))
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
}
