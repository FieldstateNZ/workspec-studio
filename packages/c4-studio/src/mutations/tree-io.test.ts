import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RefEscapesRootError } from '@workspec/c4-model/fs';
import { createTreeIo } from './tree-io.js';

let outer: string;
let root: string;
beforeEach(async () => {
  outer = await mkdtemp(join(tmpdir(), 'c4-treeio-'));
  root = join(outer, 'served');
  await mkdir(join(root, '.workspec/actors'), { recursive: true });
  await writeFile(join(root, '.workspec/actors/architect.yaml'), 'title: Architect\n');
  await writeFile(join(outer, 'outside.txt'), 'do not touch\n');
});
afterEach(async () => {
  await rm(outer, { recursive: true, force: true });
});

describe('createTreeIo — root-confined delete', () => {
  it('deletes a file inside the root', async () => {
    await createTreeIo(root).deleteFile('.workspec/actors/architect.yaml');
    await expect(readFile(join(root, '.workspec/actors/architect.yaml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('refuses traversal, absolute paths, and the root itself — nothing outside is touched', async () => {
    const io = createTreeIo(root);
    await expect(io.deleteFile('../outside.txt')).rejects.toBeInstanceOf(RefEscapesRootError);
    await expect(io.deleteFile(join(outer, 'outside.txt'))).rejects.toBeInstanceOf(
      RefEscapesRootError,
    );
    await expect(io.deleteFile('.')).rejects.toBeInstanceOf(RefEscapesRootError);
    await expect(io.deleteFile('')).rejects.toBeInstanceOf(RefEscapesRootError);
    expect(await readFile(join(outer, 'outside.txt'), 'utf8')).toBe('do not touch\n');
  });

  it('rejects a missing file with the underlying ENOENT (callers pre-check existence)', async () => {
    await expect(
      createTreeIo(root).deleteFile('.workspec/actors/ghost.yaml'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
