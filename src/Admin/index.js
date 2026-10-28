import { createRoot, render } from '@wordpress/element';
import App from './App';
import './style.css';

const container = document.getElementById( 'agentpress-admin-root' );

if ( container ) {
	if ( typeof createRoot === 'function' ) {
		createRoot( container ).render( <App /> );
	} else {
		render( <App />, container );
	}
}
