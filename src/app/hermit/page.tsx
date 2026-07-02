import { ChatPanel } from "@/components/hermit/ChatPanel";

export default function HermitPage() {
  return (
    <div data-lh-hermit-page data-lh-page="hermit" data-lh-page-archetype="tool-workspace" className="w-full">
      <header data-lh-hermit-intro>
        <h1 data-lh-hermit-title>
          <span data-lh-hermit-title-cn>路引</span>
          <span data-lh-hermit-title-en>Hermit</span>
        </h1>
      </header>
      <div data-lh-hermit-chat-frame>
        <ChatPanel />
      </div>
    </div>
  );
}
