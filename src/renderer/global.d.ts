export {};

declare global {
  interface Window {
    onworking: {
      platform: string;
      api: {
        call(command: string, params?: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }>;
      };
      pickFolder(): Promise<string | null>;
      showInFolder(fullPath: string): Promise<void>;
      confirm(opts: { title: string; message: string; okLabel?: string }): Promise<boolean>;
      onOpenWorkspace(cb: (payload?: { rootPath?: string }) => void): () => void;
    };
  }
}
