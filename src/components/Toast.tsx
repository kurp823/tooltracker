import React, { useEffect } from 'react';

export interface ToastNotification {
  id: string;
  msg: string;
  type?: 'success' | 'error' | 'info' | 'wrn' | 'err' | 'inf';
}

interface ToastProps {
  toasts: ToastNotification[];
  onRemove: (id: string) => void;
}

const ToastItem: React.FC<{ toast: ToastNotification; onRemove: (id: string) => void }> = ({
  toast,
  onRemove,
}) => {
  useEffect(() => {
    // Guaranteed auto-dismiss alert after 3.5 seconds
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, 3500);

    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  let bg = 'bg-emerald-800 border-emerald-500 shadow-emerald-950/40 text-emerald-50';
  let icon = '✓';
  if (toast.type === 'error' || toast.type === 'err') {
    bg = 'bg-rose-800 border-rose-500 shadow-rose-950/40 text-rose-50';
    icon = '✕';
  } else if (toast.type === 'wrn') {
    bg = 'bg-amber-800 border-amber-500 shadow-amber-950/40 text-amber-50';
    icon = '⚠';
  } else if (toast.type === 'info' || toast.type === 'inf') {
    bg = 'bg-blue-800 border-blue-500 shadow-blue-950/40 text-blue-50';
    icon = 'ℹ';
  }

  return (
    <div
      onClick={() => onRemove(toast.id)}
      role="alert"
      className={`${bg} text-xs font-semibold px-4 py-2.5 rounded-lg shadow-2xl pointer-events-auto border flex items-center justify-between gap-3 cursor-pointer transition transform hover:scale-[1.02] active:scale-[0.98] animate-in fade-in slide-in-from-right-4 duration-200 min-w-[300px] max-w-md backdrop-blur-md`}
    >
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm font-bold opacity-90">{icon}</span>
        <span className="leading-snug">{toast.msg}</span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(toast.id);
        }}
        className="text-white/60 hover:text-white font-black text-base px-1 leading-none rounded hover:bg-white/10 transition cursor-pointer"
        title="Dismiss"
      >
        &times;
      </button>
    </div>
  );
};

export const Toast: React.FC<ToastProps> = ({ toasts, onRemove }) => {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      id="toast-container"
      className="fixed bottom-5 right-5 z-[99999] flex flex-col items-end space-y-2 pointer-events-none no-print"
      style={{ zIndex: 99999 }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
};

