import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { withViteTestServer } from "./vite-test-server";

test("a second Vite test server preserves unloaded dependencies in a live server", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "odt-vite-dependencies-"));
  try {
    await writeFile(path.join(root, "package.json"), '{"name":"cache-test","type":"module"}');
    for (const name of ["ready-dependency", "lazy-dependency"]) {
      const directory = path.join(root, "node_modules", name);
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, "package.json"),
        JSON.stringify({ name, version: "1.0.0", main: "index.cjs" }),
      );
      await writeFile(path.join(directory, "index.cjs"), "module.exports = { value: 42 };");
      await writeFile(
        path.join(root, `${name}.js`),
        `import dependency from "${name}"; console.log(dependency.value);`,
      );
    }
    await withViteTestServer(
      {
        root,
        logLevel: "silent",
        optimizeDeps: { include: ["ready-dependency", "lazy-dependency"] },
        server: { host: "127.0.0.1", port: 0, ws: false, preTransformRequests: false },
      },
      async (app) => {
        await app.listen();
        const address = z.object({ port: z.number() }).parse(app.httpServer?.address());
        const baseUrl = `http://127.0.0.1:${address.port}`;
        const dependencyUrls: string[] = [];
        for (const name of ["ready-dependency", "lazy-dependency"]) {
          const response = await fetch(`${baseUrl}/${name}.js`);
          expect(response.status).toBe(200);
          const source = await response.text();
          const importPath = z.string().parse(source.match(/"([^"]+\.js\?v=[^"]+)"/u)?.[1]);
          dependencyUrls.push(new URL(importPath, baseUrl).href);
        }
        const [readyUrl, lazyUrl] = z.tuple([z.string(), z.string()]).parse(dependencyUrls);
        const ready = await fetch(readyUrl);
        expect(ready.status).toBe(200);
        await ready.text();

        // A different config invalidates a shared cache before the lazy import reaches it.
        await withViteTestServer(
          { root, logLevel: "silent", server: { host: "127.0.0.1", port: 0, ws: false } },
          async (other) => {
            await other.listen();
          },
        );

        const lazy = await fetch(lazyUrl);
        expect(lazy.status).toBe(200);
        expect(await lazy.text()).toContain("value: 42");
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 10_000);
