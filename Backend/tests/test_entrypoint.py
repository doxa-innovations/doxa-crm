from __future__ import annotations

import os
import subprocess
from pathlib import Path

ENTRYPOINT = Path(__file__).resolve().parents[1] / "docker-entrypoint.sh"
STUBBED_COMMANDS = ("uvicorn", "celery", "alembic")


def run_entrypoint(tmp_path: Path, env: dict[str, str], args: tuple[str, ...] = ()):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    for name in STUBBED_COMMANDS:
        stub = bin_dir / name
        stub.write_text(f'#!/usr/bin/env sh\necho "{name} $@"\n')
        stub.chmod(0o755)

    full_env = {**os.environ, **env, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
    return subprocess.run(
        ["sh", str(ENTRYPOINT), *args],
        capture_output=True,
        text=True,
        env=full_env,
        timeout=30,
    )


def test_default_role_starts_uvicorn_with_proxy_headers(tmp_path):
    result = run_entrypoint(tmp_path, {})

    assert result.returncode == 0
    assert "uvicorn app.main:app" in result.stdout
    assert "--proxy-headers" in result.stdout
    assert "--forwarded-allow-ips=*" in result.stdout


def test_worker_role_starts_a_celery_worker(tmp_path):
    result = run_entrypoint(tmp_path, {"PROCESS_ROLE": "worker"})

    assert result.returncode == 0
    assert "celery -A app.workers.celery_app.celery_app worker" in result.stdout


def test_beat_role_starts_celery_beat_with_a_writable_schedule(tmp_path):
    result = run_entrypoint(tmp_path, {"PROCESS_ROLE": "beat"})

    assert result.returncode == 0
    assert "celery -A app.workers.celery_app.celery_app beat" in result.stdout
    assert "--schedule /tmp/celerybeat-schedule" in result.stdout


def test_unknown_role_fails_loudly(tmp_path):
    result = run_entrypoint(tmp_path, {"PROCESS_ROLE": "nonsense"})

    assert result.returncode != 0
    assert "nonsense" in result.stderr


def test_migrations_run_before_the_process_starts(tmp_path):
    result = run_entrypoint(tmp_path, {"RUN_MIGRATIONS": "true"})

    assert result.returncode == 0
    assert result.stdout.index("alembic upgrade head") < result.stdout.index("uvicorn")


def test_migrations_are_skipped_by_default(tmp_path):
    result = run_entrypoint(tmp_path, {})

    assert "alembic" not in result.stdout


def test_explicit_command_overrides_the_role(tmp_path):
    result = run_entrypoint(tmp_path, {"PROCESS_ROLE": "worker"}, ("uvicorn", "custom:app"))

    assert result.returncode == 0
    assert "uvicorn custom:app" in result.stdout
    assert "celery" not in result.stdout
