import { watch } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { resolveOpenDucktorBaseDir } from "@openducktor/host";
import { Effect } from "effect";
import { ElectronOperationError, errorMessage } from "../src/effect/electron-errors";
import { resolveElectronProfilePath } from "../src/main/electron-app-identity";

const DEVTOOLS_ACTIVE_PORT_FILE_NAME = "DevToolsActivePort";
const ELECTRON_DEBUG_PORT_TIMEOUT_MS = 30_000;

export const resolveDevToolsActivePortPath = (developmentInstanceId: string): string =>
  path.join(
    resolveElectronProfilePath(
      resolveOpenDucktorBaseDir(process.env),
      "development",
      developmentInstanceId,
    ),
    DEVTOOLS_ACTIVE_PORT_FILE_NAME,
  );

const readDevToolsActivePort = async (activePortPath: string): Promise<number> => {
  const contents = await readFile(activePortPath, "utf8");
  const port = Number.parseInt(contents.split("\n", 1)[0] ?? "", 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Electron wrote an invalid ${DEVTOOLS_ACTIVE_PORT_FILE_NAME} file.`);
  }
  return port;
};

export const waitForDevToolsActivePort = (activePortPath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const settle = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      watcher.close();
    };
    const watcher = watch(path.dirname(activePortPath), (_eventType, fileName) => {
      if (fileName !== DEVTOOLS_ACTIVE_PORT_FILE_NAME) {
        return;
      }
      void readDevToolsActivePort(activePortPath).then(
        (port) => {
          settle();
          resolve(port);
        },
        (cause: unknown) => {
          settle();
          reject(cause);
        },
      );
    });
    const timeout = setTimeout(() => {
      settle();
      reject(
        new Error(
          `Electron did not write ${DEVTOOLS_ACTIVE_PORT_FILE_NAME} within ${ELECTRON_DEBUG_PORT_TIMEOUT_MS}ms.`,
        ),
      );
    }, ELECTRON_DEBUG_PORT_TIMEOUT_MS);
    watcher.once("error", (cause: unknown) => {
      settle();
      reject(cause);
    });
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
