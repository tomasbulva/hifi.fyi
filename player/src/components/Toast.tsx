import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

// ponytail: single-toast, auto-dismiss, one context. add stacking if multi-toast needed.

interface ToastContextValue {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string) => {
    if (timeoutId) clearTimeout(timeoutId);
    setMessage(msg);
    const id = setTimeout(() => setMessage(''), 2500);
    setTimeoutId(id);
  }, [timeoutId]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-full px-5 py-2.5 text-sm font-semibold animate-in fade-in slide-in-from-bottom-2"
            style={{ background: 'rgba(208,188,255,0.95)', color: '#1A0A2E', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
            {message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}