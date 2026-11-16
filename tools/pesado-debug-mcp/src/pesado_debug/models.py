"""Pydantic models shared by the MCP adapter and the CLI.

Tool output models live here so the SDK can derive each tool's output schema
from its return annotation. Each tool's models are added with that tool.
"""

from pydantic import BaseModel


class Truncation(BaseModel):
    truncated: bool
    hint: str | None = None
