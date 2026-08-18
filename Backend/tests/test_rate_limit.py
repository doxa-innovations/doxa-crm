from __future__ import annotations

from starlette.requests import Request

from app.middleware.rate_limit import rate_limit_key
from app.utils.http import client_ip


def make_request(headers: dict[str, str] | None = None, client=("10.0.0.1", 1234)) -> Request:
    raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": raw_headers,
        "client": client,
    }
    return Request(scope)


def test_client_ip_prefers_first_forwarded_for_hop():
    request = make_request({"x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178"})

    assert client_ip(request) == "203.0.113.5"


def test_client_ip_falls_back_to_socket_peer():
    request = make_request()

    assert client_ip(request) == "10.0.0.1"


def test_client_ip_returns_none_without_client_or_header():
    request = make_request(client=None)

    assert client_ip(request) is None


def test_client_ip_ignores_blank_forwarded_for():
    request = make_request({"x-forwarded-for": "   "})

    assert client_ip(request) == "10.0.0.1"


def test_rate_limit_key_returns_a_string_even_without_a_client():
    request = make_request(client=None)

    assert rate_limit_key(request) == "unknown"


def test_rate_limit_key_uses_forwarded_for():
    request = make_request({"x-forwarded-for": "203.0.113.5"})

    assert rate_limit_key(request) == "203.0.113.5"
