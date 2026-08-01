// ============================================================
// src/main/etl/transform-engine.ts
// Stage 3：转换管线执行引擎 — SOURCE_LAYER_SPEC.md §4.3
// ============================================================

import type {
  ParsedChunk, CellData, TransformedChunk, TypedCell,
  RuleDefinition, FieldDefinition,
} from '../../common/types/etl-types';
import type { FieldTransform } from '../../common/types/transforms';
import { TRANSFORM_ORDER } from '../../common/types/transforms';

// --- 排序 ---

export function sortTransforms(transforms: FieldTransform[]): FieldTransform[] {
  return [...transforms].sort((a, b) => {
    const orderA = TRANSFORM_ORDER[a.kind] ?? 99;
    const orderB = TRANSFORM_ORDER[b.kind] ?? 99;
    return orderA - orderB;
  });
}

// --- 单字段转换 ---

function applyFieldTransforms(
  rawValue: CellData | null,
  transforms: FieldTransform[],
  _row: Record<string, CellData>,
): { value: string | bigint | null; type: TypedCell['type'] } {
  if (!rawValue || rawValue.raw === undefined) {
    return { value: null, type: 'null' };
  }

  let current: string | bigint | null = rawValue.raw ?? '';
  let currentType: TypedCell['type'] = 'string';

  const sorted = sortTransforms(transforms);

  for (const t of sorted) {
    switch (t.kind) {
      case 'coerce_string': {
        let s: string = String(current ?? '');
        if (t.trim) s = s.trim();
        if (t.lowercase) s = s.toLowerCase();
        if (t.uppercase) s = s.toUpperCase();
        if (t.nullValues?.includes(s)) { current = null; currentType = 'null'; }
        else if (t.maxLength && s.length > t.maxLength) s = s.slice(0, t.maxLength);
        if (current !== null) { current = s; currentType = 'string'; }
        break;
      }

      case 'coerce_number': {
        let s = String(current ?? '').trim();
        if (s === '' || s === '-') {
          if (t.outputType === 'cents') {
            current = t.emptyAs === '0' ? 0n : null;
          } else {
            current = t.emptyAs === '0' ? '0' : null;
          }
          currentType = current === null ? 'null' : t.outputType;
          break;
        }
        let sign = 1n;
        if (t.negativePattern === 'parentheses') {
          const parenMatch = s.match(/^\((.+)\)$/);
          if (parenMatch) { s = parenMatch[1]; sign = -1n; }
        } else if (t.negativePattern === 'trailing_dash') {
          if (s.endsWith('-')) { s = '-' + s.slice(0, -1); }
        }
        if (t.negativePattern === 'leading_dash' && s.startsWith('-')) {
          sign = -1n;
          s = s.slice(1);
        }
        if (t.thousandsSeparator) s = s.replaceAll(t.thousandsSeparator, '');
        if (t.decimalSeparator && t.decimalSeparator !== '.') s = s.replace(t.decimalSeparator, '.');

        // String-based parsing: never use parseFloat (IEEE 754 precision loss)
        if (t.outputType === 'cents') {
          const dotIdx = s.indexOf('.');
          if (dotIdx === -1) {
            current = BigInt(s) * 100n * sign;
          } else {
            const intPart = s.slice(0, dotIdx) || '0';
            let fracPart = s.slice(dotIdx + 1);
            fracPart = fracPart.slice(0, 2).padEnd(2, '0'); // exactly 2 decimal digits
            current = (BigInt(intPart) * 100n + BigInt(fracPart)) * sign;
          }
          currentType = 'cents';
        } else {
          // Store as string to avoid float; sign applied to string representation
          current = sign === -1n ? '-' + s : s;
          currentType = 'number';
        }
        break;
      }

      case 'coerce_date': {
        current = String(current ?? '');
        currentType = 'date';
        break;
      }

      case 'coerce_enum': {
        const s: string = String(current ?? '');
        const mapped: string | undefined = t.mapping[s];
        if (mapped) { current = mapped; currentType = 'string'; }
        else if (t.unmappedStrategy === 'null') { current = null; currentType = 'null'; }
        else if (t.unmappedStrategy === 'error') {
          throw new Error(`Enum value "${s}" not found in mapping and unmappedStrategy is "error"`);
        }
        break;
      }

      case 'coerce_boolean': {
        const s = String(current ?? '');
        const compare = t.caseSensitive ? s : s.toLowerCase();
        const trues = t.caseSensitive ? t.trueValues : t.trueValues.map(v => v.toLowerCase());
        const falses = t.caseSensitive ? t.falseValues : t.falseValues.map(v => v.toLowerCase());
        if (trues.includes(compare)) { current = 'true'; currentType = 'boolean'; }
        else if (falses.includes(compare)) { current = 'false'; currentType = 'boolean'; }
        else { current = null; currentType = 'null'; }
        break;
      }

      case 'rename':
      case 'fill_down':
      case 'split_to_columns':
      case 'extract':
      case 'split_by_sign':
      case 'derive': {
        throw new Error(`Transform kind "${t.kind}" is not yet implemented (Phase 2)`);
      }
    }
  }

  return { value: current, type: currentType };
}

