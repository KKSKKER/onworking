import type { RuleDefinition } from '../../common/types/etl-types';

/** 把规则 sources[].pattern 中引用旧文件名的 glob 替换为新文件名。无变化时返回原引用。 */
export function rewriteRulePatterns(
  rules: RuleDefinition[],
  oldBasename: string,
  newBasename: string,
): RuleDefinition[] {
  if (!oldBasename || oldBasename === newBasename) return rules;
  const oldLower = oldBasename.toLowerCase();
  return rules.map(rule => {
    const sources = (rule.sources ?? []).map(src => {
      if (!src.pattern) return src;
      // 仅匹配 pattern 的最后一个路径段(不区分大小写,与 Windows 文件系统一致),
      // 避免把仅包含旧文件名字符串的其他规则误改。
      const segments = src.pattern.split('/');
      const last = segments[segments.length - 1];
      if (last.toLowerCase() !== oldLower) return src;
      const pattern = [...segments.slice(0, -1), newBasename].join('/');
      return { ...src, pattern };
    });
    const changed = sources.some((src, i) => src !== (rule.sources ?? [])[i]);
    return changed ? { ...rule, sources } : rule;
  });
}
