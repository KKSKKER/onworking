// onworking/src/main/rules/routes.ts
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { APIRouter } from '../api/router';
import { RuleStore, autoGenerateRule, ColumnProfile } from './rule-store';
import { ExcelParser } from '../plugins/onw-excel/parser';
import { defaultParseConfig } from '../../common/types/parse-config';
import { t } from '../../common/i18n';

export function registerRuleRoutes(router: APIRouter, rulesDir: string): void {
  const store = new RuleStore(rulesDir);

  /** Resolve the correct RuleStore — uses folder-specific store when rulesDir param is provided */
  function getStore(paramsRulesDir?: string): RuleStore {
    if (paramsRulesDir && paramsRulesDir !== rulesDir) {
      fs.mkdirSync(paramsRulesDir, { recursive: true });
      return new RuleStore(paramsRulesDir);
    }
    return store;
  }

  router.register('rule.list', async (params) => {
    const { rulesDir: rd } = (params || {}) as { rulesDir?: string };
    return getStore(rd).listAll();
  }, { description: 'List all extraction rules' });

  router.register('rule.get', async (params) => {
    const { name, rulesDir: rd } = params as { name: string; rulesDir?: string };
    return getStore(rd).load(name);
  }, { description: 'Get a rule by name' });

  router.register('rule.save', async (params) => {
    const { rulesDir: rd, ...rule } = params as Record<string, unknown>;
    const s = getStore(rd as string | undefined);
    s.save(rule as unknown as Parameters<typeof store.save>[0]);
    return { saved: true, name: (rule as { name: string }).name };
  }, { description: 'Save a rule to YAML' });

  router.register('rule.delete', async (params) => {
    const { name, rulesDir: rd } = params as { name: string; rulesDir?: string };
    getStore(rd).delete(name);
    return { deleted: true };
  }, { description: 'Delete a rule' });

  router.register('rule.autoGenerate', async (params) => {
    const { file, sheetIndex, headerRow, save, rulesDir: rd } = params as { file: string; sheetIndex?: number; headerRow?: number; save?: boolean; rulesDir?: string };
    if (!file) throw new Error(t('error.autoGenerateNeedsFile'));

    const parser = new ExcelParser();
    const structure = parser.scan(file);
    const fileName = file.replace(/^.*[\\/]/, '');

    if (structure.sheets.length === 0) throw new Error(t('error.noSheetsFound'));

    const si = sheetIndex ?? 0;
    const hr = headerRow ?? 1;
    const shouldSave = save !== false;
    const config = defaultParseConfig(file, si, hr);
    const chunks = parser.parse(file, config);

    const allRows = chunks.flatMap(c => c.rows).slice(0, 50);
    const headers = [...new Set(allRows.flatMap(r => Object.keys(r)))];

    const profiles: ColumnProfile[] = headers.map((h, i) => {
      const values = allRows.map(r => r[h]?.raw ?? '').filter(v => v !== '');
      const nonNull = values.length;
      const nullCt = allRows.length - nonNull;

      const looksNumeric = (v: string): boolean => {
        const cleaned = v.replace(/[,，\s¥$￥]/g, '').replace(/^\(.*\)$/, '-1');
        return cleaned !== '' && !isNaN(Number(cleaned));
      };
      const looksDate = (v: string): boolean => {
        const t = v.trim();
        return /^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?$/.test(t)
          || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(t);
      };
      const numCount = values.filter(looksNumeric).length;
      const dateCount = values.filter(looksDate).length;
      const n = Math.max(nonNull, 1);
      const primary = numCount / n > 0.8 ? 'number' : dateCount / n > 0.8 ? 'date' : 'string';
      const confidence = Math.max(numCount, dateCount) / n;
      const evidence = primary === 'number' ? '数值占比高' : primary === 'date' ? '日期格式占比高' : '文本为主';

      return {
        colLetter: String.fromCharCode(65 + i),
        headerText: h,
        nonNullCount: nonNull, nullCount: nullCt, nullRate: allRows.length > 0 ? nullCt / allRows.length : 0,
        typeGuess: { primary, confidence, evidence },
        sampleValues: values.slice(0, 5),
      };
    });

    const rule = autoGenerateRule(file, fileName, structure.sheets, si, hr, profiles);
    const s = getStore(rd);
    if (shouldSave) s.save(rule);

    return { rule, savedTo: shouldSave ? (rd || rulesDir) : null };
  }, { description: 'Auto-generate extraction rule from file structure' });
}
