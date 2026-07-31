interface SearchBarProps {
  query: string;
  onChange: (q: string) => void;
  onClear: () => void;
  compact?: boolean;
}

export function SearchBar({ query, onChange, onClear, compact = false }: SearchBarProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-lg cursor-pointer hover:opacity-80"
          style={{ color: '#CBC3D7' }}>
          search
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full mb-4">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-xl"
        style={{ color: '#CBC3D7' }}>
        search
      </span>
      <input
        type="text"
        value={query}
        onChange={e => onChange(e.target.value)}
        placeholder="Search for songs, albums, artists..."
        className="w-full pl-10 pr-10 py-3 rounded-xl border-none outline-none text-sm placeholder-current"
        style={{
          background: 'rgba(255,255,255,0.04)',
          color: '#E5E2E1',
          placeholderColor: '#CBC3D7',
        }}
      />
      {query && (
        <button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer hover:opacity-80 p-0"
        >
          <span className="material-symbols-outlined text-lg" style={{ color: '#CBC3D7' }}>close</span>
        </button>
      )}
    </div>
  );
}