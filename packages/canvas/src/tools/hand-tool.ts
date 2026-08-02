import type { Tool } from './tool-base.js';
import type { Camera, Vec2 } from '../types.js';

interface HandToolState {
  panStart: Vec2 | null;
  cameraStart: Camera | null;
}

/** The pan tool: drag anywhere to move the camera. Ported verbatim from the enterprise HandTool. */
export function createHandTool(): Tool {
  const state: HandToolState = {
    panStart: null,
    cameraStart: null,
  };

  return {
    name: 'hand',
    cursor: 'grab',

    onPointerDown: (e, store) => {
      state.panStart = { x: e.screenX, y: e.screenY };
      state.cameraStart = { ...store.camera };
    },

    onPointerMove: (e, store) => {
      if (!state.panStart || !state.cameraStart) return;
      const dx = (e.screenX - state.panStart.x) / state.cameraStart.zoom;
      const dy = (e.screenY - state.panStart.y) / state.cameraStart.zoom;
      store.setCamera({
        ...state.cameraStart,
        x: state.cameraStart.x - dx,
        y: state.cameraStart.y - dy,
      });
    },

    onPointerUp: () => {
      state.panStart = null;
      state.cameraStart = null;
    },

    onExit: () => {
      state.panStart = null;
      state.cameraStart = null;
    },
  };
}
