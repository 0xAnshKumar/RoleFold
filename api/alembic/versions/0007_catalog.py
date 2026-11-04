"""job catalog, feed feedback and alert settings (TRD §8, §9.1-9.3, §9.6; PRD §6.2)

catalog_jobs and catalog_source_runs are global (not user-owned, no RLS): hunt_app may only read jobs; hunt_worker
writes both. catalog_feedback and feed_settings are user-owned under forced RLS with 0001's split policies;
hunt_worker may also read every feed_settings row (to find whose alert digest is due). jobs.catalog_job_id links a
user's own copy of a catalog job (made when they open its full check) to the catalog row.

Revision ID: 0007
Revises: 0006
"""

from alembic import op

revision = "0007"
down_revision = "0006"

# Frozen DDL (generated from app/db/models.py at this revision).
SCHEMA = """
CREATE TABLE catalog_jobs (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	source TEXT NOT NULL,
	external_id TEXT NOT NULL,
	company TEXT,
	title TEXT,
	company_key TEXT DEFAULT '' NOT NULL,
	title_key TEXT DEFAULT '' NOT NULL,
	location TEXT,
	remote BOOLEAN,
	employment_type TEXT,
	apply_url TEXT,
	apply_url_key TEXT,
	description TEXT NOT NULL,
	description_hash TEXT NOT NULL,
	cleaning_notes JSONB DEFAULT '[]' NOT NULL,
	version INTEGER DEFAULT '1' NOT NULL,
	posted_at TIMESTAMP WITH TIME ZONE,
	first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	absent_since TIMESTAMP WITH TIME ZONE,
	lifecycle VARCHAR(7) DEFAULT 'active' NOT NULL,
	duplicate_of UUID,
	scam_state VARCHAR(9) DEFAULT 'none' NOT NULL,
	scam_reasons JSONB DEFAULT '[]' NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (source, external_id),
	CONSTRAINT catalog_job_lifecycle CHECK (lifecycle IN ('active', 'expired')),
	FOREIGN KEY(duplicate_of) REFERENCES catalog_jobs (id) ON DELETE SET NULL,
	CONSTRAINT catalog_scam_state CHECK (scam_state IN ('none', 'suspected', 'confirmed', 'cleared'))
);

CREATE INDEX ix_catalog_jobs_apply_url_key ON catalog_jobs (apply_url_key);

CREATE INDEX ix_catalog_jobs_feed ON catalog_jobs (first_seen_at) WHERE lifecycle = 'active' AND duplicate_of IS NULL AND scam_state IN ('none', 'cleared');

CREATE INDEX ix_catalog_jobs_identity ON catalog_jobs (company_key, title_key);

CREATE TABLE catalog_source_runs (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	source TEXT NOT NULL,
	status VARCHAR(8) NOT NULL,
	job_count INTEGER DEFAULT '0' NOT NULL,
	error TEXT,
	started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	finished_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT catalog_run_status CHECK (status IN ('complete', 'partial', 'failed'))
);

CREATE INDEX ix_catalog_source_runs_source ON catalog_source_runs (source, started_at);

CREATE TABLE catalog_feedback (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	catalog_job_id UUID NOT NULL,
	action VARCHAR(7) NOT NULL,
	reason_code TEXT,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(catalog_job_id) REFERENCES catalog_jobs (id) ON DELETE CASCADE,
	CONSTRAINT catalog_feedback_action CHECK (action IN ('save', 'dismiss', 'clear')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_catalog_feedback_user_id ON catalog_feedback (user_id);

CREATE INDEX ix_catalog_feedback_user_job ON catalog_feedback (user_id, catalog_job_id, created_at);

CREATE TABLE feed_settings (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	alert_frequency VARCHAR(6) DEFAULT 'off' NOT NULL,
	last_alert_at TIMESTAMP WITH TIME ZONE,
	signals_reset_at TIMESTAMP WITH TIME ZONE,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id),
	CONSTRAINT alert_frequency CHECK (alert_frequency IN ('off', 'weekly', 'daily')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_feed_settings_user_id ON feed_settings (user_id);

ALTER TABLE jobs ADD COLUMN catalog_job_id UUID REFERENCES catalog_jobs (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_jobs_catalog_job ON jobs (owner_user_id, catalog_job_id) WHERE catalog_job_id IS NOT NULL;
"""

# table -> owner column; the full list is every migration's RLS_TABLES (tests/core/test_units.py).
RLS_TABLES = {"catalog_feedback": "user_id", "feed_settings": "user_id"}

GRANTS = """
GRANT SELECT ON catalog_jobs TO hunt_app;
GRANT SELECT, INSERT, UPDATE ON catalog_jobs TO hunt_worker;
GRANT SELECT, INSERT ON catalog_source_runs TO hunt_worker;
CREATE POLICY feed_settings_worker_read ON feed_settings FOR SELECT TO hunt_worker USING (true);
"""


def rls_sql(table: str, col: str) -> str:
    """0001's split policies, copied (a migration is frozen; it must not import another revision)."""
    me = f"{col} = app_current_user_id()"
    return f"""
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
CREATE POLICY {table}_select ON {table} FOR SELECT USING ({me});
CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK ({me});
CREATE POLICY {table}_update ON {table} FOR UPDATE USING ({me}) WITH CHECK ({me});
CREATE POLICY {table}_delete ON {table} FOR DELETE USING ({me});
GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO hunt_app, hunt_worker;
"""


def upgrade() -> None:
    op.execute(SCHEMA)
    for table, col in RLS_TABLES.items():
        op.execute(rls_sql(table, col))
    op.execute(GRANTS)


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
