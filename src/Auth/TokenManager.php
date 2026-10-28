<?php
/**
 * API Key generation, hashing, verification, and revocation manager.
 *
 * @package AgentPress\Auth
 */

declare(strict_types=1);

namespace AgentPress\Auth;

use AgentPress\Database\Migrator;
use WP_Error;

/**
 * Class TokenManager
 *
 * Handles lifecycle management of revokable AgentPress API keys stored
 * as SHA-256 hashes in `wp_agentpress_keys`.
 */
final class TokenManager {

	/**
	 * Prefix prepended to all generated AgentPress bearer tokens.
	 */
	public const TOKEN_PREFIX = 'ap_live_';

	/**
	 * Allowed permission scopes for AgentPress API keys.
	 *
	 * @var array<int, string>
	 */
	public const ALLOWED_PERMISSIONS = array( 'read', 'write', 'admin' );

	/**
	 * Generate a new API key for a specific WordPress Agent User.
	 *
	 * The plaintext token is returned only once in the response array and
	 * never stored in the database; only its SHA-256 digest is persisted.
	 *
	 * @param string             $name          Human-readable label for the key (e.g., "n8n RAG Worker").
	 * @param int                $agent_user_id WordPress User ID linked to this agent key.
	 * @param array<int, string> $permissions   List of granted permissions (`read`, `write`, `admin`).
	 * @return array<string, mixed>|WP_Error
	 */
	public function generate_key( string $name, int $agent_user_id, array $permissions = array( 'read' ) ): array|WP_Error {
		global $wpdb;

		$clean_name = sanitize_text_field( trim( $name ) );
		if ( '' === $clean_name ) {
			return new WP_Error(
				'agentpress_invalid_key_name',
				__( 'API key name cannot be empty.', 'agentpress' ),
				array( 'status' => 400 )
			);
		}

		$user = get_userdata( $agent_user_id );
		if ( ! $user ) {
			return new WP_Error(
				'agentpress_invalid_agent_user',
				__( 'The specified WordPress Agent User does not exist.', 'agentpress' ),
				array( 'status' => 400 )
			);
		}

		$normalized_permissions = $this->normalize_permissions( $permissions );
		if ( empty( $normalized_permissions ) ) {
			return new WP_Error(
				'agentpress_invalid_permissions',
				__( 'At least one valid permission (read, write, admin) is required.', 'agentpress' ),
				array( 'status' => 400 )
			);
		}

		try {
			$random_bytes = bin2hex( random_bytes( 24 ) );
		} catch ( \Exception $e ) {
			$random_bytes = wp_generate_password( 48, false, false );
		}

		$raw_key      = self::TOKEN_PREFIX . $random_bytes;
		$key_prefix   = substr( $raw_key, 0, 14 );
		$api_key_hash = hash( 'sha256', $raw_key );
		$created_at   = current_time( 'mysql', true );
		$perms_csv    = implode( ',', $normalized_permissions );

		$inserted = $wpdb->insert(
			Migrator::keys_table(),
			array(
				'name'          => $clean_name,
				'key_prefix'    => $key_prefix,
				'api_key_hash'  => $api_key_hash,
				'agent_user_id' => $agent_user_id,
				'permissions'   => $perms_csv,
				'created_at'    => $created_at,
			),
			array( '%s', '%s', '%s', '%d', '%s', '%s' )
		);

		if ( false === $inserted ) {
			return new WP_Error(
				'agentpress_db_insert_error',
				__( 'Failed to persist the API key in the database.', 'agentpress' ),
				array( 'status' => 500 )
			);
		}

		return array(
			'id'                 => (int) $wpdb->insert_id,
			'name'               => $clean_name,
			'api_key'            => $raw_key,
			'key_prefix'         => $key_prefix,
			'agent_user_id'      => $agent_user_id,
			'agent_username'     => $user->user_login,
			'agent_display_name' => $user->display_name,
			'permissions'        => $normalized_permissions,
			'created_at'         => $created_at,
			'last_used'          => null,
			'revoked_at'         => null,
		);
	}

