import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router";

type CanonicalRouteRedirectProps = {
  to: string;
};

export function CanonicalRouteRedirect({ to }: CanonicalRouteRedirectProps): ReactElement {
  const location = useLocation();

  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}
