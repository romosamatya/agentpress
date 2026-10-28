<?php
/**
 * Database table creation and schema migrations.
 *
 * @package AgentPress\Database
 */

declare(strict_types=1);

namespace AgentPress\Database;

/**
 * Class Migrator
 *
 * Manages creation and upgrades of the `wp_agentpress_keys` and
 * `wp_agentpress_logs` custom tables using WordPress `dbDelta`.
 */
final class Migrator {

	/**
	 * Database schema version option key.
	 */
	public const DB_VERSION_OPTION = 'agentpress_db_version';

	/**
	 * Current database schema version.
	 */
	public const DB_VERSION = '1.0.0';

	/**
	 * Run on plugin activation to create custom tables.
	 *
	 * @return void
	 */
	public static function activate(): void {
		self::create_tables();
		update_option( self::DB_VERSION_OPTION, self::DB_VERSION );
	}

	/**
	 * Run on plugin deactivation.
	 *
	 * @return void
	 */
	public static function deactivate(): void {
		delete_transient( 'agentpress_stats_cache' );
	}

	/**
	 * Automatically run migrations if the installed schema version is outdated.
	 *
	 * @return void
	 */
	public static function maybe_upgrade(): void {
		$installed_version = (string) get_option( self::DB_VERSION_OPTION, '' );

		if ( self::DB_VERSION !== $installed_version ) {
			self::create_tables();
			update_option( self::DB_VERSION_OPTION, self::DB_VERSION );
		}
	}

	/**
	 * Get the full prefixed table name for API keys (`wp_agentpress_keys`).
	 *
	 * @return string
	 */
	public static function keys_table(): string {
		global $wpdb;
		return $wpdb->prefix . 'agentpress_keys';
	}

	/**
	 * Get the full prefixed table name for audit logs (`wp_agentpress_logs`).
	 *
	 * @return string
	 */
	public static function logs_table(): string {
		global $wpdb;
		return $wpdb->prefix . 'agentpress_logs';
	}

	/**
	 * Create or update the custom AgentPress database tables via `dbDelta()`.
	 *
	 * Schema:
	 * - `wp_agentpress_keys`: Stores hashed API keys, Agent User ID, permissions (`read`, `write`, `admin`), and `last_used` timestamp.
	 * - `wp_agentpress_logs`: Tracks `agent_id`, `endpoint`, `request_method`, `payload_size`, `status_code`, and `timestamp` for auditing.
	 *
	 * @return void
	 */
	public static function create_tables(): void {
		global $wpdb;

		$charset_collate = $wpdb->get_charset_collate();
		$keys_table      = self::keys_table();
		$logs_table      = self::logs_table();

		$sql_keys = "CREATE TABLE {$keys_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(191) NOT NULL,
			key_prefix varchar(16) NOT NULL,
			api_key_hash char(64) NOT NULL,
			agent_user_id bigint(20) unsigned NOT NULL,
			permissions varchar(64) NOT NULL DEFAULT 'read',
			last_used datetime DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			revoked_at datetime DEFAULT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY api_key_hash (api_key_hash),
			KEY agent_user_id (agent_user_id),
			KEY revoked_at (revoked_at)
		) {$charset_collate};";

		$sql_logs = "CREATE TABLE {$logs_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			agent_id bigint(20) unsigned NOT NULL,
			key_id bigint(20) unsigned DEFAULT NULL,
			endpoint varchar(255) NOT NULL,
			request_method varchar(16) NOT NULL,
			payload_size int(11) unsigned NOT NULL DEFAULT 0,
			status_code smallint(5) unsigned NOT NULL DEFAULT 200,
			timestamp datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY  (id),
			KEY agent_id (agent_id),
			KEY key_id (key_id),
			KEY timestamp (timestamp)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql_keys );
		dbDelta( $sql_logs );
	}
}
