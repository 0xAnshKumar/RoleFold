import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import a from "@/components/app/app.module.css";
import s from "../signin/signin.module.css";
import Confirm from "./Confirm";

export const metadata: Metadata = { title: "Stop job alerts — Hunt" };

// Public: the signed token from the alert email is the only credential, and it can only turn alerts off.
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Body({ searchParams }: Props) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) return <p className={a.note}>This link is missing its code. Use the link from the email again.</p>;
  return <Confirm token={token} />;
}

export default function Unsubscribe({ searchParams }: Props) {
  return (
    <main className={s.wrap}>
      <Link href="/" className={s.brand}>
        Hunt
      </Link>
      <section className={`panel ${s.card}`} aria-labelledby="unsub-title">
        <h1 id="unsub-title" className={s.title}>
          Stop job alert emails
        </h1>
        <p className={a.note}>You’ll stop getting emails about new jobs. Your account, feed and saved jobs stay as they are.</p>
        <Suspense fallback={null}>
          <Body searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
