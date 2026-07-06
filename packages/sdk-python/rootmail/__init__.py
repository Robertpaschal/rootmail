"""rootmail — the official Python SDK for the rootmail email API.

    from rootmail import RootMail

    client = RootMail(api_key="rm_live_...", base_url="https://api.rootmail.io")
    client.messages.send(to="you@example.com", subject="Hi", html="<b>Hello</b>")
"""
from ._client import RootMail
from .errors import RootMailConnectionError, RootMailError

__all__ = ["RootMail", "RootMailError", "RootMailConnectionError"]
__version__ = "0.1.0"
