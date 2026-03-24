import type { Metadata } from "next";

import { VizDashboard } from "@/components/visualize/viz-dashboard";
import { getVisualizationData } from "@/db/queries";

export const metadata: Metadata = {
  title: "Visualize",
  description: "Interactive D3 visualizations of camera movement patterns, director styles, and film rhythm analysis.",
};

export default async function VisualizePage() {
  const data = await getVisualizationData();

  return <VizDashboard data={data} />;
}
