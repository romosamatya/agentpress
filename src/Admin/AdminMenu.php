<?php
/**
 * WordPress Admin menu registration and React asset enqueueing.
 *
 * @package AgentPress\Admin
 */

declare(strict_types=1);

namespace AgentPress\Admin;

/**
 * Class AdminMenu
 *
 * Registers the top-level "AgentPress" page in the WordPress Dashboard and
 * enqueues the compiled React application (`build/index.js` & `build/index.css`).
 */
final class AdminMenu {

	/**
	 * Admin page slug.
	 */
	public const MENU_SLUG = 'agentpress';

	/**
	 * Register WordPress admin hooks.
	 *
	 * @return void
	 */
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'add_menu_page' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	/**
	 * Register the top-level AgentPress menu item in WP Admin.
	 *
	 * @hook admin_menu
	 * @return void
	 */
	public function add_menu_page(): void {
		add_menu_page(
			__( 'AgentPress — MCP & AI Memory Bank', 'agentpress' ),
			__( 'AgentPress', 'agentpress' ),
			'manage_options',
			self::MENU_SLUG,
			array( $this, 'render_mount_node' ),
			'dashicons-rest-api',
			58
		);
	}

	/**
	 * Render the root mount container for the React application.
	 *
	 * @return void
	 */
	public function render_mount_node(): void {
		echo '<div id="agentpress-admin-root" class="agentpress-admin-wrap"></div>';
	}

	/**
	 * Enqueue the compiled `@wordpress/scripts` React bundle and localize runtime config.
	 *
	 * @hook admin_enqueue_scripts
	 * @param string $hook_suffix Current WP Admin page hook suffix.
	 * @return void
	 */
	public function enqueue_assets( string $hook_suffix ): void {
		if ( 'toplevel_page_' . self::MENU_SLUG !== $hook_suffix ) {
			return;
		}

		$asset_file = AGENTPRESS_PATH . 'build/index.asset.php';
		$asset      = file_exists( $asset_file )
			? require $asset_file
			: array(
				'dependencies' => array( 'wp-element', 'wp-api-fetch', 'wp-i18n' ),
				'version'      => AGENTPRESS_VERSION,
			);

		wp_enqueue_script(
			'agentpress-admin-app',
			AGENTPRESS_URL . 'build/index.js',
			$asset['dependencies'],
			(string) $asset['version'],
			true
		);

		if ( file_exists( AGENTPRESS_PATH . 'build/index.css' ) ) {
			wp_enqueue_style(
				'agentpress-admin-styles',
				AGENTPRESS_URL . 'build/index.css',
				array(),
				(string) $asset['version']
			);
		}

		wp_localize_script(
			'agentpress-admin-app',
			'agentPressConfig',
			array(
				'restUrl'       => esc_url_raw( rest_url( AGENTPRESS_REST_NAMESPACE ) ),
				'siteUrl'       => esc_url_raw( get_site_url() ),
				'nonce'         => wp_create_nonce( 'wp_rest' ),
				'version'       => AGENTPRESS_VERSION,
				'currentUserId' => get_current_user_id(),
			)
		);
	}
}
