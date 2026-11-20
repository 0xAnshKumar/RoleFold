import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import a from "@/components/app/app.module.css";
import s from "./signin.module.css";

export const metadata: Metadata = { title: "Sign in" };

// ?error= codes set by src/app/auth/callback and login.
const ERRORS: Record<string, string> = {
  state: "That sign-in took too long or was opened in another tab. Try again.",
  denied: "Sign-in was cancelled. Nothing changed.",
  provider: "We couldn’t reach the sign-in service just now. Try again in a moment.",
  token: "We couldn’t confirm that sign-in. Try again.",
  config: "Sign-in isn’t set up on this server yet.",
};

// A plain link, not <Link>: prefetching a route handler would start a sign-in.
const Continue = ({ next }: { next?: string }) => (
  <a href={next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login"} className="btn btn-primary">
    Continue to sign in
  </a>
);

async function Body({ searchParams }: Pick<PageProps<"/signin">, "searchParams">) {
  const { next, error } = await searchParams;
  if (!process.env.OIDC_ISSUER)
    return (
      <p className={a.note}>
        Sign-in isn’t set up on this server yet. You can still <Link href="/jobs">look around with sample data</Link>.
      </p>
    );
  return (
    <>
      {typeof error === "string" && (
        <p role="alert" className={s.error}>
          {ERRORS[error] ?? ERRORS.token}
        </p>
      )}
      <Continue next={typeof next === "string" ? next : undefined} />
    </>
  );
}

export default function SignIn({ searchParams }: PageProps<"/signin">) {
  return (
    <main className={s.wrap}>
      <Link href="/" className={s.brand}>
        RoleFold
      </Link>
      <section className={`panel ${s.card}`} aria-labelledby="signin-title">
        <h1 id="signin-title" className={s.title}>
          Sign in to RoleFold
        </h1>
        <p className={a.note}>Your facts, resumes and saved jobs stay private to your account.</p>
        <Suspense fallback={<Continue />}>
          <Body searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
