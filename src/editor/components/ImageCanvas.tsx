// Konva tabanlı canvas. İki layer:
//  - Image layer: capture'ın kendisi.
//  - Shape layer: pen / rect / arrow / blur / text annotation'ları.
// Stage scale'i container'a fit eder, shape koordinatları image-native.
import Konva from 'konva';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
// useState yukarıda — EmptyState'te de kullanıyoruz.
import {
  Arrow as KArrow,
  Circle as KCircle,
  Group as KGroup,
  Image as KImage,
  Layer,
  Line,
  Rect as KRect,
  Stage,
  Text as KText,
} from 'react-konva';
import logoDark from '../../../resources/icons/logo-dark.png';
import logoLight from '../../../resources/icons/logo-light.png';
import { genId, useEditorStore, type Shape } from '../store/editorStore';
import { useConfigStore } from '../store/configStore';
import { useAppliedTheme } from '../hooks/useAppliedTheme';
import { useRecordingStore } from '../store/recordingStore';
import { stageRef as stageRefSingleton } from '../stage-ref';
import { TextEditor } from './TextEditor';
import { SourcePicker } from './SourcePicker';
import type { SourceInfo } from '../../shared/types';

interface DrawingState {
  drawing: boolean;
  startedAt: { x: number; y: number } | null;
  activeId: string | null;
}

export function ImageCanvas() {
  const image = useEditorStore((s) => s.image);

  if (!image) return <EmptyState />;

  return <CanvasWithImage />;
}