	/**
	 * Verify a raw Bearer API key against active hashes in `wp_agentpress_keys`.
	 *
	 * Updates the `last_used` timestamp upon successful authentication.
	 *
	 * @param string $raw_key Plaintext bearer token from the `Authorization` header.
	 * @return array<string, mixed>|null Key record array if valid and active, or null.
	 */
	public function verify_key( string $raw_key ): ?array {
		global $wpdb;

		$raw_key = trim( $raw_key );
		if ( '' === $raw_key || ! str_starts_with( $raw_key, self::TOKEN_PREFIX ) ) {
			return null;
		}

		$candidate_hash = hash( 'sha256', $raw_key );
		$table          = Migrator::keys_table();

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT id, name, key_prefix, api_key_hash, agent_user_id, permissions, last_used, created_at, revoked_at
				 FROM {$table}
				 WHERE api_key_hash = %s AND revoked_at IS NULL
				 LIMIT 1",
				$candidate_hash
			),
			ARRAY_A
		);

		if ( ! is_array( $row ) ) {
			return null;
		}

		if ( ! hash_equals( (string) $row['api_key_hash'], $candidate_hash ) ) {
			return null;
		}

		// Touch `last_used` timestamp in UTC.
		$now = current_time( 'mysql', true );
		$wpdb->update(
			$table,
			array( 'last_used' => $now ),
			array( 'id' => (int) $row['id'] ),
			array( '%s' ),
			array( '%d' )
		);

		$permissions = array_filter(
			array_map( 'trim', explode( ',', (string) $row['permissions'] ) )
		);

		return array(
			'id'            => (int) $row['id'],
			'name'          => (string) $row['name'],
			'key_prefix'    => (string) $row['key_prefix'],
			'agent_user_id' => (int) $row['agent_user_id'],
			'permissions'   => array_values( $permissions ),
			'last_used'     => $now,
			'created_at'    => (string) $row['created_at'],
		);
	}

	/**
	 * Revoke an existing API key by setting its `revoked_at` timestamp.
	 *
	 * @param int $key_id Primary key ID in `wp_agentpress_keys`.
	 * @return bool True on success, false on failure.
	 */
	public function revoke_key( int $key_id ): bool {
		global $wpdb;

		$updated = $wpdb->update(
			Migrator::keys_table(),
			array( 'revoked_at' => current_time( 'mysql', true ) ),
			array( 'id' => $key_id ),
			array( '%s' ),
			array( '%d' )
		);

		return false !== $updated && $updated > 0;
	}

	/**
	 * Permanently delete an API key record from `wp_agentpress_keys`.
	 *
	 * @param int $key_id Primary key ID in `wp_agentpress_keys`.
	 * @return bool True on success, false on failure.
	 */
	public function delete_key( int $key_id ): bool {
		global $wpdb;

		$deleted = $wpdb->delete(
			Migrator::keys_table(),
			array( 'id' => $key_id ),
			array( '%d' )
		);

		return false !== $deleted && $deleted > 0;
	}

	/**
	 * Retrieve all API keys (without hashes) for display in the WP Admin dashboard.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public function list_keys(): array {
		global $wpdb;

		$keys_table  = Migrator::keys_table();
		$users_table = $wpdb->users;

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			"SELECT k.id, k.name, k.key_prefix, k.agent_user_id, k.permissions, k.last_used, k.created_at, k.revoked_at,
					u.user_login AS agent_username, u.display_name AS agent_display_name
			 FROM {$keys_table} k
			 LEFT JOIN {$users_table} u ON k.agent_user_id = u.ID
			 ORDER BY k.created_at DESC, k.id DESC",
			ARRAY_A
		);

		if ( ! is_array( $rows ) ) {
			return array();
		}

		return array_map(
			static function ( array $row ): array {
				$permissions = array_values(
					array_filter(
						array_map( 'trim', explode( ',', (string) $row['permissions'] ) )
					)
				);

				return array(
					'id'                 => (int) $row['id'],
					'name'               => (string) $row['name'],
					'key_prefix'         => (string) $row['key_prefix'],
					'agent_user_id'      => (int) $row['agent_user_id'],
					'agent_username'     => (string) ( $row['agent_username'] ?? 'deleted' ),
					'agent_display_name' => (string) ( $row['agent_display_name'] ?? 'Deleted User' ),
					'permissions'        => $permissions,
					'last_used'          => $row['last_used'] ? (string) $row['last_used'] : null,
					'created_at'         => (string) $row['created_at'],
					'revoked_at'         => $row['revoked_at'] ? (string) $row['revoked_at'] : null,
					'status'             => null === $row['revoked_at'] ? 'active' : 'revoked',
				);
			},
			$rows
		);
	}

	/**
	 * Normalize and filter requested permission scopes against allowed values.
	 *
	 * @param array<int, string> $permissions Raw permission list.
	 * @return array<int, string>
	 */
	private function normalize_permissions( array $permissions ): array {
		$cleaned = array_map(
			static fn( $perm ): string => strtolower( trim( (string) $perm ) ),
			$permissions
		);

		return array_values(
			array_unique(
				array_intersect( $cleaned, self::ALLOWED_PERMISSIONS )
			)
		);
	}
}
