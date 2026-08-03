export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  enabled?: boolean;
  danger?: boolean;
  group?: string;
  children?: MenuItem[];
  onClick?: (ctx: MenuContext) => void;
}

export interface MenuContext {
  targetType: string;
  target: unknown;
  api: { call(command: string, params?: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> };
  actions: Record<string, (...args: unknown[]) => void>;
}

/** 派生类只实现 getItems:"我是谁、出哪些项"。定位/关闭/键盘由 ContextMenuHost 负责。 */
export abstract class BaseContextMenu {
  abstract getItems(ctx: MenuContext): MenuItem[];
}
