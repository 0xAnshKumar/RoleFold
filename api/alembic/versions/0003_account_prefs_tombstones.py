"""users.name/location (inserted at render time, never sent to models); preference/goal `raw` (the exact
PUT body: what the typed columns can't hold); deletion tombstones keep a salted hash, not the user_id

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision = "0003"
down_revision = "0002"


def upgrade() -> None:
    op.execute("""
    ALTER TABLE users ADD COLUMN name TEXT, ADD COLUMN location TEXT;
    ALTER TABLE preference_versions ADD COLUMN raw JSONB;
    ALTER TABLE career_goals ADD COLUMN raw JSONB;
    ALTER TABLE deletion_requests ALTER COLUMN user_id DROP NOT NULL, ADD COLUMN user_hash TEXT;
    """)


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
