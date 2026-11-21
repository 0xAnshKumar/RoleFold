"""users.links (profile links from the resume header: GitHub, LinkedIn, portfolio) and projects.stack (the tech
stack line as written). Links are contact lines inserted at render time, never sent to models (I-10).

Revision ID: 0011
Revises: 0010
"""

from alembic import op

revision = "0011"
down_revision = "0010"


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN links JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("ALTER TABLE projects ADD COLUMN stack TEXT")


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
