# Vynalth MCP Gateway v2

This repository hosts the Vynalth AI Model Context Protocol gateway used by AI agents such as ElevenLabs.

## MCP endpoint

Production target:

`https://mcp.vynalthai.com/api/mcp`

Transport: Streamable HTTP

## Current tools

- `gateway_status` — gateway capabilities and configuration status
- `web_search` — searches the Vynalth AI Search engine
- `web_search_status` — checks Vynalth AI Search health
- `supabase_select` — controlled read access to allowlisted Supabase tables
- `create_support_ticket` — creates a support request in an allowlisted support table
- `submit_feedback` — stores user feedback in an allowlisted feedback table
- `create_partnership_inquiry` — stores a business/partnership inquiry in an allowlisted inquiry table

## Security model

The gateway is intentionally not an arbitrary SQL bridge.

- MCP requests require `MCP_GATEWAY_TOKEN` in production.
- Supabase access is limited to table names listed in `SUPABASE_ALLOWED_TABLES`.
- Business writes use specific tools rather than arbitrary insert/update/delete commands.
- Row limits are capped by `MCP_MAX_DB_ROWS`.
- Supabase RLS and grants remain the final authorization layer.
- Keep Supabase secret/service-role credentials server-side only.

## Environment variables

Copy `.env.example` and configure the deployment environment.

Required for authenticated production MCP access:

- `MCP_GATEWAY_TOKEN`

For Vynalth AI Search:

- `VYNALTH_SEARCH_BASE_URL` (defaults to `https://search.vynalthai.com`)
- `VYNALTH_SEARCH_TIMEOUT_MS`

For Supabase:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_ALLOWED_TABLES`

Optional business-table overrides:

- `SUPABASE_SUPPORT_TABLE` (default: `support_tickets`)
- `SUPABASE_FEEDBACK_TABLE` (default: `feedback`)
- `SUPABASE_PARTNERSHIP_TABLE` (default: `partnership_inquiries`)

Limits:

- `MCP_MAX_SEARCH_RESULTS`
- `MCP_MAX_DB_ROWS`

## ElevenLabs

Configure the MCP server URL as:

`https://mcp.vynalthai.com/api/mcp`

and send the gateway token as an authorization header when supported.

## Migration from legacy MCP

The historical Vynalth MCP manifest referenced SSE and message endpoints under `vynalthai.com/api/mcp/*`. V2 uses a single Streamable HTTP MCP endpoint and should become the canonical gateway.
