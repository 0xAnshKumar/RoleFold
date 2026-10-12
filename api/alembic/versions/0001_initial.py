"""initial beta schema, hardened RLS (eng E1), grants

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None

# Frozen DDL (generated from app/db/models.py at this revision; later changes need new migrations).
SCHEMA = """
CREATE TABLE audit_log (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	actor_id UUID,
	actor_hash TEXT,
	action TEXT NOT NULL,
	target TEXT,
	reason TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id)
);

CREATE INDEX ix_audit_log_actor_id ON audit_log (actor_id);

CREATE TABLE deletion_requests (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	user_id UUID NOT NULL,
	requested_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	stages_completed JSONB DEFAULT '[]' NOT NULL,
	completed_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id)
);

CREATE INDEX ix_deletion_requests_user_id ON deletion_requests (user_id);

CREATE TABLE llm_calls (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	trace_id TEXT,
	user_id UUID,
	user_hash TEXT,
	purpose TEXT NOT NULL,
	model TEXT NOT NULL,
	prompt_version TEXT,
	tokens_in INTEGER,
	tokens_out INTEGER,
	cost NUMERIC,
	latency_ms INTEGER,
	cache_hit BOOLEAN DEFAULT 'false' NOT NULL,
	error_class TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id)
);

CREATE INDEX ix_llm_calls_user_id ON llm_calls (user_id);

CREATE TABLE tasks (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	user_id UUID,
	type TEXT NOT NULL,
	status VARCHAR(9) DEFAULT 'queued' NOT NULL,
	payload JSONB DEFAULT '{}' NOT NULL,
	idempotency_key TEXT NOT NULL,
	attempts INTEGER DEFAULT '0' NOT NULL,
	max_attempts INTEGER NOT NULL,
	run_after TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	lease_until TIMESTAMP WITH TIME ZONE,
	result JSONB,
	error_code TEXT,
	error_message TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT task_status CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'dead')),
	UNIQUE (idempotency_key)
);

CREATE INDEX ix_tasks_claimable ON tasks (run_after) WHERE status = 'queued';

CREATE INDEX ix_tasks_leased ON tasks (lease_until) WHERE status = 'running';

CREATE INDEX ix_tasks_user_status ON tasks (user_id, status);

CREATE TABLE users (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	auth_subject TEXT NOT NULL,
	email TEXT,
	locale TEXT,
	country TEXT,
	plan VARCHAR(4) DEFAULT 'free' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	deleted_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	UNIQUE (auth_subject),
	CONSTRAINT user_plan CHECK (plan IN ('free'))
);

