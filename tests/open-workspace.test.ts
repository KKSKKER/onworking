import { describe, expect, it, beforeEach, vi } from 'vitest';
import { openWorkspace, openWorkspacePath } from '../src/renderer/api/openWorkspace';

const call = vi.fn();
const pickFolder = vi.fn();

beforeEach(() => {
  call.mockReset();
  pickFolder.mockReset();
  (globalThis as unknown as { window: unknown }).window = {
    onworking: { api: { call }, pickFolder },
  };
});

describe('openWorkspacePath', () => {
  it('calls workspace.launch and returns info', async () => {
    const info = { root: '/ws', sourceDir: '/ws/source', rulesDir: '/ws/.onworking/rules', entitiesDir: '/ws/.onworking/entities', dbPath: '/ws/.onworking/db/onworking.db' };
    call.mockResolvedValue({ success: true, data: info });
    const res = await openWorkspacePath('/ws');
    expect(call).toHaveBeenCalledWith('workspace.launch', { rootPath: '/ws' });
    expect(res).toEqual(info);
  });
  it('throws when launch fails', async () => {
    call.mockResolvedValue({ success: false, error: 'bad' });
    await expect(openWorkspacePath('/ws')).rejects.toThrow('bad');
  });
});

describe('openWorkspace', () => {
  it('returns null when picker cancelled', async () => {
    pickFolder.mockResolvedValue(null);
    expect(await openWorkspace()).toBeNull();
    expect(call).not.toHaveBeenCalled();
  });
  it('launches with picked path', async () => {
    pickFolder.mockResolvedValue('/picked');
    call.mockResolvedValue({ success: true, data: { root: '/picked' } });
    const res = await openWorkspace();
    expect(call).toHaveBeenCalledWith('workspace.launch', { rootPath: '/picked' });
    expect(res).toEqual({ root: '/picked' });
  });
});
