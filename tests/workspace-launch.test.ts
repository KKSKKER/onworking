import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveLaunchMode } from '../src/main/workspace/launch';

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-'));
  dirs.push(d);
  return d;
}
afterEach(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); dirs.length = 0; });

describe('resolveLaunchMode', () => {
  it('returns "open" when .onworking/ exists', () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, '.onworking'), { recursive: true });
    expect(resolveLaunchMode(d)).toBe('open');
  });
  it('returns "create" when .onworking/ is missing', () => {
    const d = tmp();
    expect(resolveLaunchMode(d)).toBe('create');
  });
});