function CanvasWithImage() {
  const image = useEditorStore((s) => s.image)!;
  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const strokeWidth = useEditorStore((s) => s.strokeWidth);
  const fontSize = useEditorStore((s) => s.fontSize);
  const arrowHeadSize = useEditorStore((s) => s.arrowHeadSize);
  const blurRadius = useEditorStore((s) => s.blurRadius);
  const shapes = useEditorStore((s) => s.shapes);
  const selectedId = useEditorStore((s) => s.selectedId);
  const setSelected = useEditorStore((s) => s.setSelected);
  const beginShape = useEditorStore((s) => s.beginShape);
  const mutateLastShape = useEditorStore((s) => s.mutateLastShape);
  const commitUpdate = useEditorStore((s) => s.commitUpdate);
  const removeShape = useEditorStore((s) => s.removeShape);
  const cropRect = useEditorStore((s) => s.cropRect);
  const setCropRect = useEditorStore((s) => s.setCropRect);
  const applyCrop = useEditorStore((s) => s.applyCrop);
  const setTool = useEditorStore((s) => s.setTool);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [scale, setScale] = useState(1);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const drawing = useRef<DrawingState>({ drawing: false, startedAt: null, activeId: null });

  // Crop handle sürükleme state'i.
  const cropDrag = useRef<{
    active: boolean;
    handle: CropHandle | null;
    startPointer: { x: number; y: number };
    startRect: { x: number; y: number; width: number; height: number };
  }>({ active: false, handle: null, startPointer: { x: 0, y: 0 }, startRect: { x: 0, y: 0, width: 0, height: 0 } });

  // Shape resize handle sürükleme state'i.
  const shapeDrag = useRef<{
    active: boolean;
    shapeId: string | null;
    handle: ResizeHandle | null;
    startPointer: { x: number; y: number };
    startShape: Shape | null;
  }>({ active: false, shapeId: null, handle: null, startPointer: { x: 0, y: 0 }, startShape: null });

  // Aktif text edit overlay durumu.
  const [editingText, setEditingText] = useState<{
    id: string;
    x: number;
    y: number;
    value: string;
    isNew: boolean;
  } | null>(null);

  // HTMLImageElement yükle (Konva.Image bunu bekler).
  useEffect(() => {
    const img = new window.Image();
    img.src = image.objectUrl;
    img.onload = () => setImgEl(img);
  }, [image.objectUrl]);

  // Container'a fit eden scale'i hesapla.
  const recalcScale = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const padding = 32; // p-8
    const availW = el.clientWidth - padding * 2;
    const availH = el.clientHeight - padding * 2;
    const s = Math.min(availW / image.width, availH / image.height, 1);
    setScale(s > 0 ? s : 1);
  }, [image.width, image.height]);

  useLayoutEffect(() => {
    recalcScale();
    const ro = new ResizeObserver(recalcScale);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [recalcScale]);

  // Stage referansını save/copy için global slot'a yerleştir.
  useEffect(() => {
    stageRefSingleton.set(stageRef.current);
    return () => stageRefSingleton.set(null);
  }, [imgEl]);

  // Crop sürükleme mouse stage dışına çıkınca da devam etsin.
  // window level event'leri ile pointer takibi yapıyoruz.
  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (!cropDrag.current.active) return;
      const stage = stageRef.current;
      if (!stage) return;
      const container = stage.container();
      const bounds = container.getBoundingClientRect();
      // Client koordinatını image-space'e çevir.
      const rawX = (e.clientX - bounds.left) / scale;
      const rawY = (e.clientY - bounds.top) / scale;
      const p = { x: rawX, y: rawY };

      const dx = p.x - cropDrag.current.startPointer.x;
      const dy = p.y - cropDrag.current.startPointer.y;
      const r = cropDrag.current.startRect;
      const MIN = 16;
      const iW = image.width;
      const iH = image.height;

      if (cropDrag.current.handle === null) {
        const nx = Math.max(0, Math.min(r.x + dx, iW - r.width));
        const ny = Math.max(0, Math.min(r.y + dy, iH - r.height));
        setCropRect({ x: nx, y: ny, width: r.width, height: r.height });
      } else {
        let { x, y, width, height } = r;
        const h = cropDrag.current.handle;
        if (h.includes('w')) { x = Math.max(0, Math.min(r.x + dx, r.x + r.width - MIN)); width = r.width - (x - r.x); }
        if (h.includes('e')) { width = Math.min(Math.max(MIN, r.width + dx), iW - r.x); }
        if (h.includes('n')) { y = Math.max(0, Math.min(r.y + dy, r.y + r.height - MIN)); height = r.height - (y - r.y); }
        if (h.includes('s')) { height = Math.min(Math.max(MIN, r.height + dy), iH - r.y); }
        setCropRect({ x, y, width, height });
      }
    };

    const onWindowMouseUp = () => {
      if (!cropDrag.current.active) return;
      cropDrag.current.active = false;
      cropDrag.current.handle = null;
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [scale, image.width, image.height, setCropRect]);

  // Shape resize handle sürükleme — mouse stage dışına çıksa bile devam etsin.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!shapeDrag.current.active) return;
      const stage = stageRef.current;
      if (!stage) return;
      const bounds = stage.container().getBoundingClientRect();
      const px = (e.clientX - bounds.left) / scale;
      const py = (e.clientY - bounds.top) / scale;
      const dx = px - shapeDrag.current.startPointer.x;
      const dy = py - shapeDrag.current.startPointer.y;
      const src = shapeDrag.current.startShape;
      const id = shapeDrag.current.shapeId;
      const h = shapeDrag.current.handle;
      if (!src || !id || !h) return;

      const MIN = 8;
      let next: Shape | null = null;

      if (src.type === 'rect' || src.type === 'blur') {
        let { x, y, width, height } = src;
        if (h.includes('w')) { x = Math.min(src.x + dx, src.x + src.width - MIN); width = src.width - (x - src.x); }
        if (h.includes('e')) { width = Math.max(MIN, src.width + dx); }
        if (h.includes('n')) { y = Math.min(src.y + dy, src.y + src.height - MIN); height = src.height - (y - src.y); }
        if (h.includes('s')) { height = Math.max(MIN, src.height + dy); }
        next = { ...src, x, y, width, height };
      } else if (src.type === 'arrow') {
        const [x1, y1, x2, y2] = src.points;
        if (h === 'p1') next = { ...src, points: [x1 + dx, y1 + dy, x2, y2] };
        else next = { ...src, points: [x1, y1, x2 + dx, y2 + dy] };
      } else if (src.type === 'pen') {
        // Pen: bounding box hesapla, scale + translate uygula.
        const pts = src.points;
        const xs = pts.filter((_, i) => i % 2 === 0);
        const ys = pts.filter((_, i) => i % 2 !== 0);
        const bx = Math.min(...xs); const by = Math.min(...ys);
        const bw = Math.max(...xs) - bx; const bh = Math.max(...ys) - by;
        let nbx = bx; let nby = by; let nbw = bw; let nbh = bh;
        if (h.includes('w')) { nbx = bx + dx; nbw = bw - dx; }
        if (h.includes('e')) { nbw = bw + dx; }
        if (h.includes('n')) { nby = by + dy; nbh = bh - dy; }
        if (h.includes('s')) { nbh = bh + dy; }
        if (nbw < MIN) nbw = MIN;
        if (nbh < MIN) nbh = MIN;
        const scaleX = nbw / (bw || 1); const scaleY = nbh / (bh || 1);
        const newPts = pts.map((v, i) =>
          i % 2 === 0 ? nbx + (v - bx) * scaleX : nby + (v - by) * scaleY,
        );
        next = { ...src, points: newPts };
      } else if (src.type === 'text') {
        let { x, y, fontSize: fs } = src;
        if (h === 'se') {
          const newFs = Math.max(8, Math.round(fs + (dx + dy) / 2));
          next = { ...src, fontSize: newFs };
        } else if (h === 'nw') {
          const newFs = Math.max(8, Math.round(fs - (dx + dy) / 2));
          x = src.x + (fs - newFs) * 0.5;
          y = src.y + (fs - newFs) * 0.5;
          next = { ...src, x, y, fontSize: newFs };
        } else {
          x = src.x + dx; y = src.y + dy;
          next = { ...src, x, y };
        }
      } else if (src.type === 'number') {
        if (h === 'se' || h === 'ne' || h === 'e') {
          next = { ...src, radius: Math.max(10, src.radius + dx) };
        } else if (h === 'nw' || h === 'sw' || h === 'w') {
          next = { ...src, radius: Math.max(10, src.radius - dx) };
        } else {
          next = { ...src, x: src.x + dx, y: src.y + dy };
        }
      }

      if (next) {
        commitUpdate(id, () => next!);
      }
    };

    const onUp = () => {
      if (!shapeDrag.current.active) return;
      shapeDrag.current.active = false;
      shapeDrag.current.shapeId = null;
      shapeDrag.current.handle = null;
      shapeDrag.current.startShape = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scale, commitUpdate]);

  // Crop tool'a geçince resmin tamamını kapsayan başlangıç rect'i ayarla.
  useEffect(() => {
    if (tool === 'crop' && !cropRect) {
      setCropRect({ x: 0, y: 0, width: image.width, height: image.height });
    }
    if (tool !== 'crop') {
      setCropRect(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  // Crop modunda Enter onaylar, Esc iptal eder.
  useEffect(() => {
    if (tool !== 'crop') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Enter') {
        if (cropRect && cropRect.width >= 4 && cropRect.height >= 4) {
          e.preventDefault();
          void applyCrop();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCropRect(null);
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, cropRect, applyCrop, setCropRect, setTool]);

  // Delete/Backspace ile seçili shape'i sil. Tool select olmasa bile çalışır.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeShape(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, removeShape]);

  // Stage üzerindeki image-space pointer pozisyonu.
  const getPointer = (): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getPointerPosition();
    if (!p) return null;
    return { x: p.x / scale, y: p.y / scale };
  };

  const onMouseDown = () => {
    if (editingText) return;
    if (tool === 'text') return; // Text aracı click event'i ile çalışır.
    if (tool === 'number') return; // Number tool da click event'i kullanır.
    if (tool === 'select') return; // Select tool çizmiyor — sadece etkileşim.
    const p = getPointer();
    if (!p) return;

    if (tool === 'crop') {
      // Alan içine tıklama → taşıma modunu başlat.
      if (cropRect && p.x >= cropRect.x && p.x <= cropRect.x + cropRect.width &&
          p.y >= cropRect.y && p.y <= cropRect.y + cropRect.height) {
        cropDrag.current = {
          active: true,
          handle: null, // null = taşıma modu
          startPointer: p,
          startRect: { ...cropRect },
        };
      }
      return;
    }

    drawing.current.drawing = true;
    drawing.current.startedAt = p;
    const id = genId();
    drawing.current.activeId = id;

    let shape: Shape;
    switch (tool) {
      case 'pen':
        shape = { id, type: 'pen', points: [p.x, p.y], stroke: color, strokeWidth };
        break;
      case 'rect':
        shape = {
          id,
          type: 'rect',
          x: p.x,
          y: p.y,
          width: 0,
          height: 0,
          stroke: color,
          strokeWidth,
        };
        break;
      case 'arrow':
        shape = {
          id,
          type: 'arrow',
          points: [p.x, p.y, p.x, p.y],
          stroke: color,
          strokeWidth,
          headSize: arrowHeadSize,
        };
        break;
      case 'blur':
        shape = {
          id,
          type: 'blur',
          x: p.x,
          y: p.y,
          width: 0,
          height: 0,
          blurRadius,
        };
        break;
      default:
        return;
    }
    beginShape(shape);
  };

  const onMouseMove = () => {
    // Crop sürükleme (handle veya taşıma)
    if (cropDrag.current.active) {
      const p = getPointer();
      if (!p) return;
      const dx = p.x - cropDrag.current.startPointer.x;
      const dy = p.y - cropDrag.current.startPointer.y;
      const r = cropDrag.current.startRect;
      const MIN = 16;
      const iW = image.width;
      const iH = image.height;

      if (cropDrag.current.handle === null) {
        // Taşıma modu — rect'i kaydır, sınır dışına çıkmasın.
        const nx = Math.max(0, Math.min(r.x + dx, iW - r.width));
        const ny = Math.max(0, Math.min(r.y + dy, iH - r.height));
        setCropRect({ x: nx, y: ny, width: r.width, height: r.height });
      } else {
        // Handle resize modu.
        let { x, y, width, height } = r;
        const h = cropDrag.current.handle;
        if (h.includes('w')) {
          x = Math.max(0, Math.min(r.x + dx, r.x + r.width - MIN));
          width = r.width - (x - r.x);
        }
        if (h.includes('e')) {
          width = Math.min(Math.max(MIN, r.width + dx), iW - r.x);
        }
        if (h.includes('n')) {
          y = Math.max(0, Math.min(r.y + dy, r.y + r.height - MIN));
          height = r.height - (y - r.y);
        }
        if (h.includes('s')) {
          height = Math.min(Math.max(MIN, r.height + dy), iH - r.y);
        }
        setCropRect({ x, y, width, height });
      }
      return;
    }

    if (!drawing.current.drawing) return;
    const p = getPointer();
    if (!p) return;
    const start = drawing.current.startedAt;
    if (!start) return;

    mutateLastShape((s) => {
      switch (s.type) {
        case 'pen':
          return { ...s, points: [...s.points, p.x, p.y] };
        case 'rect':
          return { ...s, x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) };
        case 'blur':
          return { ...s, x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) };
        case 'arrow':
          return { ...s, points: [start.x, start.y, p.x, p.y] };
        default:
          return s;
      }
    });
  };

  const onMouseUp = () => {
    if (cropDrag.current.active) {
      cropDrag.current.active = false;
      cropDrag.current.handle = null;
      return;
    }
    if (!drawing.current.drawing) return;
    drawing.current.drawing = false;
    drawing.current.startedAt = null;
    const finishedId = drawing.current.activeId;
    drawing.current.activeId = null;
    // Çizim biter bitmez shape'i seç — resize tutamaçları hemen belirsin.
    if (finishedId) setSelected(finishedId);
  };

  const onCropHandleMouseDown = (handle: CropHandle, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const p = getPointer();
    if (!p || !cropRect) return;
    cropDrag.current = {
      active: true,
      handle,
      startPointer: p,
      startRect: { ...cropRect },
    };
  };

  // Text tool: click event'i ile yeni text alanı aç. mousedown yerine click
  // kullanmak focus stealing problemini engeller (browser body fokuslamasın).
  // Select tool: boş alana tıklama → deselect.
  // Number tool: click ile auto-incremented numbered callout ekle.
  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === 'text') {
      if (editingText) return;
      const p = getPointer();
      if (!p) return;
      const id = genId();
      setEditingText({ id, x: p.x, y: p.y, value: '', isNew: true });
      return;
    }
    if (tool === 'number') {
      const p = getPointer();
      if (!p) return;
      const next =
        shapes.filter((s) => s.type === 'number').reduce((m, s) => {
          return s.type === 'number' && s.value > m ? s.value : m;
        }, 0) + 1;
      const radius = Math.max(14, strokeWidth * 4);
      const newId = genId();
      beginShape({
        id: newId,
        type: 'number',
        x: p.x,
        y: p.y,
        value: next,
        radius,
        fill: color,
      });
      setSelected(newId);
      return;
    }
    if (tool === 'select') {
      const stage = stageRef.current;
      if (e.target === stage) {
        setSelected(null);
      }
    }
  };

  // Text commit → boş ise iptal et, isNew ise shape ekle, değilse update.
  const commitTextEdit = (value: string) => {
    if (!editingText) return;
    const trimmed = value.trim();
    if (editingText.isNew) {
      if (trimmed.length > 0) {
        beginShape({
          id: editingText.id,
          type: 'text',
          x: editingText.x,
          y: editingText.y,
          text: value,
          fontSize,
          fill: color,
        });
        setSelected(editingText.id);
      }
    } else {
      if (trimmed.length === 0) {
        // Mevcut text boşaltıldı → silmek yerine eski metni koru.
        // Phase 4'te delete shape eklenirse burada silinebilir.
      } else {
        commitUpdate(editingText.id, (s) =>
          s.type === 'text' ? { ...s, text: value } : s,
        );
      }
    }
    setEditingText(null);
  };

  const onTextDblClick = (id: string) => {
    const s = shapes.find((sh) => sh.id === id);
    if (!s || s.type !== 'text') return;
    setEditingText({ id, x: s.x, y: s.y, value: s.text, isNew: false });
  };

  const stagePixelW = image.width * scale;
  const stagePixelH = image.height * scale;

  return (
    <div
      ref={wrapperRef}
      className="flex-1 flex items-center justify-center overflow-auto p-8 relative"
      style={{ cursor: cursorForTool(tool) }}
    >
      {imgEl && (
        <div
          className="rounded-lg shadow-2xl ring-1 ring-surface-border outline outline-2 outline-canvas animate-fade-in overflow-hidden bg-canvas"
          style={{
            width: stagePixelW,
            height: stagePixelH,
            position: 'relative',
          }}
        >
          <Stage
            ref={stageRef}
            width={stagePixelW}
            height={stagePixelH}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => {
              // Crop sürükleniyorsa mouse stage dışına çıksa bile bırakma.
              if (cropDrag.current.active) return;
              onMouseUp();
            }}
            onClick={onStageClick}
          >
            <Layer listening={false}>
              <KImage image={imgEl} width={image.width} height={image.height} />
            </Layer>
            <Layer>
              {shapes.map((s) => (
                <ShapeNode
                  key={s.id}
                  shape={s}
                  imageEl={imgEl}
                  imageW={image.width}
                  imageH={image.height}
                  tool={tool}
                  selected={selectedId === s.id}
                  onSelect={() => setSelected(s.id)}
                  onSelectTool={() => setTool('select')}
                  onCommit={(updater) => commitUpdate(s.id, updater)}
                  onTextDblClick={onTextDblClick}
                  hidden={editingText?.id === s.id && !editingText.isNew}
                />
              ))}
            </Layer>
            {tool === 'crop' && cropRect && cropRect.width > 0 && cropRect.height > 0 && (
              <Layer>
                <CropOverlay
                  rect={cropRect}
                  imageW={image.width}
                  imageH={image.height}
                  onHandleMouseDown={onCropHandleMouseDown}
                  onMoveMouseDown={(e) => {
                    e.cancelBubble = true;
                    const p = getPointer();
                    if (!p || !cropRect) return;
                    cropDrag.current = { active: true, handle: null, startPointer: p, startRect: { ...cropRect } };
                  }}
                  stageRef={stageRef}
                />
              </Layer>
            )}
            {tool !== 'crop' && selectedId && (() => {
              const sel = shapes.find((s) => s.id === selectedId);
              if (!sel) return null;
              return (
                <Layer>
                  <ShapeResizeOverlay
                    shape={sel}
                    stageRef={stageRef}
                    onHandleMouseDown={(handle: ResizeHandle, e: Konva.KonvaEventObject<MouseEvent>) => {
                      e.cancelBubble = true;
                      const p = getPointer();
                      if (!p) return;
                      shapeDrag.current = {
                        active: true,
                        shapeId: sel.id,
                        handle,
                        startPointer: p,
                        startShape: sel,
                      };
                    }}
                  />
                </Layer>
              );
            })()}
          </Stage>

          {editingText && (
            <TextEditor
              x={editingText.x * scale}
              y={editingText.y * scale}
              fontSize={fontSize * scale}
              color={color}
              initialValue={editingText.value}
              onCommit={commitTextEdit}
              onCancel={() => setEditingText(null)}
            />
          )}

          {tool === 'crop' && cropRect && cropRect.width >= 4 && cropRect.height >= 4 && (
            <>
              {/* Boyut balonu — crop alanının üst ortasında */}
              <div
                className="absolute z-50 px-2 py-0.5 rounded-md bg-black/75 text-white text-xs font-mono pointer-events-none select-none"
                style={{
                  left: (cropRect.x + cropRect.width / 2) * scale,
                  top: Math.max(4, cropRect.y * scale - 28),
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                }}
              >
                {Math.round(cropRect.width)} × {Math.round(cropRect.height)}
              </div>
              {/* Kırp / İptal butonları */}
              <div
                className="absolute z-50 flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-raised/95 backdrop-blur border border-surface-border shadow-2xl text-xs"
                style={{
                  left: cropRect.x * scale,
                  top: (cropRect.y + cropRect.height) * scale + 8,
                }}
              >
                <button
                  onClick={() => void applyCrop()}
                  className="px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover whitespace-nowrap"
                >
                  Kırp (Enter)
                </button>
                <button
                  onClick={() => {
                    setCropRect(null);
                    setTool('select');
                  }}
                  className="px-2 py-1 rounded text-fg-muted hover:bg-surface-hover whitespace-nowrap"
                >
                  İptal (Esc)
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Crop seçim alanı dışını karartır + dashed border + resize handle'lar + taşıma alanı.
type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2';

function CropOverlay({
  rect,
  imageW,
  imageH,
  onHandleMouseDown,
  onMoveMouseDown,
  stageRef,
}: {
  rect: { x: number; y: number; width: number; height: number };
  imageW: number;
  imageH: number;
  onHandleMouseDown: (handle: CropHandle, e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMoveMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}) {
  const setCursor = (c: string) => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = c;
  };

  const dim = 'rgba(0, 0, 0, 0.45)';
  const hs = 25; // handle boyutu (px, image-space)
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const r2 = rect.x + rect.width;
  const b2 = rect.y + rect.height;

  const handles: { id: CropHandle; x: number; y: number; cursor: string }[] = [
    { id: 'nw', x: rect.x, y: rect.y, cursor: 'nw-resize' },
    { id: 'n',  x: cx,     y: rect.y, cursor: 'n-resize' },
    { id: 'ne', x: r2,     y: rect.y, cursor: 'ne-resize' },
    { id: 'e',  x: r2,     y: cy,     cursor: 'e-resize' },
    { id: 'se', x: r2,     y: b2,     cursor: 'se-resize' },
    { id: 's',  x: cx,     y: b2,     cursor: 's-resize' },
    { id: 'sw', x: rect.x, y: b2,     cursor: 'sw-resize' },
    { id: 'w',  x: rect.x, y: cy,     cursor: 'w-resize' },
  ];

  return (
    <>
      {/* 4 dim strip */}
      <KRect x={0} y={0} width={imageW} height={Math.max(0, rect.y)} fill={dim} listening={false} />
      <KRect x={0} y={b2} width={imageW} height={Math.max(0, imageH - b2)} fill={dim} listening={false} />
      <KRect x={0} y={rect.y} width={Math.max(0, rect.x)} height={rect.height} fill={dim} listening={false} />
      <KRect x={r2} y={rect.y} width={Math.max(0, imageW - r2)} height={rect.height} fill={dim} listening={false} />
      {/* Taşıma alanı — alan içini tıklayınca crop rect'i taşır */}
      <KRect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="transparent"
        onMouseDown={onMoveMouseDown}
        onMouseEnter={() => setCursor('move')}
        onMouseLeave={() => setCursor('default')}
      />
      {/* Crop çerçevesi */}
      <KRect x={rect.x} y={rect.y} width={rect.width} height={rect.height} stroke="#3b82f6" strokeWidth={20} dash={[12, 7]} listening={false} />
      {/* Resize handle'lar — resim sınırı içinde kalacak şekilde clamp edilir */}
      {handles.map((h) => {
        const hx = Math.max(0, Math.min(h.x - hs / 2, imageW - hs));
        const hy = Math.max(0, Math.min(h.y - hs / 2, imageH - hs));
        return (
          <KRect
            key={h.id}
            x={hx}
            y={hy}
            width={hs}
            height={hs}
            fill="white"
            stroke="#3b82f6"
            strokeWidth={5}
            cornerRadius={4}
            shadowColor="rgba(0,0,0,0.5)"
            shadowBlur={6}
            shadowOffsetX={0}
            shadowOffsetY={2}
            onMouseDown={(e) => onHandleMouseDown(h.id, e)}
            onMouseEnter={() => setCursor(h.cursor)}
            onMouseLeave={() => setCursor('default')}
          />
        );
      })}
    </>
  );
}

// Seçili shape'in bounding box'ı etrafında resize tutamaçları gösterir.
// Her shape tipine göre bbox veya endpoint tabanlı handle konumları hesaplanır.
function ShapeResizeOverlay({
  shape,
  stageRef,
  onHandleMouseDown,
}: {
  shape: Shape;
  stageRef: React.RefObject<Konva.Stage | null>;
  onHandleMouseDown: (handle: ResizeHandle, e: Konva.KonvaEventObject<MouseEvent>) => void;
}) {
  const setCursor = (c: string) => {
    const container = stageRef.current?.container();
    if (container) container.style.cursor = c;
  };

  const hs = 25; // handle boyutu (image-space px)
  const stroke = '#3b82f6';

  // Bounding box handles — rect, blur, text, number, pen
  const bboxHandles = (
    bx: number, by: number, bw: number, bh: number,
  ): { id: ResizeHandle; x: number; y: number; cursor: string }[] => {
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const r = bx + bw;
    const b = by + bh;
    return [
      { id: 'nw', x: bx, y: by,  cursor: 'nw-resize' },
      { id: 'n',  x: cx, y: by,  cursor: 'n-resize'  },
      { id: 'ne', x: r,  y: by,  cursor: 'ne-resize' },
      { id: 'e',  x: r,  y: cy,  cursor: 'e-resize'  },
      { id: 'se', x: r,  y: b,   cursor: 'se-resize' },
      { id: 's',  x: cx, y: b,   cursor: 's-resize'  },
      { id: 'sw', x: bx, y: b,   cursor: 'sw-resize' },
      { id: 'w',  x: bx, y: cy,  cursor: 'w-resize'  },
    ];
  };

  let borderEl: React.ReactNode = null;
  let handles: { id: ResizeHandle; x: number; y: number; cursor: string }[] = [];

  if (shape.type === 'rect' || shape.type === 'blur') {
    const { x, y, width, height } = shape;
    borderEl = <KRect x={x} y={y} width={width} height={height} stroke={stroke} strokeWidth={10} dash={[6, 4]} listening={false} />;
    handles = bboxHandles(x, y, width, height);
  } else if (shape.type === 'pen') {
    const pts = shape.points;
    const xs = pts.filter((_, i) => i % 2 === 0);
    const ys = pts.filter((_, i) => i % 2 !== 0);
    const bx = Math.min(...xs); const by = Math.min(...ys);
    const bw = Math.max(...xs) - bx; const bh = Math.max(...ys) - by;
    borderEl = <KRect x={bx} y={by} width={bw} height={bh} stroke={stroke} strokeWidth={10} dash={[6, 4]} listening={false} />;
    handles = bboxHandles(bx, by, bw, bh);
  } else if (shape.type === 'arrow') {
    const [x1, y1, x2, y2] = shape.points;
    borderEl = null; // ok için çerçeve yok, sadece endpoint handle'lar
    handles = [
      { id: 'p1', x: x1, y: y1, cursor: 'move' },
      { id: 'p2', x: x2, y: y2, cursor: 'move' },
    ];
  } else if (shape.type === 'text') {
    // KText'in bounding box'ını yaklaşık hesapla
    const approxW = shape.text.split('\n').reduce((m, l) => Math.max(m, l.length), 0) * shape.fontSize * 0.6;
    const approxH = shape.text.split('\n').length * shape.fontSize * 1.2;
    borderEl = <KRect x={shape.x} y={shape.y} width={approxW} height={approxH} stroke={stroke} strokeWidth={10} dash={[6, 4]} listening={false} />;
    handles = bboxHandles(shape.x, shape.y, approxW, approxH);
  } else if (shape.type === 'number') {
    const { x, y, radius: r } = shape;
    borderEl = <KCircle x={x} y={y} radius={r + 4} stroke={stroke} strokeWidth={10} dash={[6, 4]} listening={false} />;
    handles = bboxHandles(x - r, y - r, r * 2, r * 2);
  }

  return (
    <>
      {borderEl}
      {handles.map((h) => (
        <KRect
          key={h.id}
          x={h.x - hs / 2}
          y={h.y - hs / 2}
          width={hs}
          height={hs}
          fill="white"
          stroke={stroke}
          strokeWidth={2}
          cornerRadius={3}
          shadowColor="rgba(0,0,0,0.4)"
          shadowBlur={4}
          shadowOffsetY={1}
          onMouseDown={(e) => onHandleMouseDown(h.id, e)}
          onMouseEnter={() => setCursor(h.cursor)}
          onMouseLeave={() => setCursor('default')}
        />
      ))}
    </>
  );
}

function ShapeNode(props: {
  shape: Shape;
  imageEl: HTMLImageElement;
  imageW: number;
  imageH: number;
  tool: string;
  selected: boolean;
  onSelect: () => void;
  onSelectTool: () => void;
  onCommit: (updater: (s: Shape) => Shape) => void;
  onTextDblClick: (id: string) => void;
  hidden: boolean;
}) {
  const { shape: s, imageEl, tool, selected, onSelect, onSelectTool, onCommit, onTextDblClick, hidden } = props;
  const blurRef = useRef<Konva.Image>(null);

  // Blur node'unun filter'ı çalışsın diye cache et.
  useEffect(() => {
    if (s.type !== 'blur') return;
    const node = blurRef.current;
    if (!node) return;
    if (s.width <= 0 || s.height <= 0) return;
    node.cache();
    node.getLayer()?.batchDraw();
  }, [s, s.type === 'blur' ? s.width : 0, s.type === 'blur' ? s.height : 0]);

  if (hidden) return null;

  // Crop dışındaki tüm tool'larda shape'e tıklanabilir.
  const clickable = tool !== 'crop';
  // Sadece select tool'da sürüklenebilir.
  const draggable = tool === 'select';

  const highlightProps = selected
    ? { shadowColor: '#fbbf24', shadowBlur: 12, shadowOpacity: 0.9 }
    : {};

  const interactive = clickable
    ? {
        listening: true,
        draggable,
        onClick: (e: Konva.KonvaEventObject<MouseEvent>) => {
          e.cancelBubble = true;
          onSelect();
          if (tool !== 'select') onSelectTool();
        },
        onTap: (e: Konva.KonvaEventObject<TouchEvent>) => {
          e.cancelBubble = true;
          onSelect();
          if (tool !== 'select') onSelectTool();
        },
      }
    : { listening: false as const };

  switch (s.type) {
    case 'pen':
      return (
        <Line
          {...interactive}
          {...highlightProps}
          points={s.points}
          stroke={s.stroke}
          strokeWidth={s.strokeWidth}
          tension={0.4}
          lineCap="round"
          lineJoin="round"
          // Drag bittiğinde points dizisini node offset'i ile dengele.
          onDragEnd={(e) => {
            if (!draggable) return;
            const node = e.target;
            const dx = node.x();
            const dy = node.y();
            const newPoints = (s.points as number[]).map((p, i) =>
              i % 2 === 0 ? p + dx : p + dy,
            );
            node.position({ x: 0, y: 0 });
            onCommit((sh) => (sh.type === 'pen' ? { ...sh, points: newPoints } : sh));
          }}
        />
      );
    case 'rect':
      return (
        <KRect
          {...interactive}
          {...highlightProps}
          x={s.x}
          y={s.y}
          width={s.width}
          height={s.height}
          stroke={s.stroke}
          strokeWidth={s.strokeWidth}
          onDragEnd={(e) => {
            if (!draggable) return;
            const node = e.target;
            onCommit((sh) =>
              sh.type === 'rect' ? { ...sh, x: node.x(), y: node.y() } : sh,
            );
          }}
        />
      );
    case 'arrow':
      return (
        <KArrow
          {...interactive}
          {...highlightProps}
          points={s.points}
          stroke={s.stroke}
          fill={s.stroke}
          strokeWidth={s.strokeWidth}
          pointerLength={Math.max(8, s.strokeWidth * s.headSize)}
          pointerWidth={Math.max(8, s.strokeWidth * s.headSize)}
          onDragEnd={(e) => {
            if (!draggable) return;
            const node = e.target;
            const dx = node.x();
            const dy = node.y();
            const [x1, y1, x2, y2] = s.points;
            const newPoints: [number, number, number, number] = [
              x1 + dx,
              y1 + dy,
              x2 + dx,
              y2 + dy,
            ];
            node.position({ x: 0, y: 0 });
            onCommit((sh) =>
              sh.type === 'arrow' ? { ...sh, points: newPoints } : sh,
            );
          }}
        />
      );
    case 'blur':
      if (s.width <= 0 || s.height <= 0) return null;
      return (
        <KImage
          {...interactive}
          {...highlightProps}
          ref={blurRef}
          image={imageEl}
          x={s.x}
          y={s.y}
          width={s.width}
          height={s.height}
          crop={{ x: s.x, y: s.y, width: s.width, height: s.height }}
          filters={[Konva.Filters.Blur]}
          blurRadius={s.blurRadius}
          onDragEnd={(e) => {
            if (!draggable) return;
            const node = e.target;
            // Blur shape'i taşıyınca crop kaynağı da güncellensin (yeni
            // pozisyondan crop alıyor).
            onCommit((sh) =>
              sh.type === 'blur' ? { ...sh, x: node.x(), y: node.y() } : sh,
            );
          }}
        />
      );
    case 'text':
      return (
        <KText
          {...interactive}
          {...highlightProps}
          x={s.x}
          y={s.y}
          text={s.text}
          fontSize={s.fontSize}
          fill={s.fill}
          fontStyle="bold"
          onDblClick={() => onTextDblClick(s.id)}
          onMouseEnter={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = draggable ? 'move' : 'text';
          }}
          onMouseLeave={(e) => {
            const stage = e.target.getStage();
            if (stage) stage.container().style.cursor = '';
          }}
          onDragEnd={(e) => {
            if (!draggable) return;
            const node = e.target;
            onCommit((sh) =>
              sh.type === 'text' ? { ...sh, x: node.x(), y: node.y() } : sh,
            );
          }}
        />
      );
    case 'number': {
      // Numara: dolu daire + beyaz numara metni. Group olarak taşınır.
      const r = s.radius;
      const fontSize = Math.round(r * 1.1);
      const text = String(s.value);
      // Text genişliğine göre x offset ayarlamaya çalış (kabaca centerlamak için).
      return (
        <KGroup
          {...interactive}
          x={s.x}
          y={s.y}
          onDragEnd={(e) => {
            if (!draggable) return;
            const node = e.target;
            onCommit((sh) =>
              sh.type === 'number' ? { ...sh, x: node.x(), y: node.y() } : sh,
            );
          }}
        >
          <KCircle
            x={0}
            y={0}
            radius={r}
            fill={s.fill}
            stroke="#fff"
            strokeWidth={2}
            {...highlightProps}
          />
          <KText
            x={-r}
            y={-fontSize / 2}
            width={r * 2}
            height={fontSize}
            text={text}
            fontSize={fontSize}
            fill="#fff"
            fontStyle="bold"
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </KGroup>
      );
    }
  }
}

function cursorForTool(tool: string): string {
  switch (tool) {
    case 'text':
      return 'text';
    case 'pen':
    case 'rect':
    case 'arrow':
    case 'blur':
    case 'number':
      return 'crosshair';
    case 'crop':
      return 'default';
    case 'select':
      return 'default';
    default:
      return 'default';
  }
}

function EmptyState() {
  const shortcuts = useConfigStore((s) => s.shortcuts);
  const appliedTheme = useAppliedTheme();
  // İsim suffix'i logo'nun kendi rengini belirtir; tema ile ters eşleşir.
  const logo = appliedTheme === 'dark' ? logoLight : logoDark;
  const recordingActive = useRecordingStore((s) => s.active);
  const withMic = useRecordingStore((s) => s.withMic);
  const setWithMic = useRecordingStore((s) => s.setWithMic);
  const withFaceCam = useRecordingStore((s) => s.withFaceCam);
  const setWithFaceCam = useRecordingStore((s) => s.setWithFaceCam);
  const withCountdown = useRecordingStore((s) => s.withCountdown);
  const setWithCountdown = useRecordingStore((s) => s.setWithCountdown);
  const startFullscreen = useRecordingStore((s) => s.startFullscreen);
  const startWindow = useRecordingStore((s) => s.startWindow);
  const startArea = useRecordingStore((s) => s.startArea);
  const [windowPickerOpen, setWindowPickerOpen] = useState(false);
  const [captureWindowPickerOpen, setCaptureWindowPickerOpen] = useState(false);

  const startFullscreenRecording = () => {
    if (recordingActive) return;
    void startFullscreen();
  };

  const startWindowRecordingFlow = () => {
    if (recordingActive) return;
    setWindowPickerOpen(true);
  };

  const onPickWindow = (source: SourceInfo) => {
    setWindowPickerOpen(false);
    void startWindow(source);
  };

  const setImage = useEditorStore((s) => s.setImage);

  const onPickCaptureWindow = (source: SourceInfo) => {
    setCaptureWindowPickerOpen(false);
    void window.api.capture
      .screenshot({ mode: 'window', sourceId: source.id })
      .then((r) => setImage(r.pngBuffer, r.width, r.height, r.capturedAt));
  };

  const startAreaRecordingFlow = () => {
    if (recordingActive) return;
    void startArea();
  };

  return (
    <>
      <div className="flex-1 flex items-center justify-center text-fg-muted">
        <div className="text-center w-full max-w-3xl px-6">
          <img
            src={logo}
            alt="ClackShot"
            className="h-12 mx-auto mb-3 select-none"
            draggable={false}
          />
          <div className="text-sm text-fg-subtle mb-8">
            Bir ekran görüntüsü almak için aşağıdaki seçeneklerden birini kullanın.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {/* Ekran Görüntüsü */}
            <div>
              <div className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-2 h-6 flex items-center">
                Ekran Görüntüsü
              </div>
              <div className="flex flex-col gap-2">
                <CaptureButton
                  mode="area"
                  label="Alan Seç"
                  hint={shortcuts?.captureArea ?? ''}
                />
                <CaptureButton
                  mode="fullscreen"
                  label="Tam Ekran"
                  hint={shortcuts?.captureFullscreen ?? ''}
                />
                <button
                  onClick={() => setCaptureWindowPickerOpen(true)}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-raised hover:bg-surface-hover border border-surface-border transition-colors group"
                >
                  <span className="text-fg font-medium">Pencere</span>
                  <span className="text-xs text-fg-subtle font-mono group-hover:text-fg-muted">
                    {shortcuts?.captureWindow ?? ''}
                  </span>
                </button>
              </div>
            </div>

            {/* Ekran Kaydı */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-2 h-6">
                <div className="text-xs font-semibold text-fg-subtle uppercase tracking-wider">
                  Ekran Kaydı
                </div>
                <div className="flex items-center gap-1.5">
                  <CountdownToggle
                    enabled={withCountdown}
                    onChange={setWithCountdown}
                  />
                  <MicToggle enabled={withMic} onChange={setWithMic} />
                  <FaceCamToggle enabled={withFaceCam} onChange={setWithFaceCam} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <RecordButton
                  label="Alan Kaydet"
                  hint={shortcuts?.recordArea ?? ''}
                  disabled={recordingActive}
                  onClick={startAreaRecordingFlow}
                />
                <RecordButton
                  label="Tam Ekran Kaydet"
                  hint={shortcuts?.recordFullscreen ?? ''}
                  disabled={recordingActive}
                  onClick={startFullscreenRecording}
                />
                <RecordButton
                  label="Pencere Kaydet"
                  hint={shortcuts?.recordWindow ?? ''}
                  disabled={recordingActive}
                  onClick={startWindowRecordingFlow}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 text-xs text-fg-subtle/60">
            Sistem tray ikonundan veya global kısayollarla da capture alabilirsiniz.
          </div>
        </div>
      </div>

      <SourcePicker
        open={windowPickerOpen}
        type="window"
        title="Kaydedilecek Pencereyi Seç"
        onCancel={() => setWindowPickerOpen(false)}
        onPick={onPickWindow}
      />
      <SourcePicker
        open={captureWindowPickerOpen}
        type="window"
        title="Ekran Görüntüsü Alınacak Pencereyi Seç"
        onCancel={() => setCaptureWindowPickerOpen(false)}
        onPick={onPickCaptureWindow}
      />
    </>
  );
}

function MicToggle(props: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => props.onChange(!props.enabled)}
      title={props.enabled ? 'Mikrofon açık' : 'Mikrofon kapalı'}
      className={
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ' +
        (props.enabled
          ? 'bg-accent/20 text-accent border border-accent/40'
          : 'bg-surface-hover text-fg-muted border border-surface-border hover:text-fg')
      }
    >
      <MicIcon muted={!props.enabled} />
      <span className="font-medium">{props.enabled ? 'Mikrofon' : 'Sessiz'}</span>
    </button>
  );
}

function CountdownToggle(props: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => props.onChange(!props.enabled)}
      title={props.enabled ? '3-2-1 sayım açık' : '3-2-1 sayım kapalı'}
      className={
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ' +
        (props.enabled
          ? 'bg-accent/20 text-accent border border-accent/40'
          : 'bg-surface-hover text-fg-muted border border-surface-border hover:text-fg')
      }
    >
      <span className="font-mono font-semibold">3·2·1</span>
    </button>
  );
}

