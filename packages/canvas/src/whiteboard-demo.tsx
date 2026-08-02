import { useRef, useState, type FC } from 'react';
import { CanvasProvider } from './canvas-provider.js';
import { Canvas } from './canvas.js';
import { Toolbar } from './components/toolbar.js';
import { createCanvasStore } from './store/store.js';
import { registerWhiteboard } from './register-whiteboard.js';
import { useImageInput } from './hooks/use-image-input.js';
import { createShapeId } from './utils/ids.js';
import { generateInitialKey, generateKeyAfter } from './utils/fractional-index.js';
import { DRAW_DEFAULT_STROKE } from './style/shape-defaults.js';
import type { CanvasStoreInstance } from './store/store.types.js';
import type { Shape, ShapeId } from './types.js';

// A 1×1 transparent PNG — enough for the image shape to render a real <img>.
const DEMO_IMAGE_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Seed one of every base shape type: two stickies (one torn), text, a draw
 * stroke, an image, and a Discovery connector between the stickies.
 * Exported so tests and the demo render the same fixture.
 */
export function seedWhiteboardDemoShapes(instance: CanvasStoreInstance): void {
  let key = generateInitialKey();
  const nextKey = (): string => {
    const k = key;
    key = generateKeyAfter(key);
    return k;
  };

  const stickyA = createShapeId();
  const stickyB = createShapeId();
  const shapes: Shape[] = [
    {
      id: stickyA,
      type: 'sticky',
      x: 80,
      y: 80,
      width: 210,
      height: 150,
      index: nextKey(),
      text: 'Capture the idea',
      title: 'Sticky',
      color: 'yellow',
    },
    {
      id: stickyB,
      type: 'sticky',
      x: 420,
      y: 320,
      width: 210,
      height: 150,
      index: nextKey(),
      text: 'Blue paper, torn edge',
      color: 'blue',
      torn: true,
    },
    {
      id: createShapeId(),
      type: 'text',
      x: 120,
      y: 300,
      width: 200,
      height: 40,
      index: nextKey(),
      text: 'Loose text label',
      fontSize: 16,
      fontWeight: 400,
    },
    {
      id: createShapeId(),
      type: 'draw',
      x: 380,
      y: 90,
      width: 120,
      height: 80,
      index: nextKey(),
      points: [
        { x: 0, y: 80 },
        { x: 30, y: 20 },
        { x: 70, y: 60 },
        { x: 120, y: 0 },
      ],
      strokeWidth: 2,
      color: DRAW_DEFAULT_STROKE,
    },
    {
      id: createShapeId(),
      type: 'image',
      x: 640,
      y: 100,
      width: 160,
      height: 120,
      index: nextKey(),
      src: DEMO_IMAGE_SRC,
      naturalWidth: 160,
      naturalHeight: 120,
    },
    {
      id: createShapeId(),
      type: 'connector',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      index: nextKey(),
      sourceShapeId: stickyA,
      targetShapeId: stickyB,
      edgeFrom: stickyA,
      edgeTo: stickyB,
      label: 'relates to',
    },
  ];

  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
}

const DemoSurface: FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { fileInputRef, triggerUpload, handleFileChange } = useImageInput(rootRef);
  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0 }}>
      <Canvas backgroundVariant="dots" showMinimap />
      <Toolbar onUploadImage={triggerUpload} />
      <input
        // React 18's ref prop type predates the `| null` RefObject shape the
        // hook returns; the cast is sound (same object, null until mount).
        ref={fileInputRef as React.RefObject<HTMLInputElement>}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
};

/**
 * The whiteboard demo story (#118 acceptance fixture): a full canvas with
 * the whiteboard set registered, every base shape seeded, the default
 * chrome stack + toolbar + image input. Mount it full-bleed in any host:
 *
 * ```tsx
 * import '@workspec/canvas/styles.css';
 * <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
 *   <WhiteboardDemo />
 * </div>
 * ```
 */
export const WhiteboardDemo: FC = () => {
  const [instance] = useState(() => {
    const inst = createCanvasStore();
    registerWhiteboard(inst);
    seedWhiteboardDemoShapes(inst);
    return inst;
  });
  return (
    <CanvasProvider store={instance}>
      <DemoSurface />
    </CanvasProvider>
  );
};
