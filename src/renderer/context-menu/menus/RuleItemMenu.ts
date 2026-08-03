import { BaseContextMenu, MenuContext, MenuItem } from '../base';

interface RuleTarget { name: string; display?: string; }

/** 规则列表(RuleList)。 */
export class RuleItemMenu extends BaseContextMenu {
  getItems(ctx: MenuContext): MenuItem[] {
    const target = ctx.target as RuleTarget;
    return [
      { id: 'edit', label: '编辑规则', group: 'open', onClick: () => ctx.actions.onEditRule?.(target.name) },
      { id: 'delete', label: '删除规则', group: 'danger', danger: true, onClick: () => ctx.actions.onDeleteRule?.(target.name) },
    ];
  }
}
