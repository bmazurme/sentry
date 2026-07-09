import { useEffect } from 'react';

interface Props {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmColor = danger
    ? 'bg-red-600 hover:bg-red-500'
    : 'bg-blue-600 hover:bg-blue-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/60 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl p-6"
      >
        <h3 className="text-gray-900 dark:text-white font-semibold text-lg">{title}</h3>
        {message && (
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">{message}</p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 text-sm font-medium rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${confirmColor}`}
          >
            {busy ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
