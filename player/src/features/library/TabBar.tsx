interface TabBarProps<T extends string = string> {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: T) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="scrollbar-none flex gap-1 overflow-x-auto py-2">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-label-sm font-label transition-all duration-150 border-none cursor-pointer ${
            active === t.id
              ? 'bg-primary text-on-primary font-semibold'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
          }`}
        >{t.label}</button>
      ))}
    </div>
  );
}
