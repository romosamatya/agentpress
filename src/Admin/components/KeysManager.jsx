import { useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

export default function KeysManager( { keys, users, currentUserId, loading, onRefresh } ) {
	const [ keyName, setKeyName ] = useState( '' );
	const [ selectedUserId, setSelectedUserId ] = useState( currentUserId || ( users[ 0 ]?.id ?? 1 ) );
	const [ permissions, setPermissions ] = useState( {
		read: true,
		write: true,
		admin: false,
	} );
	const [ newlyCreatedKey, setNewlyCreatedKey ] = useState( null );
	const [ submitting, setSubmitting ] = useState( false );
	const [ actionError, setActionError ] = useState( null );
	const [ copied, setCopied ] = useState( false );

	const handlePermissionToggle = ( perm ) => {
		setPermissions( ( prev ) => ( {
			...prev,
			[ perm ]: ! prev[ perm ],
		} ) );
	};

	const handleGenerateKey = async ( e ) => {
		e.preventDefault();
		setActionError( null );
		setNewlyCreatedKey( null );

		const activePerms = Object.keys( permissions ).filter( ( k ) => permissions[ k ] );
		if ( ! keyName.trim() ) {
			setActionError( 'Please enter a descriptive name for the agent API key.' );
			return;
		}
		if ( activePerms.length === 0 ) {
			setActionError( 'Select at least one permission scope (read, write, or admin).' );
			return;
		}

		setSubmitting( true );
		try {
			const created = await apiFetch( {
				path: '/agentpress/v1/admin/keys',
				method: 'POST',
				data: {
					name: keyName.trim(),
					agent_user_id: Number( selectedUserId ),
					permissions: activePerms,
				},
			} );
			setNewlyCreatedKey( created );
			setKeyName( '' );
			onRefresh();
		} catch ( err ) {
			setActionError( err?.message || 'Failed to generate API key.' );
		} finally {
			setSubmitting( false );
		}
	};

	const handleRevoke = async ( keyId, permanent = false ) => {
		setActionError( null );
		try {
			await apiFetch( {
				path: `/agentpress/v1/admin/keys/${ keyId }?permanent=${ permanent ? 'true' : 'false' }`,
				method: 'DELETE',
			} );
			onRefresh();
		} catch ( err ) {
			setActionError( err?.message || 'Failed to update API key.' );
		}
	};

	const copyToClipboard = async ( text ) => {
		try {
			await navigator.clipboard.writeText( text );
			setCopied( true );
			setTimeout( () => setCopied( false ), 2500 );
		} catch {
			// Fallback ignored
		}
	};

	return (
		<div className="space-y-6">
			{ /* One-time Newly Generated Token Alert */ }
			{ newlyCreatedKey && (
				<div className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-5 shadow-sm">
					<div className="flex items-center justify-between mb-2">
						<span className="text-sm font-bold text-emerald-900 uppercase tracking-wide">
							New AgentPress API Key Generated — Copy Now (Shown Once)
						</span>
						<button
							type="button"
							onClick={ () => setNewlyCreatedKey( null ) }
							className="text-xs text-emerald-700 hover:text-emerald-950 bg-transparent border-0 cursor-pointer"
						>
							Dismiss
						</button>
					</div>
					<p className="text-xs text-emerald-800 mb-3">
						For security, AgentPress stores only the SHA-256 hash of this key in <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded">wp_agentpress_keys</code>. Save it in your agent environment now:
					</p>
					<div className="flex items-center gap-2">
						<code className="flex-1 bg-slate-900 text-emerald-400 font-mono text-sm px-4 py-2.5 rounded-lg select-all overflow-x-auto">
							{ newlyCreatedKey.api_key }
						</code>
						<button
							type="button"
							onClick={ () => copyToClipboard( newlyCreatedKey.api_key ) }
							className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg border-0 cursor-pointer"
						>
							{ copied ? 'Copied!' : 'Copy Token' }
						</button>
					</div>
				</div>
			) }

			{ /* Create Key Card */ }
			<div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
				<h2 className="text-lg font-bold text-slate-900 mt-0 mb-1">
					Generate New Agent API Key
				</h2>
				<p className="text-sm text-slate-500 mt-0 mb-4">
					Create a revokable Bearer token linked to a specific WordPress user account for attribution and capability scoping.
				</p>

				{ actionError && (
					<div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg mb-4">
						{ actionError }
					</div>
				) }

				<form onSubmit={ handleGenerateKey } className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
					<div className="md:col-span-4">
						<label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
							Agent / Integration Name
						</label>
						<input
							type="text"
							placeholder="e.g., Antigravity MCP Agent, n8n RAG Sync"
							value={ keyName }
							onChange={ ( e ) => setKeyName( e.target.value ) }
							className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-emerald-600"
						/>
					</div>

					<div className="md:col-span-3">
						<label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
							Linked WordPress User
						</label>
						<select
							value={ selectedUserId }
							onChange={ ( e ) => setSelectedUserId( e.target.value ) }
							className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
						>
							{ users.map( ( u ) => (
								<option key={ u.id } value={ u.id }>
									{ u.display_name } (@{ u.username })
								</option>
							) ) }
						</select>
					</div>

					<div className="md:col-span-3">
						<span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
							Permissions
						</span>
						<div className="flex items-center gap-3 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
							{ [ 'read', 'write', 'admin' ].map( ( scope ) => (
								<label key={ scope } className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
									<input
										type="checkbox"
										checked={ !! permissions[ scope ] }
										onChange={ () => handlePermissionToggle( scope ) }
									/>
									<span className="uppercase">{ scope }</span>
								</label>
							) ) }
						</div>
					</div>

					<div className="md:col-span-2">
						<button
							type="submit"
							disabled={ submitting }
							className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-sm rounded-lg border-0 cursor-pointer transition-colors"
						>
							{ submitting ? 'Generating...' : 'Generate Key' }
						</button>
					</div>
				</form>
			</div>

			{ /* Keys Table Card */ }
			<div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
				<div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
					<h3 className="text-base font-bold text-slate-900 m-0">
						Provisioned Agent Keys
					</h3>
					<button
						type="button"
						onClick={ onRefresh }
						className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg border-0 cursor-pointer"
					>
						Refresh
					</button>
				</div>

				{ loading ? (
					<div className="p-8 text-center text-slate-500 text-sm">Loading API keys...</div>
				) : keys.length === 0 ? (
					<div className="p-8 text-center text-slate-500 text-sm">
						No API keys provisioned yet. Create your first key above to authenticate external AI agents.
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-left border-collapse">
							<thead>
								<tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
									<th className="py-3 px-4">Name</th>
									<th className="py-3 px-4">Key Prefix</th>
									<th className="py-3 px-4">Agent User</th>
									<th className="py-3 px-4">Permissions</th>
									<th className="py-3 px-4">Last Used (UTC)</th>
									<th className="py-3 px-4">Status</th>
									<th className="py-3 px-4 text-right">Actions</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-slate-200 text-sm">
								{ keys.map( ( item ) => (
									<tr key={ item.id } className="hover:bg-slate-50/80">
										<td className="py-3.5 px-4 font-semibold text-slate-900">
											{ item.name }
										</td>
										<td className="py-3.5 px-4 font-mono text-xs text-slate-600">
											<span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
												{ item.key_prefix }••••••
											</span>
										</td>
										<td className="py-3.5 px-4 text-slate-700">
											{ item.agent_display_name }{ ' ' }
											<span className="text-xs text-slate-400">(@{ item.agent_username })</span>
										</td>
										<td className="py-3.5 px-4">
											<div className="flex flex-wrap gap-1">
												{ ( item.permissions || [] ).map( ( perm ) => (
													<span
														key={ perm }
														className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
													>
														{ perm }
													</span>
												) ) }
											</div>
										</td>
										<td className="py-3.5 px-4 text-xs text-slate-500 font-mono">
											{ item.last_used || 'Never' }
										</td>
										<td className="py-3.5 px-4">
											{ item.status === 'active' ? (
												<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
													Active
												</span>
											) : (
												<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
													Revoked
												</span>
											) }
										</td>
										<td className="py-3.5 px-4 text-right space-x-2">
											{ item.status === 'active' && (
												<button
													type="button"
													onClick={ () => handleRevoke( item.id, false ) }
													className="text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded border border-amber-200 cursor-pointer"
												>
													Revoke
												</button>
											) }
											<button
												type="button"
												onClick={ () => handleRevoke( item.id, true ) }
												className="text-xs font-medium text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded border border-red-200 cursor-pointer"
											>
												Delete
											</button>
										</td>
									</tr>
								) ) }
							</tbody>
						</table>
					</div>
				) }
			</div>
		</div>
	);
}
