/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [ './src/Admin/**/*.{js,jsx,ts,tsx}' ],
	important: '#agentpress-admin-root',
	corePlugins: {
		preflight: false,
	},
	theme: {
		extend: {},
	},
	plugins: [],
};
