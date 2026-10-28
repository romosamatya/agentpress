import { useState, useEffect, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import KeysManager from './components/KeysManager';
import AuditLogs from './components/AuditLogs';
import McpDocs from './components/McpDocs';

export default function App() {
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
			setKeys( keysRes?.keys || [] );
			setUsers( usersRes?.users || [] );
			setLogs( logsRes?.logs || [] );
			setTotalLogs( logsRes?.total || 0 );
		} catch ( err ) {
			setError( err?.message || 'Failed to load AgentPress dashboard data.' );
		} finally {
			setLoading( false );
		}
	}, [] );

	useEffect( () => {
		fetchDashboardData();
	}, [ fetchDashboardData ] );

	const activeKeysCount = keys.filter( ( k ) => k.status === 'active' ).length;

	return (
		<div className="max-w-6xl mx-auto py-6 pr-6 text-slate-800">
			{ /* Header Banner */ }
			<div className="bg-slate-900 text-white rounded-xl p-6 mb-6 shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4">
				<div>
					<div className="flex items-center gap-3">
						<span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 font-mono font-bold text-lg border border-emerald-500/30">
							AP
						</span>
						<h1 className="text-2xl font-bold text-white m-0 tracking-tight">
							AgentPress
						</h1>
						<span className="text-xs font-mono uppercase px-2.5 py-0.5 rounded-full bg-slate-800 text-emerald-400 border border-slate-700">
							v{ config.version } • MCP Ready
						</span>
					</div>
					<p className="text-slate-300 text-sm mt-2 mb-0 max-w-2xl">
						Headless Model Context Protocol (MCP) server &amp; token-efficient Markdown memory bank for external AI agents (Antigravity, n8n, Make.com, Ollama).
					</p>
				</div>

				<div className="flex items-center gap-4">
					<div className="bg-slate-800/90 border border-slate-700 rounded-lg px-4 py-2.5 text-right">
						<div className="text-xs text-slate-400 uppercase tracking-wider">Active Keys</div>
						<div className="text-xl font-bold text-emerald-400">{ activeKeysCount }</div>
					</div>
					<div className="bg-slate-800/90 border border-slate-700 rounded-lg px-4 py-2.5 text-right">
						<div className="text-xs text-slate-400 uppercase tracking-wider">Audit Events</div>
						<div className="text-xl font-bold text-sky-400">{ totalLogs }</div>
					</div>
				</div>
			</div>

			{ error && (
				<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
					<span>{ error }</span>
					<button
						type="button"
						onClick={ fetchDashboardData }
						className="text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded border-0 cursor-pointer"
					>
						Retry
					</button>
				</div>
			) }

			{ /* Navigation Tabs */ }
			<div className="flex border-b border-slate-200 mb-6 gap-2">
				<button
					type="button"
					onClick={ () => setActiveTab( 'keys' ) }
					className={ `px-4 py-2.5 font-medium text-sm rounded-t-lg border-0 cursor-pointer transition-colors ${
						activeTab === 'keys'
							? 'bg-white text-slate-900 border-b-2 border-emerald-600 shadow-sm font-semibold'
							: 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
					}` }
				>
					API Keys &amp; Agent Auth ({ keys.length })
				</button>
				<button
					type="button"
					onClick={ () => setActiveTab( 'logs' ) }
					className={ `px-4 py-2.5 font-medium text-sm rounded-t-lg border-0 cursor-pointer transition-colors ${
						activeTab === 'logs'
							? 'bg-white text-slate-900 border-b-2 border-emerald-600 shadow-sm font-semibold'
							: 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
					}` }
				>
					Agent Audit Logs ({ totalLogs })
				</button>
				<button
					type="button"
					onClick={ () => setActiveTab( 'mcp' ) }
					className={ `px-4 py-2.5 font-medium text-sm rounded-t-lg border-0 cursor-pointer transition-colors ${
						activeTab === 'mcp'
							? 'bg-white text-slate-900 border-b-2 border-emerald-600 shadow-sm font-semibold'
							: 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100'
					}` }
				>
					MCP Server &amp; REST Specs
				</button>
			</div>

			{ /* Tab Panels */ }
			{ activeTab === 'keys' && (
				<KeysManager
					keys={ keys }
					users={ users }
					currentUserId={ config.currentUserId }
					loading={ loading }
					onRefresh={ fetchDashboardData }
				/>
			) }

			{ activeTab === 'logs' && (
				<AuditLogs
					logs={ logs }
					total={ totalLogs }
					loading={ loading }
					onRefresh={ fetchDashboardData }
				/>
			) }

			{ activeTab === 'mcp' && (
				<McpDocs config={ config } />
			) }
		</div>
	);
}
