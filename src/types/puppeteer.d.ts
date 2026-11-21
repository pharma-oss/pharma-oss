declare module 'puppeteer' {
  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface Page {
    goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
    evaluate<T = unknown>(pageFunction: string | ((...args: unknown[]) => T | Promise<T>), ...args: unknown[]): Promise<T>;
    type(selector: string, text: string, options?: Record<string, unknown>): Promise<void>;
    waitForNavigation(options?: Record<string, unknown>): Promise<unknown>;
    click(selector: string, options?: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
    isClosed(): boolean;
  }

  const puppeteer: {
    launch(options?: Record<string, unknown>): Promise<Browser>;
  };

  export default puppeteer;
}
