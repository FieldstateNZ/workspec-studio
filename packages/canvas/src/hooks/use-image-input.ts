import { useEffect, useRef, useCallback, type ChangeEvent, type RefObject } from 'react';
import { useCanvasInstance } from '../canvas-provider.js';
import { createShapeId } from '../utils/ids.js';
import { generateInitialKey, generateKeyAfter } from '../utils/fractional-index.js';
import { screenToPage } from '../utils/transforms.js';
import type { ImageShape } from '../shape-types.js';

const MAX_ENCODE_DIM = 1600; // max px before JPEG compression
const MAX_DISPLAY_PX = 800; // max page-space size when placed

/**
 * Read an image File, downscale to MAX_ENCODE_DIM, and re-encode as a
 * compressed JPEG data URL. Shared by the standalone ImageShape drop and
 * any host media capture that wants the same size/quality budget on the
 * stored bytes.
 */
export async function compressImageFile(
  file: File,
): Promise<{ src: string; naturalWidth: number; naturalHeight: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('unexpected FileReader result'));
        return;
      }
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const { naturalWidth, naturalHeight } = img;
        const scale = Math.min(1, MAX_ENCODE_DIM / Math.max(naturalWidth, naturalHeight));
        const w = Math.round(naturalWidth * scale);
        const h = Math.round(naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('no 2d context'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ src: canvas.toDataURL('image/jpeg', 0.85), naturalWidth, naturalHeight });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Image intake for the canvas: paste from the clipboard, drag-and-drop
 * onto the container, or a programmatic file-picker (`triggerUpload` +
 * `handleFileChange` wired to a hidden input). Every path compresses the
 * file and creates a selected ImageShape at the drop point (or the
 * container centre), then switches back to the select tool.
 */
export function useImageInput(
  containerRef: RefObject<HTMLDivElement | null>,
  opts: { enabled?: boolean } = {},
): {
  fileInputRef: RefObject<HTMLInputElement | null>;
  triggerUpload: () => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
} {
  const instance = useCanvasInstance();
  const enabled = opts.enabled !== false;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const placeImage = useCallback(
    async (file: File, dropClientX?: number, dropClientY?: number) => {
      if (!file.type.startsWith('image/')) return;
      // Placement seam guard FIRST (the enterprise window-size fallback is
      // gone with the viewport seam): without a container there is nowhere
      // to place the image, so bail before paying for the compress.
      if (!containerRef.current) return;
      try {
        const { src, naturalWidth, naturalHeight } = await compressImageFile(file);
        const store = instance.getState();
        const { camera, shapes } = store;

        // Display size: fit within MAX_DISPLAY_PX, preserve aspect ratio.
        const scale = Math.min(1, MAX_DISPLAY_PX / Math.max(naturalWidth, naturalHeight));
        const w = Math.round(naturalWidth * scale);
        const h = Math.round(naturalHeight * scale);

        // Re-check around the await — the canvas may have unmounted while
        // the encode ran.
        const el = containerRef.current;
        if (!el) return;
        let pageX: number;
        let pageY: number;
        if (dropClientX !== undefined && dropClientY !== undefined) {
          const rect = el.getBoundingClientRect();
          const p = screenToPage(
            { x: dropClientX - rect.left, y: dropClientY - rect.top },
            camera,
          );
          pageX = p.x - w / 2;
          pageY = p.y - h / 2;
        } else {
          const center = screenToPage({ x: el.clientWidth / 2, y: el.clientHeight / 2 }, camera);
          pageX = center.x - w / 2;
          pageY = center.y - h / 2;
        }

        const id = createShapeId();
        const maxKey =
          Object.values(shapes)
            .map((s) => s.index)
            .sort()
            .at(-1) ?? null;
        const index = maxKey ? generateKeyAfter(maxKey) : generateInitialKey();

        const shape: ImageShape = {
          id,
          type: 'image',
          x: pageX,
          y: pageY,
          width: w,
          height: h,
          index,
          src,
          naturalWidth,
          naturalHeight,
        };

        store.createShape(shape);
        store.select([id], 'replace');
        store.setActiveTool('select');
      } catch (err) {
        // Unexpected decode/encode failure — surfaced for diagnosis, the
        // gesture is simply dropped (matching enterprise behaviour).
        console.error('Failed to load image:', err);
      }
    },
    [containerRef, instance],
  );

  // Paste from clipboard.
  useEffect(() => {
    if (!enabled) return;
    const handlePaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
        return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void placeImage(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [enabled, placeImage]);

  // Drag-and-drop onto the canvas.
  useEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;
    const handleDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const handleDrop = (e: DragEvent): void => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          void placeImage(file, e.clientX, e.clientY);
          break;
        }
      }
    };
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);
    return () => {
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('drop', handleDrop);
    };
  }, [enabled, containerRef, placeImage]);

  const triggerUpload = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void placeImage(file);
      e.target.value = '';
    },
    [placeImage],
  );

  return { fileInputRef, triggerUpload, handleFileChange };
}
