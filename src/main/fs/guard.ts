import * as path from 'node:path';

/** 断言 target 解析后位于 root 内,返回绝对路径;否则抛错。 */
export function assertInsideRoot(root: string, target: string): string {
  const rootAbs = path.resolve(root);
  const targetAbs = path.resolve(target);
  if (targetAbs !== rootAbs && !targetAbs.startsWith(rootAbs + path.sep)) {
    throw new Error(`目标路径不在工作区范围内: ${target}`);
  }
  return targetAbs;
}
