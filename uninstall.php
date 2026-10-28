<?php
/**
 * Uninstall handler for AgentPress.
 *
 * Drops custom database tables (`wp_agentpress_keys`, `wp_agentpress_logs`)
 * and removes plugin options when the plugin is deleted via WP Admin.
 *
 * @package AgentPress
 */

declare(strict_types=1);

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

$keys_table = $wpdb->prefix . 'agentpress_keys';
$logs_table = $wpdb->prefix . 'agentpress_logs';

// phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$keys_table}" );
// phpcs:ignore WordPress.DB.DirectDatabaseQuery,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
$wpdb->query( "DROP TABLE IF EXISTS {$logs_table}" );

delete_option( 'agentpress_db_version' );
delete_option( 'agentpress_settings' );
delete_transient( 'agentpress_stats_cache' );
