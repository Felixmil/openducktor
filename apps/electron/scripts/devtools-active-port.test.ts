import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveDevToolsActivePortPath, waitForDevToolsActivePort } from "./devtools-active-port";

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const createActivePortDirectory = (): Promise<string> =>
  mkdtemp(path.join(tmpdir(), "odt-electron-devtools-"));

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
      const controller = new AbortController();
      const portPromise = waitForDevToolsActivePort(activePortPath, controller.signal, 5_000);
      await sleep(20);
      await writeFile(activePortPath, "4");
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

  test("fails when Electron does not finish writing the active port file", async () => {
    const directory = await createActivePortDirectory();
    try {
      const activePortPath = path.join(directory, "DevToolsActivePort");
      const controller = new AbortController();
      const portPromise = waitForDevToolsActivePort(activePortPath, controller.signal, 300);
      await sleep(20);
      await writeFile(activePortPath, "not-a-port");
      await expect(portPromise).rejects.toThrow(
        "Electron did not write a complete DevToolsActivePort file within 300ms.",
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
