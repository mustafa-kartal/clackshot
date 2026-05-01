// Toast bildirimlerini ekranın sağ-altında stack olarak gösteren host.
// Her toast type'a göre renkli sol şerit alır; aksiyon varsa buton görünür.
import { useToastStore, type Toast } from '../store/toastStore';

const COLORS: Record<Toast['type'], string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  error: 'bg-red-500',
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-stretch min-w-[260px] max-w-md rounded-lg bg-surface-raised border border-surface-border shadow-2xl overflow-hidden animate-scale-in"
        >
          <div className={'w-1 shrink-0 ' + COLORS[t.type]} />
          <div className="flex-1 px-3 py-2.5 text-sm text-fg">
            {t.message}
            {t.action && (
              <button
                className="ml-3 text-xs text-accent hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="px-2 text-fg-subtle hover:text-fg hover:bg-surface-hover text-lg leading-none"
            aria-label="Kapat"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
