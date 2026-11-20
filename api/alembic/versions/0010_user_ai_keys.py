"""user_ai_keys: a user's own AI key (Settings → AI key): provider, AES-GCM ciphertext, last4. User-owned under forced
RLS with 0001's split policies.

Revision ID: 0010
Revises: 0009
"""

from alembic import op

revision = "0010"
down_revision = "0009"

# Frozen DDL (generated from app/db/models.py at this revision).
SCHEMA = """
CREATE TABLE user_ai_keys (
	id UUID DEFAULT gen_random_uuid() NOT NULL,
	provider VARCHAR(9) NOT NULL,
	key_enc BYTEA NOT NULL,
	last4 TEXT NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
	user_id UUID NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (user_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	CONSTRAINT ai_provider CHECK (provider IN ('gemini', 'anthropic', 'openai'))
);

CREATE INDEX ix_user_ai_keys_user_id ON user_ai_keys (user_id);
"""

# table -> owner column (tests/core/test_units.py checks every migration's RLS_TABLES == app/db/models.py).
RLS_TABLES = {"user_ai_keys": "user_id"}


def rls_sql(table: str, col: str) -> str:
    """0001's split policies (copied: a migration is frozen)."""
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
