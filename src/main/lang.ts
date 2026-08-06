// onworking/src/main/lang.ts
// 语言偏好归一化 + 写文件的纯函数,独立成模块以便 node 环境单测。
import * as fs from 'node:fs';

// 归一化:只认 'en',其余一律 'zh'。读路径 resolveLanguage 与写路径共用此真源。
export function pickLanguage(value: unknown): 'zh' | 'en' {
  return value === 'en' ? 'en' : 'zh';
}

// 同步写语言偏好 JSON,供「写文件后自动重启」的切换流程使用。
export function writeLanguageFile(filePath: string, lang: 'zh' | 'en'): void {
  fs.writeFileSync(filePath, JSON.stringify({ language: lang }), 'utf8');
}
