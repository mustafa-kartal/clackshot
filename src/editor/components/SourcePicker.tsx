// Pencere seçici modal. Aktif pencerelerin thumbnail'lerini grid'de gösterir,
// kullanıcı tıklayınca seçilen kaynağı parent'a bildirir.
import { useEffect, useState } from 'react';
import type { SourceInfo } from '../../shared/types';

interface SourcePickerProps {
  open: boolean;
  type: 'window' | 'screen';
  title: string;
  onCancel(): void;
  onPick(source: SourceInfo): void;
}

export function SourcePicker({ open, type, title, onCancel, onPick }: SourcePickerProps) {
  const [sources, setSources] = useState<SourceInfo[] | null>(null);

  useEffect(() => {
    if (!open) {
      setSources(null);
      return;
    }
    void window.api.capture.listSources([type]).then(setSources);
  }, [open, type]);

  // Esc ile kapat.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col rounded-2xl bg-surface-raised border border-surface-border shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          <button
            className="text-fg-subtle hover:text-fg text-2xl leading-none w-7 h-7 flex items-center justify-center rounded-md hover:bg-surface-hover"
            onClick={onCancel}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {sources === null ? (
            <div className="text-center text-sm text-fg-subtle py-8">Yükleniyor…</div>
          ) : sources.length === 0 ? (
            <div className="text-center text-sm text-fg-subtle py-8">
              Kaynak bulunamadı.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onPick(s)}
                  className="group flex flex-col items-stretch gap-2 p-2 rounded-lg bg-surface border border-surface-border hover:border-accent transition-colors text-left"
                >
                  <div className="aspect-video bg-canvas rounded overflow-hidden flex items-center justify-center">
                    {s.thumbnailDataUrl ? (
                      <img
                        src={s.thumbnailDataUrl}
                        alt={s.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-fg-subtle/60">Önizleme yok</span>
                    )}
                  </div>
                  <span
                    className="text-xs text-fg-muted group-hover:text-fg truncate"
                    title={s.name}
                  >
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-surface-border flex justify-end">
          <button
            className="px-3 py-1.5 text-sm rounded-lg text-fg hover:bg-surface-hover"
            onClick={onCancel}
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}
