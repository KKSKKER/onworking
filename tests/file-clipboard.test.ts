import { describe, expect, it, beforeEach } from 'vitest';
import { FileClipboard } from '../src/renderer/state/FileClipboard';

describe('FileClipboard', () => {
  beforeEach(() => FileClipboard.clear());
  it('starts empty', () => { expect(FileClipboard.has()).toBe(false); });
  it('stores a source path', () => {
    FileClipboard.copy('/ws/source/a.xlsx');
    expect(FileClipboard.get()).toEqual({ sourcePath: '/ws/source/a.xlsx' });
    expect(FileClipboard.has()).toBe(true);
  });
  it('clear empties', () => { FileClipboard.copy('/a'); FileClipboard.clear(); expect(FileClipboard.has()).toBe(false); });
});
