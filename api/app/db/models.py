"""Beta schema (TRD §4 as amended by CEO/eng review). Closed enums are VARCHAR + CHECK constraints."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column


def enum(name: str, *values: str) -> Enum:
    return Enum(*values, name=name, native_enum=False, create_constraint=True, length=max(map(len, values)))


ENTRY_STATUS = ("draft", "confirmed", "rejected")
ORIGIN = ("import", "manual", "enrichment")
RESPONSIBILITY_LEVELS = {1: "Contributed", 2: "Owned", 3: "Led", 4: "Managed"}
CAREER_GAP_REASONS = ("caregiving", "health", "education", "relocation", "job_search", "personal", "other")
ELIGIBILITY_FIELDS = (
    "location", "work_mode", "employment_type", "experience_years_min", "experience_years_max",
    "education_level", "required_licence", "visa_sponsorship", "salary", "language", "notice_period",
    "shift_or_travel",
)
TASK_STATUS = ("queued", "running", "succeeded", "failed", "canceled", "dead")
USAGE_METRICS = ("tailored_resume", "deep_match")


def uuid_pk() -> Mapped[uuid.UUID]:
    # Python default too, so inserts never need RETURNING (hunt_app can't SELECT INSERT-only tables).
    return mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )


def created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Base(DeclarativeBase):
    def as_dict(self) -> dict:
        # Binary columns (encrypted blobs) never leave the API.
        return {
            c.key: getattr(self, c.key)
            for c in self.__table__.columns
            if not isinstance(c.type, LargeBinary)
        }


class Owned:
    """user_id NOT NULL + RLS (TRD §3). Every subclass gets ENABLE/FORCE RLS in the migration."""

    rls_column = "user_id"

    @declared_attr
    def user_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)


class Entry(Owned):
    """Profile sections with draft/confirm lifecycle and optimistic version."""

    @declared_attr
    def status(cls) -> Mapped[str]:
        return mapped_column(enum(f"{cls.__tablename__}_status", *ENTRY_STATUS), server_default="draft")

    @declared_attr
    def origin(cls) -> Mapped[str]:
        return mapped_column(enum(f"{cls.__tablename__}_origin", *ORIGIN), server_default="manual")

    @declared_attr
    def __table_args__(cls):
        return (Index(f"ix_{cls.__tablename__}_user_status", "user_id", "status"),)

    version: Mapped[int] = mapped_column(Integer, server_default="1")
    created_at: Mapped[datetime] = created()
    updated_at: Mapped[datetime] = created()


# ---------------------------------------------------------------- profile


class User(Base):
    __tablename__ = "users"
    rls_column = "id"
    id: Mapped[uuid.UUID] = uuid_pk()
    auth_subject: Mapped[str] = mapped_column(Text, unique=True)
    email: Mapped[str | None] = mapped_column(Text)
    locale: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)
    # Inserted into resumes at render time; never sent to a model (I-10).
    name: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(enum("user_plan", "free"), server_default="free")
    created_at: Mapped[datetime] = created()
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Profile(Owned, Base):
    __tablename__ = "profiles"
    __table_args__ = (UniqueConstraint("user_id"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    headline: Mapped[str | None] = mapped_column(Text)
    summary_source: Mapped[str | None] = mapped_column(Text)
    profile_version: Mapped[int] = mapped_column(Integer, server_default="0")
    updated_at: Mapped[datetime] = created()


class Experience(Entry, Base):
    __tablename__ = "experiences"
    id: Mapped[uuid.UUID] = uuid_pk()
    employer: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    start_month: Mapped[date | None] = mapped_column(Date)  # month precision: always day 1
    end_month: Mapped[date | None] = mapped_column(Date)
    location: Mapped[str | None] = mapped_column(Text)
    employment_type: Mapped[str | None] = mapped_column(Text)


class Project(Entry, Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    start_month: Mapped[date | None] = mapped_column(Date)
    end_month: Mapped[date | None] = mapped_column(Date)


class Education(Entry, Base):
    __tablename__ = "education"
    id: Mapped[uuid.UUID] = uuid_pk()
    institution: Mapped[str | None] = mapped_column(Text)
    degree: Mapped[str | None] = mapped_column(Text)
    field_of_study: Mapped[str | None] = mapped_column(Text)
    grade: Mapped[str | None] = mapped_column(Text)
    start_month: Mapped[date | None] = mapped_column(Date)
    end_month: Mapped[date | None] = mapped_column(Date)


class Certification(Entry, Base):
    __tablename__ = "certifications"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str | None] = mapped_column(Text)
    issuer: Mapped[str | None] = mapped_column(Text)
    credential_id: Mapped[str | None] = mapped_column(Text)
    issued_month: Mapped[date | None] = mapped_column(Date)
    expires_month: Mapped[date | None] = mapped_column(Date)


class Achievement(Entry, Base):
    """One resume line as the user wrote it: awards, rankings, talks, patents (kind achievement) or a
    publication. Goes on resumes only once confirmed, under the template's Achievements / Publications."""

    __tablename__ = "achievements"
    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[str] = mapped_column(enum("achievement_kind", "achievement", "publication"), server_default="achievement")
    description: Mapped[str] = mapped_column(Text)


