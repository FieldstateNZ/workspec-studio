import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { MemoryWorkspace, WorkspaceImportError, importWorkspecZip } from '../src/index.js';

describe('WorkSpec workspace ZIPs', () => {
  it('imports a nested project root and preserves unknown files', () => {
    const files = importWorkspecZip(zipSync({
      'project/.workspec/system/app.yaml': strToU8('kind: System\n'),
      'project/.workspec/custom/evidence.bin': new Uint8Array([0, 255, 7]),
      'project/README.md': strToU8('ignored'),
    }));
    expect(Object.keys(files).sort()).toEqual(['.workspec/custom/evidence.bin', '.workspec/system/app.yaml']);
    expect(files['.workspec/custom/evidence.bin']).toEqual(new Uint8Array([0, 255, 7]));
  });

  it('round-trips edits through the canonical file map', () => {
    const workspace = new MemoryWorkspace({ '.workspec/a.yaml': strToU8('a: 1') });
    workspace.writeText('.workspec/a.yaml', 'a: 2');
    const roundTrip = importWorkspecZip(workspace.toZip());
    const result = roundTrip['.workspec/a.yaml'];
    expect(result).toBeDefined();
    if (result === undefined) throw new Error('round-trip file missing');
    expect(strFromU8(result)).toBe('a: 2');
  });

  it('rejects archives without .workspec', () => {
    expect(() => importWorkspecZip(zipSync({ 'README.md': strToU8('no') }))).toThrow(WorkspaceImportError);
  });

  it('rejects writes outside .workspec', () => {
    const workspace = new MemoryWorkspace();
    expect(() => workspace.writeText('README.md', 'nope')).toThrow('must target .workspec');
  });
});
