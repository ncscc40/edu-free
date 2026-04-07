"""add is_deleted to resource_comments

Revision ID: 31b3ce4fbc97
Revises: c553f10dbd7e
Create Date: 2026-03-01 01:26:30.429291

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '31b3ce4fbc97'
down_revision = 'c553f10dbd7e'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("resource_comments")}
    if "is_deleted" not in columns:
        op.add_column(
            "resource_comments",
            sa.Column(
                "is_deleted",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("resource_comments")}
    if "is_deleted" in columns:
        op.drop_column("resource_comments", "is_deleted")
