import { expect, test } from "bun:test";
import { Children, isValidElement, type ReactNode } from "react";
import { Route } from "react-router";
import { App } from "./App";
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

test("Chats and Agent Studio are available without a lazy route or page-loading boundary", () => {
  const app = App({});
  for (const [path, page] of [
    ["/agents", AgentsPage],
    ["/workspace-sessions", WorkspaceSessionsPage],
  ] as const) {
    const element = findRouteElement(app, path);
    expect(isValidElement(element)).toBe(true);
    if (!isValidElement(element)) throw new Error(`Missing route element for ${path}`);
    expect(element.type).toBe(page);
  }
});