// --- 引擎 ---

export class TransformEngine {
  apply(chunk: ParsedChunk, rule: RuleDefinition): TransformedChunk {
    const includedFields = rule.fields
      .filter(f => f.included)
      .sort((a, b) => a.order - b.order);

    const outputRows: Record<string, TypedCell>[] = [];
    const droppedRows: TransformedChunk['droppedRows'] = [];

    for (const row of chunk.rows) {
      let shouldDrop = false;
      let dropReason = '';

      for (const field of rule.fields) {
        if (!field.sourceHeader) continue;
        for (const t of field.transforms) {
          if (t.kind === 'filter_rows') {
            const cell = row[field.sourceHeader];
            const raw = cell?.raw ?? '';
            if (checkFilterMatch(raw, t)) {
              shouldDrop = true;
              dropReason = `filter_rows: ${field.sourceHeader} ${t.operator} ${t.value ?? 'null'}`;
            }
          }
        }
      }

      if (shouldDrop) {
        droppedRows.push({ locator: chunk.locator, reason: dropReason, rawData: row });
        continue;
      }

      const outRow: Record<string, TypedCell> = {};
      for (const field of includedFields) {
        if (field.sourceHeader === null) {
          outRow[field.outputName] = {
            value: null, type: 'null', derived: true, derivedBy: field.generatedBy,
          };
          continue;
        }

        const rawCell = row[field.sourceHeader] ?? null;
        const { value, type } = applyFieldTransforms(rawCell, field.transforms, row);

        outRow[field.outputName] = { value, type, derived: false };
      }

      outputRows.push(outRow);
    }

    return { rows: outputRows, locator: chunk.locator, droppedRows };
  }
}

// --- filter_rows 匹配辅助 ---

function checkFilterMatch(raw: string, t: { operator: string; value?: string }): boolean {
  switch (t.operator) {
    case 'eq': return raw === (t.value ?? '');
    case 'neq': return raw !== (t.value ?? '');
    case 'contains': return raw.includes(t.value ?? '');
    case 'not_contains': return !raw.includes(t.value ?? '');
    case 'is_null': return raw === '' || raw === undefined;
    case 'is_not_null': return raw !== '' && raw !== undefined;
    case 'regex': try { return new RegExp(t.value ?? '').test(raw); } catch { return false; }
    case 'not_regex': try { return !new RegExp(t.value ?? '').test(raw); } catch { return false; }
    case 'in': return (t.value ?? '').split(',').map(s => s.trim()).includes(raw);
    case 'not_in': return !((t.value ?? '').split(',').map(s => s.trim()).includes(raw));
    case 'gt': return Number(raw) > Number(t.value);
    case 'gte': return Number(raw) >= Number(t.value);
    case 'lt': return Number(raw) < Number(t.value);
    case 'lte': return Number(raw) <= Number(t.value);
    default: return false;
  }
}
