import type { ReactNode } from 'react';

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[960px] px-6 py-12 pb-32">
      {children}
    </div>
  );
}

type BreadcrumbSeg = { label: string; link?: string };

export function Breadcrumb({ segments, onNavigate }: { segments: BreadcrumbSeg[]; onNavigate?: (link: string) => void }) {
  return (
    <div className="mb-6 flex items-center gap-1.5 text-xs min-w-0" style={{ color: '#CBC3D7' }}>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className={`flex items-center gap-1.5 ${isLast ? 'min-w-0' : 'flex-shrink-0'}`}>
            {i > 0 && (
              <span className="text-xs font-light flex-shrink-0" style={{ color: 'rgba(203,195,215,0.3)' }}>/</span>
            )}
            {seg.link && onNavigate ? (
              <button
                onClick={() => onNavigate(seg.link!)}
                className="cursor-pointer border-none p-0 text-xs bg-transparent hover:opacity-80 transition-opacity font-medium truncate"
                style={{ color: '#CBC3D7' }}
              >
                {seg.label}
              </button>
            ) : (
              <span
                title={isLast ? seg.label : undefined}
                className={`text-xs truncate ${isLast ? 'font-bold' : 'font-medium'}`}
                style={{ color: isLast ? '#D0BCFF' : '#CBC3D7' }}>
                {seg.label}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h3 className="mb-3 text-label-sm uppercase tracking-widest text-on-surface-variant font-label">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="block max-w-full truncate text-sm font-semibold text-on-surface">
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="mt-10 text-center text-on-surface-variant flex items-center justify-center gap-2">
      <span className="material-symbols-outlined">search_off</span>
      {children}
    </p>
  );
}