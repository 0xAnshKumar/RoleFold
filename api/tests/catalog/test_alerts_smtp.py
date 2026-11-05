"""Alert email transport: STARTTLS must verify the server certificate (review P1)."""

import os
import ssl
from email.message import EmailMessage

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://nobody:x@127.0.0.1:1/none")
os.environ.setdefault("PSEUDONYM_SALT", "unit-test-salt-0123456789")

from app.catalog import alerts
from app.core.config import get_settings

CALLS: list = []


class StubSMTP:
    def __init__(self, host, port, timeout):
        CALLS.clear()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context=None):
        CALLS.append(("starttls", context))

    def login(self, user, password):
        CALLS.append(("login", user))

    def send_message(self, msg):
        CALLS.append(("send", msg["To"]))


def test_starttls_uses_a_verifying_context(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(s, "smtp_port", 587)
    monkeypatch.setattr(s, "smtp_user", "hunt")
    monkeypatch.setattr(alerts.smtplib, "SMTP", StubSMTP)
    msg = EmailMessage()
    msg["To"] = "rohan@example.com"
    assert alerts.send(msg) is True
    [(name, ctx), login, send] = CALLS
    assert name == "starttls" and login == ("login", "hunt") and send == ("send", "rohan@example.com")
    assert isinstance(ctx, ssl.SSLContext) and ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname
