"use client";

import PageHeader from "@/components/app/PageHeader";
import a from "@/components/app/app.module.css";
import s from "../admin.module.css";
import { Loaded, useLoad, when } from "../shared";

type Entry = { id: string; actor_id: string | null; actor_hash: string | null; action: string; target: string | null; reason: string | null; created_at: string };

export default function AuditPage() {
  const log = useLoad<{ items: Entry[] }>("/admin/audit");
  return (
    <>
      <PageHeader title="Audit log" sub="The latest 200 entries: admin actions with their reasons, account deletions, and other audited events." />
      <Loaded state={log}>
        {(d) => (
          <div className={`${a.cardFlat} ${s.tableWrap}`}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Who</th>
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((e) => (
                  <tr key={e.id}>
                    <td>{when(e.created_at)}</td>
                    <td className={a.mono}>{e.action}</td>
                    <td className={a.mono}>{e.actor_id ?? (e.actor_hash ? "deleted account" : "system")}</td>
                    <td className={a.mono}>{e.target ?? "–"}</td>
                    <td>{e.reason ?? "–"}</td>
                  </tr>
                ))}
                {!d.items.length && (
                  <tr>
                    <td colSpan={5}>No entries yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Loaded>
    </>
  );
}
