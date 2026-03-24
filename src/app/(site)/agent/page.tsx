import type { Metadata } from "next";
import { ChatInterface } from "@/components/agent/chat-interface";

export const metadata: Metadata = {
  title: "Agent MetroVision",
  description: "Conversational cinematography intelligence powered by film analysis data.",
};

export default function AgentPage() {
  return <ChatInterface />;
}
