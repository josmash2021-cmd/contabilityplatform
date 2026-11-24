// What the chat does, for the client (tax.*) and for the preparer (tax.admin*): a message shows at once as
// "Enviando…" and turns into the real one when the server has it (or "No se envió · Reintentar"); photos and
// documents go the same way with a little bar; typing and "En línea" are told to the other side.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { TaxFileError, prepareTaxUpload, saveTaxFile, showsAsPicture } from "@/lib/taxFiles";
import type { ChatFile, PendingMsg } from "./TaxChat";

type Who = { side: "client" } | { side: "preparer"; returnId: number };
type Errors = { tooBig: string; type: string; generic: string };
const newKey = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function useTaxChat(who: Who, refetch: () => Promise<unknown>, errors: Errors) {
  const utils = trpc.useUtils();
  const client = who.side === "client";
  const returnId = who.side === "preparer" ? who.returnId : 0;
  const sendC = trpc.tax.sendMessage.useMutation();
  const sendP = trpc.tax.adminSendMessage.useMutation();
  const fileC = trpc.tax.sendFile.useMutation();
  const fileP = trpc.tax.adminSendFile.useMutation();
  const typeC = trpc.tax.typing.useMutation();
  const typeP = trpc.tax.adminTyping.useMutation();
  const presC = trpc.tax.chatPresence.useMutation();
  const presP = trpc.tax.adminChatPresence.useMutation();
  const [pending, setPending] = useState<PendingMsg[]>([]);
  const jobs = useRef(new Map<string, () => Promise<unknown>>());
  const urls = useRef(new Map<string, string>());
  const lastTyping = useRef(0);

  const run = async (key: string) => {
    const job = jobs.current.get(key);
    if (!job) return;
    setPending((ps) => ps.map((p) => (p.key === key ? { ...p, failed: false } : p)));
    try {
      await job();
      await refetch();
      jobs.current.delete(key);
      setPending((ps) => ps.filter((p) => p.key !== key));
      const url = urls.current.get(key);
      if (url) { urls.current.delete(key); setTimeout(() => URL.revokeObjectURL(url), 5000); }
    } catch (e) {
      setPending((ps) => ps.map((p) => (p.key === key ? { ...p, failed: true } : p)));
      toast.error(e instanceof Error && e.message ? e.message : errors.generic);
    }
  };

  const send = (body: string) => {
    const key = newKey();
    jobs.current.set(key, () => (client ? sendC.mutateAsync({ body }) : sendP.mutateAsync({ returnId, body })));
    setPending((ps) => [...ps, { key, body, sentAt: Date.now(), file: null, failed: false }]);
    void run(key);
  };

  const sendFiles = async (files: File[]) => {
    for (const file of files) {
      let payload: Awaited<ReturnType<typeof prepareTaxUpload>>;
      try {
        payload = await prepareTaxUpload(file);
      } catch (e) {
        toast.error(e instanceof TaxFileError ? (e.reason === "tooBig" ? errors.tooBig : errors.type) : errors.generic);
        continue;
      }
      const key = newKey();
      const url = showsAsPicture(payload.mimeType) ? URL.createObjectURL(file) : null;
      if (url) urls.current.set(key, url);
      const up = payload;
      jobs.current.set(key, () => (client ? fileC.mutateAsync(up) : fileP.mutateAsync({ returnId, ...up })));
      setPending((ps) => [...ps, { key, body: "", sentAt: Date.now(), file: { name: up.fileName, size: file.size, url }, failed: false }]);
      void run(key);
    }
  };

  /** At most one "escribiendo" signal every 2.5 s. */
  const typing = () => {
    const now = Date.now();
    if (now - lastTyping.current < 2500) return;
    lastTyping.current = now;
    if (client) typeC.mutate(undefined, { onError: () => undefined });
    else typeP.mutate({ returnId }, { onError: () => undefined });
  };

  const presence = (open: boolean, tab: string) => {
    if (client) presC.mutate({ tab, open }, { onError: () => undefined });
    else presP.mutate({ returnId, tab, open }, { onError: () => undefined });
  };

  const save = async (f: ChatFile) => {
    try {
      saveTaxFile(client ? await utils.tax.chatFile.fetch({ id: f.id }) : await utils.tax.adminChatFile.fetch({ id: f.id }));
    } catch {
      toast.error(errors.generic);
    }
  };

  return { pending, send, sendFiles, retry: (key: string) => void run(key), typing, presence, save };
}
