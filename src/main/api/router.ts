type CommandHandler = (params?: Record<string, unknown>) => Promise<unknown>;

interface CommandEntry {
  handler: CommandHandler;
  gate: 'none' | 'human';
  description: string;
}

export class APIRouter {
  private commands = new Map<string, CommandEntry>();
  private listeners = new Map<string, Set<(data: unknown) => void>>();

  register(command: string, handler: CommandHandler, options?: { gate?: 'none' | 'human'; description?: string }): void {
    this.commands.set(command, {
      handler,
      gate: options?.gate ?? 'none',
      description: options?.description ?? '',
    });
  }

  async call(command: string, params?: Record<string, unknown>): Promise<unknown> {
    const entry = this.commands.get(command);
    if (!entry) {
      throw new Error(`Unknown command: ${command}`);
    }
    return entry.handler(params);
  }

  on(event: string, callback: (data: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  listCommands(): { command: string; gate: string; description: string }[] {
    return Array.from(this.commands.entries()).map(([command, entry]) => ({
      command,
      gate: entry.gate,
      description: entry.description,
    }));
  }
}

export const apiRouter = new APIRouter();
