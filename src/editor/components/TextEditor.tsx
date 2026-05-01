// Konva üstüne render edilen inline metin editörü. Stage scaled koordinat
// alır (image-space × scale), ekran üstündeki gerçek piksel pozisyonu için.
// Enter → commit, Shift+Enter → newline, Esc → cancel, blur → commit.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface TextEditorProps {
  x: number;
  y: number;
  fontSize: number;
  color: string;
  initialValue: string;
  onCommit(value: string): void;
  onCancel(): void;
}

export function TextEditor(props: TextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(props.initialValue);

  // Auto-resize: yüksekliği içeriğe göre.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, props.fontSize * 1.4)}px`;
  }, [value, props.fontSize]);

  // Mount'ta odakla. Çift rAF ile click'in tetiklediği focus stealing'in
  // önüne geç — bazı durumlarda mousedown'dan sonra body kısa süre fokus alır.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const focusIt = () => {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    };
    focusIt();
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(focusIt);
      (focusIt as unknown as { _r2?: number })._r2 = r2;
    });
    return () => {
      cancelAnimationFrame(r1);
      const r2 = (focusIt as unknown as { _r2?: number })._r2;
      if (r2) cancelAnimationFrame(r2);
    };
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder="Metin yazın…"
      rows={1}
      onChange={(e) => setValue(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => props.onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          props.onCommit(value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          props.onCancel();
        }
        e.stopPropagation();
      }}
      style={{
        position: 'absolute',
        left: props.x,
        top: props.y,
        fontSize: props.fontSize,
        color: props.color,
        lineHeight: 1.2,
        fontFamily: 'inherit',
        fontWeight: 'bold',
        background: 'rgba(0, 0, 0, 0.55)',
        border: '1px dashed rgba(255, 255, 255, 0.6)',
        borderRadius: 4,
        padding: '2px 6px',
        margin: 0,
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        minWidth: 120,
        minHeight: props.fontSize * 1.4,
        zIndex: 50,
        whiteSpace: 'pre',
        caretColor: props.color,
      }}
    />
  );
}
