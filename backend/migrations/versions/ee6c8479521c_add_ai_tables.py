"""add_ai_tables

Revision ID: ee6c8479521c
Revises: 31b3ce4fbc97
Create Date: 2026-03-01 13:44:26.752003

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ee6c8479521c'
down_revision = '31b3ce4fbc97'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "ai_chat_history" not in tables:
        op.create_table(
            "ai_chat_history",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("course_id", sa.Integer(), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=True),
            sa.Column("messages_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if "ai_analyses" not in tables:
        op.create_table(
            "ai_analyses",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("resource_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("analysis_type", sa.String(length=20), nullable=False),
            sa.Column("source", sa.String(length=30), nullable=True),
            sa.Column("summary", sa.Text(), nullable=True),
            sa.Column("data_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.CheckConstraint("analysis_type IN ('video', 'document')", name="ck_ai_analyses_type"),
            sa.ForeignKeyConstraint(["resource_id"], ["course_resources.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if "ai_flashcards" not in tables:
        op.create_table(
            "ai_flashcards",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("resource_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("front", sa.Text(), nullable=False),
            sa.Column("back", sa.Text(), nullable=False),
            sa.Column("difficulty", sa.Integer(), nullable=False),
            sa.Column("times_reviewed", sa.Integer(), nullable=False),
            sa.Column("last_reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["resource_id"], ["course_resources.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    ai_chat_indexes = {idx["name"] for idx in inspector.get_indexes("ai_chat_history")} if "ai_chat_history" in inspector.get_table_names() else set()
    ai_analyses_indexes = {idx["name"] for idx in inspector.get_indexes("ai_analyses")} if "ai_analyses" in inspector.get_table_names() else set()
    ai_flashcard_indexes = {idx["name"] for idx in inspector.get_indexes("ai_flashcards")} if "ai_flashcards" in inspector.get_table_names() else set()

    if "ix_ai_chat_history_course_id" not in ai_chat_indexes:
        op.create_index("ix_ai_chat_history_course_id", "ai_chat_history", ["course_id"], unique=False)
    if "ix_ai_chat_history_user_id" not in ai_chat_indexes:
        op.create_index("ix_ai_chat_history_user_id", "ai_chat_history", ["user_id"], unique=False)
    if "ix_ai_analyses_resource_id" not in ai_analyses_indexes:
        op.create_index("ix_ai_analyses_resource_id", "ai_analyses", ["resource_id"], unique=False)
    if "ix_ai_analyses_user_id" not in ai_analyses_indexes:
        op.create_index("ix_ai_analyses_user_id", "ai_analyses", ["user_id"], unique=False)
    if "ix_ai_flashcards_resource_id" not in ai_flashcard_indexes:
        op.create_index("ix_ai_flashcards_resource_id", "ai_flashcards", ["resource_id"], unique=False)
    if "ix_ai_flashcards_user_id" not in ai_flashcard_indexes:
        op.create_index("ix_ai_flashcards_user_id", "ai_flashcards", ["user_id"], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "ai_flashcards" in tables:
        op.drop_table("ai_flashcards")
    if "ai_analyses" in tables:
        op.drop_table("ai_analyses")
    if "ai_chat_history" in tables:
        op.drop_table("ai_chat_history")
