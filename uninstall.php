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

// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange
$wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $wpdb->prefix . 'agentpress_keys' ) );

// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange
$wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $wpdb->prefix . 'agentpress_logs' ) );

delete_option( 'agentpress_db_version' );
delete_option( 'agentpress_settings' );
delete_transient( 'agentpress_stats_cache' );
