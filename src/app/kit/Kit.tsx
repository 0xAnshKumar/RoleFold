"use client";

import { useState } from "react";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { Card, CardSet, cardLink, cardRaised } from "@/components/ui/Card";
import { Checkbox, Radio, Switch } from "@/components/ui/Choice";
import { ChipRow, FilterChip, SkillChip } from "@/components/ui/Chip";
import { Dialog, type DialogVariant } from "@/components/ui/Dialog";
import { Disclosure } from "@/components/ui/Disclosure";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar, StageList } from "@/components/ui/Progress";
import { FactTag, ProofMark, SignatureLine } from "@/components/ui/Proof";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton, SkeletonRegion, SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/State";
import { Badge, StatusMark, VerdictMark } from "@/components/ui/Status";
import { TabLinks, Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { VerdictSeal } from "@/components/ui/VerdictSeal";
import type { Status, Verdict } from "@/lib/mock";
import s from "./kit.module.css";

const STATUSES: Status[] = ["supported", "match", "partial", "no_evidence", "gap", "conflict", "unknown"];
const VERDICTS: Verdict[] = ["Strong fit", "Good fit with gaps", "Stretch", "Poor fit", "Not enough detail in this posting", "Not eligible"];
const FORCED = ["hover", "press", "focus"] as const;
const SWATCHES = [
  "bg", "bg-sunken", "surface", "surface-raised", "text", "text-muted", "line", "line-strong", "accent", "accent-hover", "accent-tint",
  "proof", "tag", "supported", "supported-bg", "partial", "partial-bg", "missing", "missing-bg", "conflict", "conflict-bg", "inverse-bg",
];
const TYPE = ["t-d1", "t-d2", "t-d3", "t-h", "t-title", "t-lead", "t-body", "t-sm", "t-label", "t-xs", "t-quote", "t-id"];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className={s.section} aria-labelledby={id}>
      <h2 id={id} className={s.h2}>
        {title}
        <span className="sr-only"> ({id.split("-")[0]})</span>
      </h2>
      {children}
    </section>
  );
}
const Row = ({ label, children }: { label?: string; children: React.ReactNode }) => (
  <div className={s.row}>
    {label && <span className={s.rowLabel}>{label}</span>}
    <div className={s.rowItems}>{children}</div>
  </div>
);

