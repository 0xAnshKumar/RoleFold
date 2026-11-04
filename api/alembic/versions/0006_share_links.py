"""share_links: read-only resume links (PRD §7). User-owned under forced RLS with 0001's split policies, plus one
public read path: a session that set app.share_token to a token's SHA-256 sees that one row while it is not revoked
(the same pattern as 0001's users/app.auth_subject). The API then reads the resume as its owner.

Revision ID: 0006
Revises: 0005
"""

from alembic import op

revision = "0006"
down_revision = "0005"

# Frozen DDL (generated from app/db/models.py at this revision).
SCHEMA = """
CREATE TABLE share_links (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	resume_id UUID NOT NULL,
	token_hash TEXT NOT NULL,
	show_contact JSONB DEFAULT '[]' NOT NULL,
	consent_text TEXT NOT NULL,
	consented_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	revoked_at TIMESTAMP WITH TIME ZONE,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(resume_id) REFERENCES resumes (id) ON DELETE CASCADE,
	UNIQUE (token_hash),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_share_links_user_id ON share_links (user_id);

CREATE INDEX ix_share_links_resume_id ON share_links (resume_id);

-- NULLIF as in 0001: an unset GUC reads as '' once set in a session; '' matches no hash.
CREATE FUNCTION app_current_share_token() RETURNS text LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.share_token', true), '') $$;
"""

# table -> owner column (tests/core/test_units.py checks 0001 + 0005 + this == app/db/models.py).
RLS_TABLES = {"share_links": "user_id"}


def rls_sql(table: str, col: str) -> str:
    """0001's split policies (copied: a migration is frozen), with the public read by token hash on SELECT only."""
    me = f"{col} = app_current_user_id()"
    read = f"({me} OR (revoked_at IS NULL AND token_hash = app_current_share_token()))"
    return f"""
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
CREATE POLICY {table}_select ON {table} FOR SELECT USING ({read});
CREATE POLICY {table}_insert ON {table} FOR INSERT WITH CHECK ({me});
CREATE POLICY {table}_update ON {table} FOR UPDATE USING ({me}) WITH CHECK ({me});
CREATE POLICY {table}_delete ON {table} FOR DELETE USING ({me});
GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO hunt_app, hunt_worker;
"""


def upgrade() -> None:
    op.execute(SCHEMA)
    for table, col in RLS_TABLES.items():
        op.execute(rls_sql(table, col))


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
