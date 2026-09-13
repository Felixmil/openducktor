import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveDevToolsActivePortPath, waitForDevToolsActivePort } from "./devtools-active-port";

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const createActivePortDirectory = (): Promise<string> =>
  mkdtemp(path.join(tmpdir(), "odt-electron-devtools-"));

type CapturedPortTimeout = {
  readonly fire: () => void;
  readonly restore: () => void;
};

const capturePortTimeout = (): CapturedPortTimeout => {
  const originalSetTimeout = globalThis.setTimeout;
  const capturedHandlers: Array<() => void> = [];
  const captureSetTimeout = (
    handler: () => void,
    delay?: number,
  ): ReturnType<typeof setTimeout> => {
    if ((delay ?? 0) >= 1_000) {
      capturedHandlers.push(handler);
      return originalSetTimeout(() => {}, 0);
    }
    return originalSetTimeout(handler, delay);
  };
  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value: captureSetTimeout,
    writable: true,
  });
  return {
    fire: () => {
      const handler = capturedHandlers.shift();
      if (!handler) {
        throw new Error("The CDP port wait did not schedule a timeout.");
      }
      handler();
    },
    restore: () => {
      Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: originalSetTimeout,
        writable: true,
      });
    },
  };
};

describe("Electron DevTools active port file", () => {
  test("resolves the active port file inside the development instance profile", () => {
    expect(resolveDevToolsActivePortPath("electron-0123456789ab")).toEndWith(
      path.join(
        "runtime",
        "dev-instances",
        "electron-0123456789ab",
        "electron-profile",
        "DevToolsActivePort",
      ),
    );
  });

  test("waits for the active port file and returns the bound port", async () => {
    const directory = await createActivePortDirectory();
    try {
      const activePortPath = path.join(directory, "DevToolsActivePort");
      const controller = new AbortController();
      const portPromise = waitForDevToolsActivePort(activePortPath, controller.signal);
      await sleep(0);
      await writeFile(activePortPath, "45678\n/devtools/browser/example\n");
      expect(await portPromise).toBe(45_678);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("keeps waiting until Electron finishes writing the active port file", async () => {
    const directory = await createActivePortDirectory();
    try {
      const activePortPath = path.join(directory, "DevToolsActivePort");
      await writeFile(activePortPath, "4");
      const controller = new AbortController();
      const portPromise = waitForDevToolsActivePort(activePortPath, controller.signal);
      await sleep(20);
      await writeFile(activePortPath, "45678\n/devtools/browser/example\n");
      expect(await portPromise).toBe(45_678);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("stops waiting when the lifecycle aborts the wait", async () => {
    const directory = await createActivePortDirectory();
    try {
      const activePortPath = path.join(directory, "DevToolsActivePort");
      const controller = new AbortController();
      const portPromise = waitForDevToolsActivePort(activePortPath, controller.signal);
      controller.abort();
      expect(await portPromise).toBeNull();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("returns null when the lifecycle passes an aborted signal", async () => {
    const directory = await createActivePortDirectory();
    try {
      const activePortPath = path.join(directory, "DevToolsActivePort");
      const controller = new AbortController();
      controller.abort();
      expect(await waitForDevToolsActivePort(activePortPath, controller.signal)).toBeNull();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("fails with a recovery step when Electron never writes the active port file", async () => {
    const directory = await createActivePortDirectory();
    const capturedTimeout = capturePortTimeout();
    try {
      const activePortPath = path.join(directory, "DevToolsActivePort");
      const controller = new AbortController();
      const portPromise = waitForDevToolsActivePort(activePortPath, controller.signal);
      capturedTimeout.fire();
      await expect(portPromise).rejects.toThrow(
        "Electron did not write DevToolsActivePort within 30000ms. Check the Electron startup output, then rerun `bun run electron:dev:cdp`.",
      );
    } finally {
      capturedTimeout.restore();
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("fails with the last read failure and a recovery step when the active port file stays incomplete", async () => {
    const directory = await createActivePortDirectory();
    const capturedTimeout = capturePortTimeout();
    try {
      const activePortPath = path.join(directory, "DevToolsActivePort");
      const controller = new AbortController();
      await writeFile(activePortPath, "not-a-port");
      const portPromise = waitForDevToolsActivePort(activePortPath, controller.signal);
      await sleep(20);
      await writeFile(activePortPath, "still-not-a-port");
      await sleep(50);
      capturedTimeout.fire();
      await expect(portPromise).rejects.toThrow(
        "Electron did not write a complete DevToolsActivePort file within 30000ms. Last read failure: Electron wrote an incomplete DevToolsActivePort file. Check the Electron startup output, then rerun `bun run electron:dev:cdp`.",
      );
    } finally {
      capturedTimeout.restore();
      await rm(directory, { force: true, recursive: true });
    }
  });
});