class Language(Entry, Base):
    """A spoken language and the user's own proficiency words. Imported ones wait as drafts like other entries."""

    __tablename__ = "languages"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(Text)
    proficiency: Mapped[str | None] = mapped_column(Text)


class Fact(Entry, Base):
    """Exactly one owner entity; content lives in fact_versions (edits create versions).

    `version` is the optimistic-lock counter (any change); `current_version` points at fact_versions.version.
    """

    __tablename__ = "facts"
    id: Mapped[uuid.UUID] = uuid_pk()
    current_version: Mapped[int] = mapped_column(Integer, server_default="1")
    experience_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("experiences.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    education_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("education.id", ondelete="CASCADE"), index=True
    )

    @declared_attr
    def __table_args__(cls):
        return (
            Index("ix_facts_user_status", "user_id", "status"),
            CheckConstraint("num_nonnulls(experience_id, project_id, education_id) = 1", name="one_owner"),
        )


class FactVersion(Owned, Base):
    __tablename__ = "fact_versions"
    __table_args__ = (UniqueConstraint("fact_id", "version"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    fact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("facts.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text)
    tools: Mapped[list] = mapped_column(JSONB, server_default="[]")  # [{skill_id|null, raw}]
    responsibility_level: Mapped[int | None] = mapped_column(
        SmallInteger, CheckConstraint("responsibility_level BETWEEN 1 AND 4", name="responsibility_1_4")
    )
    outcome_value: Mapped[float | None] = mapped_column(Numeric)
    outcome_unit: Mapped[str | None] = mapped_column(Text)
    outcome_method: Mapped[str | None] = mapped_column(Text)
    completion: Mapped[str | None] = mapped_column(enum("fact_completion", "planned", "in_progress", "completed"))
    artifact_refs: Mapped[list] = mapped_column(JSONB, server_default="[]")
    source_span: Mapped[dict | None] = mapped_column(JSONB)
    change_kind: Mapped[str | None] = mapped_column(enum("fact_change_kind", "update", "correction"))  # §16.4
    content_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created()


class CareerGap(Owned, Base):
    """CEO D25. reason is excluded from matching, embeddings and analytics."""

    __tablename__ = "career_gaps"
    id: Mapped[uuid.UUID] = uuid_pk()
    start_month: Mapped[date] = mapped_column(Date)
    end_month: Mapped[date | None] = mapped_column(Date)
    reason: Mapped[str | None] = mapped_column(enum("career_gap_reason", *CAREER_GAP_REASONS))
    reason_text: Mapped[str | None] = mapped_column(Text)
    show_on_resume: Mapped[bool] = mapped_column(Boolean, server_default="false")
    version: Mapped[int] = mapped_column(Integer, server_default="1")
    created_at: Mapped[datetime] = created()


class UserSkill(Owned, Base):
    __tablename__ = "user_skills"
    id: Mapped[uuid.UUID] = uuid_pk()
    skill_id: Mapped[str | None] = mapped_column(Text)  # taxonomy id; null = unmapped raw text
    raw_label: Mapped[str] = mapped_column(Text)
    proficiency: Mapped[str | None] = mapped_column(Text)
    evidence_fact_ids: Mapped[list] = mapped_column(JSONB, server_default="[]")
    self_declared: Mapped[bool] = mapped_column(Boolean, server_default="false")  # CEO D18
    created_at: Mapped[datetime] = created()


class SkillAssertion(Owned, Base):
    __tablename__ = "skill_assertions"
    id: Mapped[uuid.UUID] = uuid_pk()
    skill_id: Mapped[str | None] = mapped_column(Text)
    requirement_text: Mapped[str | None] = mapped_column(Text)
    assertion: Mapped[str] = mapped_column(enum("skill_assertion", "has", "does_not_have"))
    created_at: Mapped[datetime] = created()
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PreferenceVersion(Owned, Base):
    __tablename__ = "preference_versions"
    __table_args__ = (UniqueConstraint("user_id", "version"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    version: Mapped[int] = mapped_column(Integer)
    locations: Mapped[list] = mapped_column(JSONB, server_default="[]")  # [{place_id, radius_km}]
    work_modes: Mapped[list] = mapped_column(JSONB, server_default="[]")
    employment_types: Mapped[list] = mapped_column(JSONB, server_default="[]")
    seniority_range: Mapped[dict | None] = mapped_column(JSONB)
    salary_range: Mapped[dict | None] = mapped_column(JSONB)  # {min, max, currency, period}
    notice_period_days: Mapped[int | None] = mapped_column(Integer)
    relocation: Mapped[bool | None] = mapped_column(Boolean)
    visa_needs: Mapped[list] = mapped_column(JSONB, server_default="[]")
    raw: Mapped[dict | None] = mapped_column(JSONB)  # the PUT /v1/preferences body as sent
    effective_at: Mapped[datetime] = created()


class CareerGoal(Owned, Base):
    __tablename__ = "career_goals"
    __table_args__ = (UniqueConstraint("user_id", "version"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    version: Mapped[int] = mapped_column(Integer)
    target_occupations: Mapped[list] = mapped_column(JSONB, server_default="[]")
    industries: Mapped[list] = mapped_column(JSONB, server_default="[]")
    direction_text: Mapped[str | None] = mapped_column(Text)
    raw: Mapped[dict | None] = mapped_column(JSONB)  # the PUT /v1/goals body as sent (seniority lives here)
    created_at: Mapped[datetime] = created()


class Import(Owned, Base):
    __tablename__ = "imports"
    id: Mapped[uuid.UUID] = uuid_pk()
    source_file_key: Mapped[str] = mapped_column(Text)
    filename: Mapped[str] = mapped_column(Text)
    format: Mapped[str] = mapped_column(enum("import_format", "pdf", "docx", "txt", "md", "linkedin_csv"))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    parser_version: Mapped[str | None] = mapped_column(Text)
    model_version: Mapped[str | None] = mapped_column(Text)
    created_entries: Mapped[list] = mapped_column(JSONB, server_default="[]")
    # Encrypted redaction placeholder map (CEO D12); written by the import pipeline.
    placeholder_map_enc: Mapped[bytes | None] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = created()


class EnrichmentQuestion(Owned, Base):
    __tablename__ = "enrichment_questions"
    __table_args__ = (Index("ix_enrichment_questions_user_state", "user_id", "state"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    question: Mapped[str] = mapped_column(Text)
    target_type: Mapped[str | None] = mapped_column(Text)
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    priority: Mapped[float] = mapped_column(Numeric, server_default="0")
    state: Mapped[str] = mapped_column(enum("enrichment_state", "open", "answered", "skipped"), server_default="open")
    answer_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created()


# ---------------------------------------------------------------- jobs (pasted only at beta)


class JobOwned:
    """Job tables: owner_user_id NOT NULL at beta (no catalog, CEO R1)."""

    rls_column = "owner_user_id"

    @declared_attr
    def owner_user_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)


def job_version_fk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), ForeignKey("job_versions.id", ondelete="CASCADE"), index=True)


class Job(JobOwned, Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("uq_jobs_catalog_job", "owner_user_id", "catalog_job_id", unique=True,
                            postgresql_where=text("catalog_job_id IS NOT NULL")),)
    id: Mapped[uuid.UUID] = uuid_pk()
    company: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    apply_url: Mapped[str | None] = mapped_column(Text)
    lifecycle: Mapped[str] = mapped_column(
        enum("job_lifecycle", "active", "expired", "removed", "unknown"), server_default="unknown"
    )
    scam_state: Mapped[str] = mapped_column(
        enum("job_scam_state", "none", "suspected", "confirmed", "cleared"), server_default="none"
    )
    report_count: Mapped[int] = mapped_column(Integer, server_default="0")
    # This user's copy of a catalog job, made when they open its full check (0007, app/routes/feed.py).
    catalog_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("catalog_jobs.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = created()


class JobVersion(JobOwned, Base):
    __tablename__ = "job_versions"
    __table_args__ = (UniqueConstraint("job_id", "version"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    raw_text: Mapped[str] = mapped_column(Text)
    description_hash: Mapped[str] = mapped_column(Text)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observed_at: Mapped[datetime] = created()


class JobRequirement(JobOwned, Base):
    __tablename__ = "job_requirements"
    id: Mapped[uuid.UUID] = uuid_pk()
    job_version_id: Mapped[uuid.UUID] = job_version_fk()
    requirement_key: Mapped[str] = mapped_column(Text)
    value: Mapped[str | None] = mapped_column(Text)  # normalized text (e.g. "GraphQL"); sent to models, never the quote
    quote: Mapped[str | None] = mapped_column(Text)
    quote_start: Mapped[int | None] = mapped_column(Integer)
    quote_end: Mapped[int | None] = mapped_column(Integer)
    category: Mapped[str | None] = mapped_column(Text)
    importance: Mapped[str] = mapped_column(enum("requirement_importance", "required", "preferred", "unknown"))
    gate: Mapped[str] = mapped_column(
        enum("requirement_gate", "none", "credential", "work_authorization"), server_default="none"
    )
    skill_id: Mapped[str | None] = mapped_column(Text)
    occupation_id: Mapped[str | None] = mapped_column(Text)
    extraction_version: Mapped[str | None] = mapped_column(Text)


class JobEligibility(JobOwned, Base):
    __tablename__ = "job_eligibility"
    id: Mapped[uuid.UUID] = uuid_pk()
    job_version_id: Mapped[uuid.UUID] = job_version_fk()
    field: Mapped[str] = mapped_column(enum("eligibility_field", *ELIGIBILITY_FIELDS))
    value: Mapped[dict | None] = mapped_column(JSONB)  # null = unknown (I-7)
    quote: Mapped[str | None] = mapped_column(Text)


class MatchAnalysis(Owned, Base):
    __tablename__ = "match_analyses"
    # F1: one mapping per (user, job_version, evidence pack); no fingerprint (A3).
    __table_args__ = (UniqueConstraint("user_id", "job_version_id", "evidence_pack_hash"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    job_version_id: Mapped[uuid.UUID] = job_version_fk()
    evidence_pack_hash: Mapped[str] = mapped_column(Text)
    evidence_fact_version_ids: Mapped[list] = mapped_column(JSONB, server_default="[]")
    eligibility_results: Mapped[list] = mapped_column(JSONB, server_default="[]")
    requirement_results: Mapped[list] = mapped_column(JSONB, server_default="[]")
    goal_fit: Mapped[str | None] = mapped_column(
        enum("match_goal_fit", "aligned", "partly", "not_aligned", "unknown")
    )
    verdict: Mapped[str | None] = mapped_column(
        enum(
            "match_verdict",
            "strong_fit", "good_fit_with_gaps", "stretch", "poor_fit", "not_eligible", "insufficient_detail",
        )
    )
    open_questions: Mapped[list] = mapped_column(JSONB, server_default="[]")
    model_version: Mapped[str | None] = mapped_column(Text)
    prompt_version: Mapped[str | None] = mapped_column(Text)
    basis: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = created()


class JobFeedback(Owned, Base):
    __tablename__ = "job_feedback"
    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"))
    match_analysis_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("match_analyses.id", ondelete="SET NULL")
    )
    # assessment_right/assessment_wrong = match-page thumbs (CEO D26).
    action: Mapped[str] = mapped_column(
        enum(
            "job_feedback_action",
            "save", "dismiss", "applied", "not_interested", "assessment_right", "assessment_wrong",
        )
    )
    reason_code: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created()


# ---------------------------------------------------------------- resumes


class Resume(Owned, Base):
    __tablename__ = "resumes"
    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[str] = mapped_column(enum("resume_kind", "master", "tailored"))
    target_occupation_id: Mapped[str | None] = mapped_column(Text)
    target_job_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_versions.id", ondelete="SET NULL")
    )
    template_id: Mapped[str] = mapped_column(Text)
    parent_resume_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = created()


class ResumeDraft(Owned, Base):
    """Mutable working draft per resume (CEO D16); snapshotted into resume_versions."""

    __tablename__ = "resume_drafts"
    id: Mapped[uuid.UUID] = uuid_pk()
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), unique=True
    )
    profile_version: Mapped[int] = mapped_column(Integer)
    statements: Mapped[list] = mapped_column(JSONB, server_default="[]")
    layout_options: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    version: Mapped[int] = mapped_column(Integer, server_default="1")
    updated_at: Mapped[datetime] = created()


class ResumeVersion(Owned, Base):
    """Immutable: hunt_app has no UPDATE grant on this table."""

    __tablename__ = "resume_versions"
    __table_args__ = (UniqueConstraint("resume_id", "version"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    resume_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"))
    version: Mapped[int] = mapped_column(Integer)
    profile_version: Mapped[int] = mapped_column(Integer)
    selected_fact_version_ids: Mapped[list] = mapped_column(JSONB, server_default="[]")
    statements: Mapped[list] = mapped_column(JSONB, server_default="[]")
    layout_options: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    check_summary: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    basis: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = created()


class ResumeExport(Owned, Base):
    __tablename__ = "resume_exports"
    id: Mapped[uuid.UUID] = uuid_pk()
    resume_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resume_versions.id", ondelete="CASCADE"), index=True
    )
    format: Mapped[str] = mapped_column(enum("export_format", "pdf", "docx", "txt"))
    object_key: Mapped[str] = mapped_column(Text)
    parse_safety: Mapped[dict | None] = mapped_column(JSONB)
    basis: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = created()


# ---------------------------------------------------------------- share links (0006)


class ShareLink(Owned, Base):
    """Read-only web resume behind an unguessable link (PRD §7). Only the token's SHA-256 is stored. The row is
    the consent record (what the user agreed to, and when) and stays after revocation. Public lookup: migration 0006."""

    __tablename__ = "share_links"
    id: Mapped[uuid.UUID] = uuid_pk()
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(Text, unique=True)
    show_contact: Mapped[list] = mapped_column(JSONB, server_default="[]")  # subset of email, phone, location
    consent_text: Mapped[str] = mapped_column(Text)
    consented_at: Mapped[datetime] = created()
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- catalog, feed and alerts (0007)


class CatalogJob(Base):
    """Global (not user-owned): jobs ingested from enabled sources, shared by every user (TRD §8).
    hunt_app may only read; the worker writes. A duplicate points at its canonical job and leaves the feed."""

    __tablename__ = "catalog_jobs"
    __table_args__ = (
        UniqueConstraint("source", "external_id"),
        Index("ix_catalog_jobs_feed", "first_seen_at", postgresql_where=text(
            "lifecycle = 'active' AND duplicate_of IS NULL AND scam_state IN ('none', 'cleared')")),
        Index("ix_catalog_jobs_identity", "company_key", "title_key"),
        Index("ix_catalog_jobs_apply_url_key", "apply_url_key"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    source: Mapped[str] = mapped_column(Text)
    external_id: Mapped[str] = mapped_column(Text)
    company: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    company_key: Mapped[str] = mapped_column(Text, server_default="")
    title_key: Mapped[str] = mapped_column(Text, server_default="")
    location: Mapped[str | None] = mapped_column(Text)
    remote: Mapped[bool | None] = mapped_column(Boolean)
    employment_type: Mapped[str | None] = mapped_column(Text)
    apply_url: Mapped[str | None] = mapped_column(Text)
    apply_url_key: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)  # cleaned plain text
    description_hash: Mapped[str] = mapped_column(Text)
    cleaning_notes: Mapped[list] = mapped_column(JSONB, server_default="[]")  # what clean() stripped
    version: Mapped[int] = mapped_column(Integer, server_default="1")  # +1 when description_hash changes
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_seen_at: Mapped[datetime] = created()
    last_seen_at: Mapped[datetime] = created()
    # First complete run that didn't list it; reset when seen again. Expires after JOB_EXPIRE_GRACE_DAYS.
    absent_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lifecycle: Mapped[str] = mapped_column(enum("catalog_job_lifecycle", "active", "expired"), server_default="active")
    duplicate_of: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("catalog_jobs.id", ondelete="SET NULL")
    )
    scam_state: Mapped[str] = mapped_column(
        enum("catalog_scam_state", "none", "suspected", "confirmed", "cleared"), server_default="none"
    )
    scam_reasons: Mapped[list] = mapped_column(JSONB, server_default="[]")


class CatalogSourceRun(Base):
    """Global: one row per fetch (TRD §8.3 source health). Only complete runs count toward expiry."""

    __tablename__ = "catalog_source_runs"
    __table_args__ = (Index("ix_catalog_source_runs_source", "source", "started_at"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    source: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(enum("catalog_run_status", "complete", "partial", "failed"))
    job_count: Mapped[int] = mapped_column(Integer, server_default="0")
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = created()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CatalogFeedback(Owned, Base):
    """Feed card feedback (PRD §6.2, TRD §9.6). The latest row per job is its state; `clear` undoes."""

    __tablename__ = "catalog_feedback"
    __table_args__ = (Index("ix_catalog_feedback_user_job", "user_id", "catalog_job_id", "created_at"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    catalog_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("catalog_jobs.id", ondelete="CASCADE")
    )
    action: Mapped[str] = mapped_column(enum("catalog_feedback_action", "save", "dismiss", "clear"))
    reason_code: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created()


class FeedSettings(Owned, Base):
    """Alert frequency and the learned-signal reset point. The worker may read every row (to find who is due)."""

    __tablename__ = "feed_settings"
    __table_args__ = (UniqueConstraint("user_id"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    alert_frequency: Mapped[str] = mapped_column(enum("alert_frequency", "off", "weekly", "daily"), server_default="off")
    last_alert_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signals_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = created()


# ---------------------------------------------------------------- taxonomy curation (0008)


class SkillAlias(Base):
    """Global curator decisions for unmapped skill terms (TRD §6): approved = alias of skill_id, rejected = not a
    skill. Keyed by the normalized term (app/routes/admin.py `norm`). hunt_app/hunt_worker read, hunt_admin writes."""

    __tablename__ = "skill_aliases"
    __table_args__ = (CheckConstraint("(status = 'approved') = (skill_id IS NOT NULL)", name="approved_has_skill"),)
    alias_norm: Mapped[str] = mapped_column(Text, primary_key=True)
    alias: Mapped[str] = mapped_column(Text)
    skill_id: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(enum("skill_alias_status", "approved", "rejected"))
    source: Mapped[str] = mapped_column(Text, server_default="curator")
    created_at: Mapped[datetime] = created()
    updated_at: Mapped[datetime] = created()


# ---------------------------------------------------------------- system


class UsageCounter(Owned, Base):
    __tablename__ = "usage_counters"
    __table_args__ = (
        UniqueConstraint("user_id", "metric", "period"),
        CheckConstraint("used >= 0 AND reserved >= 0", name="non_negative"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    metric: Mapped[str] = mapped_column(enum("usage_metric", *USAGE_METRICS))
    period: Mapped[str] = mapped_column(Text)  # 'YYYY-MM' (UTC)
    used: Mapped[int] = mapped_column(Integer, server_default="0")
    reserved: Mapped[int] = mapped_column(Integer, server_default="0")


class UsageReservation(Owned, Base):
    """One row per reservation so it can be settled once and expire after 1 h (TRD §11.1)."""

    __tablename__ = "usage_reservations"
    __table_args__ = (
        # First deep match per (user, job_version) counts once (CEO D19).
        Index(
            "uq_usage_reservations_subject", "user_id", "metric", "subject",
            unique=True, postgresql_where=text("state <> 'released'"),
        ),
        Index("ix_usage_reservations_open", "user_id", "created_at", postgresql_where=text("state = 'reserved'")),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    metric: Mapped[str] = mapped_column(enum("usage_reservation_metric", *USAGE_METRICS))
    period: Mapped[str] = mapped_column(Text)
    subject: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str] = mapped_column(
        enum("usage_reservation_state", "reserved", "converted", "released"), server_default="reserved"
    )
    created_at: Mapped[datetime] = created()


class Task(Base):
    """Postgres task queue (TRD §11.1). user_id has no FK: a deletion task outlives its user row."""

    __tablename__ = "tasks"
    rls_column = "user_id"
    __table_args__ = (
        Index("ix_tasks_claimable", "run_after", postgresql_where=text("status = 'queued'")),
        Index("ix_tasks_leased", "lease_until", postgresql_where=text("status = 'running'")),
        Index("ix_tasks_user_status", "user_id", "status"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    type: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(enum("task_status", *TASK_STATUS), server_default="queued")
    payload: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    idempotency_key: Mapped[str] = mapped_column(Text, unique=True)
    attempts: Mapped[int] = mapped_column(Integer, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer)
    run_after: Mapped[datetime] = created()
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[dict | None] = mapped_column(JSONB)
    error_code: Mapped[str | None] = mapped_column(Text)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created()
    updated_at: Mapped[datetime] = created()


class IdempotencyKey(Owned, Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("user_id", "key"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    key: Mapped[str] = mapped_column(Text)
    route: Mapped[str] = mapped_column(Text)
    request_hash: Mapped[str] = mapped_column(Text)
    status_code: Mapped[int | None] = mapped_column(Integer)
    response: Mapped[dict | None] = mapped_column(JSONB)  # null while the first request is in flight
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DeletionRequest(Base):
    """Tombstone list (TRD §12.4). user_id is cleared on completion; only the salted user_hash remains."""

    __tablename__ = "deletion_requests"
    rls_column = "user_id"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    user_hash: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = created()
    stages_completed: Mapped[list] = mapped_column(JSONB, server_default="[]")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    """System table (no RLS): hunt_app may only INSERT. actor_id is replaced by actor_hash on deletion."""

    __tablename__ = "audit_log"
    __table_args__ = ({"implicit_returning": False},)
    id: Mapped[uuid.UUID] = uuid_pk()
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    actor_hash: Mapped[str | None] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    target: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created()


class LlmCall(Base):
    """System table (no RLS): hunt_app may only INSERT. user_id is replaced by user_hash on deletion."""

    __tablename__ = "llm_calls"
    __table_args__ = ({"implicit_returning": False},)
    id: Mapped[uuid.UUID] = uuid_pk()
    trace_id: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    user_hash: Mapped[str | None] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    prompt_version: Mapped[str | None] = mapped_column(Text)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    cost: Mapped[float | None] = mapped_column(Numeric)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    cache_hit: Mapped[bool] = mapped_column(Boolean, server_default="false")
    error_class: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created()


# Tables under RLS: (table, owner column). Worker gets extra all-rows policies on WORKER_TABLES.
RLS_TABLES = {
    mp.class_.__tablename__: mp.class_.rls_column for mp in Base.registry.mappers if hasattr(mp.class_, "rls_column")
}
WORKER_TABLES = ("tasks", "deletion_requests")
SYSTEM_TABLES = ("audit_log", "llm_calls", "skill_aliases")  # no RLS: not user-owned
# Global job catalog (0007): no owner, so no RLS; hunt_app reads, hunt_worker writes.
CATALOG_TABLES = ("catalog_jobs", "catalog_source_runs")
