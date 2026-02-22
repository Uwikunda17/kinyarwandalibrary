export interface CommandLifecycleEvent {
  name: string;
  line: string;
}

export interface CommandLifecycleEndEvent extends CommandLifecycleEvent {
  value: unknown;
}

export interface CustomCommandContext {
  args: unknown[];
  variables: Record<string, unknown>;
  dependencies: Record<string, unknown>;
  line: string;
  command: string;
  run: (
    code: string,
    options?: Partial<RunKinyarwandaOptions>
  ) => Promise<RunKinyarwandaResult>;
}

export type CustomCommandHandler = (context: CustomCommandContext) => unknown | Promise<unknown>;

export interface RunKinyarwandaOptions {
  variables?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  commands?: Record<string, CustomCommandHandler>;
  stopOnValidationFail?: boolean;
  injectDependenciesAsVariables?: boolean;
  onCommandStart?: (event: CommandLifecycleEvent) => unknown | Promise<unknown>;
  onCommandEnd?: (event: CommandLifecycleEndEvent) => unknown | Promise<unknown>;
  onError?: (error: unknown) => unknown | Promise<unknown>;
}

export interface RunKinyarwandaResult {
  ok: boolean;
  failedLine?: string;
  variables: Record<string, unknown>;
  exports: Record<string, unknown>;
  results: unknown[];
}

export interface KinyarwandaRunner {
  run(code: string, options?: RunKinyarwandaOptions): Promise<RunKinyarwandaResult>;
  runFile(filePath: string, options?: RunKinyarwandaOptions): Promise<RunKinyarwandaResult>;
  withOptions(options?: RunKinyarwandaOptions): KinyarwandaRunner;
}

export interface BrowserScriptOptions {
  selector?: string;
  runOptions?: RunKinyarwandaOptions;
  stopOnValidationFail?: boolean;
}

export interface HtmlKinyarwandaAdapter {
  run(code: string, options?: RunKinyarwandaOptions): Promise<RunKinyarwandaResult>;
  runFromElement(selector: string, options?: RunKinyarwandaOptions): Promise<RunKinyarwandaResult>;
  runScriptTags(
    options?: BrowserScriptOptions
  ): Promise<Array<{ script: Element; result: RunKinyarwandaResult }>>;
}

export function runKinyarwanda(
  code: string,
  options?: RunKinyarwandaOptions
): Promise<RunKinyarwandaResult>;

export function createKinyarwandaRunner(options?: RunKinyarwandaOptions): KinyarwandaRunner;
export function createBackendKinyarwanda(options?: RunKinyarwandaOptions): KinyarwandaRunner;
export function createReactKinyarwanda(options?: RunKinyarwandaOptions): KinyarwandaRunner;
export function createVueKinyarwanda(options?: RunKinyarwandaOptions): KinyarwandaRunner;
export function createHtmlKinyarwanda(options?: RunKinyarwandaOptions): HtmlKinyarwandaAdapter;

export function runKinyarwandaInBrowser(
  code: string,
  options?: RunKinyarwandaOptions
): Promise<RunKinyarwandaResult>;
export function runKinyarwandaFile(
  url: string,
  options?: RunKinyarwandaOptions
): Promise<RunKinyarwandaResult>;
export function runKinyarwandaScripts(
  options?: BrowserScriptOptions
): Promise<Array<{ script: Element; result: RunKinyarwandaResult }>>;
export function installKinyarwandaGlobal(options?: {
  autoRun?: boolean;
  selector?: string;
  runOptions?: RunKinyarwandaOptions;
  stopOnValidationFail?: boolean;
}): {
  runKinyarwanda: typeof runKinyarwanda;
  runKinyarwandaInBrowser: typeof runKinyarwandaInBrowser;
  runKinyarwandaFile: typeof runKinyarwandaFile;
  runKinyarwandaScripts: typeof runKinyarwandaScripts;
} | null;

export const DOM_NO_MATCH: unique symbol;
export function runDOMCommand(
  line: string,
  variables?: Record<string, unknown>,
  options?: { onEvent?: (handlerName: string, event: Event) => unknown }
): unknown | typeof DOM_NO_MATCH;

export function idafiteAgaciro(selector: string): boolean;
export function siImererweNeza(selector: string): boolean;
export function ntibihuye(selectorOne: string, selectorTwo: string): boolean;
export function validateCommand(line: string, variables?: Record<string, unknown>): boolean | null;

export function networkCommand(
  line: string,
  variables?: Record<string, unknown>
): Promise<Response | FormData | unknown | null>;
