import { useMemo, useState } from 'preact/hooks';

import type { Track } from '@yasq/shared';
import type { PermissionRule } from '../types';

interface FilterSidebarProps {
  selectedTags: Record<string, string[]>;
  setSelectedTags: (
    update: Record<string, string[]> | ((prev: Record<string, string[]>) => Record<string, string[]>)
  ) => void;
  activeTagCategories: [string, string[]][];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  availableTagsByCategory: Record<string, string[]>;
  baseTracks: { track: Track; originalIndex: number }[];
  isTracksActive: boolean;
  isPermissionsActive: boolean;
  selectedPermissionTypes: PermissionRule['type'][];
  setSelectedPermissionTypes: (
    update: PermissionRule['type'][] | ((prev: PermissionRule['type'][]) => PermissionRule['type'][])
  ) => void;
}

export function FilterSidebar({
  selectedTags,
  setSelectedTags,
  activeTagCategories,
  searchQuery,
  setSearchQuery,
  availableTagsByCategory,
  baseTracks,
  isTracksActive,
  isPermissionsActive,
  selectedPermissionTypes,
  setSelectedPermissionTypes,
}: FilterSidebarProps) {
  // Track expanded tag categories
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleCategoryCollapse = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const toggleTagSelection = (type: string, value: string) => {
    setSelectedTags(prev => {
      const currentVals = prev[type] || [];
      const updatedVals = currentVals.includes(value) ? currentVals.filter(v => v !== value) : [...currentVals, value];

      const nextState = { ...prev, [type]: updatedVals };
      if (updatedVals.length === 0) delete nextState[type];
      return nextState;
    });
  };

  const clearAllTags = () => setSelectedTags({});

  const togglePermissionType = (type: PermissionRule['type']) => {
    setSelectedPermissionTypes(prev =>
      prev.includes(type) ? prev.filter(selected => selected !== type) : [...prev, type]
    );
  };

  const clearPermissionTypes = () => setSelectedPermissionTypes([]);

  const reachableTagsMap = useMemo(() => {
    const validTags = new Map<string, number>();
    const categories = Object.keys(availableTagsByCategory);

    categories.forEach(catToSkip => {
      // Get all active category filters EXCEPT the category currently being checked
      const otherFilters = Object.entries(selectedTags).filter(([type, vals]) => type !== catToSkip && vals.length > 0);

      // Filter base tracks against all OTHER active categories (AND logic across types, OR within type)
      const reachableInCat = baseTracks.filter(({ track }) =>
        otherFilters.every(([type, selectedVals]) =>
          track.tags?.some(t => t.type === type && selectedVals.includes(t.value))
        )
      );

      // Count occurrences of tags for the current category
      reachableInCat.forEach(({ track }) => {
        track.tags?.forEach(tag => {
          if (tag.type === catToSkip) {
            validTags.set(tag.value, (validTags.get(tag.value) || 0) + 1);
          }
        });
      });
    });

    return validTags;
  }, [baseTracks, selectedTags, availableTagsByCategory]);

  const searchPlaceholder = isTracksActive
    ? 'Search title, game...'
    : isPermissionsActive
      ? 'Search username, user ID, game, filename...'
      : 'Search playlist name...';

  return (
    <>
      <div className="search-box">
        <label htmlFor="search-input">Search</label>
        <div className="search-input-wrapper">
          <input
            id="search-input"
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onInput={e => setSearchQuery((e.target as HTMLInputElement).value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="secondary-btn clear-search-btn"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {isTracksActive && Object.keys(availableTagsByCategory).length > 0 && (
        <div className="tag-filter-section">
          <div className="tag-filter-header">
            <label>Filter by Tag</label>
            {activeTagCategories.length > 0 && (
              <button
                onClick={clearAllTags}
                className="secondary-btn"
              >
                Clear All
              </button>
            )}
          </div>

          {Object.entries(availableTagsByCategory).map(([category, tagValues]) => {
            const isExpanded = expandedCategories[category] ?? false;

            return (
              <div
                key={category}
                className="tag-category-group"
              >
                <div
                  className="tag-category-header"
                  onClick={() => toggleCategoryCollapse(category)}
                >
                  <span className="tag-category-title">{category}</span>
                  <button
                    type="button"
                    className="collapse-btn"
                  >
                    {isExpanded ? '−' : '+'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="tag-checkboxes-list">
                    {tagValues.map(val => {
                      const isChecked = selectedTags[category]?.includes(val) ?? false;
                      const count = reachableTagsMap.get(val) || 0;
                      const isDisabled = !isChecked && count === 0;

                      return (
                        <label
                          key={val}
                          className={`tag-checkbox-label ${isDisabled ? 'disabled' : ''}`}
                        >
                          <div className="tag-checkbox-content">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => toggleTagSelection(category, val)}
                            />
                            <span>{val}</span>
                          </div>
                          <span className="tag-badge">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isPermissionsActive && (
        <div className="tag-filter-section">
          <div className="tag-filter-header">
            <label>Filter by Permission Type</label>
            {selectedPermissionTypes.length > 0 && (
              <button
                type="button"
                onClick={clearPermissionTypes}
                className="secondary-btn"
              >
                Clear
              </button>
            )}
          </div>
          <div className="tag-checkboxes-list">
            {(['whitelist', 'blacklist'] as const).map(type => (
              <label
                key={type}
                className="tag-checkbox-label"
              >
                <div className="tag-checkbox-content">
                  <input
                    type="checkbox"
                    checked={selectedPermissionTypes.includes(type)}
                    onChange={() => togglePermissionType(type)}
                  />
                  <span>{type === 'whitelist' ? 'Whitelist' : 'Blacklist'}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
