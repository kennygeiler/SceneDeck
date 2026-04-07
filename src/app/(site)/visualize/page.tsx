import type { Metadata } from "next";

import { VizDashboard } from "@/components/visualize/viz-dashboard";
import { getVisualizationData } from "@/db/queries";

export const metadata: Metadata = {
  title: "Visualize",
  description:
    "Composition patterns across the MetroVision archive—e.g. framing vs depth scatter—for cinematography research.",
};

export default async function VisualizePage() {
  const data = await getVisualizationData();

  return <VizDashboard data={data} />;
}
