=== AgentPress ===
Contributors: romosamatya
Tags: ai, mcp, markdown, rest-api, headless
Requires at least: 6.2
Tested up to: 6.7
Stable tag: 1.0.0
Requires PHP: 8.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Transforms WordPress into a Model Context Protocol (MCP) server and token-efficient Markdown memory bank for external AI agents.

== Description ==

AgentPress is a headless-first WordPress plugin that transforms a WordPress installation into a Model Context Protocol (MCP) server and structured memory bank for external AI agents (n8n, Make.com, Ollama, Antigravity).

It bypasses standard HTML-heavy REST APIs to deliver token-efficient Markdown and structured JSON for RAG (Retrieval-Augmented Generation) and autonomous publishing workflows.

= Core Features =

* **Token-Auth API:** Revokable Bearer API keys (`ap_live_...`) stored as SHA-256 hashes and linked to specific WordPress users with `read`, `write`, and `admin` scopes.
* **AI-Optimized Endpoints:** `/wp-json/agentpress/v1/memory` strips Gutenberg block comments and shortcodes to serve clean Markdown (`content_markdown`).
* **Flexible Publishing Policy:** Configure in the dashboard whether AI-generated posts default to `draft`, `pending`, or `publish`, and whether per-request status overrides are allowed.
* **Structured RAG Metadata:** Explicit schema mapping for `author`, `citations`, and `review_date`.
* **Native MCP Server:** JSON-RPC 2.0 endpoint at `/wp-json/agentpress/v1/mcp` exposing `read_wp_memory` and `write_wp_draft` tools.
* **Activity & Audit Log:** Tracks every AI request (`agent_id`, `endpoint`, `request_method`, `payload_size`, `status_code`, and `timestamp`).
* **WP-CLI Integration:** Full terminal management via `wp agentpress`.

== Installation ==

1. Upload `agentpress.zip` via **Plugins > Add New > Upload Plugin** in the WordPress Admin Dashboard, or extract the `agentpress` directory into `/wp-content/plugins/`.
2. Activate **AgentPress** through the **Plugins** menu in WordPress.
3. Navigate to **AgentPress** in the WordPress Admin sidebar to create an API key and configure your default publishing status.

== Changelog ==

= 1.0.0 =
* Initial release with SHA-256 Bearer authentication, Markdown converter, `/wp-json/agentpress/v1/memory` and `/wp-json/agentpress/v1/mcp` endpoints, React admin UI, and WP-CLI commands.
