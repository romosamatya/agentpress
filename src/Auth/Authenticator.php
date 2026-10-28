<?php
/**
 * HTTP Bearer Token authenticator for AgentPress REST API endpoints.
 *
 * @package AgentPress\Auth
 */

declare(strict_types=1);

namespace AgentPress\Auth;

use AgentPress\Database\Logger;
use WP_Error;
use WP_REST_Request;

/**
 * Class Authenticator
 *
 * Validates `Authorization: Bearer <agentpress_api_key>` headers on incoming
 * REST requests, enforces permission scopes (`read`, `write`, `admin`), and
 * binds the authenticated Agent User to the active WordPress execution context.
 */
final class Authenticator {

	/**
	 * TokenManager instance.
	 *
	 * @var TokenManager
	 */
	private TokenManager $token_manager;

	/**
	 * Audit Logger instance.
	 *
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * Currently authenticated key metadata for the active request.
	 *
	 * @var array<string, mixed>|null
	 */
	private ?array $current_key = null;

	/**
	 * Constructor.
	 *
	 * @param TokenManager $token_manager Token manager service.
	 * @param Logger       $logger        Audit logger service.
	 */
	public function __construct( TokenManager $token_manager, Logger $logger ) {
		$this->token_manager = $token_manager;
		$this->logger        = $logger;
	}

	/**
	 * Authenticate an incoming REST API request and check required permission scope.
	 *
	 * Expects header: `Authorization: Bearer <agentpress_api_key>`
	 *
	 * @param WP_REST_Request $request             Incoming REST API request object.
	 * @param string          $required_permission Required permission scope (`read`, `write`, or `admin`).
	 * @return bool|WP_Error True if authorized, or WP_Error with 401/403 status.
	 */
	public function authenticate( WP_REST_Request $request, string $required_permission = 'read' ): bool|WP_Error {
		$bearer_token = $this->extract_bearer_token( $request );

		if ( null === $bearer_token ) {
			return new WP_Error(
				'agentpress_missing_auth_header',
				__( 'Missing or malformed Authorization Bearer header. Expected: Authorization: Bearer <agentpress_api_key>', 'agentpress' ),
				array( 'status' => 401 )
			);
		}

		$key_record = $this->token_manager->verify_key( $bearer_token );

		if ( null === $key_record ) {
			$this->logger->log_request(
				0,
				$request->get_route(),
				$request->get_method(),
				strlen( (string) $request->get_body() ),
				401,
				null
			);

			return new WP_Error(
				'agentpress_invalid_api_key',
				__( 'Invalid or revoked AgentPress API key.', 'agentpress' ),
				array( 'status' => 401 )
			);
		}

		$agent_user_id = (int) $key_record['agent_user_id'];
		$user          = get_userdata( $agent_user_id );

		if ( ! $user ) {
			return new WP_Error(
				'agentpress_orphaned_agent_user',
				__( 'The WordPress user associated with this API key no longer exists.', 'agentpress' ),
				array( 'status' => 403 )
			);
		}

		if ( ! $this->has_permission( $key_record['permissions'], $required_permission ) ) {
			$this->logger->log_request(
				$agent_user_id,
				$request->get_route(),
				$request->get_method(),
				strlen( (string) $request->get_body() ),
				403,
				(int) $key_record['id']
			);

			return new WP_Error(
				'agentpress_insufficient_permissions',
				sprintf(
					/* translators: %s: required permission scope */
					__( 'This AgentPress API key lacks the required "%s" permission.', 'agentpress' ),
					$required_permission
				),
				array( 'status' => 403 )
			);
		}

		// Set the current WordPress user context to the Agent User.
		wp_set_current_user( $agent_user_id );
		$this->current_key = $key_record;

		return true;
	}

	/**
	 * Get the currently authenticated API key record for the active request.
	 *
	 * @return array<string, mixed>|null
	 */
	public function get_current_key(): ?array {
		return $this->current_key;
	}

	/**
	 * Extract the bearer token from `Authorization` request headers or server globals.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return string|null Extracted token string or null if not found.
	 */
	private function extract_bearer_token( WP_REST_Request $request ): ?string {
		$auth_header = $request->get_header( 'authorization' );

		if ( empty( $auth_header ) && isset( $_SERVER['HTTP_AUTHORIZATION'] ) ) {
			$auth_header = sanitize_text_field( wp_unslash( $_SERVER['HTTP_AUTHORIZATION'] ) );
		} elseif ( empty( $auth_header ) && isset( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
			$auth_header = sanitize_text_field( wp_unslash( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) );
		}

		if ( empty( $auth_header ) || ! is_string( $auth_header ) ) {
			return null;
		}

		if ( preg_match( '/^Bearer\s+(\S+)$/i', trim( $auth_header ), $matches ) ) {
			return $matches[1];
		}

		return null;
	}

	/**
	 * Evaluate whether the key's granted scopes satisfy the required permission.
	 *
	 * Hierarchy:
	 * - `admin` satisfies `admin`, `write`, and `read`.
	 * - `write` satisfies `write` and `read`.
	 * - `read` satisfies `read`.
	 *
	 * @param array<int, string> $granted_permissions Permissions assigned to the API key.
	 * @param string             $required_permission Required permission for the endpoint.
	 * @return bool
	 */
	private function has_permission( array $granted_permissions, string $required_permission ): bool {
		if ( in_array( 'admin', $granted_permissions, true ) ) {
			return true;
		}

		if ( 'write' === $required_permission && in_array( 'write', $granted_permissions, true ) ) {
			return true;
		}

		if ( 'read' === $required_permission && (
			in_array( 'read', $granted_permissions, true ) ||
			in_array( 'write', $granted_permissions, true )
		) ) {
			return true;
		}

		return in_array( $required_permission, $granted_permissions, true );
	}
}
