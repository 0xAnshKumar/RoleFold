"""achievements (incl. publications) and languages: profile sections with the draft/confirm lifecycle,
user-owned under forced RLS with the same split policies and grants as 0001

Revision ID: 0005
Revises: 0004
"""

from alembic import op

revision = "0005"
down_revision = "0004"

# Frozen DDL (generated from app/db/models.py at this revision).
SCHEMA = """
CREATE TABLE achievements (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	kind VARCHAR(11) DEFAULT 'achievement' NOT NULL,
	description TEXT NOT NULL,
	version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	status VARCHAR(9) DEFAULT 'draft' NOT NULL,
	origin VARCHAR(10) DEFAULT 'manual' NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT achievement_kind CHECK (kind IN ('achievement', 'publication')),
	CONSTRAINT achievements_status CHECK (status IN ('draft', 'confirmed', 'rejected')),
	CONSTRAINT achievements_origin CHECK (origin IN ('import', 'manual', 'enrichment')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_achievements_user_id ON achievements (user_id);

CREATE INDEX ix_achievements_user_status ON achievements (user_id, status);

CREATE TABLE languages (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	name TEXT NOT NULL,
	proficiency TEXT,
	version INTEGER DEFAULT '1' NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	status VARCHAR(9) DEFAULT 'draft' NOT NULL,
	origin VARCHAR(10) DEFAULT 'manual' NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT languages_status CHECK (status IN ('draft', 'confirmed', 'rejected')),
	CONSTRAINT languages_origin CHECK (origin IN ('import', 'manual', 'enrichment')),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_languages_user_id ON languages (user_id);

CREATE INDEX ix_languages_user_status ON languages (user_id, status);
"""

# table -> owner column; the full list is 0001's RLS_TABLES plus this one (tests/core/test_units.py).
RLS_TABLES = {"achievements": "user_id", "languages": "user_id"}


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


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
