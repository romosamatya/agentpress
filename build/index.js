( function ( wp ) {
	'use strict';

	const { createElement: el, useState, useEffect, useCallback, createRoot, render } = wp.element;
	const apiFetch = wp.apiFetch;

	function KeysManager( { keys, users, currentUserId, loading, onRefresh } ) {
		const [ showCreate, setShowCreate ] = useState( keys.length === 0 );
		const [ keyName, setKeyName ] = useState( '' );
		const [ selectedUserId, setSelectedUserId ] = useState( currentUserId || ( users[ 0 ] && users[ 0 ].id ) || 1 );
		const [ permissions, setPermissions ] = useState( { read: true, write: true, admin: false } );
		const [ newlyCreatedKey, setNewlyCreatedKey ] = useState( null );
		const [ submitting, setSubmitting ] = useState( false );
		const [ actionError, setActionError ] = useState( null );
		const [ copied, setCopied ] = useState( false );
		const [ filterStatus, setFilterStatus ] = useState( 'all' );

		const togglePerm = ( perm ) => {
			setPermissions( ( prev ) => ( { ...prev, [ perm ]: ! prev[ perm ] } ) );
		};

		const handleGenerateKey = async ( e ) => {
			e.preventDefault();
			setActionError( null );
			setNewlyCreatedKey( null );

			const activePerms = Object.keys( permissions ).filter( ( k ) => permissions[ k ] );
			if ( ! keyName.trim() ) {
				setActionError( 'Enter a key name.' );
				return;
			}
			if ( activePerms.length === 0 ) {
				setActionError( 'Select at least one permission scope.' );
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
				setShowCreate( false );
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
				setActionError( ( err && err.message ) || 'Failed to update key.' );
			}
		};

		const copyText = async ( text ) => {
			try {
				await navigator.clipboard.writeText( text );
				setCopied( true );
				setTimeout( () => setCopied( false ), 2000 );
			} catch ( _e ) {}
		};

		const filteredKeys = keys.filter( ( k ) => {
			if ( filterStatus === 'all' ) return true;
			return k.status === filterStatus;
		} );

		return el(
			'div',
			null,
			newlyCreatedKey &&
				el(
					'div',
					{ className: 'ap-secret-banner' },
					el(
						'div',
						{ className: 'ap-secret-header' },
						el( 'span', null, 'Save your secret key — "' + newlyCreatedKey.name + '"' ),
						el(
							'button',
							{
								type: 'button',
								className: 'ap-btn ap-btn-secondary ap-btn-sm',
								onClick: () => setNewlyCreatedKey( null ),
							},
							'Done'
						)
					),
					el(
						'p',
						{ className: 'ap-secret-sub' },
						'This token will not be shown again. Only its SHA-256 digest is stored in the database.'
					),
					el(
						'div',
						{ className: 'ap-secret-row' },
						el( 'code', { className: 'ap-secret-code' }, newlyCreatedKey.api_key ),
						el(
							'button',
							{
								type: 'button',
								className: 'ap-btn ap-btn-primary',
								onClick: () => copyText( newlyCreatedKey.api_key ),
							},
							copied ? 'Copied' : 'Copy key'
						)
					)
				),
			actionError &&
				el(
					'div',
					{ className: 'ap-notice ap-notice-error' },
					el( 'span', null, actionError ),
					el(
						'button',
						{
							type: 'button',
							className: 'ap-btn ap-btn-secondary ap-btn-sm',
							onClick: () => setActionError( null ),
						},
						'Dismiss'
					)
				),
			el(
				'div',
				{ className: 'ap-surface' },
				el(
					'div',
					{ className: 'ap-surface-header' },
					el(
						'div',
						null,
						el( 'h2', { className: 'ap-surface-title' }, 'Secret keys' ),
						el(
							'p',
							{ className: 'ap-surface-desc' },
							'Bearer tokens used by external agents to authenticate with /wp-json/agentpress/v1.'
						)
					),
					el(
						'div',
						{ className: 'ap-topbar-actions' },
						el(
							'div',
							{ className: 'ap-segmented' },
							[ 'all', 'active', 'revoked' ].map( ( st ) =>
								el(
									'button',
									{
										key: st,
										type: 'button',
										className: 'ap-seg-btn ' + ( filterStatus === st ? 'ap-seg-btn-active' : '' ),
										onClick: () => setFilterStatus( st ),
									},
									st.charAt( 0 ).toUpperCase() + st.slice( 1 )
								)
							)
						),
						el(
							'button',
							{
								type: 'button',
								className: 'ap-btn ' + ( showCreate ? 'ap-btn-secondary' : 'ap-btn-primary' ),
								onClick: () => setShowCreate( ! showCreate ),
							},
							showCreate ? 'Cancel' : '+ Create secret key'
						)
					)
				),
				showCreate &&
					el(
						'form',
						{ onSubmit: handleGenerateKey, className: 'ap-create-bar' },
						el(
							'div',
							{ className: 'ap-create-grid' },
							el(
								'div',
								null,
								el( 'label', { className: 'ap-field-label' }, 'Name' ),
								el( 'input', {
									type: 'text',
									className: 'ap-input',
									placeholder: 'e.g. n8n News Pipeline',
									value: keyName,
									onChange: ( e ) => setKeyName( e.target.value ),
									autoFocus: true,
								} )
							),
							el(
								'div',
								null,
								el( 'label', { className: 'ap-field-label' }, 'WordPress user' ),
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
								null,
								el( 'label', { className: 'ap-field-label' }, 'Scopes' ),
								el(
									'div',
									{ className: 'ap-scope-group' },
									[ 'read', 'write', 'admin' ].map( ( scope ) =>
										el(
											'button',
											{
												key: scope,
												type: 'button',
												className:
													'ap-scope-btn ' + ( permissions[ scope ] ? 'ap-scope-btn-on' : '' ),
												onClick: () => togglePerm( scope ),
											},
											( permissions[ scope ] ? '✓ ' : '' ) + scope
										)
									)
								)
							),
							el(
								'div',
								null,
								el(
									'button',
									{ type: 'submit', disabled: submitting, className: 'ap-btn ap-btn-primary' },
									submitting ? 'Creating…' : 'Create key'
								)
							)
						)
					),
				loading
					? el( 'div', { className: 'ap-empty' }, 'Loading keys…' )
					: filteredKeys.length === 0
					? el(
							'div',
							{ className: 'ap-empty' },
							'No keys match the current filter. Click "+ Create secret key" to generate one.'
					  )
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
									el( 'th', null, 'Secret key' ),
									el( 'th', null, 'User' ),
									el( 'th', null, 'Scopes' ),
									el( 'th', null, 'Last used' ),
									el( 'th', null, 'Status' ),
									el( 'th', { className: 'ap-right' }, '' )
								)
							),
							el(
								'tbody',
								null,
								filteredKeys.map( ( item ) =>
									el(
										'tr',
										{ key: item.id },
										el( 'td', { style: { fontWeight: 500 } }, item.name ),
										el(
											'td',
											null,
											el( 'code', { className: 'ap-key-chip' }, item.key_prefix + '••••••••' )
										),
										el(
											'td',
											{ className: 'ap-muted' },
											'@' + item.agent_username
										),
										el(
											'td',
											null,
											( item.permissions || [] ).map( ( perm ) =>
												el( 'span', { key: perm, className: 'ap-tag' }, perm )
											)
										),
										el(
											'td',
											{ className: 'ap-mono ap-muted' },
											item.last_used ? item.last_used.replace( ' ', ' · ' ) : 'Never'
										),
										el(
											'td',
											null,
											el(
												'span',
												{ className: 'ap-status-inline' },
												el( 'span', {
													className:
														'ap-dot ' +
														( item.status === 'active' ? 'ap-dot-green' : 'ap-dot-gray' ),
												} ),
												item.status === 'active' ? 'Active' : 'Revoked'
											)
										),
										el(
											'td',
											{ className: 'ap-right' },
											item.status === 'active' &&
												el(
													'button',
													{
														type: 'button',
														className: 'ap-btn ap-btn-secondary ap-btn-sm',
														style: { marginRight: '6px' },
														onClick: () => handleRevoke( item.id, false ),
													},
													'Revoke'
												),
											el(
												'button',
												{
													type: 'button',
													className: 'ap-btn ap-btn-ghost-danger ap-btn-sm',
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

		useEffect( () => {
			if ( settings ) {
				setDefaultStatus( settings.default_post_status || 'draft' );
				setAllowOverride( settings.allow_status_override !== undefined ? settings.allow_status_override : true );
				setRenderFrontend( settings.render_markdown_frontend !== undefined ? settings.render_markdown_frontend : true );
			}
		}, [ settings ] );

		const persist = async ( next ) => {
			setSaving( true );
			setSavedNotice( false );
			try {
				await apiFetch( {
					path: '/agentpress/v1/admin/settings',
					method: 'POST',
					data: next,
				} );
				setSavedNotice( true );
				if ( onSaved ) onSaved();
				setTimeout( () => setSavedNotice( false ), 2000 );
			} finally {
				setSaving( false );
			}
		};

		const onChangeStatus = ( st ) => {
			setDefaultStatus( st );
			persist( {
				default_post_status: st,
				allow_status_override: allowOverride,
				render_markdown_frontend: renderFrontend,
			} );
		};

		const onToggleOverride = () => {
			const nextVal = ! allowOverride;
			setAllowOverride( nextVal );
			persist( {
				default_post_status: defaultStatus,
				allow_status_override: nextVal,
				render_markdown_frontend: renderFrontend,
			} );
		};

		const onToggleRender = () => {
			const nextVal = ! renderFrontend;
			setRenderFrontend( nextVal );
			persist( {
				default_post_status: defaultStatus,
				allow_status_override: allowOverride,
				render_markdown_frontend: nextVal,
			} );
		};

		return el(
			'div',
			null,
			savedNotice &&
				el(
					'div',
					{ className: 'ap-notice ap-notice-ok' },
					el( 'span', null, 'Preferences updated.' ),
					el( 'span', { className: 'ap-mono' }, saving ? 'Saving…' : 'Saved' )
				),
			el(
				'div',
				{ className: 'ap-surface' },
				el(
					'div',
					{ className: 'ap-surface-header' },
					el(
						'div',
						null,
						el( 'h2', { className: 'ap-surface-title' }, 'Publishing behavior' ),
						el(
							'p',
							{ className: 'ap-surface-desc' },
							'Configure how incoming articles from n8n, Make, or MCP tools are published and rendered.'
						)
					)
				),
				el(
					'div',
					{ className: 'ap-setting-row' },
					el(
						'div',
						{ className: 'ap-setting-info' },
						el( 'h3', { className: 'ap-setting-label' }, 'Default post status' ),
						el(
							'p',
							{ className: 'ap-setting-help' },
							'Status assigned to new posts created via POST /wp-json/agentpress/v1/memory when no status is specified (or when override is disabled below).'
						)
					),
					el(
						'div',
						{ className: 'ap-segmented' },
						[
							{ id: 'draft', label: 'Draft' },
							{ id: 'pending', label: 'Pending' },
							{ id: 'publish', label: 'Publish live' },
						].map( ( opt ) =>
							el(
								'button',
								{
									key: opt.id,
									type: 'button',
									className:
										'ap-seg-btn ' + ( defaultStatus === opt.id ? 'ap-seg-btn-active' : '' ),
									onClick: () => onChangeStatus( opt.id ),
								},
								opt.label
							)
						)
					)
				),
				el(
					'div',
					{ className: 'ap-setting-row' },
					el(
						'div',
						{ className: 'ap-setting-info' },
						el( 'h3', { className: 'ap-setting-label' }, 'Allow API payload to override status' ),
						el(
							'p',
							{ className: 'ap-setting-help' },
							'When enabled, requests containing {"status": "publish"} or {"status": "draft"} set their own status. Turn off to force every bot to use the Default post status above.'
						)
					),
					el(
						'button',
						{
							type: 'button',
							role: 'switch',
							'aria-checked': !! allowOverride,
							className: 'ap-switch ' + ( allowOverride ? 'ap-switch-on' : 'ap-switch-off' ),
							onClick: onToggleOverride,
						},
						el( 'span', { className: 'ap-switch-thumb' } )
					)
				),
				el(
					'div',
					{ className: 'ap-setting-row' },
					el(
						'div',
						{ className: 'ap-setting-info' },
						el( 'h3', { className: 'ap-setting-label' }, 'Render Markdown to HTML on frontend' ),
						el(
							'p',
							{ className: 'ap-setting-help' },
							'Converts Markdown headings, lists, links, and code blocks into semantic HTML for visitors while serving pure Markdown over the API.'
						)
					),
					el(
						'button',
						{
							type: 'button',
							role: 'switch',
							'aria-checked': !! renderFrontend,
							className: 'ap-switch ' + ( renderFrontend ? 'ap-switch-on' : 'ap-switch-off' ),
							onClick: onToggleRender,
						},
						el( 'span', { className: 'ap-switch-thumb' } )
					)
				)
			)
		);
	}

	function AuditLogs( { logs, total, loading, onRefresh } ) {
		const [ methodFilter, setMethodFilter ] = useState( 'ALL' );

		const formatBytes = ( bytes ) => {
			const n = Number( bytes ) || 0;
			return n < 1024 ? n + ' B' : ( n / 1024 ).toFixed( 1 ) + ' KB';
		};

		const filtered = logs.filter( ( l ) => {
			if ( methodFilter === 'ALL' ) return true;
			return l.request_method === methodFilter;
		} );

		return el(
			'div',
			{ className: 'ap-surface' },
			el(
				'div',
				{ className: 'ap-surface-header' },
				el(
					'div',
					null,
					el( 'h2', { className: 'ap-surface-title' }, 'Request log' ),
					el(
						'p',
						{ className: 'ap-surface-desc' },
						total + ' total requests recorded in wp_agentpress_logs.'
					)
				),
				el(
					'div',
					{ className: 'ap-topbar-actions' },
					el(
						'div',
						{ className: 'ap-segmented' },
						[ 'ALL', 'GET', 'POST' ].map( ( m ) =>
							el(
								'button',
								{
									key: m,
									type: 'button',
									className: 'ap-seg-btn ' + ( methodFilter === m ? 'ap-seg-btn-active' : '' ),
									onClick: () => setMethodFilter( m ),
								},
								m
							)
						)
					),
					el(
						'button',
						{ type: 'button', onClick: onRefresh, className: 'ap-btn ap-btn-secondary' },
						'Refresh'
					)
				)
			),
			loading
				? el( 'div', { className: 'ap-empty' }, 'Loading request logs…' )
				: filtered.length === 0
				? el( 'div', { className: 'ap-empty' }, 'No API requests recorded yet.' )
				: el(
						'table',
						{ className: 'ap-table' },
						el(
							'thead',
							null,
							el(
								'tr',
								null,
								el( 'th', null, 'Status' ),
								el( 'th', null, 'Method' ),
								el( 'th', null, 'Route' ),
								el( 'th', null, 'Key / User' ),
								el( 'th', null, 'Size' ),
								el( 'th', { className: 'ap-right' }, 'Time (UTC)' )
							)
						),
						el(
							'tbody',
							null,
							filtered.map( ( log ) =>
								el(
									'tr',
									{ key: log.id },
									el(
										'td',
										{ className: 'ap-mono' },
										el(
											'span',
											{ className: 'ap-status-inline' },
											el( 'span', {
												className:
													'ap-dot ' +
													( log.status_code >= 200 && log.status_code < 300
														? 'ap-dot-green'
														: 'ap-dot-amber' ),
											} ),
											String( log.status_code )
										)
									),
									el( 'td', null, el( 'span', { className: 'ap-tag' }, log.request_method ) ),
									el( 'td', { className: 'ap-mono' }, log.endpoint ),
									el(
										'td',
										{ className: 'ap-muted' },
										log.key_name
											? log.key_name + ' (@' + log.agent_username + ')'
											: '@' + log.agent_username
									),
									el( 'td', { className: 'ap-mono ap-muted' }, formatBytes( log.payload_size ) ),
									el( 'td', { className: 'ap-mono ap-muted ap-right' }, log.timestamp )
								)
							)
						)
				  )
		);
	}

	function McpDocs( { config } ) {
		const restUrl = config.restUrl || window.location.origin + '/wp-json/agentpress/v1';
		const [ snippetTab, setSnippetTab ] = useState( 'write' );
		const [ copied, setCopied ] = useState( false );

		const snippets = {
			write:
				'curl -X POST "' +
				restUrl +
				'/memory" \\\n' +
				'  -H "Authorization: Bearer ap_live_<your_secret_key>" \\\n' +
				'  -H "Content-Type: application/json" \\\n' +
				"  -d '{\n" +
				'    "title": "Industry News Digest",\n' +
				'    "content_markdown": "## Summary\\n\\nClean Markdown body written by n8n or Make.",\n' +
				'    "status": "draft",\n' +
				'    "meta": {\n' +
				'      "author": "News Bot",\n' +
				'      "citations": ["https://example.com/source"],\n' +
				'      "review_date": "2026-10-28"\n' +
				'    }\n' +
				"  }'",
			read:
				'curl -X GET "' +
				restUrl +
				'/memory?post_type=post&limit=10" \\\n' +
				'  -H "Authorization: Bearer ap_live_<your_secret_key>"',
			mcp:
				'curl -X POST "' +
				restUrl +
				'/mcp" \\\n' +
				'  -H "Authorization: Bearer ap_live_<your_secret_key>" \\\n' +
				'  -H "Content-Type: application/json" \\\n' +
				"  -d '{\n" +
				'    "jsonrpc": "2.0",\n' +
				'    "id": 1,\n' +
				'    "method": "tools/call",\n' +
				'    "params": {\n' +
				'      "name": "read_wp_memory",\n' +
				'      "arguments": { "post_type": "post", "limit": 5 }\n' +
				'    }\n' +
				"  }'",
		};

		const copySnippet = async () => {
			try {
				await navigator.clipboard.writeText( snippets[ snippetTab ] );
				setCopied( true );
				setTimeout( () => setCopied( false ), 1800 );
			} catch ( _e ) {}
		};

		return el(
			'div',
			null,
			el(
				'div',
				{ className: 'ap-surface' },
				el(
					'div',
					{ className: 'ap-surface-header' },
					el(
						'div',
						null,
						el( 'h2', { className: 'ap-surface-title' }, 'Endpoints & MCP tools' ),
						el(
							'p',
							{ className: 'ap-surface-desc' },
							'All routes require an Authorization: Bearer ap_live_<key> header.'
						)
					)
				),
				el(
					'table',
					{ className: 'ap-table' },
					el(
						'thead',
						null,
						el(
							'tr',
							null,
							el( 'th', null, 'Method' ),
							el( 'th', null, 'URL' ),
							el( 'th', null, 'Scope' ),
							el( 'th', null, 'Description' )
						)
					),
					el(
						'tbody',
						null,
						el(
							'tr',
							null,
							el( 'td', null, el( 'span', { className: 'ap-tag' }, 'GET' ) ),
							el( 'td', { className: 'ap-mono' }, restUrl + '/memory' ),
							el( 'td', null, el( 'span', { className: 'ap-tag' }, 'read' ) ),
							el( 'td', { className: 'ap-muted' }, 'Fetch posts in clean Markdown with RAG metadata.' )
						),
						el(
							'tr',
							null,
							el( 'td', null, el( 'span', { className: 'ap-tag' }, 'POST' ) ),
							el( 'td', { className: 'ap-mono' }, restUrl + '/memory' ),
							el( 'td', null, el( 'span', { className: 'ap-tag' }, 'write' ) ),
							el( 'td', { className: 'ap-muted' }, 'Create or update a post from Markdown.' )
						),
						el(
							'tr',
							null,
							el( 'td', null, el( 'span', { className: 'ap-tag' }, 'POST' ) ),
							el( 'td', { className: 'ap-mono' }, restUrl + '/mcp' ),
							el( 'td', null, el( 'span', { className: 'ap-tag' }, 'read / write' ) ),
							el(
								'td',
								{ className: 'ap-muted' },
								'JSON-RPC 2.0 endpoint exposing read_wp_memory and write_wp_draft.'
							)
						)
					)
				)
			),
			el(
				'div',
				{ className: 'ap-surface' },
				el(
					'div',
					{ className: 'ap-code-tabs' },
					el(
						'div',
						{ className: 'ap-segmented' },
						[
							{ id: 'write', label: 'POST /memory (Create post)' },
							{ id: 'read', label: 'GET /memory (Read RAG)' },
							{ id: 'mcp', label: 'POST /mcp (JSON-RPC)' },
						].map( ( t ) =>
							el(
								'button',
								{
									key: t.id,
									type: 'button',
									className: 'ap-seg-btn ' + ( snippetTab === t.id ? 'ap-seg-btn-active' : '' ),
									onClick: () => setSnippetTab( t.id ),
								},
								t.label
							)
						)
					),
					el(
						'button',
						{ type: 'button', onClick: copySnippet, className: 'ap-btn ap-btn-secondary ap-btn-sm' },
						copied ? 'Copied' : 'Copy snippet'
					)
				),
				el( 'pre', { className: 'ap-pre' }, snippets[ snippetTab ] )
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
				setError( ( err && err.message ) || 'Failed to load dashboard data.' );
			} finally {
				setLoading( false );
			}
		}, [] );

		useEffect( () => {
			fetchDashboardData();
		}, [ fetchDashboardData ] );

		const activeKeysCount = keys.filter( ( k ) => k.status === 'active' ).length;

		return el(
			'div',
			{ className: 'ap-shell' },
			el(
				'div',
				{ className: 'ap-topbar' },
				el(
					'div',
					null,
					el(
						'div',
						{ className: 'ap-title-row' },
						el( 'h1', { className: 'ap-title' }, 'AgentPress' ),
						el( 'span', { className: 'ap-version' }, 'v' + config.version )
					),
					el(
						'p',
						{ className: 'ap-subtitle' },
						'Markdown REST API & Model Context Protocol (MCP) server for WordPress.'
					)
				),
				el(
					'div',
					{ className: 'ap-topbar-actions' },
					el(
						'button',
						{
							type: 'button',
							className: 'ap-status-chip',
							onClick: () => setActiveTab( 'settings' ),
							title: 'Click to change default post status',
						},
						el( 'span', {
							className:
								'ap-dot ' +
								( settings.default_post_status === 'publish' ? 'ap-dot-green' : 'ap-dot-amber' ),
						} ),
						'Default status: ',
						el(
							'strong',
							null,
							settings.default_post_status === 'publish'
								? 'Auto-Publish'
								: settings.default_post_status.charAt( 0 ).toUpperCase() +
								  settings.default_post_status.slice( 1 )
						)
					)
				)
			),
			error &&
				el(
					'div',
					{ className: 'ap-notice ap-notice-error' },
					el( 'span', null, error ),
					el(
						'button',
						{
							type: 'button',
							className: 'ap-btn ap-btn-secondary ap-btn-sm',
							onClick: fetchDashboardData,
						},
						'Retry'
					)
				),
			el(
				'nav',
				{ className: 'ap-nav' },
				el(
					'button',
					{
						type: 'button',
						className: 'ap-nav-item ' + ( activeTab === 'keys' ? 'ap-nav-item-active' : '' ),
						onClick: () => setActiveTab( 'keys' ),
					},
					'API Keys',
					el( 'span', { className: 'ap-nav-count' }, String( activeKeysCount ) )
				),
				el(
					'button',
					{
						type: 'button',
						className: 'ap-nav-item ' + ( activeTab === 'settings' ? 'ap-nav-item-active' : '' ),
						onClick: () => setActiveTab( 'settings' ),
					},
					'Publishing'
				),
				el(
					'button',
					{
						type: 'button',
						className: 'ap-nav-item ' + ( activeTab === 'logs' ? 'ap-nav-item-active' : '' ),
						onClick: () => setActiveTab( 'logs' ),
					},
					'Activity Log',
					el( 'span', { className: 'ap-nav-count' }, String( totalLogs ) )
				),
				el(
					'button',
					{
						type: 'button',
						className: 'ap-nav-item ' + ( activeTab === 'mcp' ? 'ap-nav-item-active' : '' ),
						onClick: () => setActiveTab( 'mcp' ),
					},
					'Endpoints & MCP'
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
