// 手工验收脚本 — 验证 Transform 引擎和类型系统
// 运行: cd D:\Jeffrey\测试1\onworking && npx ts-node verify.ts

import { TransformEngine } from './src/main/etl/transform-engine';
import type { ParsedChunk, RuleDefinition } from './src/common/types/etl-types';

const engine = new TransformEngine();

// 模拟一份序时账数据
const chunk: ParsedChunk = {
  rows: [
    { '日期': { raw: '2024/1/5', typed: null, type: 'string' },
      '凭证号': { raw: '合计', typed: null, type: 'string' },
      '借方金额': { raw: '1,234.56', typed: null, type: 'string' },
      '贷方金额': { raw: '(500)', typed: null, type: 'string' },
      '科目编码': { raw: '  1001  ', typed: null, type: 'string' } },
    { '日期': { raw: '2024/1/6', typed: null, type: 'string' },
      '凭证号': { raw: 'V-002', typed: null, type: 'string' },
      '借方金额': { raw: '2,500', typed: null, type: 'string' },
      '贷方金额': { raw: '0', typed: null, type: 'string' },
      '科目编码': { raw: '1002', typed: null, type: 'string' } },
  ],
  locator: { parser: 'mock', file: 'test.xlsx', contentHash: 'abc123', detail: {} },
};

// 模拟规则（序时账提取）
const rule: RuleDefinition = {
  name: 'journal_ledger',
  display: '序时账提取',
  version: 1,
  sources: [{ pattern: '*.xlsx', headerRow: 1 }],
  fields: [
    { sourceHeader: '日期', outputName: 'date', included: true, order: 1, transforms: [] },
    { sourceHeader: '凭证号', outputName: 'voucher_no', included: true, order: 2, transforms: [
      { kind: 'filter_rows', operator: 'eq', value: '合计', action: 'drop', aiRationale: '合计行不是分录数据' },
    ]},
    { sourceHeader: '借方金额', outputName: 'debit_cents', included: true, order: 3, transforms: [
      { kind: 'coerce_number', outputType: 'cents', negativePattern: 'parentheses',
        thousandsSeparator: ',', decimalSeparator: '.', emptyAs: '0',
        aiRationale: '千分位文本转整数分，括号=负数' },
    ]},
    { sourceHeader: '贷方金额', outputName: 'credit_cents', included: true, order: 4, transforms: [
      { kind: 'coerce_number', outputType: 'cents', negativePattern: 'parentheses',
        thousandsSeparator: ',', decimalSeparator: '.', emptyAs: '0',
        aiRationale: '与借方同规则' },
    ]},
    { sourceHeader: '科目编码', outputName: 'account_code', included: true, order: 5, transforms: [
      { kind: 'coerce_string', trim: true, aiRationale: '科目编码四周有空格的案例' },
    ]},
  ],
  mergeStrategy: { mode: 'append' },
};

const result = engine.apply(chunk, rule);

console.log('=== 输入 (2行) ===');
chunk.rows.forEach((r, i) => console.log(`行${i + 1}:`, r['凭证号'].raw, '| 借:', r['借方金额'].raw, '| 贷:', r['贷方金额'].raw));

console.log('\n=== 输出 ===');
result.rows.forEach((r, i) => {
  console.log(`行${i + 1}: voucher=${r['voucher_no'].value}, debit=${r['debit_cents'].value}(${r['debit_cents'].type}), credit=${r['credit_cents'].value}(${r['credit_cents'].type}), code=${r['account_code'].value}`);
});

console.log('\n=== 丢弃行 ===');
result.droppedRows.forEach(d => console.log('原因:', d.reason));

// 验收断言
const passed = [
  result.rows.length === 1,                           // 合计行被过滤
  result.droppedRows.length === 1,                    // 1行被丢弃
  result.rows[0].debit_cents.value === 123456n,      // "1,234.56" → 123456 分
  result.rows[0].credit_cents.value === 250000n,     // "2,500" → 250000 分
  result.rows[0].account_code.value === '1002',      // trim "  1001  " → no, wait it's line 2 which is V-002
  result.rows[0].voucher_no.value === 'V-002',       // 第二行凭证号
];

// Actually let me recalculate: row 1 (合计) is dropped, row 2 (V-002) survives
// Row 2: debit "2,500" → 250000 cents, credit "0" → 0 cents, code "1002"
const checks = {
  '过滤合计行': result.rows.length === 1 && result.droppedRows.length === 1,
  '千分位转整数分 1,234.56→123456': false, // row 1 was dropped
  '千分位转整数分 2,500→250000': result.rows[0]?.debit_cents.value === 250000n,
  '括号负数 (500)→-50000': false, // row 1 was dropped, credit column test
  '科目编码去空格 1002→1002': result.rows[0]?.account_code.value === '1002',
};

console.log('\n=== 验收结果 ===');
Object.entries(checks).forEach(([name, ok]) => {
  console.log(ok ? '✅' : '❌', name);
});

// 再测一组合计行+负数
const chunk2: ParsedChunk = {
  rows: [
    { '金额': { raw: '1,234.56', typed: null, type: 'string' } },
    { '金额': { raw: '(500)', typed: null, type: 'string' } },
  ],
  locator: { parser: 'mock', file: 'test.xlsx', contentHash: 'def456', detail: {} },
};

const rule2: RuleDefinition = {
  name: 'test',
  display: '测试',
  version: 1,
  sources: [{ pattern: '*.xlsx', headerRow: 1 }],
  fields: [
    { sourceHeader: '金额', outputName: 'amount_cents', included: true, order: 1, transforms: [
      { kind: 'coerce_number', outputType: 'cents', negativePattern: 'parentheses',
        thousandsSeparator: ',', decimalSeparator: '.', emptyAs: '0',
        aiRationale: '测试括号负数' },
    ]},
  ],
  mergeStrategy: { mode: 'append' },
};

const result2 = engine.apply(chunk2, rule2);
console.log('\n=== 补充测试：括号负数 ===');
console.log('行1: 1,234.56 →', result2.rows[0].amount_cents.value, '(期望 123456n)');
console.log('行2: (500) →', result2.rows[1].amount_cents.value, '(期望 -50000n)');
console.log(result2.rows[0].amount_cents.value === 123456n ? '✅ 千分位转分' : '❌');
console.log(result2.rows[1].amount_cents.value === -50000n ? '✅ 括号负数' : '❌');
