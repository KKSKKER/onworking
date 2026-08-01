// ============================================================
// src/main/entity/entity-registry.ts
// Entity 定义注册表 — Spike 2.2 (minimal, no YAML yet)
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

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

/**
 * Load all Entity definitions from a directory of YAML files.
 * Silently skips the directory if it does not exist.
 */
export function loadEntitiesFromDir(entitiesDir: string): void {
  if (!fs.existsSync(entitiesDir)) return;
  const files = fs.readdirSync(entitiesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(entitiesDir, file), 'utf-8');
    const def = yaml.load(raw) as EntityDef;
    registry.set(def.name, def);
  }
}
