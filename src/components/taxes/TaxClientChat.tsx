import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { taxLiveCopy } from "@/i18n/copy/taxLive";
import { useExit } from "@/hooks/useTaxLive";
import { TaxFileViewer } from "./TaxFileViewer";
import { TaxChat } from "./TaxChat";
import { ChatBubble, ChatSheet, ChatWindow } from "./TaxChatDock";
import type { ClientChat } from "./useClientChat";

function Panel({ c, onBack, onMinimize, className }: { c: ClientChat; onBack?: () => void; onMinimize?: () => void; className?: string }) {
  const t = useCopy(taxLiveCopy).chat;
  return (
    <TaxChat me="client" tone="app" title={c.name || t.preparer} initials={c.initials} online={c.online} typing={c.typing}
      messages={c.messages} pending={c.chat.pending} onSend={c.chat.send} onFiles={(f) => void c.chat.sendFiles(f)} onTyping={c.onTyping}
      onRetry={c.chat.retry} onOpenFile={(f) => c.setViewing({ id: f.id, title: f.fileName })} onSaveFile={(f) => void c.chat.save(f)}
      onBack={onBack} onMinimize={onMinimize} placeholder={t.placeholder} emptyText={t.empty} stagger focusKey={c.focusKey} onBusyChange={c.setBusy}
      className={className} />
  );
}

/** Computers, after sending: the chat as a column beside the return; it folds to the right into the bubble. */
export function ClientChatDock({ c }: { c: ClientChat }) {
  const life = useExit(!c.folded, 900);
  return (
    <div className="sticky top-4 h-[calc(100dvh-2rem)] max-h-[780px] min-w-0 overflow-hidden rounded-[20px]">
      <div className="tx-dock h-full w-[400px] overflow-hidden rounded-[20px] border border-slate-200 bg-white" data-folded={c.folded}>
        {life.mounted && <Panel c={c} onMinimize={c.close} className="h-full" />}
      </div>
    </div>
  );
}

/** The bubble, the phone's sheet, the computer's window (before sending) and the viewer for the chat's files. */
export function ClientChatOverlays({ c }: { c: ClientChat }) {
  const t = useCopy(taxLiveCopy).chat;
  const title = c.name || t.preparer;
  const bubble = c.docked ? c.folded : c.desktop ? !c.win : !c.sheet;
  return (
    <>
      <ChatBubble show={bubble} label={t.contact} title={title} initials={c.initials} online={c.online} unread={c.unread} unreadLabel={t.newMessages(c.unread)}
        peek={c.peek} onOpen={c.open} className={cn("bottom-[calc(96px+env(safe-area-inset-bottom,0px))] right-4 lg:bottom-6 lg:right-6")} />
      {!c.desktop && <ChatSheet open={c.sheet} onClose={c.close} label={title}><Panel c={c} onBack={c.close} className="h-full flex-1" /></ChatSheet>}
      {c.desktop && !c.docked && <ChatWindow open={c.win} onClose={c.close} label={title}><Panel c={c} onMinimize={c.close} className="h-full flex-1" /></ChatWindow>}
      <TaxFileViewer chat docId={c.viewing?.id ?? null} title={c.viewing?.title} onClose={() => c.setViewing(null)} />
    </>
  );
}
