import { afterEach, describe, expect, it } from 'vitest';
import {
  clearStudioWorkspace,
  loadLeftSidebarCollapsed,
  loadRightSidebarCollapsed,
  loadStudioWorkspace,
  saveLeftSidebarCollapsed,
  saveRightSidebarCollapsed,
  saveStudioWorkspace,
} from './studio-storage.js';

afterEach(() => localStorage.clear());

describe('studio storage', () => {
  it('round-trips the canonical workspace bytes', () => {
    const original = Uint8Array.from([0, 1, 2, 127, 128, 255]);

    expect(saveStudioWorkspace(original)).toBe(true);
    expect(loadStudioWorkspace()).toEqual(original);

    clearStudioWorkspace();
    expect(loadStudioWorkspace()).toBeNull();
  });

  it('discards corrupt saved workspaces', () => {
    localStorage.setItem('workspec-studio.workspace.v1', '{broken');

    expect(loadStudioWorkspace()).toBeNull();
    expect(localStorage.getItem('workspec-studio.workspace.v1')).toBeNull();
  });

  it('defaults both sidebars to collapsed and remembers changes', () => {
    expect(loadLeftSidebarCollapsed()).toBe(true);
    expect(loadRightSidebarCollapsed()).toBe(true);

    saveLeftSidebarCollapsed(false);
    saveRightSidebarCollapsed(false);

    expect(loadLeftSidebarCollapsed()).toBe(false);
    expect(loadRightSidebarCollapsed()).toBe(false);
  });
});
