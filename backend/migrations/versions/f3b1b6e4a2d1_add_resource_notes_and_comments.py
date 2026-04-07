"""add resource notes and comments

Revision ID: f3b1b6e4a2d1
Revises: c8d0740f9c88
Create Date: 2026-02-28 23:59:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3b1b6e4a2d1'
down_revision = 'c8d0740f9c88'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('course_resources', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))

    op.create_table(
        'resource_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('resource_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['parent_id'], ['resource_comments.id']),
        sa.ForeignKeyConstraint(['resource_id'], ['course_resources.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('resource_comments', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_resource_comments_resource_id'), ['resource_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_resource_comments_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_resource_comments_parent_id'), ['parent_id'], unique=False)


def downgrade():
    with op.batch_alter_table('resource_comments', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_resource_comments_parent_id'))
        batch_op.drop_index(batch_op.f('ix_resource_comments_user_id'))
        batch_op.drop_index(batch_op.f('ix_resource_comments_resource_id'))

    op.drop_table('resource_comments')

    with op.batch_alter_table('course_resources', schema=None) as batch_op:
        batch_op.drop_column('notes')
