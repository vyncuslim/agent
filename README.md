# Vynalth MCP Gateway v2

Vynalth AI's remote Model Context Protocol gateway. It exposes a single MCP endpoint for agent clients such as ElevenLabs while keeping upstream systems behind explicit permissions.

## Architecture

```text
Agent / ElevenLabs
       |
       v
https://mcp.vynalthai.com/api/mcp
       |
       +-- Vynalth AI Search -> https://search.vynalthai.com/api/search
       |
       +-- Approved Supabase tables -> RLS / grants / table allowlist
```

The gateway uses **Streamable HTTP** through `mcp-handler` v2 and targets the current MCP protocol generation. Legacy SSE endpoints are intentionally not used.

## Available tools

- `gateway_status` - reports configured capabilities without exposing secrets.
- `web_search` - searches the Vynalth AI Search index.
- `web_search_status` - checks Vynalth AI Search health/index status.
- `supabase_select` - reads approved Supabase tables with an allowlist, row limit and optional equality filters.

Generic SQL and unrestricted database mutation tools are deliberately not exposed. Business write actions should be added later as narrow, named tools/RPCs (for example `create_support_ticket`) with their own authorization rules.

## Environment

Copy `.env.example` to `.env.local` for local development and configure secrets only in your deployment platform.

Required for production:

```bash
MCP_GATEWAY_TOKEN=long-random-token
VYNALTH_SEARCH_BASE_URL=https://search.vynalthai.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-publishable-or-restricted-key
SUPABASE_ALLOWED_TABLES=profiles,posts,support_tickets,feedback
```

For Supabase, prefer RLS + least-privilege grants. A publishable key is suitable for data intentionally exposed through RLS. Do not put secret/service-role credentials in browser code or Git.

## Local development

```bash
npm install
npm run dev
```

Endpoints:

- `http://localhost:3000/api/mcp`
- `http://localhost:3000/api/health`
- `http://localhost:3000/.well-known/mcp.json`

MCP requests require either:

```http
Authorization: Bearer <MCP_GATEWAY_TOKEN>
```

or:

```http
x-mcp-key: <MCP_GATEWAY_TOKEN>
```

## ElevenLabs

Configure the remote MCP URL as:

```text
https://mcp.vynalthai.com/api/mcp
```

Send `MCP_GATEWAY_TOKEN` as a Bearer token/secret header. Keep read/search tools automatic; require explicit approval for any future tool that creates, changes or sends user data.

## Deployment target

Recommended production setup:

1. Deploy this repository as its own Vercel project.
2. Configure the environment variables in Vercel.
3. Attach `mcp.vynalthai.com` to the project.
4. Verify `/api/health`.
5. Connect an MCP client and test `gateway_status`, `web_search`, and `supabase_select`.
6. After cutover, update the legacy `vynalthai.com/.well-known/mcp.json` to point to this gateway.

## Security model

- Bearer-token gateway authentication.
- No credentials committed to the repository.
- Fixed HTTPS upstream for Vynalth AI Search.
- Supabase table allowlist.
- Supabase RLS/grants remain authoritative.
- Database reads are capped by `MCP_MAX_DB_ROWS`.
- No arbitrary SQL.
- No unrestricted delete/update tool.

Future write capabilities should be implemented as dedicated business actions instead of exposing raw database administration.
