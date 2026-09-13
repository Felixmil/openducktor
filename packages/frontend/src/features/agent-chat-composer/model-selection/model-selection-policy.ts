import type { AgentModelDescriptor } from "@openducktor/core";

export const resolveModelSelectionPolicy = (
  model: AgentModelDescriptor | null,
  liveSession: boolean,
) => {
  const variants = model?.variants ?? [];
  const liveVariants = liveSession ? model?.liveSessionUpdates?.variants : undefined;
  return {
    canChangeProfile: !liveSession || model?.liveSessionUpdates?.profile !== false,
    variants: liveVariants
      ? variants.filter((variant) => liveVariants.includes(variant))
      : variants,
  };
};
