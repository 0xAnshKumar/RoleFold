import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Status";
import { type resumeExtras, type Resume } from "@/lib/mock";
import { TEMPLATES } from "@/lib/templates";
import ResumePaper from "./ResumePaper";
import s from "./templateGallery.module.css";

/** The user's own resume, rendered in each of the six templates. Used on /resumes and in the editor. */
export default function TemplateGallery({
  resume,
  extras,
  selected,
  recommended,
  onPick,
  disabled,
  lines,
}: {
  resume: Resume;
  extras: typeof resumeExtras | null;
  selected?: string;
  recommended?: string;
  onPick: (id: string) => void;
  disabled?: boolean;
  lines?: Record<string, string>;
}) {
  return (
    <div className={s.gallery}>
      <div className={s.grid} role="radiogroup" aria-label="Resume templates">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={t.id === selected} className={s.tpl} disabled={disabled} onClick={() => onPick(t.id)}>
            <span className={s.thumb} aria-hidden>
              <span className={s.fit}>
                <ResumePaper resume={resume} template={t} lines={lines} extras={extras} />
              </span>
              {t.id === selected && (
                <span className={s.check}>
                  <Icon name="check" size={16} />
                </span>
              )}
            </span>
            <span className={s.name}>
              {t.name}
              {t.id === selected && <span className="sr-only"> (selected)</span>}
            </span>
            {t.id === recommended && <Badge className={s.rec}>Recommended for you</Badge>}
            <span className={s.for}>{t.bestFor}</span>
            <span className={s.meta}>Modelled on: {t.modelledOn}</span>
          </button>
        ))}
      </div>
      <p className={s.note}>
        Every template is single-column with standard headings and real text, so screening software reads them all the same way. Pick the one that suits your field.
      </p>
    </div>
  );
}
