"""MCP adapter: registers tools and prompts on an MCPServer and runs it over stdio.

Thin by design (ADR-007): each tool validates input through its type hints,
calls a function in `core/`, and wraps the result. No business logic here.
"""

import logging

from mcp.server import MCPServer

from pesado_debug import __version__
from pesado_debug.config import Settings
from pesado_debug.logging_setup import configure_logging

logger = logging.getLogger(__name__)

SERVER_NAME = "pesado-debug"
INSTRUCTIONS = (
    "Investigates El Pesado test and CI failures: failed GitHub Actions runs, trimmed job logs, "
    "JUnit test results, test-only database scenarios, and a local flake checker. "
    "Database tools only ever touch a database marked as test; they never touch production."
)


def build_server(settings: Settings) -> MCPServer:
    server: MCPServer = MCPServer(name=SERVER_NAME, version=__version__, instructions=INSTRUCTIONS)
    logger.info(
        "server_built",
        extra={"github_ready": settings.github_ready, "db_ready": settings.db_ready},
    )
    return server


def main() -> None:
    configure_logging()
    settings = Settings()
    build_server(settings).run()  # stdio is the default (and only) transport


if __name__ == "__main__":
    main()
