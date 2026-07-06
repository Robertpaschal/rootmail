"""Error types for the rootmail SDK."""
from __future__ import annotations

from typing import Any, Optional


class RootMailError(Exception):
    """Raised when the API returns a non-2xx response.

    Attributes:
        status: HTTP status code.
        code: rootmail error code (e.g. ``feature_locked``), when present.
        message: human-readable message.
        details: the parsed error payload, when present.
    """

    def __init__(
        self,
        status: int,
        message: str,
        code: Optional[str] = None,
        details: Any = None,
    ) -> None:
        super().__init__(f"[{status}] {message}")
        self.status = status
        self.code = code
        self.message = message
        self.details = details


class RootMailConnectionError(RootMailError):
    """Raised when the API can't be reached."""

    def __init__(self, message: str) -> None:
        super().__init__(0, message, code="connection_error")
