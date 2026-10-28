import { useState, useEffect } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

export default function SettingsPanel( { settings, onSaved } ) {
	const [ defaultStatus, setDefaultStatus ] = useState( settings?.default_post_status || 'draft' );
	const [ allowOverride, setAllowOverride ] = useState(
		settings?.allow_status_override !== undefined ? settings.allow_status_override : true
	);
	const [ renderFrontend, setRenderFrontend ] = useState(
		settings?.render_markdown_frontend !== undefined ? settings.render_markdown_frontend : true
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
			setSaveError( err?.message || 'Failed to save publishing settings.' );
		} finally {
			setSaving( false );
		}
	};

	return (
		<div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
			<div>
				<h2 className="text-lg font-bold text-slate-900 mt-0 mb-1">
					AI Agent Publishing &amp; Workflow Settings
				</h2>
				<p className="text-sm text-slate-500 m-0">
					Control whether posts created by external AI agents (n8n, Make.com, Ollama, Antigravity) are published live immediately or saved as drafts for human review.
				</p>
			</div>

			{ savedNotice && (
				<div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg font-medium">
					Settings saved! All incoming agent requests will immediately follow this policy.
				</div>
			) }

			{ saveError && (
				<div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
					{ saveError }
				</div>
			) }

			<form onSubmit={ handleSave } className="space-y-5">
				<div>
					<label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
						1. Default Post Status for AI Agents
					</label>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
						<label
							className={ `p-4 rounded-xl border-2 cursor-pointer transition-all ${
								defaultStatus === 'draft'
									? 'border-emerald-600 bg-emerald-50/50'
									: 'border-slate-200 hover:border-slate-300'
							}` }
						>
							<div className="flex items-center gap-2 font-bold text-slate-900 text-sm mb-1">
								<input
									type="radio"
									name="default_post_status"
									value="draft"
									checked={ defaultStatus === 'draft' }
									onChange={ () => setDefaultStatus( 'draft' ) }
								/>
								<span>Save as Draft (Editorial Review)</span>
							</div>
							<p className="text-xs text-slate-600 m-0">
								AI-generated articles land in Drafts so a human can review before publishing.
							</p>
						</label>

						<label
							className={ `p-4 rounded-xl border-2 cursor-pointer transition-all ${
								defaultStatus === 'publish'
									? 'border-emerald-600 bg-emerald-50/50'
									: 'border-slate-200 hover:border-slate-300'
							}` }
						>
							<div className="flex items-center gap-2 font-bold text-slate-900 text-sm mb-1">
								<input
									type="radio"
									name="default_post_status"
									value="publish"
									checked={ defaultStatus === 'publish' }
									onChange={ () => setDefaultStatus( 'publish' ) }
								/>
								<span>Publish Immediately (Auto-Post Live)</span>
							</div>
							<p className="text-xs text-slate-600 m-0">
								Hands-off automation: AI-generated articles go live on your site immediately.
							</p>
						</label>

						<label
							className={ `p-4 rounded-xl border-2 cursor-pointer transition-all ${
								defaultStatus === 'pending'
									? 'border-emerald-600 bg-emerald-50/50'
									: 'border-slate-200 hover:border-slate-300'
							}` }
						>
							<div className="flex items-center gap-2 font-bold text-slate-900 text-sm mb-1">
								<input
									type="radio"
									name="default_post_status"
									value="pending"
									checked={ defaultStatus === 'pending' }
									onChange={ () => setDefaultStatus( 'pending' ) }
								/>
								<span>Pending Review</span>
							</div>
							<p className="text-xs text-slate-600 m-0">
								Marks AI posts as &ldquo;Pending Review&rdquo; in the WordPress editorial queue.
							</p>
						</label>
					</div>
				</div>

				<div className="pt-2 border-t border-slate-100">
					<label className="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={ allowOverride }
							onChange={ ( e ) => setAllowOverride( e.target.checked ) }
							className="mt-1"
						/>
						<div>
							<div className="text-sm font-bold text-slate-900">
								Allow API calls to override status (<code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">&quot;status&quot;: &quot;publish&quot; | &quot;draft&quot;</code>)
							</div>
							<p className="text-xs text-slate-500 mt-0.5 mb-0">
								When enabled, n8n/Make can pass <code className="font-mono">&quot;status&quot;: &quot;publish&quot;</code> or <code className="font-mono">&quot;status&quot;: &quot;draft&quot;</code> per request (falling back to your Default Status above if omitted). Uncheck this to strictly force <strong>all</strong> AI agents to use the Default Status chosen above.
							</p>
						</div>
					</label>
				</div>

				<div className="pt-2 border-t border-slate-100">
					<label className="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={ renderFrontend }
							onChange={ ( e ) => setRenderFrontend( e.target.checked ) }
							className="mt-1"
						/>
						<div>
							<div className="text-sm font-bold text-slate-900">
								Auto-convert AI Markdown into formatted HTML for human blog visitors
							</div>
							<p className="text-xs text-slate-500 mt-0.5 mb-0">
								Converts headings, bold text, lists, links, and code blocks into semantic HTML on your public blog while preserving 100% pure Markdown in the AgentPress API.
							</p>
						</div>
					</label>
				</div>

				<div className="pt-2">
					<button
						type="submit"
						disabled={ saving }
						className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold text-sm rounded-lg border-0 cursor-pointer"
					>
						{ saving ? 'Saving Settings...' : 'Save Publishing Settings' }
					</button>
				</div>
			</form>
		</div>
	);
}
