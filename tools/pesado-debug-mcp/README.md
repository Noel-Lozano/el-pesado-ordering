# pesado-debug

Local MCP server (stdio) for investigating El Pesado test and CI failures.
Design: [ADR-007](../../docs/adr/007-debug-mcp-server.md). Plan:
[debug-mcp-server.md](../../docs/plans/debug-mcp-server.md).

Full setup instructions arrive with the last commit of this feature. Until then:

```powershell
cd tools/pesado-debug-mcp
uv sync
uv run pytest
```
