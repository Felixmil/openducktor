import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { createTerminalLaunchEnvironment } from "./terminal-launch-environment";

const testIfPosixShellIsAvailable = process.platform === "win32" ? test.skip : test;

const resolveEnvironment = (input: Parameters<typeof createTerminalLaunchEnvironment>[0]) =>
  Effect.runPromise(createTerminalLaunchEnvironment(input)());

testIfPosixShellIsAvailable(
  "uses the host-resolved environment without probing the login shell again",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "odt-terminal-launch-environment-"));
    const probePath = join(root, "login-shell-probed");
    const shellPath = join(root, "fake-shell");
    try {
      await writeFile(shellPath, `#!/bin/sh\nprintf probed > ${JSON.stringify(probePath)}\n`);
      await chmod(shellPath, 0o755);

      const environment = await resolveEnvironment({
        processEnv: {
          PATH: "/already/resolved:/usr/bin",
          SHELL: shellPath,
        },
        platform: "darwin",
        readUserShell: () => null,
      });

      expect(environment.shell).toBe(shellPath);
      expect(environment.env.PATH).toBe("/already/resolved:/usr/bin");
      expect(await Bun.file(probePath).exists()).toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);

testIfPosixShellIsAvailable(
  "prefers the account login shell over the inherited SHELL value",
  async () => {
    const environment = await resolveEnvironment({
      processEnv: {
        PATH: "/usr/bin",
        SHELL: "/bin/bash",
      },
      platform: "linux",
      readUserShell: () => "/usr/bin/zsh",
    });

    expect(environment.shell).toBe("/usr/bin/zsh");
    expect(environment.env.SHELL).toBe("/usr/bin/zsh");
    expect(environment.args).toEqual(["-l"]);
  },
);

testIfPosixShellIsAvailable(
  "falls back to the inherited SHELL value when the account shell is unavailable",
  async () => {
    const environment = await resolveEnvironment({
      processEnv: {
        PATH: "/usr/bin",
        SHELL: "/bin/bash",
      },
      platform: "linux",
      readUserShell: () => null,
    });

    expect(environment.shell).toBe("/bin/bash");
    expect(environment.env.SHELL).toBe("/bin/bash");
  },
);

testIfPosixShellIsAvailable(
  "falls back to the inherited SHELL value when the account shell is not absolute",
  async () => {
    const environment = await resolveEnvironment({
      processEnv: {
        PATH: "/usr/bin",
        SHELL: "/bin/bash",
      },
      platform: "linux",
      readUserShell: () => "zsh",
    });

    expect(environment.shell).toBe("/bin/bash");
    expect(environment.env.SHELL).toBe("/bin/bash");
  },
);

testIfPosixShellIsAvailable("fails when neither shell value is absolute", async () => {
  const result = await Effect.runPromiseExit(
    createTerminalLaunchEnvironment({
      processEnv: {
        PATH: "/usr/bin",
        SHELL: "bash",
      },
      platform: "linux",
      readUserShell: () => "zsh",
    })(),
  );

  expect(result._tag).toBe("Failure");
  expect(String(result)).toContain("shell_unavailable");
});
