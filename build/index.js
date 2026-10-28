( function ( wp ) {
	'use strict';

	const { createElement: el, Fragment, useState, useEffect, useCallback, createRoot, render } = wp.element;
	const apiFetch = wp.apiFetch;

	function KeysManager( { keys, users, currentUserId, loading, onRefresh } ) {
		const [ keyName, setKeyName ] = useState( '' );
		const [ selectedUserId, setSelectedUserId ] = useState( currentUserId || ( users[ 0 ] && users[ 0 ].id ) || 1 );
		const [ permissions, setPermissions ] = useState( { read: true, write: true, admin: false } );
		const [ newlyCreatedKey, setNewlyCreatedKey ] = useState( null );
		const [ submitting, setSubmitting ] = useState( false );
		const [ actionError, setActionError ] = useState( null );
		const [ copied, setCopied ] = useState( false );

		const handlePermissionToggle = ( perm ) => {
			setPermissions( ( prev ) => ( { ...prev, [ perm ]: ! prev[ perm ] } ) );
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
				setActionError( ( err && err.message ) || 'Failed to generate API key.' );
			} finally {
				setSubmitting( false );
			}
		};

		const handleRevoke = async ( keyId, permanent ) => {
			setActionError( null );
			try {
				await apiFetch( {
					path: '/agentpress/v1/admin/keys/' + keyId + '?permanent=' + ( permanent ? 'true' : 'false' ),
					method: 'DELETE',
				} );
				onRefresh();
			} catch ( err ) {
				setActionError( ( err && err.message ) || 'Failed to update API key.' );
			}
		};

		const copyToClipboard = async ( text ) => {
			try {
				await navigator.clipboard.writeText( text );
				setCopied( true );
				setTimeout( () => setCopied( false ), 2500 );
			} catch ( _e ) {}
		};

		return el(
			'div',
			{ className: 'ap-space-y' },
			newlyCreatedKey &&
				el(
					'div',
					{ className: 'ap-alert-success' },
					el(
						'div',
						{ className: 'ap-flex-between' },
						el( 'strong', null, 'New AgentPress API Key Generated — Copy Now (Shown Once)' ),
						el(
							'button',
							{
								type: 'button',
								className: 'ap-btn-link',
								onClick: () => setNewlyCreatedKey( null ),
							},
							'Dismiss'
						)
					),
					el(
						'p',
						{ className: 'ap-help-text' },
						'For security, AgentPress stores only the SHA-256 hash of this key in wp_agentpress_keys.'
					),
					el(
						'div',
						{ className: 'ap-token-box' },
						el( 'code', { className: 'ap-token-code' }, newlyCreatedKey.api_key ),
						el(
							'button',
							{
								type: 'button',
								className: 'ap-btn-primary',
								onClick: () => copyToClipboard( newlyCreatedKey.api_key ),
							},
							copied ? 'Copied!' : 'Copy Token'
						)
					)
				),
			el(
				'div',
				{ className: 'ap-card' },
				el( 'h2', { className: 'ap-card-title' }, 'Generate New Agent API Key' ),
				el(
					'p',
					{ className: 'ap-card-subtitle' },
					'Create a revokable Bearer token linked to a specific WordPress user account for attribution and capability scoping.'
				),
				actionError && el( 'div', { className: 'ap-alert-error' }, actionError ),
				el(
					'form',
					{ onSubmit: handleGenerateKey, className: 'ap-form-grid' },
					el(
						'div',
						{ className: 'ap-field' },
						el( 'label', { className: 'ap-label' }, 'Agent / Integration Name' ),
						el( 'input', {
							type: 'text',
							className: 'ap-input',
							placeholder: 'e.g., Antigravity MCP Agent, n8n RAG Sync',
							value: keyName,
							onChange: ( e ) => setKeyName( e.target.value ),
						} )
					),
					el(
						'div',
						{ className: 'ap-field' },
						el( 'label', { className: 'ap-label' }, 'Linked WordPress User' ),
						el(
							'select',
							{
								className: 'ap-select',
								value: selectedUserId,
								onChange: ( e ) => setSelectedUserId( e.target.value ),
							},
							users.map( ( u ) =>
								el( 'option', { key: u.id, value: u.id }, u.display_name + ' (@' + u.username + ')' )
							)
						)
					),
					el(
						'div',
						{ className: 'ap-field' },
						el( 'label', { className: 'ap-label' }, 'Permissions' ),
						el(
							'div',
							{ className: 'ap-checkbox-group' },
							[ 'read', 'write', 'admin' ].map( ( scope ) =>
								el(
									'label',
									{ key: scope, className: 'ap-checkbox-label' },
									el( 'input', {
										type: 'checkbox',
										checked: !! permissions[ scope ],
										onChange: () => handlePermissionToggle( scope ),
									} ),
									scope.toUpperCase()
								)
							)
						)
					),
					el(
						'div',
						{ className: 'ap-field ap-field-action' },
						el(
							'button',
							{ type: 'submit', disabled: submitting, className: 'ap-btn-dark' },
							submitting ? 'Generating...' : 'Generate Key'
						)
					)
				)
			),
			el(
				'div',
				{ className: 'ap-card ap-card-table' },
				el(
					'div',
					{ className: 'ap-card-header' },
					el( 'h3', { className: 'ap-card-title' }, 'Provisioned Agent Keys' ),
					el( 'button', { type: 'button', onClick: onRefresh, className: 'ap-btn-secondary' }, 'Refresh' )
				),
				loading
					? el( 'div', { className: 'ap-empty' }, 'Loading API keys...' )
					: keys.length === 0
					? el( 'div', { className: 'ap-empty' }, 'No API keys provisioned yet.' )
					: el(
							'table',
							{ className: 'ap-table' },
							el(
								'thead',
								null,
								el(
									'tr',
									null,
									el( 'th', null, 'Name' ),
									el( 'th', null, 'Key Prefix' ),
									el( 'th', null, 'Agent User' ),
									el( 'th', null, 'Permissions' ),
									el( 'th', null, 'Last Used (UTC)' ),
									el( 'th', null, 'Status' ),
									el( 'th', { className: 'ap-text-right' }, 'Actions' )
								)
							),
							el(
								'tbody',
								null,
								keys.map( ( item ) =>
									el(
										'tr',
										{ key: item.id },
										el( 'td', { className: 'ap-font-semibold' }, item.name ),
										el( 'td', null, el( 'code', { className: 'ap-badge-code' }, item.key_prefix + '••••••' ) ),
										el( 'td', null, item.agent_display_name + ' (@' + item.agent_username + ')' ),
										el(
											'td',
											null,
											( item.permissions || [] ).map( ( perm ) =>
												el( 'span', { key: perm, className: 'ap-badge-perm' }, perm.toUpperCase() )
											)
										),
										el( 'td', { className: 'ap-mono' }, item.last_used || 'Never' ),
										el(
											'td',
											null,
											el(
												'span',
												{
													className:
														item.status === 'active'
															? 'ap-badge-active'
															: 'ap-badge-revoked',
												},
												item.status === 'active' ? 'Active' : 'Revoked'
											)
										),
										el(
											'td',
											{ className: 'ap-text-right' },
											item.status === 'active' &&
												el(
													'button',
													{
														type: 'button',
														className: 'ap-btn-warn',
														onClick: () => handleRevoke( item.id, false ),
													},
													'Revoke'
												),
											el(
												'button',
												{
													type: 'button',
													className: 'ap-btn-danger',
													onClick: () => handleRevoke( item.id, true ),
												},
												'Delete'
											)
										)
									)
								)
							)
					  )
			)
		);
	}

	function AuditLogs( { logs, total, loading, onRefresh } ) {
		const formatBytes = ( bytes ) => {
			const n = Number( bytes ) || 0;
			return n < 1024 ? n + ' B' : ( n / 1024 ).toFixed( 1 ) + ' KB';
		};

		return el(
			'div',
			{ className: 'ap-card ap-card-table' },
			el(
				'div',
				{ className: 'ap-card-header' },
				el(
					'div',
					null,
					el( 'h2', { className: 'ap-card-title' }, 'Agent Activity & Audit Logs' ),
					el(
						'p',
						{ className: 'ap-card-subtitle' },
						'Real-time telemetry recorded in wp_agentpress_logs (' + total + ' total requests).'
					)
				),
				el( 'button', { type: 'button', onClick: onRefresh, className: 'ap-btn-secondary' }, 'Refresh Logs' )
			),
			loading
				? el( 'div', { className: 'ap-empty' }, 'Loading audit logs...' )
				: logs.length === 0
				? el( 'div', { className: 'ap-empty' }, 'No agent requests recorded yet.' )
				: el(
						'table',
						{ className: 'ap-table' },
						el(
							'thead',
							null,
							el(
								'tr',
								null,
								el( 'th', null, 'Timestamp (UTC)' ),
								el( 'th', null, 'Method' ),
								el( 'th', null, 'Endpoint' ),
								el( 'th', null, 'Agent User' ),
								el( 'th', null, 'API Key' ),
								el( 'th', null, 'Payload' ),
								el( 'th', null, 'Status' )
							)
						),
						el(
							'tbody',
							null,
							logs.map( ( log ) =>
								el(
									'tr',
									{ key: log.id },
									el( 'td', { className: 'ap-mono' }, log.timestamp ),
									el( 'td', null, el( 'span', { className: 'ap-badge-perm' }, log.request_method ) ),
									el( 'td', { className: 'ap-mono' }, log.endpoint ),
									el(
										'td',
										null,
										log.agent_id > 0
											? log.agent_display_name + ' (#' + log.agent_id + ')'
											: 'Unauthenticated'
									),
									el(
										'td',
										{ className: 'ap-mono' },
										log.key_prefix ? log.key_name + ' (' + log.key_prefix + '•••)' : '—'
									),
									el( 'td', { className: 'ap-mono' }, formatBytes( log.payload_size ) ),
									el(
										'td',
										null,
										el(
											'span',
											{
												className:
													log.status_code >= 200 && log.status_code < 300
														? 'ap-badge-active'
														: 'ap-badge-revoked',
											},
											String( log.status_code )
										)
									)
								)
							)
						)
				  )
		);
	}

	function McpDocs( { config } ) {
		const restUrl = config.restUrl || window.location.origin + '/wp-json/agentpress/v1';

		return el(
			'div',
			{ className: 'ap-space-y' },
			el(
				'div',
				{ className: 'ap-card' },
				el( 'h2', { className: 'ap-card-title' }, 'Model Context Protocol (MCP) Server & Endpoints' ),
				el(
					'p',
					{ className: 'ap-card-subtitle' },
					'AgentPress exposes token-efficient Markdown endpoints and MCP JSON-RPC 2.0 tools at ' + restUrl
				),
				el(
					'pre',
					{ className: 'ap-code-block' },
					'GET  ' +
						restUrl +
						'/memory?post_type=post&limit=10\n' +
						'POST ' +
						restUrl +
						'/memory\n' +
						'GET  ' +
						restUrl +
						'/mcp\n' +
						'POST ' +
						restUrl +
						'/mcp   (Tools: read_wp_memory, write_wp_draft)\n\n' +
						'Header Required:\n' +
						'Authorization: Bearer ap_live_<your_agentpress_api_key>'
				)
			)
		);
	}

	function App() {
		const [ activeTab, setActiveTab ] = useState( 'keys' );
		const [ keys, setKeys ] = useState( [] );
		const [ users, setUsers ] = useState( [] );
		const [ logs, setLogs ] = useState( [] );
		const [ totalLogs, setTotalLogs ] = useState( 0 );
		const [ loading, setLoading ] = useState( true );
		const [ error, setError ] = useState( null );

		const config = window.agentPressConfig || {
			restUrl: '/wp-json/agentpress/v1',
			siteUrl: window.location.origin,
			version: '1.0.0',
			currentUserId: 1,
		};

		const fetchDashboardData = useCallback( async () => {
			setLoading( true );
			setError( null );
			try {
				const [ keysRes, usersRes, logsRes ] = await Promise.all( [
					apiFetch( { path: '/agentpress/v1/admin/keys' } ),
					apiFetch( { path: '/agentpress/v1/admin/users' } ),
					apiFetch( { path: '/agentpress/v1/admin/logs?limit=50' } ),
				] );
				setKeys( ( keysRes && keysRes.keys ) || [] );
				setUsers( ( usersRes && usersRes.users ) || [] );
				setLogs( ( logsRes && logsRes.logs ) || [] );
				setTotalLogs( ( logsRes && logsRes.total ) || 0 );
			} catch ( err ) {
				setError( ( err && err.message ) || 'Failed to load AgentPress dashboard data.' );
			} finally {
				setLoading( false );
			}
		}, [] );

		useEffect( () => {
			fetchDashboardData();
		}, [ fetchDashboardData ] );

		return el(
			'div',
			{ className: 'ap-container' },
			el(
				'div',
				{ className: 'ap-hero' },
				el(
					'div',
					null,
					el( 'h1', { className: 'ap-hero-title' }, 'AgentPress — MCP Server & AI Memory Bank' ),
					el(
						'p',
						{ className: 'ap-hero-subtitle' },
						'Token-efficient Markdown REST API & Model Context Protocol server for external AI agents.'
					)
				)
			),
			error && el( 'div', { className: 'ap-alert-error' }, error ),
			el(
				'div',
				{ className: 'ap-tabs' },
				el(
					'button',
					{
						type: 'button',
						className: 'ap-tab ' + ( activeTab === 'keys' ? 'ap-tab-active' : '' ),
						onClick: () => setActiveTab( 'keys' ),
					},
					'API Keys & Agent Auth (' + keys.length + ')'
				),
				el(
					'button',
					{
						type: 'button',
						className: 'ap-tab ' + ( activeTab === 'logs' ? 'ap-tab-active' : '' ),
						onClick: () => setActiveTab( 'logs' ),
					},
					'Agent Audit Logs (' + totalLogs + ')'
				),
				el(
					'button',
					{
						type: 'button',
						className: 'ap-tab ' + ( activeTab === 'mcp' ? 'ap-tab-active' : '' ),
						onClick: () => setActiveTab( 'mcp' ),
					},
					'MCP Server & REST Specs'
				)
			),
			activeTab === 'keys' &&
				el( KeysManager, {
					keys,
					users,
					currentUserId: config.currentUserId,
					loading,
					onRefresh: fetchDashboardData,
				} ),
			activeTab === 'logs' &&
				el( AuditLogs, {
					logs,
					total: totalLogs,
					loading,
					onRefresh: fetchDashboardData,
				} ),
			activeTab === 'mcp' && el( McpDocs, { config } )
		);
	}

	const container = document.getElementById( 'agentpress-admin-root' );
	if ( container ) {
		if ( typeof createRoot === 'function' ) {
			createRoot( container ).render( el( App ) );
		} else {
			render( el( App ), container );
		}
	}
} )( window.wp );
