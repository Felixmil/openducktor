import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { resolveOpenDucktorBaseDir } from "@openducktor/host";
import { Effect } from "effect";
import { ElectronOperationError, errorMessage } from "../src/effect/electron-errors";
import { resolveElectronProfilePath } from "../src/main/electron-app-identity";

const DEVTOOLS_ACTIVE_PORT_FILE_NAME = "DevToolsActivePort";
const ELECTRON_DEBUG_PORT_TIMEOUT_MS = 30_000;
export const DEVTOOLS_ACTIVE_PORT_RECOVERY_STEP =
  "Check the Electron startup output, then rerun `bun run electron:dev:cdp`.";

export const resolveDevToolsActivePortPath = (developmentInstanceId: string): string =>
  path.join(
    resolveElectronProfilePath(
      resolveOpenDucktorBaseDir(process.env),
      "development",
      developmentInstanceId,
    ),
    DEVTOOLS_ACTIVE_PORT_FILE_NAME,
  );

type DevToolsActivePortReadResult =
  | { readonly ok: true; readonly port: number }
  | { readonly ok: false; readonly failure: string };

const readDevToolsActivePort = async (
  activePortPath: string,
): Promise<DevToolsActivePortReadResult> => {
  let contents: string;
  try {
    contents = await readFile(activePortPath, "utf8");
  } catch (cause) {
    return { ok: false, failure: errorMessage(cause) };
  }
  const [portLine = "", browserPathLine = ""] = contents.split("\n");
  const port = Number.parseInt(portLine, 10);
  if (!Number.isInteger(port) || port <= 0 || browserPathLine === "") {
    return {
      ok: false,
      failure: `Electron wrote an incomplete ${DEVTOOLS_ACTIVE_PORT_FILE_NAME} file.`,
    };
  }
  return { ok: true, port };
};

const devToolsActivePortTimeoutMessage = (lastFailure: string | null): string =>
  lastFailure === null
    ? `Electron did not write ${DEVTOOLS_ACTIVE_PORT_FILE_NAME} within ${ELECTRON_DEBUG_PORT_TIMEOUT_MS}ms. ${DEVTOOLS_ACTIVE_PORT_RECOVERY_STEP}`
    : `Electron did not write a complete ${DEVTOOLS_ACTIVE_PORT_FILE_NAME} file within ${ELECTRON_DEBUG_PORT_TIMEOUT_MS}ms. Last read failure: ${lastFailure} ${DEVTOOLS_ACTIVE_PORT_RECOVERY_STEP}`;

export const waitForDevToolsActivePort = (
  activePortPath: string,
  signal: AbortSignal,
): Promise<number | null> =>
  new Promise((resolve, reject) => {
    const watchedDirectory = path.dirname(activePortPath);
    let settled = false;
    let lastFailure: string | null = null;
    let watcher: FSWatcher | null = null;
    let fileWatcher: FSWatcher | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const settle = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout !== null) {
        clearTimeout(timeout);
      }
      watcher?.close();
      fileWatcher?.close();
      signal.removeEventListener("abort", handleAbort);
    };
    const failWatch = (resource: string, cause: unknown): void => {
      settle();
      reject(
        new Error(
          `Failed to watch ${resource} for ${DEVTOOLS_ACTIVE_PORT_FILE_NAME}: ${errorMessage(cause)} ${DEVTOOLS_ACTIVE_PORT_RECOVERY_STEP}`,
        ),
      );
    };
    const readAndResolve = (): void => {
      void readDevToolsActivePort(activePortPath).then((readResult) => {
        if (settled) {
          return;
        }
        if (!readResult.ok) {
          lastFailure = readResult.failure;
          return;
        }
        settle();
        resolve(readResult.port);
      });
    };
    const attachPortFileWatcher = (): boolean => {
      try {
        const nextFileWatcher = watch(activePortPath, readAndResolve);
        nextFileWatcher.once("error", (cause: unknown) => {
          failWatch(activePortPath, cause);
        });
        fileWatcher = nextFileWatcher;
        return true;
      } catch {
        return false;
      }
    };
    const observePortFile = (): void => {
      if (fileWatcher === null) {
        attachPortFileWatcher();
      }
      readAndResolve();
    };
    const handleAbort = (): void => {
      settle();
      resolve(null);
    };
    if (signal.aborted) {
      resolve(null);
      return;
    }
    try {
      watcher = watch(watchedDirectory, (_eventType, fileName) => {
        if (fileName !== null && fileName !== DEVTOOLS_ACTIVE_PORT_FILE_NAME) {
          return;
        }
        observePortFile();
      });
    } catch (cause) {
      failWatch(watchedDirectory, cause);
      return;
    }
    timeout = setTimeout(() => {
      settle();
      reject(new Error(devToolsActivePortTimeoutMessage(lastFailure)));
    }, ELECTRON_DEBUG_PORT_TIMEOUT_MS);
    watcher?.once("error", (cause: unknown) => {
      failWatch(watchedDirectory, cause);
    });
    signal.addEventListener("abort", handleAbort, { once: true });
  });

export const prepareDevToolsActivePortFileEffect = (
  activePortPath: string,
): Effect.Effect<void, ElectronOperationError> =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(path.dirname(activePortPath), { recursive: true });
      await rm(activePortPath, { force: true });
    },
    catch: (cause) =>
      new ElectronOperationError({
        operation: "electron.dev.prepare-devtools-active-port-file",
        message: errorMessage(cause),
        path: activePortPath,
        cause,
      }),
  });
