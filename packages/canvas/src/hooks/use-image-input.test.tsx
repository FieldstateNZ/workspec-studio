import { describe, expect, test } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ChangeEvent, ReactNode, RefObject } from 'react';
import { useImageInput } from './use-image-input.js';
import { CanvasProvider } from '../canvas-provider.js';
import { createCanvasStore } from '../store/store.js';
import type { CanvasStoreInstance } from '../store/store.types.js';

// Image-input placement-seam bail-out (S1 debt item 5, FIX 1b): without a
// measurable container there is NOWHERE to place a pasted/picked image —
// the enterprise window-centre fallback is gone with the viewport seam, so
// the gesture must be a clean no-op (no shape, no error), checked BEFORE
// the compress pipeline runs.

function wrapperFor(instance: CanvasStoreInstance) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <CanvasProvider store={instance}>{children}</CanvasProvider>;
  };
}

function pngFile(): File {
  return new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' });
}

function changeEventWith(file: File): ChangeEvent<HTMLInputElement> {
  return {
    target: { files: [file], value: '' },
  } as unknown as ChangeEvent<HTMLInputElement>;
}

describe('useImageInput — container bail-out', () => {
  test('file-picker ingestion with no measurable container is a clean no-op', async () => {
    const instance = createCanvasStore();
    const nullRef: RefObject<HTMLDivElement | null> = { current: null };
    const { result } = renderHook(() => useImageInput(nullRef), {
      wrapper: wrapperFor(instance),
    });

    result.current.handleFileChange(changeEventWith(pngFile()));
    // The bail happens synchronously before the async encode; flush anyway.
    await Promise.resolve();
    expect(Object.keys(instance.getState().shapes)).toHaveLength(0);
    expect(instance.getState().history.stack).toHaveLength(0);
  });

  test('non-image files are ignored regardless of container', async () => {
    const instance = createCanvasStore();
    const div = document.createElement('div');
    const ref: RefObject<HTMLDivElement | null> = { current: div };
    const { result } = renderHook(() => useImageInput(ref), {
      wrapper: wrapperFor(instance),
    });

    const textFile = new File(['hi'], 'x.txt', { type: 'text/plain' });
    result.current.handleFileChange(changeEventWith(textFile));
    await Promise.resolve();
    expect(Object.keys(instance.getState().shapes)).toHaveLength(0);
  });
});
