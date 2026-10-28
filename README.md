# AgentPress

**Headless-first WordPress plugin that transforms a WordPress installation into a Model Context Protocol (MCP) server and structured memory bank for external AI agents.**

---

## 1. Product Requirements Document: AgentPress

### 1.1 Project Overview
AgentPress is a headless-first WordPress plugin that transforms a WordPress installation into a Model Context Protocol (MCP) server and structured memory bank for external AI agents (e.g., n8n, Make.com, Ollama, Antigravity). It bypasses standard HTML-heavy REST APIs to deliver token-efficient Markdown/JSON for RAG (Retrieval-Augmented Generation) and autonomous agent workflows.

### 1.2 Target Audience
Developers running headless setups (AstroJS/Next.js) and automation engineers who need bots to securely read, write, and manage WordPress content without scraping HTML or dealing with legacy WordPress cookie authentication.

### 1.3 Core Features (MVP / Free Tier)
- **Token-Auth API**: Custom revokable API keys linked to specific "Agent Users" in WordPress.
- **AI-Optimized Endpoints**: Custom `/wp-json/agentpress/v1/` routes returning clean Markdown instead of Gutenberg block HTML.
- **Metadata Structuring**: Explicit schema mapping for custom fields (`Author`, `Citations`, `Review Date`) for precise AI ingestion.

### 1.4 Premium Features (Pro Tier - Future Scope)
- **Native MCP Server**: Integration allowing agents to natively discover read/write tools.
- **Agent Audit Logs**: Tracking interface in the WP Admin to monitor AI vs. human edits.
- **Vector DB Webhooks**: Outgoing webhooks on `save_post` to sync content to ChromaDB or Pinecone.

---

## 2. System Architecture & Tech Stack

### 2.1 Core Technologies

| Layer | Technology | Usage |
| :--- | :--- | :--- |
| **Backend** | PHP 8.0+ | Strict typing enabled, WordPress Plugin API integration |
| **Frontend** | React | WP Admin UI via `@wordpress/scripts`, TailwindCSS |
| **Database** | MySQL / MariaDB | Native WP tables + custom tables for logs and API keys |

### 2.2 Plugin Structure
```text
agentpress/
├── agentpress.php           # Plugin header & bootstrap
├── composer.json            # PSR-4 autoloading configuration
├── package.json             # React dependencies & build scripts
├── src/
│   ├── Admin/               # React components & WP Admin menu registration
│   ├── API/                 # Custom REST controller classes & Markdown converter
│   ├── Auth/                # Token generation & validation logic
│   └── Database/            # Custom table creation, migrations & audit logger
├── build/                   # Compiled React assets
└── mcp.json                 # Model Context Protocol manifest
```

### 2.3 Database Schema (Custom Tables)
- **`wp_agentpress_keys`**: Stores hashed API keys, Agent User ID, permissions (`read`, `write`, `admin`), and `last_used` timestamp.
- **`wp_agentpress_logs`**: Tracks `agent_id`, `endpoint`, `request_method`, `payload_size`, and `timestamp` for auditing.

---

## 3. API & MCP Specifications

### 3.1 Authentication
All incoming HTTP requests to the AgentPress endpoints must include the following authorization header:
```http
Authorization: Bearer <agentpress_api_key>
```

### 3.2 REST Endpoints

#### `GET /wp-json/agentpress/v1/memory`
- **Purpose**: Retrieve posts formatted specifically for RAG ingestion.
- **Parameters**: `post_type`, `limit`, `offset`, `category`, `post_id`.
- **Returns**: JSON array with standard metadata, structured schema (`author`, `citations`, `review_date`), and `content_markdown`.

#### `POST /wp-json/agentpress/v1/memory`
- **Purpose**: Create or update a post record.
- **Payload**:
  ```json
  {
    "title": "Structured Memory Entry",
    "content_markdown": "# Overview\n\nToken-efficient content...",
    "status": "draft",
    "meta": {
      "author": "Research Agent",
      "citations": ["https://example.com/source-1"],
      "review_date": "2026-10-28"
    }
  }
  ```
- **Returns**: `201 Created` with the generated Post ID.

### 3.3 Model Context Protocol (MCP) Tools
The plugin exposes the following system tools to MCP-compatible agents via `mcp.json` and `/wp-json/agentpress/v1/mcp`:
- **`read_wp_memory`**: Fetches recent content or specific post IDs in clean Markdown.
- **`write_wp_draft`**: Pushes generated Markdown into a new WP post draft with structured metadata.

---

## 4. Standard Operating Procedure: AgentPress Development

### 4.1 Development Principles
- **Terminal-First Management**: Assume WP-CLI is available for all database operations, scaffolding, and testing workflows.
- **No HTML in API**: The REST API must strictly output Markdown or structured JSON. Strip all Gutenberg blocks and shortcodes before serving data via the API.
- **React over jQuery**: All WP Admin interfaces must be built using React (`@wordpress/scripts`). Legacy jQuery scripts are strictly prohibited.

### 4.2 Workflow Steps
1. **Scaffold First**: Create the basic PHP classes and PSR-4 autoloading before writing core business logic.
2. **Auth Layer**: Build and test the token authentication system using Postman or cURL before building data endpoints.
3. **Data Layer**: Implement the REST controllers, ensuring strict sanitization and validation on all `POST` requests.
4. **UI Layer**: Build the React dashboard to generate API keys and view activity logs.

### 4.3 Code Generation Rules
- Always enforce strict typing at the top of every PHP file (`declare(strict_types=1);`).
- Namespace all core classes under `AgentPress\`.
- Thoroughly document all hooks, filters, and API endpoints using standard PHPDoc blocks.

---

## 5. WP-CLI Terminal Management Reference

AgentPress registers the `wp agentpress` command suite for terminal-first workflows:

```bash
# Run or verify custom database table migrations (wp_agentpress_keys & wp_agentpress_logs)
wp agentpress migrate

# Generate a new API key for a WordPress Agent User
wp agentpress key-generate "Antigravity MCP Agent" --user=admin --permissions=read,write

# Output only the raw key token for CI/CD or shell scripts
export AGENTPRESS_KEY=$(wp agentpress key-generate "CI Worker" --user=1 --porcelain)

# List all API keys (supports --status=active|revoked|all and --format=table|json|csv|yaml)
wp agentpress key-list

# Revoke or permanently delete an API key by ID
wp agentpress key-revoke 1
wp agentpress key-revoke 1 --delete

# Inspect recent AI agent audit logs
wp agentpress logs --limit=25

# Preview posts converted to token-efficient Markdown for RAG ingestion
wp agentpress memory --post_type=post --limit=5 --format=json
```

---

## 6. Local Docker Development Environment

A complete Docker Compose stack (`MariaDB 10.11` + `WordPress PHP 8.2` + automated `WP-CLI` bootstrapper) is included in [`docker-compose.yml`](./docker-compose.yml).

```bash
# Start MariaDB, WordPress (port 8080), and auto-activate AgentPress
docker compose up -d

# Run WP-CLI commands inside the container
docker compose run --rm wpcli wp agentpress key-generate "Local Test Agent" --user=admin --permissions=read,write,admin
docker compose run --rm wpcli wp agentpress key-list
docker compose run --rm wpcli wp agentpress logs
```

- **WordPress Site**: `http://localhost:8080`
- **WP Admin Dashboard**: `http://localhost:8080/wp-admin/admin.php?page=agentpress` (`admin` / `admin`)
- **REST Memory Endpoint**: `http://localhost:8080/wp-json/agentpress/v1/memory`
- **MCP Endpoint**: `http://localhost:8080/wp-json/agentpress/v1/mcp`


