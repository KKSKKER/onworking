/** 简易 glob 匹配（支持 ** 和 *） */
export function matchGlob(filePath: string, pattern: string): boolean {
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');

  return new RegExp(`^${regexStr}$`, 'i').test(filePath);
}
