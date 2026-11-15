import type { Tag, Track } from '@yasq/shared';
import { useEffect, useMemo, useState } from 'preact/hooks';

interface TrackFormProps {
  isEditing: boolean;
  indexedTrack?: { track: Track; originalIndex: number };
  tracks: Track[];
  availableTagsByCategory: Record<string, string[]>;
  onSuccess: () => Promise<void> | void;
  onCancel: () => void;
}

export function TrackForm({
  isEditing,
  indexedTrack,
  tracks,
  availableTagsByCategory,
  onSuccess,
  onCancel,
}: TrackFormProps) {
  // Track Form State
  const [title, setTitle] = useState('');
  const [game, setGame] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFilename, setAudioFilename] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverFilename, setCoverFilename] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (isEditing) {
      const track = indexedTrack?.track;
      if (track) {
        setTitle(track.title);
        setGame(track.game);
        setAudioFilename(track.audio);
        setAudioFile(null);
        setCoverFilename(track.cover || '');
        setCoverFile(null);
        setTags(track.tags || []);
      }
    } else {
      setTitle('');
      setGame('');
      setAudioFile(null);
      setAudioFilename('');
      setCoverFile(null);
      setCoverFilename('');
      setTags([]);
    }
  }, [isEditing, indexedTrack]);

  const addTagField = () => setTags([...tags, { type: '', value: '' }]);
  const removeTag = (index: number) => setTags(tags.filter((_, i) => i !== index));
  const updateTag = (index: number, field: 'type' | 'value', val: string) => {
    setTags(tags.map((t, i) => (i === index ? { ...t, [field]: val } : t)));
  };

  // Track Handlers
  const submitTrack = async (e: Event) => {
    e.preventDefault();
    let filename = audioFilename;
    let coverName = coverFilename;

    // Upload audio file if selected
    if (audioFile) {
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(audioFile.name) },
        body: audioFile,
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        filename = data.filename;
      }
    }

    // Upload cover image if selected
    if (coverFile) {
      const res = await fetch('/api/upload?type=cover', {
        method: 'POST',
        headers: { 'X-File-Name': encodeURIComponent(coverFile.name) },
        body: coverFile,
      });
      if (res.ok) {
        const data = await res.json();
        coverName = data.filename;
      }
    }

    const trackData = { game, title, audio: filename, cover: coverName, tags };
    const url = isEditing ? `/api/tracks/${indexedTrack?.originalIndex}` : '/api/tracks';
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trackData),
    });

    if (res.ok) {
      await onSuccess();
    }
  };

  const availableGames = useMemo(() => {
    return Array.from(new Set(tracks.map(t => t.game).filter(Boolean)));
  }, [tracks]);

  return (
    <>
      <div className="tab-actions">
        <button
          onClick={onCancel}
          className="secondary-btn"
        >
          ← Back to List
        </button>
      </div>

      <form
        onSubmit={submitTrack}
        className="card creator-form"
      >
        <h3>{isEditing ? 'Edit Track' : 'Add New Track'}</h3>

        <div className="field">
          <label htmlFor="game-name-input">Game Name</label>
          <input
            id="game-name-input"
            type="text"
            required
            value={game}
            list="game-names-list"
            onInput={e => setGame((e.target as HTMLInputElement).value)}
          />
          <datalist id="game-names-list">
            {availableGames.map(game => (
              <option
                key={game}
                value={game}
              />
            ))}
          </datalist>
        </div>

        <div className="field">
          <label htmlFor="track-title-input">Track Title</label>
          <input
            id="track-title-input"
            type="text"
            required
            value={title}
            onInput={e => setTitle((e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="field">
          <label htmlFor="audio-file-input">Audio File</label>
          <input
            id="audio-file-input"
            type="file"
            accept="audio/*"
            required={!isEditing && !audioFilename}
            onChange={e => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files[0]) {
                setAudioFile(files[0]);
                setAudioFilename(files[0].name);
              }
            }}
          />
          {audioFilename && <small>Current audio file: {audioFilename}</small>}
        </div>

        <div className="field">
          <label htmlFor="cover-image-input">Cover Image</label>
          <input
            id="cover-image-input"
            type="file"
            accept="image/*"
            onChange={e => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files[0]) {
                setCoverFile(files[0]);
                setCoverFilename(files[0].name);
              }
            }}
          />
          {coverFilename && <small>Current cover file: {coverFilename}</small>}
        </div>

        <div className="field">
          <label>Tags</label>
          {tags.map((tag, index) => {
            const matchingValues = availableTagsByCategory[tag.type] || [];
            const valueListId = `tag-values-${index}`;

            return (
              <div
                key={index}
                className="tag-row"
              >
                <input
                  type="text"
                  placeholder="Type"
                  value={tag.type}
                  list="tag-types-list"
                  onInput={e => updateTag(index, 'type', (e.target as HTMLInputElement).value)}
                />
                <datalist id="tag-types-list">
                  {Object.keys(availableTagsByCategory).map(type => (
                    <option
                      key={type}
                      value={type}
                    />
                  ))}
                </datalist>

                <input
                  type="text"
                  placeholder="Value"
                  value={tag.value}
                  list={valueListId}
                  onInput={e => updateTag(index, 'value', (e.target as HTMLInputElement).value)}
                />
                <datalist id={valueListId}>
                  {matchingValues.map(val => (
                    <option
                      key={val}
                      value={val}
                    />
                  ))}
                </datalist>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => removeTag(index)}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="secondary-btn"
            onClick={addTagField}
          >
            + Add Tag
          </button>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="primary-btn"
          >
            {isEditing ? 'Update Track' : 'Save Track'}
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
