<?php
/**
 * Audit logger for AI agent requests and operations.
 *
 * @package AgentPress\Database
 */

declare(strict_types=1);

namespace AgentPress\Database;

/**
 * Class Logger
 *
 * Records and queries audit entries in `wp_agentpress_logs` to track
 * `agent_id`, `endpoint`, `request_method`, `payload_size`, and `timestamp`.
 */
final class Logger {

	/**
	 * Record an API request in `wp_agentpress_logs`.
	 *
	 * @param int      $agent_id       WordPress User ID associated with the agent.
	 * @param string   $endpoint       REST route path accessed (e.g., `/agentpress/v1/memory`).
	 * @param string   $request_method HTTP method (`GET`, `POST`, etc.).
	 * @param int      $payload_size   Size of the request/response payload in bytes.
	 * @param int      $status_code    HTTP status code returned.
	 * @param int|null $key_id         Optional ID of the API key in `wp_agentpress_keys`.
	 * @return bool True if inserted, false otherwise.
	 */
	public function log_request(
		int $agent_id,
		string $endpoint,
		string $request_method,
		int $payload_size,
		int $status_code = 200,
		?int $key_id = null
	): bool {
		global $wpdb;

		$table = Migrator::logs_table();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$result = $wpdb->insert(
			$table,
			array(
				'agent_id'       => $agent_id,
				'key_id'         => $key_id,
				'endpoint'       => sanitize_text_field( substr( $endpoint, 0, 255 ) ),
				'request_method' => strtoupper( sanitize_text_field( substr( $request_method, 0, 16 ) ) ),
				'payload_size'   => max( 0, $payload_size ),
				'status_code'    => $status_code,
				'timestamp'      => current_time( 'mysql', true ),
			),
			array( '%d', '%d', '%s', '%s', '%d', '%d', '%s' )
		);

		return false !== $result;
	}

	/**
	 * Retrieve paginated audit logs for the WP Admin dashboard.
	 *
	 * @param int $limit  Maximum number of log entries to return.
	 * @param int $offset Number of records to skip.
	 * @return array<int, array<string, mixed>>
	 */
	public function get_logs( int $limit = 50, int $offset = 0 ): array {
		global $wpdb;

		$logs_table  = Migrator::logs_table();
		$keys_table  = Migrator::keys_table();
		$users_table = $wpdb->users;

		$limit  = max( 1, min( 200, $limit ) );
		$offset = max( 0, $offset );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				'SELECT l.id, l.agent_id, l.key_id, l.endpoint, l.request_method, l.payload_size, l.status_code, l.timestamp,
						u.user_login AS agent_username, u.display_name AS agent_display_name,
						k.name AS key_name, k.key_prefix
				 FROM %i l
				 LEFT JOIN %i u ON l.agent_id = u.ID
				 LEFT JOIN %i k ON l.key_id = k.id
				 ORDER BY l.timestamp DESC, l.id DESC
				 LIMIT %d OFFSET %d',
				$logs_table,
				$users_table,
				$keys_table,
				$limit,
				$offset
			),
			ARRAY_A
		);

		if ( ! is_array( $rows ) ) {
			return array();
		}

		return array_map(
			static function ( array $row ): array {
				return array(
					'id'                 => (int) $row['id'],
					'agent_id'           => (int) $row['agent_id'],
					'agent_username'     => (string) ( $row['agent_username'] ?? 'unknown' ),
					'agent_display_name' => (string) ( $row['agent_display_name'] ?? 'Unknown Agent' ),
					'key_id'             => isset( $row['key_id'] ) ? (int) $row['key_id'] : null,
					'key_name'           => (string) ( $row['key_name'] ?? '' ),
					'key_prefix'         => (string) ( $row['key_prefix'] ?? '' ),
					'endpoint'           => (string) $row['endpoint'],
					'request_method'     => (string) $row['request_method'],
					'payload_size'       => (int) $row['payload_size'],
					'status_code'        => (int) $row['status_code'],
					'timestamp'          => (string) $row['timestamp'],
				);
			},
			$rows
		);
	}

	/**
	 * Count total audit log entries.
	 *
	 * @return int
	 */
	public function count_logs(): int {
		global $wpdb;

		$logs_table = Migrator::logs_table();

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return (int) $wpdb->get_var(
			$wpdb->prepare( 'SELECT COUNT(*) FROM %i', $logs_table )
		);
	}
}
