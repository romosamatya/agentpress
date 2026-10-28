( function ( wp ) {
	'use strict';

	const { createElement: el, useState, useEffect, useCallback, createRoot, render } = wp.element;
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

	function SettingsPanel( { settings, onSaved } ) {
		const [ defaultStatus, setDefaultStatus ] = useState( ( settings && settings.default_post_status ) || 'draft' );
		const [ allowOverride, setAllowOverride ] = useState(
			settings && settings.allow_status_override !== undefined ? settings.allow_status_override : true
		);
		const [ renderFrontend, setRenderFrontend ] = useState(
			settings && settings.render_markdown_frontend !== undefined ? settings.render_markdown_frontend : true
		);
		const [ saving, setSaving ] = useState( false );
		const [ savedNotice, setSavedNotice ] = useState( false );
		const [ saveError, setSaveError ] = useState( null );

		useEffect( () => {
			if ( settings ) {
				setDefaultStatus( settings.default_post_status || 'draft' );
				setAllowOverride( settings.allow_status_override !== undefined ? settings.allow_status_override : true );
				setRenderFrontend( settings.render_markdown_frontend !== undefined ? settings.render_markdown_frontend : true );
			}
		}, [ settings ] );

		const handleSave = async ( e ) => {
			e.preventDefault();
			setSaving( true );
			setSavedNotice( false );
			setSaveError( null );
			try {
				await apiFetch( {
					path: '/agentpress/v1/admin/settings',
					method: 'POST',
					data: {
						default_post_status: defaultStatus,
						allow_status_override: allowOverride,
						render_markdown_frontend: renderFrontend,
					},
				} );
				setSavedNotice( true );
				if ( onSaved ) {
					onSaved();
				}
				setTimeout( () => setSavedNotice( false ), 3000 );
			} catch ( err ) {
				setSaveError( ( err && err.message ) || 'Failed to save settings.' );
			} finally {
				setSaving( false );
			}
		};

		const statusOptions = [
			{
				value: 'draft',
				title: 'Save as Draft (Editorial Review)',
				desc: 'AI-generated posts land in Drafts so a human editor can review before publishing.',
			},
			{
				value: 'publish',
				title: 'Publish Immediately (Auto-Post Live)',
				desc: 'Hands-off automation: AI-generated articles go live on your site immediately.',
			},
			{
				value: 'pending',
				title: 'Pending Review',
				desc: 'Places AI-generated posts into the WordPress Pending Review queue.',
			},
		];

		return el(
			'div',
			{ className: 'ap-card ap-space-y' },
			el(
				'div',
				null,
				el( 'h2', { className: 'ap-card-title' }, 'AI Agent Publishing & Workflow Settings' ),
				el(
					'p',
					{ className: 'ap-card-subtitle' },
					'Choose whether posts created by external AI agents (n8n, Make.com, Ollama, Antigravity) are published live immediately or saved as drafts.'
				)
			),
			savedNotice &&
				el(
					'div',
					{ className: 'ap-alert-success' },
					'Settings saved! Incoming AI agent requests will now follow this policy.'
				),
			saveError && el( 'div', { className: 'ap-alert-error' }, saveError ),
			el(
				'form',
				{ onSubmit: handleSave, className: 'ap-space-y' },
				el(
					'div',
					null,
					el( 'label', { className: 'ap-label' }, '1. Default Post Status for AI Agents' ),
					el(
						'div',
						{ className: 'ap-radio-grid' },
						statusOptions.map( ( opt ) =>
							el(
								'label',
								{
									key: opt.value,
									className:
										'ap-radio-card ' +
										( defaultStatus === opt.value ? 'ap-radio-card-active' : '' ),
								},
								el(
									'div',
									{ className: 'ap-radio-header' },
									el( 'input', {
										type: 'radio',
										name: 'default_post_status',
										value: opt.value,
										checked: defaultStatus === opt.value,
										onChange: () => setDefaultStatus( opt.value ),
									} ),
									el( 'strong', null, opt.title )
								),
								el( 'p', { className: 'ap-radio-desc' }, opt.desc )
							)
						)
					)
				),
				el(
					'div',
					{ className: 'ap-setting-toggle' },
					el(
						'label',
						{ className: 'ap-checkbox-label' },
						el( 'input', {
							type: 'checkbox',
							checked: !! allowOverride,
							onChange: ( e ) => setAllowOverride( e.target.checked ),
						} ),
						el(
							'span',
							null,
							el( 'strong', null, 'Allow API call to specify status ("status": "publish" | "draft")' ),
							el(
								'span',
								{ className: 'ap-toggle-sub' },
								' — When checked, n8n/Make can pass "status": "publish" or "status": "draft" per request (or omit it to use your Default Status above). Uncheck to strictly enforce the Default Status above for all AI bots.'
							)
						)
					)
				),
				el(
					'div',
					{ className: 'ap-setting-toggle' },
					el(
						'label',
						{ className: 'ap-checkbox-label' },
						el( 'input', {
							type: 'checkbox',
							checked: !! renderFrontend,
							onChange: ( e ) => setRenderFrontend( e.target.checked ),
						} ),
						el(
							'span',
							null,
							el( 'strong', null, 'Auto-convert AI Markdown into formatted HTML for blog readers' ),
							el(
								'span',
								{ className: 'ap-toggle-sub' },
								' — Converts headings, bold text, lists, and links into clean HTML on your public blog while keeping 100% pure Markdown in the AgentPress API.'
							)
						)
					)
				),
				el(
					'div',
					null,
					el(
						'button',
						{ type: 'submit', disabled: saving, className: 'ap-btn-primary' },
						saving ? 'Saving Settings...' : 'Save Publishing Settings'
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
						'/memory   (Payload: { "title", "content_markdown", "status": "publish"|"draft", "meta" })\n' +
						'GET  ' +
						restUrl +
						'/mcp\n' +
						'POST ' +
						restUrl +
						'/mcp      (Tools: read_wp_memory, write_wp_draft)\n\n' +
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
		const [ settings, setSettings ] = useState( {
			default_post_status: 'draft',
			allow_status_override: true,
			render_markdown_frontend: true,
		} );
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
				const [ keysRes, usersRes, logsRes, settingsRes ] = await Promise.all( [
					apiFetch( { path: '/agentpress/v1/admin/keys' } ),
					apiFetch( { path: '/agentpress/v1/admin/users' } ),
					apiFetch( { path: '/agentpress/v1/admin/logs?limit=50' } ),
					apiFetch( { path: '/agentpress/v1/admin/settings' } ),
				] );
				setKeys( ( keysRes && keysRes.keys ) || [] );
				setUsers( ( usersRes && usersRes.users ) || [] );
				setLogs( ( logsRes && logsRes.logs ) || [] );
				setTotalLogs( ( logsRes && logsRes.total ) || 0 );
				if ( settingsRes && settingsRes.settings ) {
					setSettings( settingsRes.settings );
				}
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
						className: 'ap-tab ' + ( activeTab === 'settings' ? 'ap-tab-active' : '' ),
						onClick: () => setActiveTab( 'settings' ),
					},
					'Publishing Settings (' + ( settings.default_post_status || 'draft' ).toUpperCase() + ')'
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
			activeTab === 'settings' &&
				el( SettingsPanel, {
					settings,
					onSaved: fetchDashboardData,
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
