"""Output schemas for each LLM task (TRD §10.1). Every model reply is validated against these.

Fields the model cannot read are null (I-7). Extraction schemas deliberately have no fields for
date of birth, gender, marital status, religion or photo (CEO D15).
"""

from typing import Literal

from pydantic import BaseModel, Field

Month = str  # "YYYY-MM", or "YYYY" when only a year is written (kept for projects and education only)


class DraftFact(BaseModel):
    description: str
    tools: list[str] = []
    outcome_value: str | None = None
    outcome_unit: str | None = None
    source_verb: str | None = Field(None, description="Main verb as written, for the responsibility suggestion")
    completion: Literal["planned", "in_progress", "completed"] | None = None
    source_span: str = Field(description="Exact source text this fact came from")


class DraftExperience(BaseModel):
    employer: str | None = None
    title: str | None = None
    start: Month | None = None
    end: Month | None = None
    location: str | None = None
    stack: str | None = Field(None, description="Projects only: the tech stack exactly as written, e.g. 'Python, FastAPI, Docker'")
    facts: list[DraftFact] = []
    source_span: str


class DraftEducation(BaseModel):
    institution: str | None = None
    degree: str | None = None
    start: Month | None = None
    end: Month | None = None
    source_span: str


class DraftItem(BaseModel):
    name: str
    source_span: str


class DraftAchievement(BaseModel):
    kind: Literal["achievement", "publication"]
    text: str = Field(description="The line exactly as written")
    source_span: str


class DraftBreak(BaseModel):
    start: Month | None = None
    end: Month | None = None
    reason: str | None = Field(None, description="The reason in the resume's own words, if one is written")
    source_span: str


class ResumeExtract(BaseModel):
    experiences: list[DraftExperience] = []
    projects: list[DraftExperience] = []
    education: list[DraftEducation] = []
    skills: list[DraftItem] = []
    certifications: list[DraftItem] = []
    languages: list[DraftItem] = []
    achievements: list[DraftAchievement] = []
    career_breaks: list[DraftBreak] = []


class ProfileEnrich(BaseModel):
    facts: list[DraftFact] = []


class JobRequirementDraft(BaseModel):
    quote: str = Field(description="Verbatim text from the posting")
    category: Literal["skill", "experience", "education", "credential", "work_authorization", "other"]
    importance: Literal["required", "preferred", "unknown"]
    gate: Literal["none", "credential", "work_authorization"] = "none"
    skill_text: str | None = None


class JobEligibilityDraft(BaseModel):
    field: Literal[
        "location", "work_mode", "employment_type", "experience_years", "salary", "notice_period", "visa"
    ]
    value: str | None = Field(None, description="A short normalized value of a few words, never the whole sentence")
    quote: str | None = None


class JobExtract(BaseModel):
    title: str | None = None
    company: str | None = None
    requirements: list[JobRequirementDraft] = []
    eligibility: list[JobEligibilityDraft] = []


class TaxonomyPick(BaseModel):
    candidate_id: str | None = Field(description="One of the given candidate ids, or null for none")


class WrittenStatement(BaseModel):
    type: Literal["candidate_fact", "summary", "connective"]
    text: str
    cited_fact_version_ids: list[str] = []


class ResumeWrite(BaseModel):
    statements: list[WrittenStatement]


class StatementVerdict(BaseModel):
    statement_index: int
    supported: bool
    unsupported_claims: list[str] = []


class StatementVerify(BaseModel):
    results: list[StatementVerdict]


class RequirementMapping(BaseModel):
    requirement_id: str
    support: Literal["supported", "partial", "no_evidence_recorded"]
    cited_fact_version_ids: list[str] = []
    reason: str


class RequirementMap(BaseModel):
    results: list[RequirementMapping]
