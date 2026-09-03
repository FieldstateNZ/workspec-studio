const WORKSPACE_KEY = 'workspec-studio.workspace.v1';
const LEFT_SIDEBAR_KEY = 'workspec-studio.sidebar.left-collapsed';
const RIGHT_SIDEBAR_KEY = 'workspec-studio.sidebar.right-collapsed';

function encode(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decode(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function saveStudioWorkspace(bytes: Uint8Array): boolean {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ version: 1, zip: encode(bytes) }));
    return true;
  } catch {
    return false;
  }
}

export function loadStudioWorkspace(): Uint8Array | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as { version?: unknown; zip?: unknown };
    if (value.version !== 1 || typeof value.zip !== 'string') throw new Error('Unsupported saved workspace.');
    return decode(value.zip);
  } catch {
    try {
      localStorage.removeItem(WORKSPACE_KEY);
    } catch {
      // Storage can be unavailable in private or locked-down browser contexts.
    }
    return null;
  }
}

export function clearStudioWorkspace(): void {
  try {
    localStorage.removeItem(WORKSPACE_KEY);
  } catch {
    // Starting a fresh in-memory project should still work without storage.
  }
}

function loadBoolean(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function saveBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Sidebar preferences are optional when storage is unavailable.
  }
}

export function loadLeftSidebarCollapsed(): boolean {
  return loadBoolean(LEFT_SIDEBAR_KEY, true);
}

export function saveLeftSidebarCollapsed(collapsed: boolean): void {
  saveBoolean(LEFT_SIDEBAR_KEY, collapsed);
}

export function loadRightSidebarCollapsed(): boolean {
  return loadBoolean(RIGHT_SIDEBAR_KEY, true);
}

export function saveRightSidebarCollapsed(collapsed: boolean): void {
  saveBoolean(RIGHT_SIDEBAR_KEY, collapsed);
}
