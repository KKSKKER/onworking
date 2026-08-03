import * as fs from 'node:fs';
import * as path from 'node:path';

/** 判据:.onworking/ 存在 → 打开,否则新建。单一判定点,前端不选。 */
export function resolveLaunchMode(rootPath: string): 'open' | 'create' {
  return fs.existsSync(path.join(rootPath, '.onworking')) ? 'open' : 'create';
}
