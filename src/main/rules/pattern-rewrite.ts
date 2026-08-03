import type { RuleDefinition } from '../../common/types/etl-types';

/** 把规则 sources[].pattern 中引用旧文件名的 glob 替换为新文件名。无变化时返回原引用。 */
export function rewriteRulePatterns(
  rules: RuleDefinition[],
  oldBasename: string,
  newBasename: string,
): RuleDefinition[] {
  if (!oldBasename || oldBasename === newBasename) return rules;
  return rules.map(rule => {
    const sources = (rule.sources ?? []).map(src => {
      if (src.pattern && src.pattern.includes(oldBasename)) {
        return { ...src, pattern: src.pattern.split(oldBasename).join(newBasename) };
      }
      return src;
    });
    const changed = sources.some((src, i) => src !== (rule.sources ?? [])[i]);
    return changed ? { ...rule, sources } : rule;
  });
}
