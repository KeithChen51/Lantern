import { ChatPanel } from "@/components/hermit/ChatPanel";

export default function HermitPage() {
  return (
    <div data-lh-hermit-page data-lh-page="hermit" data-lh-page-archetype="tool-workspace" className="w-full">
      <header data-lh-hermit-intro>
        <h1 data-lh-hermit-title>
          <span data-lh-hermit-title-cn>路引</span>
          <span data-lh-hermit-title-en>Hermit</span>
        </h1>
        <p data-lh-hermit-description>直接描述服务场景，路引会按事实、判断依据和下一步话术来回应。</p>
      </header>
      <div data-lh-hermit-chat-frame>
        <ChatPanel />
      </div>
    </div>
  );
}