function FaceCamToggle(props: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => props.onChange(!props.enabled)}
      title={props.enabled ? 'Yüz kamerası açık' : 'Yüz kamerası kapalı'}
      className={
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ' +
        (props.enabled
          ? 'bg-accent/20 text-accent border border-accent/40'
          : 'bg-surface-hover text-fg-muted border border-surface-border hover:text-fg')
      }
    >
      <CamIcon disabled={!props.enabled} />
      <span className="font-medium">Kamera</span>
    </button>
  );
}

function CamIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
      {disabled && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" />}
    </svg>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      {muted && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" />}
    </svg>
  );
}

function RecordButton(props: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={
        'flex items-center justify-between px-4 py-3 rounded-xl border transition-colors group ' +
        (props.disabled
          ? 'bg-surface-raised/40 border-surface-border/50 text-fg-subtle/60 cursor-not-allowed'
          : 'bg-surface-raised hover:bg-surface-hover border-surface-border text-fg')
      }
    >
      <span className="font-medium flex items-center gap-2">
        <span
          className={
            'w-2 h-2 rounded-full ' + (props.disabled ? 'bg-zinc-600' : 'bg-red-500')
          }
        />
        {props.label}
      </span>
      {props.hint && (
        <span className="text-xs text-fg-subtle font-mono group-hover:text-fg-muted">
          {props.hint}
        </span>
      )}
    </button>
  );
}

function CaptureButton(props: {
  mode: 'area' | 'fullscreen' | 'window';
  label: string;
  hint: string;
}) {
  return (
    <button
      onClick={() => window.api.capture.trigger(props.mode)}
      className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-raised hover:bg-surface-hover border border-surface-border transition-colors group"
    >
      <span className="text-fg font-medium">{props.label}</span>
      <span className="text-xs text-fg-subtle font-mono group-hover:text-fg-muted">
        {props.hint}
      </span>
    </button>
  );
}
