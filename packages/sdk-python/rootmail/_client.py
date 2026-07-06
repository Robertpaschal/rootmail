"""HTTP client for the rootmail API."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from .errors import RootMailConnectionError, RootMailError
from ._resources import (
    Analytics,
    Assistant,
    Campaigns,
    Contacts,
    Deliverability,
    Imports,
    Lists,
    Messages,
    Sequences,
    SubTenants,
    Suppressions,
    Templates,
)

__all__ = ["RootMail"]

_DEFAULT_BASE_URL = "http://localhost:4000"


class RootMail:
    """The rootmail API client.

    Example::

        from rootmail import RootMail

        client = RootMail(api_key="rm_live_...")
        msg = client.messages.send(
            to="user@example.com",
            subject="Welcome",
            html="<h1>Hi</h1>",
        )
        print(msg["id"], msg["status"])
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = _DEFAULT_BASE_URL,
        sub_tenant_id: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        if not api_key:
            raise ValueError("rootmail: `api_key` is required")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._sub_tenant_id = sub_tenant_id
        self._timeout = timeout

        self.messages = Messages(self)
        self.templates = Templates(self)
        self.contacts = Contacts(self)
        self.lists = Lists(self)
        self.campaigns = Campaigns(self)
        self.sequences = Sequences(self)
        self.suppressions = Suppressions(self)
        self.sub_tenants = SubTenants(self)
        self.analytics = Analytics(self)
        self.deliverability = Deliverability(self)
        self.imports = Imports(self)
        self.assistant = Assistant(self)

    def with_sub_tenant(self, sub_tenant_id: str) -> "RootMail":
        """Return a client scoped to a sub-tenant (sets X-Rootmail-Subtenant)."""
        return RootMail(
            api_key=self._api_key,
            base_url=self._base_url,
            sub_tenant_id=sub_tenant_id,
            timeout=self._timeout,
        )

    def request(
        self,
        method: str,
        path: str,
        query: Optional[Dict[str, Any]] = None,
        body: Any = None,
        idempotency_key: Optional[str] = None,
    ) -> Any:
        url = self._base_url + path
        if query:
            clean = {k: str(v) for k, v in query.items() if v is not None}
            if clean:
                url += "?" + urllib.parse.urlencode(clean)

        headers = {"Authorization": f"Bearer {self._api_key}"}
        data: Optional[bytes] = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        if self._sub_tenant_id:
            headers["X-Rootmail-Subtenant"] = self._sub_tenant_id
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", "replace")
            payload = _safe_json(raw)
            err = payload.get("error") if isinstance(payload, dict) else None
            message = (err or {}).get("message") if isinstance(err, dict) else None
            code = (err or {}).get("code") if isinstance(err, dict) else None
            raise RootMailError(
                exc.code,
                message or f"Request failed with status {exc.code}",
                code=code,
                details=payload,
            ) from None
        except urllib.error.URLError as exc:
            raise RootMailConnectionError(
                f"Cannot reach the rootmail API at {self._base_url}: {exc.reason}"
            ) from None


def _safe_json(text: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text
