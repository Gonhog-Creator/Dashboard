import { ChatPanel } from "@/components/chat/ChatPanel";

export default function ChatPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Chat</h1>
      <ChatPanel />
    </div>
  );
}
