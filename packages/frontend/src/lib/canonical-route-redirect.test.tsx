import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { CanonicalRouteRedirect } from "./canonical-route-redirect";

function LocationProbe(): ReactElement {
  const location = useLocation();

  return (
    <output aria-label="Current location">{`${location.pathname}${location.search}${location.hash}`}</output>
  );
}

test("redirects an old route and preserves its query and hash", async () => {
  render(
    <MemoryRouter initialEntries={["/agents?task=task-1&agent=build#transcript"]}>
      <Routes>
        <Route path="/agents" element={<CanonicalRouteRedirect to="/workflows" />} />
        <Route path="/workflows" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );

  expect((await screen.findByLabelText("Current location")).textContent).toBe(
    "/workflows?task=task-1&agent=build#transcript",
  );
});
