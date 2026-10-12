"""job_requirements.value: the normalized requirement text from extraction (TRD §9.4 "normalized values")

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.execute("ALTER TABLE job_requirements ADD COLUMN value TEXT")


def downgrade() -> None:
    raise NotImplementedError("expand-contract only (TRD §13.6): write a forward migration instead")
