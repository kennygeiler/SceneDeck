import type { Metadata } from "next";
import { ChatInterface } from "@/components/agent/chat-interface";

export const metadata: Metadata = {
  title: "Agent MetroVision",
  description:
    "Conversational research assistant over the MetroVision archive — composition, scenes, and export-ready answers.",
};

export default function AgentPage() {
  return <ChatInterface />;
}
