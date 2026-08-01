/** 简易 glob 匹配（支持 ** 和 *）。** 匹配零个或多个目录层级。 */
export function matchGlob(filePath: string, pattern: string): boolean {
  let regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // **/ → optional directory prefix (zero or more path segments)
    .replace(/\*\*\//g, '(.*/)?')
    // remaining ** without trailing / → greedy match
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');

  return new RegExp(`^${regexStr}$`, 'i').test(filePath);
}
