import { useToastStore, type Toast } from '../store/toastStore';

const STRIPE: Record<Toast['type'], string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  error: 'bg-red-500',
  loading: 'bg-accent',
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
          className="pointer-events-auto flex flex-col min-w-[260px] max-w-md rounded-lg bg-surface-raised border border-surface-border shadow-2xl overflow-hidden animate-scale-in"
        >
          <div className="flex items-stretch">
            <div className={'w-1 shrink-0 ' + STRIPE[t.type]} />
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
            {t.type !== 'loading' && (
              <button
                onClick={() => dismiss(t.id)}
                className="px-2 text-fg-subtle hover:text-fg hover:bg-surface-hover text-lg leading-none"
                aria-label="Kapat"
              >
                ×
              </button>
            )}
          </div>

          {t.type === 'loading' && (
            <div style={{ position: 'relative', overflow: 'hidden', height: 2, background: 'rgb(39 39 42)' }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: '25%',
                background: '#0EA5E9',
                borderRadius: 2,
                animation: 'progressSlide 1.2s ease-in-out infinite',
              }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
