import type { Metadata } from "next";

import { ShotBrowser } from "@/components/shots/shot-browser";
import { mockShots } from "@/lib/mock/shots";

export const metadata: Metadata = {
  title: "Browse",
  description: "Browse the SceneDeck demo shot archive and filter by movement type.",
};

export default function BrowsePage() {
  return <ShotBrowser shots={mockShots} />;
}
