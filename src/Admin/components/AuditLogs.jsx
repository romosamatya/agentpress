export default function AuditLogs( { logs, total, loading, onRefresh } ) {
	const formatBytes = ( bytes ) => {
		const n = Number( bytes ) || 0;
		if ( n < 1024 ) {
			return `${ n } B`;
		}
		return `${ ( n / 1024 ).toFixed( 1 ) } KB`;
	};

	return (
		<div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
			<div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
				<div>
					<h2 className="text-lg font-bold text-slate-900 m-0">
						Agent Activity &amp; Audit Logs
					</h2>
					<p className="text-xs text-slate-500 mt-1 mb-0">
						Real-time telemetry recorded in <code className="font-mono">wp_agentpress_logs</code> ({ total } total requests).
					</p>
				</div>
				<button
					type="button"
					onClick={ onRefresh }
					className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border-0 cursor-pointer"
				>
					Refresh Logs
				</button>
			</div>

			{ loading ? (
				<div className="p-8 text-center text-slate-500 text-sm">Loading audit logs...</div>
			) : logs.length === 0 ? (
				<div className="p-8 text-center text-slate-500 text-sm">
					No agent requests recorded yet. Authenticate against <code className="font-mono">/wp-json/agentpress/v1/memory</code> to see audit telemetry.
				</div>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left border-collapse">
						<thead>
							<tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
								<th className="py-3 px-4">Timestamp (UTC)</th>
								<th className="py-3 px-4">Method</th>
								<th className="py-3 px-4">Endpoint</th>
								<th className="py-3 px-4">Agent User</th>
								<th className="py-3 px-4">API Key</th>
								<th className="py-3 px-4">Payload</th>
								<th className="py-3 px-4">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-200 text-sm">
							{ logs.map( ( log ) => (
								<tr key={ log.id } className="hover:bg-slate-50/80">
									<td className="py-3 px-4 font-mono text-xs text-slate-600">
										{ log.timestamp }
									</td>
									<td className="py-3 px-4">
										<span
											className={ `text-xs font-mono font-bold px-2 py-0.5 rounded ${
												log.request_method === 'POST'
													? 'bg-sky-100 text-sky-800'
													: 'bg-emerald-100 text-emerald-800'
											}` }
										>
											{ log.request_method }
										</span>
									</td>
									<td className="py-3 px-4 font-mono text-xs text-slate-800">
										{ log.endpoint }
									</td>
									<td className="py-3 px-4 text-slate-700">
										{ log.agent_id > 0 ? (
											<>
												{ log.agent_display_name }{ ' ' }
												<span className="text-xs text-slate-400">(#{ log.agent_id })</span>
											</>
										) : (
											<span className="text-xs text-red-600 font-medium">Unauthenticated</span>
										) }
									</td>
									<td className="py-3 px-4 font-mono text-xs text-slate-500">
										{ log.key_prefix ? `${ log.key_name } (${ log.key_prefix }•••)` : '—' }
									</td>
									<td className="py-3 px-4 font-mono text-xs text-slate-600">
										{ formatBytes( log.payload_size ) }
									</td>
									<td className="py-3 px-4">
										<span
											className={ `inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold ${
												log.status_code >= 200 && log.status_code < 300
													? 'bg-emerald-100 text-emerald-800'
													: 'bg-red-100 text-red-800'
											}` }
										>
											{ log.status_code }
										</span>
									</td>
								</tr>
							) ) }
						</tbody>
					</table>
				</div>
			) }
		</div>
	);
}
