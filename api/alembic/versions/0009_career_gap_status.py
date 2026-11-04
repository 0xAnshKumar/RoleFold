"""career_gaps.status: imported career breaks wait as drafts the user confirms, like other imported entries.
Existing (typed) breaks are confirmed.

Revision ID: 0009
Revises: 0008
"""

from alembic import op

revision = "0009"
down_revision = "0008"

SCHEMA = """
ALTER TABLE career_gaps ADD COLUMN status VARCHAR(9) DEFAULT 'confirmed' NOT NULL;
ALTER TABLE career_gaps ADD CONSTRAINT career_gaps_status CHECK (status IN ('draft', 'confirmed', 'rejected'));
"""


def upgrade() -> None:
    op.execute(SCHEMA)


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
