import { useBranding } from "@/lib/queries/branding";

/** The instance's name as a node, for text built outside a component (see describeEvent). */
export function BrandName() {
  return <>{useBranding().name}</>;
}
