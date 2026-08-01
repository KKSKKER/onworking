// ============================================================
// src/common/types/transforms.ts
// FieldTransform 联合类型 — 12 变体 + 基类
// 遵循 SOURCE_LAYER_SPEC.md §1.3 完整定义
// ============================================================

export type FieldTransform =
  | CoerceStringTransform
  | CoerceNumberTransform
  | CoerceDateTransform
  | CoerceEnumTransform
  | CoerceBooleanTransform
  | SplitToColumnsTransform
  | ExtractTransform
  | SplitBySignTransform
  | FillDownTransform
  | FilterRowsTransform
  | DeriveTransform
  | RenameTransform;

// --- 转换执行顺序（§1.2）---
// 引擎自动按此顺序重排；越界警告

export const TRANSFORM_ORDER: Record<string, number> = {
  fill_down: 1,
  rename: 2,
  coerce_string: 3,
  coerce_number: 3,
  coerce_date: 3,
  coerce_enum: 3,
  coerce_boolean: 3,
  split_to_columns: 4,
  extract: 5,
  split_by_sign: 6,
  derive: 7,
  filter_rows: 8,
};

// --- 基类 ---

export interface TransformBase {
  kind: string;
  aiRationale: string;   // 强制：AI 必须解释为什么
}

// --- 类型转换 (Coercion) ---

export interface CoerceStringTransform extends TransformBase {
  kind: 'coerce_string';
  trim?: boolean;
  uppercase?: boolean;
  lowercase?: boolean;
  maxLength?: number;
  nullValues?: string[];
}

export interface CoerceNumberTransform extends TransformBase {
  kind: 'coerce_number';
  outputType: 'cents' | 'number';
  negativePattern: 'leading_dash' | 'parentheses' | 'trailing_dash';
  thousandsSeparator?: string;
  decimalSeparator?: string;
  emptyAs?: '0' | 'null';
}

export interface CoerceDateTransform extends TransformBase {
  kind: 'coerce_date';
  formats: string[];
  excelSerial?: boolean;
  fallbackStrategy: 'null' | 'error' | 'keep_raw';
  timezone: 'preserve' | 'utc';
}

export interface CoerceEnumTransform extends TransformBase {
  kind: 'coerce_enum';
  mapping: Record<string, string>;
  unmappedStrategy: 'null' | 'keep_raw' | 'error';
}

export interface CoerceBooleanTransform extends TransformBase {
  kind: 'coerce_boolean';
  trueValues: string[];
  falseValues: string[];
  caseSensitive: boolean;
}

// --- 结构转换 (Structural) ---

export interface SplitToColumnsTransform extends TransformBase {
  kind: 'split_to_columns';
  delimiter: string;
  trimParts: boolean;
  outputs: {
    name: string;
    type: 'string' | 'number' | 'date';
  }[];
}

export interface ExtractTransform extends TransformBase {
  kind: 'extract';
  pattern: string;
  outputName: string;
  extractAll?: boolean;
  joinSeparator?: string;
}

export interface SplitBySignTransform extends TransformBase {
  kind: 'split_by_sign';
  positiveOutput: string;
  negativeOutput: string;
  zeroBehavior: 'positive' | 'negative' | 'drop';
}

export interface DeriveTransform extends TransformBase {
  kind: 'derive';
  expression: string;
  outputName: string;
  outputType: 'string' | 'cents' | 'number' | 'date';
}

// --- 清洗转换 (Cleaning) ---

export interface FillDownTransform extends TransformBase {
  kind: 'fill_down';
  strategy: 'previous' | 'next' | 'value';
  fillValue?: string;
  maxConsecutive?: number;
}

export interface FilterRowsTransform extends TransformBase {
  kind: 'filter_rows';
  operator:
    | 'eq' | 'neq'
    | 'gt' | 'gte' | 'lt' | 'lte'
    | 'contains' | 'not_contains'
    | 'regex' | 'not_regex'
    | 'is_null' | 'is_not_null'
    | 'in' | 'not_in';
  value?: string;
  action: 'drop' | 'flag';
  flagColumn?: string;
  flagValue?: string;
}

// --- 标识转换 ---

export interface RenameTransform extends TransformBase {
  kind: 'rename';
  outputName: string;
}

// --- 辅助 ---

export function hasRationale(t: FieldTransform): boolean {
  return typeof t.aiRationale === 'string' && t.aiRationale.length > 0;
}
