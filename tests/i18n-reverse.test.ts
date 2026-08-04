// tests/i18n-reverse.test.ts
// 反向扫描:源码(src/**/*.{ts,tsx})中不得出现硬编码的中文/CJK 界面文案。
// 正向测试(i18n-keys.test.ts)保证每个 t('key') 都能解析;本测试保证漏网的中文
// 字符串字面量 / JSX 文本 / 属性值不被重新引入。命中的串必须逐条列在 ALLOWLIST 里。
//
// 用 TypeScript 编译器(已是 devDependency)解析 AST,天然处理正则字面量、
// 嵌套模板字符串、JSX 文本、console 调用等边界情况,不做手写 tokenizer。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// ALLOWLIST —— 每条都是"确实豁免"的串(不是界面文案)。新增豁免请附理由。
// 报告值为源码原文(带引号/反引号),因此下面每项也带同样的引号做精确匹配。
// ---------------------------------------------------------------------------
const ALLOWLIST = new Set<string>([
  // ---- 跨进程哨兵:main ↔ renderer 精确比对的字面量,替换会破坏匹配/协议 ----
  "'无规则,已跳过'",      // ETL fileStats.error 哨兵:etl/routes.ts 写入,View3Results.tsx 过滤
  "'No source pattern'",  // ETL fileStats.error 哨兵(纯 ASCII,显式豁免声明)
  "'No matching file'",   // ETL fileStats.error 哨兵(纯 ASCII,显式豁免声明)
  "'DB not open'",        // db/worker.ts 未打开库时的协议错误串(纯 ASCII,显式豁免声明)

  // ---- 规则用户数据:持久化到 YAML(aiRationale / display / evidence),非界面文案 ----
  "'字段类型: 金额(分)'", // TableConfig.ts: coerce_number 的 aiRationale 模板
  "'字段类型: 数字'",     // TableConfig.ts: coerce_number 的 aiRationale 模板
  "'字段类型: 日期'",     // TableConfig.ts: coerce_date 的 aiRationale 模板
  "'字段类型: 文本'",     // TableConfig.ts: coerce_string 的 aiRationale 模板
  "'YYYY年M月D日'",       // 日期解析格式(rule-store.ts / TableConfig.ts transforms),非文案
  "'数值占比高'",         // rules/routes.ts: autoGenerate 启发式证据标签,写入规则 YAML
  "'日期格式占比高'",     // 同上
  "'文本为主'",           // 同上
  "'千分位'",             // rule-store.ts: 千分位证据标签,用于判定 thousandsSeparator
  "`提取规则: ${this.fileName} [${this.sheetName}]`", // TableConfig.ts: 规则 display 模板
  "`提取规则: ${fileName}`",                           // rule-store.ts: 规则 display 模板

  // ---- 数据处理串(非界面) ----
  "'查询结果.csv'", // db/routes.ts: 导出对话框默认文件名(任务要求保持原样)

  // ---- 标点分隔符(非可翻译词) ----
  "'；'", // BigTableSettings.tsx: 校验错误列表用全角分号拼接
]);

// CJK 判定:汉字 + 扩展A + 兼容区 + CJK 标点(、。… U+3000-303F)+ 全角形式(，；￥ U+FF00-FFEF)+ 假名 + 谚文
const CJK_RE = /[一-鿿㐀-䶿豈-﫿　-〿＀-￯぀-ヿ가-힯]/;

function walk(d: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p).forEach((f) => out.push(f));
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

interface Str { value: string; line: number; }

/** 判断 CallExpression 的调用根是不是 console(console.log / console.error 等)。 */
function isConsoleCall(call: ts.CallExpression): boolean {
  let expr: ts.Expression = call.expression;
  while (ts.isPropertyAccessExpression(expr)) expr = expr.expression;
  return ts.isIdentifier(expr) && expr.text === 'console';
}

/**
 * 用 TS AST 提取全部字符串字面量 / 模板字符串 / JSX 文本(跳过注释与 console 调用参数)。
 */
function extractStrings(txt: string, fileName: string): Str[] {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, txt, ts.ScriptTarget.Latest, true, kind);
  const out: Str[] = [];
  const lineOf = (pos: number): number => sf.getLineAndCharacterOfPosition(pos).line + 1;

  const check = (node: ts.Node): void => {
    const value = node.getText(sf);
    if (CJK_RE.test(value)) out.push({ value, line: lineOf(node.getStart(sf)) });
  };

  const visit = (node: ts.Node, inConsoleCall: boolean): void => {
    let skip = inConsoleCall;
    if (ts.isCallExpression(node) && isConsoleCall(node)) skip = true;
    if (ts.isStringLiteral(node)) { if (!skip) check(node); }
    else if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) { if (!skip) check(node); }
    else if (ts.isJsxText(node)) {
      const text = node.getText(sf).trim();
      if (text && CJK_RE.test(text)) out.push({ value: text, line: lineOf(node.getStart(sf)) });
    }
    ts.forEachChild(node, (c) => visit(c, skip));
  };
  visit(sf, false);
  return out;
}

describe('i18n 反向扫描(源码不得硬编码 CJK 文案)', () => {
  it('src 下所有 CJK 字符串/JSX 文本/属性值必须在 ALLOWLIST 中', () => {
    const violations: string[] = [];
    for (const f of walk(path.join(root, 'src'))) {
      const txt = readFileSync(f, 'utf8');
      for (const s of extractStrings(txt, f)) {
        if (!ALLOWLIST.has(s.value)) {
          violations.push(`${path.relative(root, f)}:${s.line}: ${s.value}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