CREATE TABLE career_gaps (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	start_month DATE NOT NULL,
	end_month DATE,
	reason VARCHAR(10),
	reason_text TEXT,
	show_on_resume BOOLEAN DEFAULT 'false' NOT NULL,
	version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT career_gap_reason CHECK (reason IN ('caregiving', 'health', 'education', 'relocation', 'job_search', 'personal', 'other')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_career_gaps_user_id ON career_gaps (user_id);

CREATE TABLE career_goals (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	version INTEGER NOT NULL,
	target_occupations JSONB DEFAULT '[]' NOT NULL,
	industries JSONB DEFAULT '[]' NOT NULL,
	direction_text TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id, version),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_career_goals_user_id ON career_goals (user_id);

CREATE TABLE certifications (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	name TEXT,
	issuer TEXT,
	credential_id TEXT,
	issued_month DATE,
	expires_month DATE,
	version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	status VARCHAR(9) DEFAULT 'draft' NOT NULL,
	origin VARCHAR(10) DEFAULT 'manual' NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT certifications_status CHECK (status IN ('draft', 'confirmed', 'rejected')),
	CONSTRAINT certifications_origin CHECK (origin IN ('import', 'manual', 'enrichment')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_certifications_user_id ON certifications (user_id);

CREATE INDEX ix_certifications_user_status ON certifications (user_id, status);

CREATE TABLE education (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	institution TEXT,
	degree TEXT,
	field_of_study TEXT,
	grade TEXT,
	start_month DATE,
	end_month DATE,
	version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	status VARCHAR(9) DEFAULT 'draft' NOT NULL,
	origin VARCHAR(10) DEFAULT 'manual' NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT education_status CHECK (status IN ('draft', 'confirmed', 'rejected')),
	CONSTRAINT education_origin CHECK (origin IN ('import', 'manual', 'enrichment')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_education_user_id ON education (user_id);

CREATE INDEX ix_education_user_status ON education (user_id, status);

CREATE TABLE enrichment_questions (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	question TEXT NOT NULL,
	target_type TEXT,
	target_id UUID,
	priority NUMERIC DEFAULT '0' NOT NULL,
	state VARCHAR(8) DEFAULT 'open' NOT NULL,
	answer_text TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT enrichment_state CHECK (state IN ('open', 'answered', 'skipped')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_enrichment_questions_user_id ON enrichment_questions (user_id);

CREATE INDEX ix_enrichment_questions_user_state ON enrichment_questions (user_id, state);

CREATE TABLE experiences (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	employer TEXT,
	title TEXT,
	start_month DATE,
	end_month DATE,
	location TEXT,
	employment_type TEXT,
	version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	status VARCHAR(9) DEFAULT 'draft' NOT NULL,
	origin VARCHAR(10) DEFAULT 'manual' NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT experiences_status CHECK (status IN ('draft', 'confirmed', 'rejected')),
	CONSTRAINT experiences_origin CHECK (origin IN ('import', 'manual', 'enrichment')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_experiences_user_id ON experiences (user_id);

CREATE INDEX ix_experiences_user_status ON experiences (user_id, status);

CREATE TABLE idempotency_keys (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	key TEXT NOT NULL,
	route TEXT NOT NULL,
	request_hash TEXT NOT NULL,
	status_code INTEGER,
	response JSONB,
	expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id, key),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_idempotency_keys_user_id ON idempotency_keys (user_id);

CREATE TABLE imports (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	source_file_key TEXT NOT NULL,
	filename TEXT NOT NULL,
	format VARCHAR(12) NOT NULL,
	size_bytes BIGINT NOT NULL,
	parser_version TEXT,
	model_version TEXT,
	created_entries JSONB DEFAULT '[]' NOT NULL,
	placeholder_map_enc BYTEA,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT import_format CHECK (format IN ('pdf', 'docx', 'txt', 'md', 'linkedin_csv')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_imports_user_id ON imports (user_id);

CREATE TABLE jobs (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	company TEXT,
	title TEXT,
	apply_url TEXT,
	lifecycle VARCHAR(7) DEFAULT 'unknown' NOT NULL,
	scam_state VARCHAR(9) DEFAULT 'none' NOT NULL,
	report_count INTEGER DEFAULT '0' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	owner_user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT job_lifecycle CHECK (lifecycle IN ('active', 'expired', 'removed', 'unknown')),
	CONSTRAINT job_scam_state CHECK (scam_state IN ('none', 'suspected', 'confirmed', 'cleared')),
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_jobs_owner_user_id ON jobs (owner_user_id);

CREATE TABLE preference_versions (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	version INTEGER NOT NULL,
	locations JSONB DEFAULT '[]' NOT NULL,
	work_modes JSONB DEFAULT '[]' NOT NULL,
	employment_types JSONB DEFAULT '[]' NOT NULL,
	seniority_range JSONB,
	salary_range JSONB,
	notice_period_days INTEGER,
	relocation BOOLEAN,
	visa_needs JSONB DEFAULT '[]' NOT NULL,
	effective_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id, version),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_preference_versions_user_id ON preference_versions (user_id);

CREATE TABLE profiles (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	headline TEXT,
	summary_source TEXT,
	profile_version INTEGER DEFAULT '0' NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_profiles_user_id ON profiles (user_id);

CREATE TABLE projects (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	name TEXT,
	description TEXT,
	url TEXT,
	start_month DATE,
	end_month DATE,
	version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	status VARCHAR(9) DEFAULT 'draft' NOT NULL,
	origin VARCHAR(10) DEFAULT 'manual' NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT projects_status CHECK (status IN ('draft', 'confirmed', 'rejected')),
	CONSTRAINT projects_origin CHECK (origin IN ('import', 'manual', 'enrichment')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_projects_user_id ON projects (user_id);

CREATE INDEX ix_projects_user_status ON projects (user_id, status);

CREATE TABLE skill_assertions (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	skill_id TEXT,
	requirement_text TEXT,
	assertion VARCHAR(13) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	withdrawn_at TIMESTAMP WITH TIME ZONE,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT skill_assertion CHECK (assertion IN ('has', 'does_not_have')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_skill_assertions_user_id ON skill_assertions (user_id);

CREATE TABLE usage_counters (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	metric VARCHAR(15) NOT NULL,
	period TEXT NOT NULL,
	used INTEGER DEFAULT '0' NOT NULL,
	reserved INTEGER DEFAULT '0' NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id, metric, period),
	CONSTRAINT non_negative CHECK (used >= 0 AND reserved >= 0),
	CONSTRAINT usage_metric CHECK (metric IN ('tailored_resume', 'deep_match')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_usage_counters_user_id ON usage_counters (user_id);

CREATE TABLE usage_reservations (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	metric VARCHAR(15) NOT NULL,
	period TEXT NOT NULL,
	subject TEXT,
	state VARCHAR(9) DEFAULT 'reserved' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT usage_reservation_metric CHECK (metric IN ('tailored_resume', 'deep_match')),
	CONSTRAINT usage_reservation_state CHECK (state IN ('reserved', 'converted', 'released')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_usage_reservations_open ON usage_reservations (user_id, created_at) WHERE state = 'reserved';

CREATE INDEX ix_usage_reservations_user_id ON usage_reservations (user_id);

CREATE UNIQUE INDEX uq_usage_reservations_subject ON usage_reservations (user_id, metric, subject) WHERE state <> 'released';

CREATE TABLE user_skills (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	skill_id TEXT,
	raw_label TEXT NOT NULL,
	proficiency TEXT,
	evidence_fact_ids JSONB DEFAULT '[]' NOT NULL,
	self_declared BOOLEAN DEFAULT 'false' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_user_skills_user_id ON user_skills (user_id);

CREATE TABLE facts (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	current_version INTEGER DEFAULT '1' NOT NULL,
	experience_id UUID,
	project_id UUID,
	education_id UUID,
	version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	status VARCHAR(9) DEFAULT 'draft' NOT NULL,
	origin VARCHAR(10) DEFAULT 'manual' NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT one_owner CHECK (num_nonnulls(experience_id, project_id, education_id) = 1),
	FOREIGN KEY(experience_id) REFERENCES experiences (id) ON DELETE CASCADE,
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE,
	FOREIGN KEY(education_id) REFERENCES education (id) ON DELETE CASCADE,
	CONSTRAINT facts_status CHECK (status IN ('draft', 'confirmed', 'rejected')),
	CONSTRAINT facts_origin CHECK (origin IN ('import', 'manual', 'enrichment')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_facts_education_id ON facts (education_id);

CREATE INDEX ix_facts_experience_id ON facts (experience_id);

CREATE INDEX ix_facts_project_id ON facts (project_id);

CREATE INDEX ix_facts_user_id ON facts (user_id);

CREATE INDEX ix_facts_user_status ON facts (user_id, status);

CREATE TABLE job_versions (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	job_id UUID NOT NULL,
	version INTEGER NOT NULL,
	raw_text TEXT NOT NULL,
	description_hash TEXT NOT NULL,
	posted_at TIMESTAMP WITH TIME ZONE,
	observed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	owner_user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (job_id, version),
	FOREIGN KEY(job_id) REFERENCES jobs (id) ON DELETE CASCADE,
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_job_versions_owner_user_id ON job_versions (owner_user_id);

CREATE TABLE fact_versions (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	fact_id UUID NOT NULL,
	version INTEGER NOT NULL,
	description TEXT NOT NULL,
	tools JSONB DEFAULT '[]' NOT NULL,
	responsibility_level SMALLINT CONSTRAINT responsibility_1_4 CHECK (responsibility_level BETWEEN 1 AND 4),
	outcome_value NUMERIC,
	outcome_unit TEXT,
	outcome_method TEXT,
	completion VARCHAR(11),
	artifact_refs JSONB DEFAULT '[]' NOT NULL,
	source_span JSONB,
	change_kind VARCHAR(10),
	content_hash TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (fact_id, version),
	FOREIGN KEY(fact_id) REFERENCES facts (id) ON DELETE CASCADE,
	CONSTRAINT fact_completion CHECK (completion IN ('planned', 'in_progress', 'completed')),
	CONSTRAINT fact_change_kind CHECK (change_kind IN ('update', 'correction')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_fact_versions_user_id ON fact_versions (user_id);

CREATE TABLE job_eligibility (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	job_version_id UUID NOT NULL,
	field VARCHAR(20) NOT NULL,
	value JSONB,
	quote TEXT,
	owner_user_id UUID NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(job_version_id) REFERENCES job_versions (id) ON DELETE CASCADE,
	CONSTRAINT eligibility_field CHECK (field IN ('location', 'work_mode', 'employment_type', 'experience_years_min', 'experience_years_max', 'education_level', 'required_licence', 'visa_sponsorship', 'salary', 'language', 'notice_period', 'shift_or_travel')),
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_job_eligibility_job_version_id ON job_eligibility (job_version_id);

CREATE INDEX ix_job_eligibility_owner_user_id ON job_eligibility (owner_user_id);

CREATE TABLE job_requirements (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	job_version_id UUID NOT NULL,
	requirement_key TEXT NOT NULL,
	quote TEXT,
	quote_start INTEGER,
	quote_end INTEGER,
	category TEXT,
	importance VARCHAR(9) NOT NULL,
	gate VARCHAR(18) DEFAULT 'none' NOT NULL,
	skill_id TEXT,
	occupation_id TEXT,
	extraction_version TEXT,
	owner_user_id UUID NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(job_version_id) REFERENCES job_versions (id) ON DELETE CASCADE,
	CONSTRAINT requirement_importance CHECK (importance IN ('required', 'preferred', 'unknown')),
	CONSTRAINT requirement_gate CHECK (gate IN ('none', 'credential', 'work_authorization')),
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_job_requirements_job_version_id ON job_requirements (job_version_id);

CREATE INDEX ix_job_requirements_owner_user_id ON job_requirements (owner_user_id);

CREATE TABLE match_analyses (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	job_version_id UUID NOT NULL,
	evidence_pack_hash TEXT NOT NULL,
	evidence_fact_version_ids JSONB DEFAULT '[]' NOT NULL,
	eligibility_results JSONB DEFAULT '[]' NOT NULL,
	requirement_results JSONB DEFAULT '[]' NOT NULL,
	goal_fit VARCHAR(11),
	verdict VARCHAR(19),
	open_questions JSONB DEFAULT '[]' NOT NULL,
	model_version TEXT,
	prompt_version TEXT,
	basis JSONB NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id, job_version_id, evidence_pack_hash),
	FOREIGN KEY(job_version_id) REFERENCES job_versions (id) ON DELETE CASCADE,
	CONSTRAINT match_goal_fit CHECK (goal_fit IN ('aligned', 'partly', 'not_aligned', 'unknown')),
	CONSTRAINT match_verdict CHECK (verdict IN ('strong_fit', 'good_fit_with_gaps', 'stretch', 'poor_fit', 'not_eligible', 'insufficient_detail')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_match_analyses_job_version_id ON match_analyses (job_version_id);

CREATE INDEX ix_match_analyses_user_id ON match_analyses (user_id);

CREATE TABLE resumes (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	kind VARCHAR(8) NOT NULL,
	target_occupation_id TEXT,
	target_job_version_id UUID,
	template_id TEXT NOT NULL,
	parent_resume_id UUID,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT resume_kind CHECK (kind IN ('master', 'tailored')),
	FOREIGN KEY(target_job_version_id) REFERENCES job_versions (id) ON DELETE SET NULL,
	FOREIGN KEY(parent_resume_id) REFERENCES resumes (id) ON DELETE SET NULL,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_resumes_user_id ON resumes (user_id);

CREATE TABLE job_feedback (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	job_id UUID NOT NULL,
	match_analysis_id UUID,
	action VARCHAR(16) NOT NULL,
	reason_code TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(job_id) REFERENCES jobs (id) ON DELETE CASCADE,
	FOREIGN KEY(match_analysis_id) REFERENCES match_analyses (id) ON DELETE SET NULL,
	CONSTRAINT job_feedback_action CHECK (action IN ('save', 'dismiss', 'applied', 'not_interested', 'assessment_right', 'assessment_wrong')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_job_feedback_user_id ON job_feedback (user_id);

CREATE TABLE resume_drafts (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	resume_id UUID NOT NULL,
	profile_version INTEGER NOT NULL,
	statements JSONB DEFAULT '[]' NOT NULL,
	layout_options JSONB DEFAULT '{}' NOT NULL,
	version INTEGER DEFAULT '1' NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (resume_id),
	FOREIGN KEY(resume_id) REFERENCES resumes (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_resume_drafts_user_id ON resume_drafts (user_id);

CREATE TABLE resume_versions (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	resume_id UUID NOT NULL,
	version INTEGER NOT NULL,
	profile_version INTEGER NOT NULL,
	selected_fact_version_ids JSONB DEFAULT '[]' NOT NULL,
	statements JSONB DEFAULT '[]' NOT NULL,
	layout_options JSONB DEFAULT '{}' NOT NULL,
	check_summary JSONB DEFAULT '{}' NOT NULL,
	basis JSONB NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (resume_id, version),
	FOREIGN KEY(resume_id) REFERENCES resumes (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_resume_versions_user_id ON resume_versions (user_id);

CREATE TABLE resume_exports (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	resume_version_id UUID NOT NULL,
	format VARCHAR(4) NOT NULL,
	object_key TEXT NOT NULL,
	parse_safety JSONB,
	basis JSONB NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(resume_version_id) REFERENCES resume_versions (id) ON DELETE CASCADE,
	CONSTRAINT export_format CHECK (format IN ('pdf', 'docx', 'txt')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_resume_exports_resume_version_id ON resume_exports (resume_version_id);

CREATE INDEX ix_resume_exports_user_id ON resume_exports (user_id);
"""

# table -> owner column. Every table here gets ENABLE + FORCE RLS with split policies.
RLS_TABLES = {
    'career_gaps': 'user_id',
    'career_goals': 'user_id',
    'certifications': 'user_id',
    'deletion_requests': 'user_id',
    'education': 'user_id',
    'enrichment_questions': 'user_id',
    'experiences': 'user_id',
    'fact_versions': 'user_id',
    'facts': 'user_id',
    'idempotency_keys': 'user_id',
    'imports': 'user_id',
    'job_eligibility': 'owner_user_id',
    'job_feedback': 'user_id',
    'job_requirements': 'owner_user_id',
    'job_versions': 'owner_user_id',
    'jobs': 'owner_user_id',
    'match_analyses': 'user_id',
    'preference_versions': 'user_id',
    'profiles': 'user_id',
    'projects': 'user_id',
    'resume_drafts': 'user_id',
    'resume_exports': 'user_id',
    'resume_versions': 'user_id',
    'resumes': 'user_id',
    'skill_assertions': 'user_id',
    'tasks': 'user_id',
    'usage_counters': 'user_id',
    'usage_reservations': 'user_id',
    'user_skills': 'user_id',
    'users': 'id',
}

# Extra all-rows policies for hunt_worker: it claims tasks across users and runs deletions.
WORKER_TABLES = ("tasks", "deletion_requests")

# Snapshots: hunt_app/hunt_worker may insert and delete (cascade) but never update.
IMMUTABLE = ("resume_versions", "resume_exports")

FUNCTIONS = """
-- NULLIF: once a GUC was set in a session, an unset value reads as '' (not NULL). Both deny.
CREATE FUNCTION app_current_user_id() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION app_current_auth_subject() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.auth_subject', true), '') $$;
"""

PRECHECK = """
DO $$
BEGIN
  IF current_user IN ('hunt_app', 'hunt_worker') THEN
    RAISE EXCEPTION 'run migrations as hunt_owner: app roles must not own tables';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('hunt_app', 'hunt_worker')) <> 2 THEN
    RAISE EXCEPTION 'roles hunt_app / hunt_worker missing: run alembic/bootstrap.sql first';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('hunt_app', 'hunt_worker')
             AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'hunt_app / hunt_worker must not have BYPASSRLS or SUPERUSER';
  END IF;
END $$;
"""


def rls_sql(table: str, col: str) -> str:
    me = f"{col} = app_current_user_id()"
    read = me
    insert = me
    if table == "users":
        # Auth resolves subject -> id before app.user_id is known (app/core/auth.py).
        read = f"({me} OR auth_subject = app_current_auth_subject())"
        insert = "auth_subject = app_current_auth_subject()"
    return f"""
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
CREATE POLICY {table}_select ON {table} FOR SELECT USING ({read});
CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK ({insert});
CREATE POLICY {table}_update ON {table} FOR UPDATE USING ({me}) WITH CHECK ({me});
CREATE POLICY {table}_delete ON {table} FOR DELETE USING ({me});
"""


def grants_sql() -> str:
    out = []
    for table in RLS_TABLES:
        privs = "SELECT, INSERT, DELETE" if table in IMMUTABLE else "SELECT, INSERT, UPDATE, DELETE"
        if table in WORKER_TABLES:
            out.append(f"GRANT SELECT, INSERT ON {table} TO hunt_app;")
            out.append(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO hunt_worker;")
            out.append(f"CREATE POLICY {table}_worker ON {table} TO hunt_worker USING (true) WITH CHECK (true);")
        else:
            out.append(f"GRANT {privs} ON {table} TO hunt_app, hunt_worker;")
    for table in ("audit_log", "llm_calls"):
        out.append(f"GRANT INSERT ON {table} TO hunt_app;")
        out.append(f"GRANT SELECT, INSERT, UPDATE ON {table} TO hunt_worker;")
    return "\n".join(out)


def upgrade() -> None:
    op.execute(PRECHECK)
    op.execute(FUNCTIONS)
    op.execute(SCHEMA)
    for table, col in RLS_TABLES.items():
        op.execute(rls_sql(table, col))
    op.execute(grants_sql())


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
