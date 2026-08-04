import * as path from 'node:path';
import { t } from '../../common/i18n';

/** 断言 target 解析后位于 root 内,返回绝对路径;否则抛错。 */
export function assertInsideRoot(root: string, target: string): string {
  const rootAbs = path.resolve(root);
  const targetAbs = path.resolve(target);
  if (targetAbs !== rootAbs && !targetAbs.startsWith(rootAbs + path.sep)) {
    throw new Error(t('error.targetOutsideWorkspace', { target }));
  }
  return targetAbs;
}
