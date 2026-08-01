// ============================================================
// src/main/entity/entity-registry.ts
// Entity 定义注册表 — Spike 2.2 (minimal, no YAML yet)
// ============================================================

/** Minimal Entity attribute for Spike 2.2 */
export interface EntityAttribute {
  name: string;
  type: 'string' | 'cents' | 'number' | 'date';
  expression: string;   // SQL expression for this attribute
}

export interface EntityDef {
  name: string;
  table: string;
  grain: string[];       // GROUP BY columns
  attributes: EntityAttribute[];
}

/** In-memory registry. Phase 3: load from Entity YAML files. */
const registry = new Map<string, EntityDef>();

export function registerEntity(def: EntityDef): void {
  registry.set(def.name, def);
}

export function getEntity(name: string): EntityDef | undefined {
  return registry.get(name);
}

export function listEntities(): string[] {
  return Array.from(registry.keys());
}
