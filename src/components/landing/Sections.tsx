import { Stamp, StatusIcon } from "@/components/ui";
import s from "./sections.module.css";

/* ---------- 1. What we do: the two products ---------- */
export function WhatWeDo() {
  return (
    <section id="what" className={s.what} aria-labelledby="what-title">
      <div className={s.wrap}>
        <header className={s.head}>
          <h2 id="what-title" className={s.h2}>
            Two things, done honestly.
          </h2>
          <p className={s.lede}>
            A free resume builder that only writes what you can prove, and a job checker that tells you plainly whether a
            role fits you, and why.
          </p>
        </header>

        <div className={s.whatGrid}>
          <article className={s.whatResume}>
            <div className={s.whatCopy}>
              <h3 className={s.h3}>A resume that gets read.</h3>
              <p>
                Single-column, ATS-safe templates. Every line comes from a fact you confirmed. Before you download, we read
                the file back the way screening software does, and tell you exactly what it found.
              </p>
              <ul className={s.ticks}>
                <li>PDF, Word and plain text, free</li>
                <li>No fake “ATS score”, no hidden keywords</li>
                <li>Every line shows the fact it came from</li>
              </ul>
            </div>
            <div className={s.checkCard} aria-label="Example readability check">
              <p className={s.mono}>Readability check · Rohan_Iyer_Resume.pdf</p>
              {[
                "Name, email and phone read back",
                "Sections: Experience, Skills, Education",
                "2 employers, 2 job titles, 2 date ranges",
                "14 skills recognised",
                "Word file reads back the same",
              ].map((r) => (
                <p key={r} className={s.checkRow}>
                  <span className={s.checkIcon}>
                    <StatusIcon name="check" />
                  </span>
                  {r}
                </p>
              ))}
              <p className={s.checkFoot}>Read back by two independent text extractors.</p>
            </div>
          </article>

          <article className={s.whatJobs}>
            <div className={s.whatCopy}>
              <h3 className={s.h3}>Jobs, explained.</h3>
              <p>
                Paste any job, from anywhere. We check the must-haves first, then every requirement against your confirmed
                facts. One plain verdict, never a percentage.
              </p>
            </div>
            <div className={s.miniJob} aria-label="Example job check">
              <p className={s.mono}>Senior Frontend Engineer · Kestrel Pay</p>
              <p className={s.miniRow}>
                <span>Bengaluru, hybrid</span>
                <Stamp status="match" />
              </p>
              <p className={s.miniRow}>
                <span>React + TypeScript</span>
                <Stamp status="supported" />
              </p>
              <p className={s.miniRow}>
                <span>Core Web Vitals</span>
                <Stamp status="partial" />
              </p>
              <p className={s.miniRow}>
                <span>GraphQL</span>
                <Stamp status="no_evidence" />
              </p>
              <p className={s.verdict}>Good fit with gaps</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ---------- 2. The problem, red-penned ---------- */
export function Problem() {
  return (
    <section className={s.problem} aria-labelledby="problem-title">
      <div className={`${s.wrap} ${s.problemGrid}`}>
        <div className={s.problemCopy}>
          <h2 id="problem-title" className={s.h2}>
            Why most resumes quietly fail.
          </h2>
          <p className={s.lede}>
            AI tools make resumes sound impressive by inventing things. Fancy templates look good to people and break the
            software that reads them first. And none of it survives the interview question: “tell me more about that.”
          </p>
          <ul className={s.problemList}>
            <li>
              <b>Invented numbers and titles</b> you can’t defend in an interview.
            </li>
            <li>
              <b>Two-column designs</b> that screening software reads in the wrong order.
            </li>
            <li>
              <b>Keyword stuffing</b> that recruiters spot in seconds.
            </li>
            <li>
              <b>“92% match” scores</b> that don’t say what’s actually missing.
            </li>
          </ul>
        </div>

        <figure className={s.redPen} aria-label="A typical AI-written resume, marked up in red pen">
          <p className={s.rpName}>Rohan Iyer</p>
          <p className={s.rpTag}>Results-driven visionary frontend ninja</p>
          <div className={s.rpCols}>
            <div className={s.rpSide}>
              <span />
              <span />
              <span />
            </div>
            <ul className={s.rpList}>
              <li>
                Spearheaded a <mark className={s.rpBad}>40%</mark> revenue increase through React
                <span className={`${s.note} ${s.n1}`}>invented number</span>
              </li>
              <li>
                <mark className={s.rpBad}>Led</mark> company-wide performance strategy
                <span className={`${s.note} ${s.n2}`}>you contributed, not led</span>
              </li>
              <li>
                React, React.js, ReactJS, <mark className={s.rpBad}>React Native</mark>, Redux, Kubernetes, AI
                <span className={`${s.note} ${s.n3}`}>keyword stuffing</span>
              </li>
            </ul>
          </div>
          <span className={`${s.note} ${s.n4}`}>two columns: ATS reads this out of order</span>
          <svg className={s.circle} viewBox="0 0 200 80" aria-hidden>
            <path d="M12 44 C10 12 178 4 190 34 C200 66 40 82 16 58" fill="none" stroke="#c0352b" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </figure>
      </div>
    </section>
  );
}

/* ---------- 3. Features in detail (alternating rows) ---------- */
export function Features() {
  return (
    <section id="features" className={s.features} aria-labelledby="features-title">
      <div className={s.wrap}>
        <header className={s.head}>
          <h2 id="features-title" className={s.h2}>
            Everything it does for you.
          </h2>
        </header>

        <div className={s.rows}>
          <div className={s.row}>
            <div className={s.rowCopy}>
              <h3 className={s.h3}>Bring the resume you already have.</h3>
              <p>
                Upload a PDF or Word file, paste text, or import your LinkedIn data export. We turn it into separate facts
                you review. Anything we can’t read stays empty; we never guess a date or a number.
              </p>
            </div>
            <div className={s.rowArt}>
              <div className={s.files}>
                {[
                  ["PDF", "resume_2024.pdf"],
                  ["DOCX", "Rohan Iyer CV.docx"],
                  ["CSV", "LinkedIn export"],
                ].map(([k, n], i) => (
                  <div key={n} className={s.file} style={{ rotate: `${(i - 1) * 4}deg` }}>
                    <span className={s.fileKind}>{k}</span>
                    <span className={s.fileLines} aria-hidden>
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className={s.fileName}>{n}</span>
                  </div>
                ))}
                <p className={s.fileArrow}>→ 11 draft facts to review</p>
              </div>
            </div>
          </div>

          <div className={`${s.row} ${s.rowFlip}`}>
            <div className={s.rowCopy}>
              <h3 className={s.h3}>Questions that find your real impact.</h3>
              <p>
                Most of what makes you good never reaches your resume. We ask a few short, specific questions, like a
                mentor reading over your shoulder, and turn your answers into facts you confirm.
              </p>
            </div>
            <div className={s.rowArt}>
              <div className={s.qa}>
                <p className={s.margin}>You moved checkout to React. Did anything get faster, or did more people complete checkout?</p>
                <div className={s.answer}>
                  <p className={s.mono}>Your answer</p>
                  <p>Bundle went from 1.8 MB to 640 KB. Checkout drop-off fell, but I don’t have the exact number.</p>
                </div>
                <div className={s.draftFact}>
                  <p className={s.mono}>New draft fact · F-16</p>
                  <p>Cut the checkout bundle from 1.8 MB to 640 KB</p>
                  <span className={s.confirmBtn}>Confirm</span>
                </div>
              </div>
            </div>
          </div>

          <div className={s.row}>
            <div className={s.rowCopy}>
              <h3 className={s.h3}>Tailor for any job in one click.</h3>
              <p>
                Keep one master resume per direction. For a specific job, we reorder and reword the same confirmed facts
                for that role and show what changed. Nothing new is invented.
              </p>
            </div>
            <div className={s.rowArt}>
              <div className={s.tailor}>
                <div className={s.tPage}>
                  <p className={s.mono}>Master · Frontend Engineer</p>
                  <span className={s.tLine} />
                  <span className={s.tLine} />
                  <span className={`${s.tLine} ${s.tShort}`} />
                </div>
                <span className={s.tArrow}>→</span>
                <div className={`${s.tPage} ${s.tTailored}`}>
                  <p className={s.mono}>Tailored · Kestrel Pay</p>
                  <span className={`${s.tLine} ${s.tHi}`} />
                  <span className={s.tLine} />
                  <span className={`${s.tLine} ${s.tShort} ${s.tHi}`} />
                  <p className={s.tNote}>2 lines moved up · 1 skill added from your facts</p>
                </div>
              </div>
            </div>
          </div>

          <div className={`${s.row} ${s.rowFlip}`}>
            <div className={s.rowCopy}>
              <h3 className={s.h3}>Know exactly what’s missing, and what to do.</h3>
              <p>
                Not every gap is the same. Some are on your resume, some are in your profile, and some are real skills to
                learn. We tell you which is which.
              </p>
            </div>
            <div className={s.rowArt}>
              <ul className={s.gaps}>
                <li>
                  <p className={s.gapKind}>Presentation gap</p>
                  <p>You have the evidence; your resume doesn’t show it.</p>
                  <p className={s.gapDo}>Add it to the tailored resume</p>
                </li>
                <li>
                  <p className={s.gapKind}>Evidence gap</p>
                  <p>You may have done it; nothing’s recorded yet.</p>
                  <p className={s.gapDo}>Answer one question</p>
                </li>
                <li>
                  <p className={s.gapKind}>Learning gap</p>
                  <p>You’ve said you don’t have it yet.</p>
                  <p className={s.gapDo}>See how many of your best-fit jobs ask for it</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 4. Honest comparison (categories, not brands) ---------- */
const COMPARE: { row: string; us: string; chat: string; builders: string; boards: string }[] = [
  { row: "Every line traced to a fact you confirmed", us: "yes", chat: "no", builders: "no", boards: "—" },
  { row: "Blocks invented numbers and inflated titles", us: "yes", chat: "no", builders: "no", boards: "—" },
  { row: "Reads your file back like screening software", us: "yes", chat: "no", builders: "some", boards: "—" },
  { row: "Explains job fit requirement by requirement", us: "yes", chat: "some", builders: "no", boards: "no" },
  { row: "No match percentage pretending to be a prediction", us: "yes", chat: "—", builders: "no", boards: "no" },
  { row: "Free to build and download", us: "yes", chat: "yes", builders: "some", boards: "—" },
];

function Cell({ v }: { v: string }) {
  if (v === "yes")
    return (
      <span className={s.cYes}>
        <StatusIcon name="check" />
        <span className="sr-only">Yes</span>
      </span>
    );
  if (v === "no")
    return (
      <span className={s.cNo}>
        <StatusIcon name="cross" />
        <span className="sr-only">No</span>
      </span>
    );
  if (v === "some") return <span className={s.cSome}>Some</span>;
  return <span className={s.cNa}>n/a</span>;
}

export function Compare() {
  return (
    <section className={s.compare} aria-labelledby="compare-title">
      <div className={s.wrap}>
        <header className={s.head}>
          <h2 id="compare-title" className={s.h2}>
            How it’s different.
          </h2>
          <p className={s.lede}>Compared with the tools people usually reach for.</p>
        </header>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">What it does</span>
                </th>
                <th scope="col" className={s.usCol}>
                  Hunt
                </th>
                <th scope="col">AI chatbots</th>
                <th scope="col">Typical resume builders</th>
                <th scope="col">Job boards</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.row}>
                  <th scope="row">{r.row}</th>
                  <td className={s.usCol}>
                    <Cell v={r.us} />
                  </td>
                  <td>
                    <Cell v={r.chat} />
                  </td>
                  <td>
                    <Cell v={r.builders} />
                  </td>
                  <td>
                    <Cell v={r.boards} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- 5. Promises, signed ---------- */
export function Promises() {
  return (
    <section id="trust" className={s.promises} aria-labelledby="promises-title">
      <div className={`${s.wrap} ${s.promisesGrid}`}>
        <div>
          <h2 id="promises-title" className={s.h2}>
            Your career history is yours.
          </h2>
          <p className={s.lede}>You’re trusting us with your work life. These aren’t settings; they’re how it’s built.</p>
        </div>
        <div className={s.letter}>
          <p className={s.letterHead}>Our promises to you</p>
          <ol className={s.letterList}>
            <li>We never sell your data, and never show it to employers.</li>
            <li>Your name and contact details are never sent to an AI model.</li>
            <li>Nothing you upload is used to train anyone’s AI.</li>
            <li>Export everything, or delete everything, whenever you like.</li>
            <li>We never apply to jobs for you, and never pretend to know your chances.</li>
          </ol>
          <p className={s.signature}>— the Hunt team</p>
          <span className={s.letterStamp}>
            <StatusIcon name="check" /> Signed
          </span>
        </div>
      </div>
    </section>
  );
}

/* ---------- 6. FAQ (native details, no JS) ---------- */
const FAQ = [
  ["Is it really free?", "Yes. Building your profile, master resumes, PDF and Word downloads and the readability check are free. The free plan includes 10 tailored resumes and 30 detailed job checks a month, and you’ll always see your count before you reach it. A resume you’ve already made can always be downloaded."],
  ["Will my resume pass every ATS?", "Nobody can honestly promise that, so we don’t. Our templates are single-column and built to be read by machines, and before every download we read the file back with two independent text extractors and show you what they found."],
  ["Will you apply to jobs for me?", "No. We help you decide which jobs are worth it and give you a resume you can defend. Applying stays your decision, on the employer’s own site."],
  ["Where do the jobs come from?", "Right now, from you: paste any job description from Naukri, LinkedIn, a company site or an email. We read only the text you paste and never scrape sites that don’t allow it."],
  ["Does it work for my profession?", "It works for every profession, from engineers and accountants to nurses and electricians. Some fields are labelled beta while we measure quality for them, and we say so plainly."],
  ["What can the AI change on my resume?", "Only wording and order. Numbers, dates, employers, titles, tools and how much you were responsible for are checked against your confirmed facts by code. If a line claims more than a fact supports, it’s blocked and you see why."],
];

export function Faq() {
  return (
    <section id="faq" className={s.faq} aria-labelledby="faq-title">
      <div className={`${s.wrap} ${s.faqGrid}`}>
        <h2 id="faq-title" className={s.h2}>
          Questions, answered straight.
        </h2>
        <div className={s.faqList}>
          {FAQ.map(([q, a]) => (
            <details key={q} className={s.qItem}>
              <summary>
                <span>{q}</span>
                <span className={s.qPlus} aria-hidden />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
