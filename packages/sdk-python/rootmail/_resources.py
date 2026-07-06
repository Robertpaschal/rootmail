"""Resource groups for the rootmail client. Methods return parsed JSON (dicts).

All request/response fields are the API's snake_case names.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from ._client import RootMail


class _Resource:
    def __init__(self, client: "RootMail") -> None:
        self._c = client


class Messages(_Resource):
    def send(
        self,
        to: str,
        subject: Optional[str] = None,
        html: Optional[str] = None,
        text: Optional[str] = None,
        template: Optional[str] = None,
        variables: Optional[Dict[str, Any]] = None,
        from_email: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        **extra: Any,
    ) -> Dict[str, Any]:
        """Send a message. Pass ``html``/``text`` or a ``template`` slug + ``variables``.

        An ``idempotency_key`` guarantees a single send on retries (one is generated
        if you don't pass one).
        """
        body: Dict[str, Any] = {"to": to, **extra}
        if subject is not None:
            body["subject"] = subject
        if html is not None:
            body["html"] = html
        if text is not None:
            body["text"] = text
        if template is not None:
            body["template"] = template
        if variables is not None:
            body["variables"] = variables
        if from_email is not None:
            body["from_email"] = from_email
        return self._c.request(
            "POST", "/v1/messages", body=body,
            idempotency_key=idempotency_key or str(uuid.uuid4()),
        )

    def list(self, limit: Optional[int] = None, status: Optional[str] = None) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/messages", query={"limit": limit, "status": status})

    def get(self, message_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/messages/{message_id}")

    def get_audit(self, message_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/messages/{message_id}/audit")

    def get_proof(self, message_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/messages/{message_id}/proof")


class Templates(_Resource):
    def list(self) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/templates")

    def get(self, template_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/templates/{template_id}")

    def create(self, **body: Any) -> Dict[str, Any]:
        return self._c.request("POST", "/v1/templates", body=body)

    def update(self, template_id: str, **body: Any) -> Dict[str, Any]:
        return self._c.request("PATCH", f"/v1/templates/{template_id}", body=body)

    def delete(self, template_id: str) -> Dict[str, Any]:
        return self._c.request("DELETE", f"/v1/templates/{template_id}")


class Contacts(_Resource):
    def list(self, **query: Any) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/contacts", query=query)

    def create(self, **body: Any) -> Dict[str, Any]:
        return self._c.request("POST", "/v1/contacts", body=body)

    def delete(self, email: str) -> Dict[str, Any]:
        from urllib.parse import quote
        return self._c.request("DELETE", f"/v1/contacts/{quote(email)}")


class Lists(_Resource):
    def list(self) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/lists")

    def get(self, list_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/lists/{list_id}")

    def create(self, name: str, description: Optional[str] = None) -> Dict[str, Any]:
        return self._c.request("POST", "/v1/lists", body={"name": name, "description": description})

    def delete(self, list_id: str) -> Dict[str, Any]:
        return self._c.request("DELETE", f"/v1/lists/{list_id}")

    def contacts(self, list_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/lists/{list_id}/contacts")

    def add_contact(self, list_id: str, email: str) -> Dict[str, Any]:
        return self._c.request("POST", f"/v1/lists/{list_id}/contacts", body={"email": email})


class Campaigns(_Resource):
    def list(self) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/campaigns")

    def get(self, campaign_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/campaigns/{campaign_id}")

    def create(self, **body: Any) -> Dict[str, Any]:
        return self._c.request("POST", "/v1/campaigns", body=body)

    def send(self, campaign_id: str, scheduled_at: Optional[str] = None) -> Dict[str, Any]:
        return self._c.request(
            "POST", f"/v1/campaigns/{campaign_id}/send", body={"scheduled_at": scheduled_at}
        )

    def delete(self, campaign_id: str) -> Dict[str, Any]:
        return self._c.request("DELETE", f"/v1/campaigns/{campaign_id}")

    def analytics(self, campaign_id: str) -> Dict[str, Any]:
        """The campaign's sent → delivered → opened → clicked funnel and rates."""
        return self._c.request("GET", f"/v1/campaigns/{campaign_id}/analytics")


class Sequences(_Resource):
    def list(self) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/sequences")

    def get(self, sequence_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/sequences/{sequence_id}")

    def create(self, **body: Any) -> Dict[str, Any]:
        return self._c.request("POST", "/v1/sequences", body=body)

    def update(self, sequence_id: str, **body: Any) -> Dict[str, Any]:
        return self._c.request("PATCH", f"/v1/sequences/{sequence_id}", body=body)

    def delete(self, sequence_id: str) -> Dict[str, Any]:
        return self._c.request("DELETE", f"/v1/sequences/{sequence_id}")

    def enroll(self, sequence_id: str, email: str) -> Dict[str, Any]:
        return self._c.request("POST", f"/v1/sequences/{sequence_id}/enroll", body={"email": email})

    def enrollments(self, sequence_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/sequences/{sequence_id}/enrollments")

    def analytics(self, sequence_id: str) -> Dict[str, Any]:
        """The sequence's engagement funnel plus per-step drop-off."""
        return self._c.request("GET", f"/v1/sequences/{sequence_id}/analytics")


class Suppressions(_Resource):
    def list(self, **query: Any) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/suppressions", query=query)

    def add(self, email: str, reason: Optional[str] = None) -> Dict[str, Any]:
        return self._c.request("POST", "/v1/suppressions", body={"email": email, "reason": reason})

    def check(self, email: str) -> Dict[str, Any]:
        """Is this address suppressed? (checked automatically before every send too.)"""
        return self._c.request("GET", "/v1/suppressions/check", query={"email": email})


class SubTenants(_Resource):
    def list(self) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/sub-tenants")

    def get(self, sub_tenant_id: str) -> Dict[str, Any]:
        return self._c.request("GET", f"/v1/sub-tenants/{sub_tenant_id}")

    def create(self, **body: Any) -> Dict[str, Any]:
        return self._c.request("POST", "/v1/sub-tenants", body=body)

    def auth(self, sub_tenant_id: str) -> Dict[str, Any]:
        """SPF/DKIM/DMARC/BIMI posture + the exact DNS records to publish."""
        return self._c.request("GET", f"/v1/sub-tenants/{sub_tenant_id}/auth")


class Analytics(_Resource):
    def get(self, window_days: Optional[int] = None) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/analytics", query={"window_days": window_days})


class Deliverability(_Resource):
    def get(self, window_days: Optional[int] = None) -> Dict[str, Any]:
        return self._c.request("GET", "/v1/deliverability", query={"window_days": window_days})


class Imports(_Resource):
    def contacts(self, entries: List[Dict[str, Any]], list_id: Optional[str] = None) -> Dict[str, Any]:
        return self._c.request(
            "POST", "/v1/imports/contacts", body={"entries": entries, "list_id": list_id}
        )

    def suppressions(self, entries: List[Dict[str, Any]], source: Optional[str] = None) -> Dict[str, Any]:
        return self._c.request(
            "POST", "/v1/imports/suppressions", body={"entries": entries, "source": source}
        )


class Assistant(_Resource):
    def chat(self, prompt: str) -> Dict[str, Any]:
        """Ask the agentic assistant to build, operate, or diagnose your email."""
        return self._c.request("POST", "/v1/assistant", body={"prompt": prompt})
