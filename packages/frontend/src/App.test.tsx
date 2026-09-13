import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { Route } from "react-router";
import { App } from "./App";
import { CanonicalRouteRedirect } from "./lib/canonical-route-redirect";
import { AgentsPage } from "./pages/agents/agents-page";
import WorkspaceSessionsPage from "./pages/workspace-sessions/workspace-sessions-page";

function findRouteElement(node: ReactNode, path: string): ReactNode {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; path?: string; element?: ReactNode }>(child)) {
      continue;
    }
    if (child.type === Route && child.props.path === path) return child.props.element;
    const match = findRouteElement(child.props.children, path);
    if (match) return match;
  }
  return null;
}

test("Chats and Task workflows are available without a lazy route or page-loading boundary", () => {
  const app = App({});
  for (const [path, page] of [
    ["/workflows", AgentsPage],
    ["/chats", WorkspaceSessionsPage],
  ] as const) {
    const element = findRouteElement(app, path);
    expect(isValidElement(element)).toBe(true);
    if (!isValidElement(element)) throw new Error(`Missing route element for ${path}`);
    expect(element.type).toBe(page);
  }
});

test("old session page routes redirect to their canonical routes", () => {
  const app = App({});
  for (const [path, destination] of [
    ["/agents", "/workflows"],
    ["/workspace-sessions", "/chats"],
  ] as const) {
    const element = findRouteElement(app, path);
    expect(isValidElement<{ to: string }>(element)).toBe(true);
    if (!isValidElement<{ to: string }>(element)) {
      throw new Error(`Missing route element for ${path}`);
    }
    expect(element.type).toBe(CanonicalRouteRedirect);
    expect(element.props.to).toBe(destination);
  }
});