function Body({ theme }: { theme: "light" | "night" }) {
  const p = (x: string) => `${theme}-${x}`;
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogVariant | "danger" | null>(null);
  const [busy, setBusy] = useState(false);
  const [pressed, setPressed] = useState(true);
  const [seg, setSeg] = useState<"contributed" | "owned" | "led" | "managed">("owned");
  const [linked, setLinked] = useState(false);
  const [sealKey, setSealKey] = useState(0);
  const [sigKey, setSigKey] = useState(0);

  return (
    <div className={s.body}>
      <h1 className={s.h1}>{theme === "light" ? "Light" : "Night"}</h1>

      <Section id={p("colour")} title="Colour">
        <div className={s.swatches}>
          {SWATCHES.map((c) => (
            <div key={c} className={s.swatch}>
              <span className={s.chip} style={{ background: `var(--${c})` }} />
              <code>--{c}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section id={p("type")} title="Type">
        <div className={s.stack}>
          <p className="t-d1">
            Proof you can <span className="italic-accent proof">hold</span>
          </p>
          {TYPE.slice(1).map((t) => (
            <p key={t} className={t}>
              {t}: Frontend Engineer II, ₹8-12 LPA, F-15, 12 Oct 2026, l I 1 O 0
            </p>
          ))}
        </div>
      </Section>

      <Section id={p("elevation")} title="Radius and elevation">
        <div className={s.shadows}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`${s.shadowBox} rim`} style={{ boxShadow: `var(--shadow-${n})` }}>
              shadow-{n}
            </div>
          ))}
        </div>
      </Section>

      <Section id={p("buttons")} title="Buttons">
        {(["primary", "secondary", "ghost", "danger", "dangerFilled"] as const).map((v) => (
          <Row key={v} label={v}>
            <Button variant={v}>Confirm 8 facts</Button>
            {FORCED.map((f) => (
              <Button key={f} variant={v} data-force={f}>
                {f}
              </Button>
            ))}
            <Button variant={v} disabled aria-describedby={p("why")}>
              Disabled
            </Button>
            <Button variant={v} loading>
              Saving
            </Button>
          </Row>
        ))}
        <p id={p("why")} className={s.note}>
          Disabled buttons stay focusable and point at a visible reason like this one.
        </p>
        <Row label="sizes">
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary">Default</Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="secondary" icon={<Icon name="plus" size={18} />}>
            Add a fact
          </Button>
        </Row>
        <Row label="interactive">
          <Button
            variant="primary"
            loading={busy}
            onClick={() => {
              setBusy(true);
              setTimeout(() => setBusy(false), 1200);
            }}
          >
            Download PDF
          </Button>
          <IconButton label="Save job" icon={<Icon name="heart" />} />
          <IconButton label="More actions" icon={<Icon name="more" />} variant="secondary" />
          <ButtonLink href="#" variant="secondary">
            Link as button
          </ButtonLink>
          <a href="#">Text link</a>
        </Row>
      </Section>

      <Section id={p("inputs")} title="Inputs">
        <div className={s.grid}>
          <Input label="Full name" defaultValue="Rohan Iyer" autoComplete="name" />
          <Input label="Hover" defaultValue="Rohan Iyer" data-force="hover" />
          <Input label="Focus" defaultValue="Rohan Iyer" data-force="focus" />
          <Input label="Email" type="email" defaultValue="rohan@" error="Enter a full email, like name@example.com." />
          <Input label="Disabled" defaultValue="Can’t change this" disabled helper="Your sign-in provider owns this field." />
          <Input label="Read-only" defaultValue="F-15 · 12 Oct" readOnly />
          <Input label="Phone" prefix="+91" inputMode="tel" autoComplete="tel-national" defaultValue="98765 43210" />
          <Input label="Expected CTC" prefix="₹" suffix="LPA" inputMode="decimal" defaultValue="12" helper="Stored as a number." />
          <Select label="Notice period" defaultValue="30">
            <option value="0">Can join now</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
          </Select>
          <Textarea label="Fact" defaultValue="Cut checkout page load from 4.1s to 2.3s by splitting the JavaScript bundle." helper="Grows from 3 to 12 rows." />
        </div>
      </Section>

      <Section id={p("choices")} title="Checkbox, radio, switch, segmented">
        <div className={s.grid}>
          <div>
            <Checkbox label="Remote only" defaultChecked />
            <Checkbox label="Hybrid" helper="2-3 days in office" />
            <Checkbox label="Disabled" disabled />
          </div>
          <div role="radiogroup" aria-label="Job type">
            <Radio name={p("r")} label="Full-time" defaultChecked />
            <Radio name={p("r")} label="Internship" />
            <Radio name={p("r")} label="Disabled" disabled />
          </div>
          <div>
            <Switch label="Data saver" helper="Fewer images, no texture, no motion" />
            <Switch label="Email me new matches" defaultChecked />
            <Switch label="Disabled" disabled />
          </div>
          <div className={s.stack}>
            <Segmented
              label="Your part"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "contributed", label: "Contributed" },
                { value: "owned", label: "Owned" },
                { value: "led", label: "Led" },
                { value: "managed", label: "Managed" },
              ]}
            />
            <Segmented
              label="Theme"
              size="sm"
              defaultValue="light"
              options={[
                { value: "light", label: "Light" },
                { value: "night", label: "Night" },
                { value: "system", label: "System" },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section id={p("chips")} title="Chips">
        <ChipRow label="Filters">
          <FilterChip count={2}>All filters</FilterChip>
          <FilterChip pressed={pressed} onClick={() => setPressed(!pressed)}>
            Remote
          </FilterChip>
          <FilterChip applied chevron>
            Location: Bengaluru
          </FilterChip>
          <FilterChip chevron>0-2 yrs</FilterChip>
          <FilterChip data-force="hover">Hover</FilterChip>
          <FilterChip data-force="press">Press</FilterChip>
          <FilterChip data-force="focus">Focus</FilterChip>
          <FilterChip disabled>Disabled</FilterChip>
        </ChipRow>
        <Row label="skills">
          <SkillChip confirmed>React</SkillChip>
          <SkillChip confirmed>TypeScript</SkillChip>
          <SkillChip>GraphQL</SkillChip>
        </Row>
      </Section>

      <Section id={p("status")} title="Status marks, verdict marks, badges">
        <Row>
          {STATUSES.map((st) => (
            <StatusMark key={st} status={st} />
          ))}
        </Row>
        <Row>
          {VERDICTS.map((v) => (
            <VerdictMark key={v} verdict={v} detail={v === "Good fit with gaps" ? "1 gap" : undefined} />
          ))}
        </Row>
        <Row>
          <Badge dot>4 entries to confirm</Badge>
          <Badge>Saved · 3</Badge>
        </Row>
      </Section>

      <Section id={p("seal")} title="Verdict seal">
        <div className={s.seals}>
          {VERDICTS.map((v) => (
            <VerdictSeal key={v} verdict={v} checkedOn="6 Nov" />
          ))}
          <VerdictSeal verdict={null} />
        </div>
        <Row label="sizes · press">
          <VerdictSeal key={sealKey} verdict="Good fit with gaps" checkedOn="6 Nov" size={96} press={sealKey > 0} />
          <VerdictSeal verdict="Stretch" size={64} />
          <Button size="sm" onClick={() => setSealKey(sealKey + 1)}>
            Replay press
          </Button>
        </Row>
      </Section>

      <Section id={p("proof")} title="Proof mark, fact tag, signature">
        <p>
          From the posting: <ProofMark quote>“You have built or maintained a shared component library”</ProofMark>
        </p>
        <p
          tabIndex={0}
          className={s.claim}
          onPointerEnter={() => setLinked(true)}
          onPointerLeave={() => setLinked(false)}
          onFocus={() => setLinked(true)}
          onBlur={() => setLinked(false)}
        >
          Linked proof (hover or focus this line): <ProofMark on={linked}>checkout 4.1s → 2.3s</ProofMark>
        </p>
        <Row label="fact tag">
          <FactTag id="F-15" date="12 Oct" fact="Cut checkout page load from 4.1s to 2.3s by splitting the JavaScript bundle." />
          <FactTag id="F-14" date="12 Oct" linked fact="Built the shared React component library." />
          <FactTag id="F-09" date="3 Oct" changed fact="Led the move to TypeScript." />
        </Row>
        <Row label="signature">
          <SignatureLine date="12 Oct 2026" />
          <SignatureLine key={sigKey} date="6 Nov 2026" reveal={sigKey > 0} />
          <Button size="sm" onClick={() => setSigKey(sigKey + 1)}>
            Replay signature
          </Button>
        </Row>
      </Section>

      <Section id={p("cards")} title="Cards">
        <CardSet className={s.cards}>
          <Card interactive>
            <a href="#" className={cardLink}>
              <span className="t-title">Frontend Engineer II</span>
            </a>
            <p className="t-sm">Lumen Health · Bengaluru · Hybrid</p>
            <p className="t-sm muted">1-3 yrs · ₹8-12 LPA · 3 days ago · via company site</p>
            <div className={`${s.cardActions} ${cardRaised}`}>
              <Button size="sm">Check this job</Button>
            </div>
          </Card>
          <Card interactive>
            <a href="#" className={cardLink}>
              <span className="t-title">UI Engineer</span>
            </a>
            <p className="t-sm">Kestrel Pay · Remote, India</p>
            <p className="t-sm muted">Fresher · Salary not shown · Today · via Greenhouse</p>
          </Card>
        </CardSet>
        <Card>A base card: surface, rim, shadow-1. Never a card inside a card.</Card>
      </Section>

      <Section id={p("tabs")} title="Tabs and disclosure">
        <TabLinks
          label={`Jobs sections (${theme} demo)`}
          items={[
            { href: "#", label: "For you", current: true },
            { href: "#", label: "Saved & pasted · 3", current: false },
          ]}
        />
        <Tabs
          label="Resume view"
          tabs={[
            { value: "edit", label: "Edit", panel: <p>Edit panel. Arrow keys, Home and End move between tabs.</p> },
            { value: "preview", label: "Preview", panel: <p>Preview panel.</p> },
          ]}
        />
        <Card flush className={s.disclosures}>
          <Disclosure summary="React and TypeScript in production">
            <p className="t-xs muted">From the posting</p>
            <ProofMark quote>“3+ years building production React apps in TypeScript”</ProofMark>
          </Disclosure>
          <Disclosure summary="Design systems (open by default)" defaultOpen>
            <p>Your fact <FactTag id="F-14" date="12 Oct" /> Built and maintained the shared React component library.</p>
          </Disclosure>
        </Card>
      </Section>

      <Section id={p("overlays")} title="Dialog, drawer, sheet, toast">
        <Row>
          <Button onClick={() => setDialog("dialog")}>Open dialog</Button>
          <Button onClick={() => setDialog("danger")}>Danger dialog</Button>
          <Button onClick={() => setDialog("drawer")}>Open drawer</Button>
          <Button onClick={() => setDialog("sheet")}>Open sheet</Button>
          <Button onClick={() => toast({ message: "Saved to your jobs." })}>Toast</Button>
          <Button onClick={() => toast({ message: "Fact marked not yours.", action: { label: "Undo", onClick: () => toast({ message: "Restored." }) } })}>Toast with Undo</Button>
        </Row>
        <Dialog
          open={dialog === "dialog"}
          onClose={() => setDialog(null)}
          title="Paste a job"
          description="Paste the posting text. We only read what you paste."
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => setDialog(null)}>
                Check this job
              </Button>
            </>
          }
        >
          <Textarea label="Job description" rows={4} />
        </Dialog>
        <Dialog
          open={dialog === "danger"}
          onClose={() => setDialog(null)}
          title="Delete this resume?"
          description="Your facts stay. You can make a new resume from them any time."
          footer={
            <>
              <Button onClick={() => setDialog(null)}>Keep it</Button>
              <Button variant="dangerFilled" onClick={() => setDialog(null)}>
                Delete resume
              </Button>
            </>
          }
        />
        <Dialog
          open={dialog === "drawer"}
          onClose={() => setDialog(null)}
          variant="drawer"
          title="Filters"
          footer={
            <Button variant="primary" onClick={() => setDialog(null)}>
              Show 24 jobs
            </Button>
          }
        >
          <Checkbox label="Remote" defaultChecked />
          <Checkbox label="Hybrid" />
          <Select label="Posted" defaultValue="7">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </Select>
        </Dialog>
        <Dialog open={dialog === "sheet"} onClose={() => setDialog(null)} variant="sheet" title="Account">
          <p className="t-sm muted">A bottom sheet, as the phone account menu uses.</p>
        </Dialog>
      </Section>

      <Section id={p("progress")} title="Progress and skeleton">
        <ProgressBar value={1.2} max={2} label="Uploading… 1.2 of 2.0 MB" valueText="1.2 of 2.0 MB" />
        <StageList
          label="Reading your file"
          stages={[
            { label: "Reading your file", state: "done" },
            { label: "Finding your roles", state: "current" },
            { label: "Finding dates and numbers", state: "pending" },
            { label: "Getting facts ready", state: "pending" },
          ]}
        />
        <SkeletonRegion label="Loading jobs">
          <Card>
            <Skeleton width="55%" height={20} />
            <SkeletonText lines={2} lineHeight={21} />
            <Skeleton width={140} height={36} radius="var(--r-sm)" />
          </Card>
        </SkeletonRegion>
      </Section>

      <Section id={p("states")} title="Empty and error states">
        <div className={s.grid}>
          <Card>
            <EmptyState
              level={3}
              title="Nothing saved yet"
              action={<Button variant="primary">Paste a job</Button>}
              secondary={<a href="#">See jobs for you</a>}
            >
              Save jobs from For you, or paste one you found elsewhere.
            </EmptyState>
          </Card>
          <Card>
            <ErrorState title="We couldn’t finish this check" action={<Button variant="primary">Try again</Button>}>
              Nothing was charged against your checks.
            </ErrorState>
          </Card>
          <Card>
            <EmptyState level={3} icon="offline" title="You’re offline" action={<Button>Retry</Button>}>
              Your edits are saved on this phone and will sync when you’re back.
            </EmptyState>
          </Card>
        </div>
      </Section>

      <section lang="hi" className={s.section} aria-labelledby={p("hi")}>
        <h2 id={p("hi")} className={s.h2}>
          देवनागरी
          <span className="sr-only"> ({theme})</span>
        </h2>
        <p>हर पंक्ति उस तथ्य से जुड़ी है जिसकी आपने पुष्टि की है। रोहन अय्यर, आईआईटी बॉम्बे।</p>
        <Row>
          <Button variant="primary">8 तथ्यों की पुष्टि करें</Button>
          <Button>रद्द करें</Button>
          <FilterChip applied chevron>
            स्थान: बेंगलुरु
          </FilterChip>
          <SkillChip confirmed>रिएक्ट</SkillChip>
          <StatusMark status="supported">प्रमाणित</StatusMark>
        </Row>
        <Input label="पूरा नाम" defaultValue="रोहन अय्यर" helper="जैसा आपके दस्तावेज़ों में है" />
      </section>
    </div>
  );
}

export default function Kit() {
  return (
    <main id="main" className={s.page}>
      <header className={s.top}>
        <h1 className="t-d2">Design system kit</h1>
        <p className="muted">
          Every v2 primitive in every state (DESIGN.md 3). Hover, press and focus are forced with <code>data-force</code> so they show statically.
          Check at 360px and 1280px.
        </p>
      </header>
      <div className={s.themes}>
        <div data-theme="light" className={s.theme}>
          <Body theme="light" />
        </div>
        <div data-theme="night" className={s.theme}>
          <Body theme="night" />
        </div>
      </div>
    </main>
  );
}
