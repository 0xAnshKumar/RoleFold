"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import a from "@/components/app/app.module.css";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import type { AiProvider, AiKey as State } from "@/lib/data";
import { useAction } from "@/lib/useAction";
import s from "./settings.module.css";

const PROVIDERS: Record<AiProvider, { name: string; where: string }> = {
  gemini: { name: "Google Gemini", where: "Google AI Studio" },
  anthropic: { name: "Anthropic Claude", where: "the Claude Console" },
  openai: { name: "OpenAI", where: "the OpenAI platform" },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** PUT/DELETE /v1/me/ai-key. Pick a provider, paste a key; the API checks it with that provider. Never shown again. Demo: disabled. */
export default function AiKey({ state, demo }: { state: State; demo: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState<AiProvider>(state.provider ?? "gemini");
  const { busy, error, setError, run } = useAction();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run("save", async () => {
      await api("/me/ai-key", { method: "PUT", body: { provider, api_key: key.trim() } });
      setKey("");
      setOpen(false);
      router.refresh();
    });
  };
  const remove = () =>
    run("remove", async () => {
      await api("/me/ai-key", { method: "DELETE" });
      router.refresh();
    });

  return (
    <>
      <span className={s.text}>
        <span className={s.key}>Your own AI key</span>
        <span className={s.muted}>
          {state.set
            ? `${PROVIDERS[state.provider ?? "gemini"].name} key ending ${state.last4}${state.added_at ? `, added ${day(state.added_at)}` : ""}. RoleFold’s AI runs on it, billed to your account with that provider.`
            : "Optional. RoleFold’s AI runs on our key by default. Add a Gemini, Claude or OpenAI key and it runs on yours instead, billed to you."}
        </span>
        {error && !open && (
          <span role="alert" className={a.problem}>
            {error}
          </span>
        )}
      </span>
      <span className={s.actions}>
        {state.set && (
          <Button size="sm" variant="danger" disabled={demo || !!busy} loading={busy === "remove"} onClick={remove}>
            Remove
          </Button>
        )}
        <Button
          size="sm"
          disabled={demo}
          aria-describedby={demo ? "aikey-demo" : undefined}
          onClick={() => {
            setKey("");
            setProvider(state.provider ?? "gemini");
            setError(null);
            setOpen(true);
          }}
        >
          {state.set ? "Replace…" : "Add key…"}
        </Button>
      </span>
      {demo && (
        <span id="aikey-demo" className="sr-only">
          This is sample data, so there’s no account to add a key to.
        </span>
      )}
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={state.set ? "Replace your AI key" : "Add your AI key"}
        description="Pick the provider, then paste an API key you created with them. We check it with that provider, store it encrypted, and only ever show its last 4 characters. If the provider rejects it later, AI steps stop and we tell you; we never switch back to our key without asking."
      >
        <form className={s.deleteForm} onSubmit={save}>
          <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
            {(Object.keys(PROVIDERS) as AiProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDERS[p].name}
              </option>
            ))}
          </Select>
          <Input
            label={`${PROVIDERS[provider].name} API key`}
            helper={`Create one in ${PROVIDERS[provider].where}.`}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
          {error && (
            <p role="alert" className={a.problem}>
              {error}
            </p>
          )}
          <div className={s.deleteActions}>
            <Button disabled={!!busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={key.trim().length < 20} loading={busy === "save"}>
              Check and save
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
