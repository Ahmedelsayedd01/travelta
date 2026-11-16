/**
 * Runtime globals available on every platform the framework-free packages run on (browsers, Hermes/React Native, Node for tests).
 * Declared here instead of pulling in DOM/Node typings, so platform-specific APIs (window, fs, AsyncStorage)
 * cannot leak into this framework-free package.
 */
declare function structuredClone<T>(value: T): T;
declare function setTimeout(handler: () => void, ms?: number): unknown;
declare function clearTimeout(handle: unknown): void;
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
