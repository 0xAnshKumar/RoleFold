"""admin console: skill_aliases (taxonomy curator decisions) and least-privilege grants for hunt_admin, the
BYPASSRLS role the console uses for cross-user reads (task queue, spend, unmapped skill terms, audit log)

Revision ID: 0008
Revises: 0007
"""

from alembic import op

revision = "0008"
down_revision = "0007"

# hunt_admin needs BYPASSRLS, which only a superuser can grant, so it comes from alembic/bootstrap.sql.
PRECHECK = """
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hunt_admin' AND rolbypassrls AND NOT rolsuper) THEN
    RAISE EXCEPTION 'role hunt_admin (LOGIN BYPASSRLS NOSUPERUSER) missing: as a superuser run '
      '"CREATE ROLE hunt_admin LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ''...'';" '
      '(see alembic/bootstrap.sql), then rerun alembic upgrade head';
  END IF;
END $$;
"""

# Frozen DDL (generated from app/db/models.py at this revision).
SCHEMA = """
CREATE TABLE skill_aliases (
	alias_norm TEXT NOT NULL,
	alias TEXT NOT NULL,
	skill_id TEXT,
	status VARCHAR(8) NOT NULL,
	source TEXT DEFAULT 'curator' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	PRIMARY KEY (alias_norm),
	CONSTRAINT approved_has_skill CHECK ((status = 'approved') = (skill_id IS NOT NULL)),
	CONSTRAINT skill_alias_status CHECK (status IN ('approved', 'rejected'))
);
"""

# BYPASSRLS skips row policies, so table grants are the whole boundary: read-only on user data the console
# aggregates, UPDATE only on tasks (replay), INSERT-only audit. Support access to one user's data does not use
# hunt_admin: it reads as hunt_app with app.user_id set, in a READ ONLY transaction (app/routes/admin.py).
GRANTS = """
GRANT USAGE ON SCHEMA public TO hunt_admin;
GRANT SELECT ON users, tasks, llm_calls, audit_log, user_skills, facts, fact_versions, job_requirements TO hunt_admin;
GRANT UPDATE ON tasks TO hunt_admin;
GRANT INSERT ON audit_log TO hunt_admin;
GRANT SELECT, INSERT, UPDATE ON skill_aliases TO hunt_admin;
GRANT SELECT ON skill_aliases TO hunt_app, hunt_worker;
"""


def upgrade() -> None:
    op.execute(PRECHECK)
    op.execute(SCHEMA)
    op.execute(GRANTS)


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
