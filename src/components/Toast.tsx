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
    // Auto-dismiss alert after 4 seconds
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, 4000);

    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  let bg = 'bg-emerald-700';
  if (toast.type === 'error' || toast.type === 'err') bg = 'bg-rose-700';
  else if (toast.type === 'wrn') bg = 'bg-amber-600';
  else if (toast.type === 'info' || toast.type === 'inf') bg = 'bg-blue-700';

  return (
    <div
      onClick={() => onRemove(toast.id)}
      className={`${bg} text-white text-xs font-bold px-4 py-2.5 rounded shadow-lg pointer-events-auto border border-black/10 flex items-center justify-between gap-3 cursor-pointer transition transform hover:scale-[1.02] animate-in fade-in slide-in-from-bottom-2 duration-200`}
    >
      <span>{toast.msg}</span>
      <span className="text-white/70 hover:text-white font-black text-sm">&times;</span>
    </div>
  );
};

export const Toast: React.FC<ToastProps> = ({ toasts, onRemove }) => {
  return (
    <div id="toast-container" className="fixed bottom-5 right-5 z-50 space-y-2 pointer-events-none no-print">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
};

