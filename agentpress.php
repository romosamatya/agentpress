<?php
/**
 * Plugin Name:       AgentPress
 * Plugin URI:        https://github.com/agentpress/agentpress
 * Description:       Transforms WordPress into a Model Context Protocol (MCP) server and token-efficient Markdown memory bank for external AI agents.
 * Version:           1.0.0
 * Requires at least: 6.2
 * Requires PHP:      8.0
 * Author:            AgentPress Contributors
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       agentpress
 *
 * @package AgentPress
 */

declare(strict_types=1);

namespace AgentPress;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Plugin constants.
 */
define( 'AGENTPRESS_VERSION', '1.0.0' );
define( 'AGENTPRESS_FILE', __FILE__ );
define( 'AGENTPRESS_PATH', plugin_dir_path( __FILE__ ) );
define( 'AGENTPRESS_URL', plugin_dir_url( __FILE__ ) );
define( 'AGENTPRESS_REST_NAMESPACE', 'agentpress/v1' );

/**
 * Register PSR-4 autoloader.
 *
 * Uses Composer's autoloader if present, or falls back to a native PSR-4
 * autoloader mapped to `src/` so the plugin works out-of-the-box.
 */
if ( file_exists( AGENTPRESS_PATH . 'vendor/autoload.php' ) ) {
	require_once AGENTPRESS_PATH . 'vendor/autoload.php';
} else {
	spl_autoload_register(
		static function ( string $class ): void {
			$prefix   = 'AgentPress\\';
			$base_dir = AGENTPRESS_PATH . 'src/';

			$len = strlen( $prefix );
			if ( strncmp( $prefix, $class, $len ) !== 0 ) {
				return;
			}

			$relative_class = substr( $class, $len );
			$file           = $base_dir . str_replace( '\\', '/', $relative_class ) . '.php';

			if ( file_exists( $file ) ) {
				require_once $file;
			}
		}
	);
}

/**
 * Run database migrations on plugin activation.
 *
 * @hook register_activation_hook
 */
register_activation_hook(
	__FILE__,
	static function (): void {
		Database\Migrator::activate();
	}
);

/**
 * Clean up transient caches on plugin deactivation.
 *
 * @hook register_deactivation_hook
 */
register_deactivation_hook(
	__FILE__,
	static function (): void {
		Database\Migrator::deactivate();
	}
);

/**
 * Bootstrap the core plugin singleton on `plugins_loaded`.
 *
 * @hook plugins_loaded
 */
add_action(
	'plugins_loaded',
	static function (): void {
		Plugin::instance()->init();
	}
);
