// 应用内"复制源文件"剪贴板(模块级,非响应式;粘贴时读取)。
let clipboard: { sourcePath: string } | null = null;

export const FileClipboard = {
  copy(sourcePath: string): void { clipboard = { sourcePath }; },
  get(): { sourcePath: string } | null { return clipboard; },
  has(): boolean { return clipboard !== null; },
  clear(): void { clipboard = null; },
};
