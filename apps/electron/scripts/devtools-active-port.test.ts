import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveDevToolsActivePortPath, waitForDevToolsActivePort } from "./devtools-active-port";

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
    const directory = await mkdtemp(path.join(tmpdir(), "odt-electron-devtools-"));
    try {
      const activePortPath = path.join(directory, "DevToolsActivePort");
      const portPromise = waitForDevToolsActivePort(activePortPath);
      await writeFile(activePortPath, "45678\n/devtools/browser/example\n");
      expect(await portPromise).toBe(45_678);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
