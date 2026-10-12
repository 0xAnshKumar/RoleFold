import os

# Unit tests never connect: the engine is created lazily and these routes fail before any SQL.
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://nobody:x@127.0.0.1:1/none")
os.environ.setdefault("PSEUDONYM_SALT", "unit-test-salt-0123456789")
