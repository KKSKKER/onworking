import { BaseContextMenu } from './base';

const registry = new Map<string, new () => BaseContextMenu>();

export const ContextMenuRegistry = {
  register(targetType: string, ctor: new () => BaseContextMenu): void { registry.set(targetType, ctor); },
  resolve(targetType: string): (new () => BaseContextMenu) | undefined { return registry.get(targetType); },
};
