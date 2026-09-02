let pendingImport: File | null = null;

export function setPendingImport(file: File): void {
  pendingImport = file;
}

export function takePendingImport(): File | null {
  const file = pendingImport;
  pendingImport = null;
  return file;
}
