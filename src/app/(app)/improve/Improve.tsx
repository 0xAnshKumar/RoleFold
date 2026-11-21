"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/State";
import { api } from "@/lib/api";
import type { Suggestion } from "@/lib/suggestions";
import { useAction } from "@/lib/useAction";
import s from "./improve.module.css";

// shortcut: dismissals live in this browser only; move them to the API if users ask to see them on every device.
const STORE = "rolefold:dismissed-suggestions";
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));
const parse = (raw: string): string[] => {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export default function Improve({ suggestions, demo }: { suggestions: Suggestion[]; demo: boolean }) {
  // The raw string is the snapshot (stable between reads); the server renders with nothing dismissed.
  const dismissed = parse(useSyncExternalStore(subscribe, () => localStorage.getItem(STORE) ?? "[]", () => "[]"));
  const [done, setDone] = useState<Record<string, string>>({}); // card key -> what happened, shown in place of the card
  // An edit refreshes the page and the fact's new version gives its card a new id: key edits by fact so the note stays.
  const doneKey = (x: Suggestion) => (x.kind === "edit" ? `fact:${x.fact.id}` : x.id);
  const dismiss = (id: string) => {
    localStorage.setItem(STORE, JSON.stringify([...dismissed, id].slice(-200)));
    listeners.forEach((fn) => fn());
  };
  const shown = suggestions.filter((x) => !dismissed.includes(x.id));
  const open = shown.filter((x) => !done[doneKey(x)]);
  const groups = [
    { title: "Fix these first", items: shown.filter((x) => x.severity === "fix") },
    { title: "Worth a look", items: shown.filter((x) => x.severity === "consider") },
  ].filter((g) => g.items.length);

  const next = (
    <div className={s.next}>
      <ButtonLink href="/resumes" variant="primary">
        Pick a template
      </ButtonLink>
      <ButtonLink href="/jobs">Find jobs</ButtonLink>
    </div>
  );

  if (!open.length)
    return (
      <Card>
        <EmptyState icon="check" title={shown.length ? "That’s everything for now" : "Nothing to fix"} action={next}>
          {shown.length ? "Your changes are saved. Update your resume with them from the Resume page." : "Your confirmed facts pass every check we run. Pick a template, then start your search."}
        </EmptyState>
      </Card>
    );

  return (
    <div className={s.page}>
      <p className={s.count} role="status">
        {open.length} suggestion{open.length === 1 ? "" : "s"}
      </p>
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`h-${g.title}`} className={s.group}>
          <h2 id={`h-${g.title}`} className={s.groupTitle}>
            {g.title}
          </h2>
          <ul className={s.list}>
            {g.items.map((x) => (
              <li key={x.id}>
                {done[doneKey(x)] ? (
                  <p className={s.done} role="status">
                    <Icon name="check" size={16} />
                    {done[doneKey(x)]}
                  </p>
                ) : (
                  <Item x={x} demo={demo} onDone={(msg) => setDone((d) => ({ ...d, [doneKey(x)]: msg }))} onDismiss={() => dismiss(x.id)} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className={s.foot}>When you’re done, choose how your resume looks or start your search.</p>
      {next}
    </div>
  );
}

function Item({ x, demo, onDone, onDismiss }: { x: Suggestion; demo: boolean; onDone: (msg: string) => void; onDismiss: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(x.kind === "edit" ? x.fact.text : "");
  const { busy, error, run } = useAction();

  // PATCH /v1/facts/{id}: a new version of the user's own fact (the master resume then offers "Update with new facts").
  const saveEdit = () =>
    x.kind === "edit" &&
    run("save", async () => {
      if (!demo) {
        await api(`/facts/${x.fact.id}`, { method: "PATCH", body: { version: x.fact.version, description: text.trim() } });
        router.refresh();
      }
      onDone(demo ? "Sample data: nothing was saved." : "Saved. Your resume will offer to update with it.");
    });
  return (
    <Card as="article" className={s.item}>
      <h3 className={s.title}>{x.title}</h3>
      <p className={s.why}>{x.why}</p>

      {x.kind === "edit" &&
        (editing ? (
          <>
            <Textarea label={`Your line under ${x.fact.role || "this role"}`} helper={x.hint} value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} autoFocus />
            <div className={s.actions}>
              <Button variant="primary" size="sm" loading={busy === "save"} disabled={!text.trim() || text.trim() === x.fact.text.trim()} onClick={saveEdit}>
                Save my wording
              </Button>
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <blockquote className={s.quote}>
              <span className={s.role}>{x.fact.role}</span>
              {x.fact.text}
            </blockquote>
            <div className={s.actions}>
              <Button size="sm" onClick={() => setEditing(true)}>
                Edit this line
              </Button>
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Leave it
              </Button>
            </div>
          </>
        ))}

      {x.kind === "link" && (
        <div className={s.actions}>
          <ButtonLink href={x.href} size="sm">
            {x.action}
          </ButtonLink>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Leave it
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className={s.problem}>
          <Icon name="alert" size={16} />
          {error} {x.kind === "edit" && <Link href="/profile#exp">Edit it on your profile instead</Link>}
        </p>
      )}
    </Card>
  );
}
