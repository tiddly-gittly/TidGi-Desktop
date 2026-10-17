import path from 'node:path';
import type { TiddlyWiki } from 'tiddlywiki';

type TiddlyWikiInstance = ReturnType<typeof TiddlyWiki>;
type Trace = (level: 'debug' | 'warn', message: string) => void;
type FatalHandler = (error: Error) => void;
type Label = string | ((arguments_: unknown[], invocation: number) => string);

interface StartupTask {
  name?: string;
  startup?: (...arguments_: unknown[]) => unknown;
}

interface ObservableBoot {
  executeNextStartupTask(callback?: () => void): boolean;
  isStartupTaskEligible(task: StartupTask): boolean;
  remainingStartupModules?: StartupTask[];
}

function isCallable(value: unknown): value is (...arguments_: unknown[]) => unknown {
  return typeof value === 'function';
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value !== null && typeof value === 'object' && typeof Reflect.get(value, 'then') === 'function';
}

function isObservableBoot(value: unknown): value is ObservableBoot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return isCallable(Reflect.get(value, 'executeNextStartupTask')) &&
    isCallable(Reflect.get(value, 'isStartupTaskEligible'));
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function observeMethod(
  target: object,
  methodName: string,
  label: Label,
  trace: Trace,
  afterSuccess?: () => void,
): void {
  const original: unknown = Reflect.get(target, methodName);
  if (!isCallable(original)) return;
  let invocation = 0;
  Reflect.set(target, methodName, function observedMethod(this: unknown, ...arguments_: unknown[]) {
    const invocationLabel = typeof label === 'string' ? label : label(arguments_, ++invocation);
    trace('debug', `TiddlyWiki phase begin: ${invocationLabel}`);
    const pendingTimer = setTimeout(() => {
      trace('warn', `TiddlyWiki phase pending after 15000 ms: ${invocationLabel}`);
    }, 15_000);
    pendingTimer.unref();
    try {
      const result = Reflect.apply(original, this, arguments_);
      clearTimeout(pendingTimer);
      trace('debug', `TiddlyWiki phase end: ${invocationLabel}`);
      afterSuccess?.();
      return result;
    } catch (error) {
      clearTimeout(pendingTimer);
      trace('warn', `TiddlyWiki phase rejected: ${invocationLabel}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
}

function sanitizedFolderIdentifier(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '<unknown>';
  const normalized = value.replaceAll('\\', '/');
  const basename = path.posix.basename(normalized);
  const parentBasename = path.posix.basename(path.posix.dirname(normalized));
  return [parentBasename, basename].filter(segment => segment !== '' && segment !== '.').join('/').slice(0, 100) || '<root>';
}

function sanitizedPluginName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '<unknown>';
  const segments = value.replaceAll('\\', '/').split('/').filter(Boolean);
  const safeName = value.startsWith('@') && segments.length >= 2
    ? `@${segments.at(-2)?.replace(/^@/, '')}/${segments.at(-1)}`
    : segments.at(-1);
  return (safeName ?? '<unknown>').slice(0, 100);
}

/** Install low-volume phase tracing without changing TiddlyWiki completion semantics. */
export function installTiddlyWikiStartupObserver(
  wikiInstance: TiddlyWikiInstance,
  trace: Trace,
  onFatal: FatalHandler = () => {},
): void {
  let fatalReported = false;
  const reportFatal = (error: unknown): void => {
    if (fatalReported) return;
    fatalReported = true;
    try {
      onFatal(asError(error));
    } catch (fatalHandlerError) {
      trace('warn', `TiddlyWiki startup fatal handler failed: ${asError(fatalHandlerError).message}`);
    }
  };
  let wikiObserversInstalled = false;
  const installWikiObservers = (): void => {
    if (wikiObserversInstalled) return;
    const wikiStore = Reflect.get(wikiInstance, 'wiki');
    if (wikiStore === undefined || wikiStore === null || typeof wikiStore !== 'object') {
      trace('warn', 'TiddlyWiki store observers skipped after initStartup: wiki store unavailable');
      return;
    }
    wikiObserversInstalled = true;
    observeMethod(wikiInstance, 'loadTiddlersNode', 'loadTiddlersNode', trace);
    observeMethod(wikiInstance, 'loadWikiTiddlers', 'loadWikiTiddlers', trace);
    observeMethod(wikiInstance, 'loadPluginFolder', (arguments_, invocation) => `loadPluginFolder #${invocation} (${sanitizedFolderIdentifier(arguments_[0])})`, trace);
    observeMethod(wikiInstance, 'loadPlugin', (arguments_, invocation) => `loadPlugin #${invocation} (${sanitizedPluginName(arguments_[0])})`, trace);
    observeMethod(wikiStore, 'readPluginInfo', 'plugins.readInfo', trace);
    observeMethod(wikiStore, 'registerPluginTiddlers', 'plugins.register', trace);
    observeMethod(wikiStore, 'unpackPluginTiddlers', 'plugins.unpack', trace);
    observeMethod(wikiStore, 'defineShadowModules', 'plugins.defineShadowModules', trace);
    observeMethod(wikiStore, 'defineTiddlerModules', 'plugins.defineTiddlerModules', trace);
  };

  observeMethod(wikiInstance.boot, 'initStartup', 'boot.initStartup', trace, installWikiObservers);
  observeMethod(wikiInstance.boot, 'loadStartup', 'boot.loadStartup', trace);
  observeMethod(wikiInstance.boot, 'execStartup', 'boot.execStartup', trace);

  const bootValue: unknown = wikiInstance.boot;
  if (!isObservableBoot(bootValue)) return;
  const boot = bootValue;
  const originalExecuteNextStartupTask = boot.executeNextStartupTask.bind(boot);
  let activeTask: { name: string; pendingTimer: NodeJS.Timeout } | undefined;
  const finishActiveTask = (outcome: 'end' | 'rejected', error?: unknown): void => {
    if (activeTask === undefined) return;
    clearTimeout(activeTask.pendingTimer);
    trace(
      outcome === 'end' ? 'debug' : 'warn',
      `TiddlyWiki startup task ${outcome}: ${activeTask.name}${error === undefined ? '' : `: ${asError(error).message}`}`,
    );
    activeTask = undefined;
  };

  boot.executeNextStartupTask = (callback?: () => void): boolean => {
    finishActiveTask('end');
    const nextTask = boot.remainingStartupModules?.find(task => boot.isStartupTaskEligible(task));
    if (nextTask !== undefined) {
      const name = nextTask.name ?? '<anonymous>';
      trace('debug', `TiddlyWiki startup task begin: ${name}`);
      const pendingTimer = setTimeout(() => {
        trace('warn', `TiddlyWiki startup task pending after 15000 ms: ${name}`);
      }, 15_000);
      pendingTimer.unref();
      activeTask = { name, pendingTimer };
      if (typeof nextTask.startup === 'function') {
        const originalStartup = nextTask.startup;
        nextTask.startup = function observedStartup(this: unknown, ...arguments_: unknown[]) {
          try {
            const result = originalStartup.apply(this, arguments_);
            if (isPromiseLike(result)) {
              return Promise.resolve(result).catch((error: unknown) => {
                finishActiveTask('rejected', error);
                reportFatal(error);
                // TiddlyWiki only attaches a fulfillment handler to a returned
                // startup promise. Keep the failed task pending until the host
                // terminates this worker instead of creating an unhandled
                // derived rejection or incorrectly continuing startup.
                return new Promise<never>(() => undefined);
              });
            }
            return result;
          } catch (error) {
            finishActiveTask('rejected', error);
            throw error;
          }
        };
      }
    }
    try {
      return originalExecuteNextStartupTask(() => {
        finishActiveTask('end');
        callback?.();
      });
    } catch (error) {
      finishActiveTask('rejected', error);
      throw error;
    }
  };
}
