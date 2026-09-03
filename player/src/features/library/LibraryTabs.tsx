interface Tab {
  id: string;
  label: string;
}

interface FilterPill { id: string; label: string }

interface LibraryTabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
  filter?: string;
  onFilter?: (id: string) => void;
  /** Filter pills for the active tab — tabs without filters show none. */
  filters?: FilterPill[];
}

export function LibraryTabs({ tabs, active, onChange, filter = 'all', onFilter, filters = [] }: LibraryTabsProps) {
  return (
    <div>
      {/* Tab row */}
      <div className="flex items-center gap-8 mb-5">
        {tabs.map(t => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="relative px-1 py-2 text-base border-none cursor-pointer transition-colors bg-transparent font-semibold"
              style={{
                color: isActive ? '#E5E2E1' : '#CBC3D7',
              }}
            >
              {t.label}
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-1 rounded-full"
                  style={{ background: '#D0BCFF' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Filter pills */}
      {filters.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {filters.map(f => {
            const isActive = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => onFilter?.(f.id)}
                className="px-5 py-2 text-xs rounded-full border-none cursor-pointer transition-colors font-medium"
                style={{
                  background: isActive ? '#2C2C2C' : 'rgba(255,255,255,0.04)',
                  color: '#E5E2E1',
                  border: isActive ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {f.id === 'favorites' && '♥ '}{f.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}