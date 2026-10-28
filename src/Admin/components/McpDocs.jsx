export default function McpDocs( { config } ) {
	const restUrl = config.restUrl || `${ window.location.origin }/wp-json/agentpress/v1`;

	const curlReadExample = `curl -X GET "${ restUrl }/memory?post_type=post&limit=5" \\
  -H "Authorization: Bearer ap_live_<your_api_key>"`;

	const curlWriteExample = `curl -X POST "${ restUrl }/memory" \\
  -H "Authorization: Bearer ap_live_<your_api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Q4 Autonomous Research Summary",
    "content_markdown": "## Key Findings\\n\\n- Zero HTML overhead\\n- Structured RAG citations",
    "status": "draft",
    "meta": {
      "author": "Antigravity Research Agent",
      "citations": ["https://example.com/report-2026"],
      "review_date": "2026-10-28"
    }
  }'`;

	const mcpRpcExample = `curl -X POST "${ restUrl }/mcp" \\
  -H "Authorization: Bearer ap_live_<your_api_key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "read_wp_memory",
      "arguments": {
        "post_type": "post",
        "limit": 3
      }
    }
  }'`;

	return (
		<div className="space-y-6">
			<div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
				<h2 className="text-lg font-bold text-slate-900 mt-0 mb-2">
					Model Context Protocol (MCP) Tools
				</h2>
				<p className="text-sm text-slate-600 mt-0 mb-4">
					AgentPress exposes a native MCP discovery manifest and JSON-RPC 2.0 tool execution endpoint at{ ' ' }
					<code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">{ restUrl }/mcp</code>.
				</p>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
						<div className="font-mono text-sm font-bold text-emerald-700 mb-1">
							read_wp_memory
						</div>
						<p className="text-xs text-slate-600 m-0">
							Fetches recent posts or specific Post IDs stripped of all Gutenberg HTML and shortcodes, returning clean <code className="font-mono">content_markdown</code> and structured metadata (<code className="font-mono">author</code>, <code className="font-mono">citations</code>, <code className="font-mono">review_date</code>).
						</p>
					</div>

					<div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
						<div className="font-mono text-sm font-bold text-sky-700 mb-1">
							write_wp_draft
						</div>
						<p className="text-xs text-slate-600 m-0">
							Pushes generated Markdown content and structured provenance metadata directly into a new or existing WordPress post draft.
						</p>
					</div>
				</div>
			</div>

			<div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
				<h3 className="text-base font-bold text-slate-900 m-0">
					Quickstart cURL Examples
				</h3>

				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
						1. Retrieve RAG Memory (GET /wp-json/agentpress/v1/memory)
					</div>
					<pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-x-auto m-0">
						{ curlReadExample }
					</pre>
				</div>

				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
						2. Write Markdown Post Draft (POST /wp-json/agentpress/v1/memory)
					</div>
					<pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-x-auto m-0">
						{ curlWriteExample }
					</pre>
				</div>

				<div>
					<div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
						3. Invoke MCP Tool via JSON-RPC 2.0 (POST /wp-json/agentpress/v1/mcp)
					</div>
					<pre className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-x-auto m-0">
						{ mcpRpcExample }
					</pre>
				</div>
			</div>
		</div>
	);
}
