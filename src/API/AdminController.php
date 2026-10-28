<?php
/**
 * WP Admin REST Controller for managing API keys and viewing Agent Audit Logs.
 *
 * @package AgentPress\API
 */

declare(strict_types=1);

namespace AgentPress\API;

use AgentPress\Auth\TokenManager;
use AgentPress\Database\Logger;
use WP_Error;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Class AdminController
 *
 * Provides internal REST endpoints secured by `manage_options` capability
 * for the React WP Admin dashboard (`/wp-json/agentpress/v1/admin/*`).
 */
final class AdminController extends WP_REST_Controller {

	/**
	 * TokenManager service.
	 *
	 * @var TokenManager
	 */
	private TokenManager $token_manager;

	/**
	 * Audit Logger service.
	 *
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * Constructor.
	 *
	 * @param TokenManager $token_manager Token manager service.
	 * @param Logger       $logger        Audit logger service.
	 */
	public function __construct( TokenManager $token_manager, Logger $logger ) {
		$this->namespace     = AGENTPRESS_REST_NAMESPACE;
		$this->rest_base     = 'admin';
		$this->token_manager = $token_manager;
		$this->logger        = $logger;
	}

	/**
	 * Register WP Admin management routes.
	 *
	 * @return void
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/keys',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'list_keys' ),
					'permission_callback' => array( $this, 'check_admin_permission' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_key' ),
					'permission_callback' => array( $this, 'check_admin_permission' ),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/keys/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( $this, 'revoke_or_delete_key' ),
					'permission_callback' => array( $this, 'check_admin_permission' ),
					'args'                => array(
						'id'        => array(
							'type'              => 'integer',
							'required'          => true,
							'sanitize_callback' => 'absint',
						),
						'permanent' => array(
							'type'    => 'boolean',
							'default' => false,
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/logs',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'list_logs' ),
					'permission_callback' => array( $this, 'check_admin_permission' ),
					'args'                => array(
						'limit'  => array(
							'type'              => 'integer',
							'default'           => 50,
							'sanitize_callback' => 'absint',
						),
						'offset' => array(
							'type'              => 'integer',
							'default'           => 0,
							'sanitize_callback' => 'absint',
						),
					),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/users',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'list_agent_users' ),
					'permission_callback' => array( $this, 'check_admin_permission' ),
				),
			)
		);

		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base . '/settings',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_settings' ),
					'permission_callback' => array( $this, 'check_admin_permission' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'update_settings' ),
					'permission_callback' => array( $this, 'check_admin_permission' ),
				),
			)
		);
	}

	/**
	 * Verify that the current WordPress user has `manage_options` capability.
	 *
	 * @return bool
	 */
	public function check_admin_permission(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * List all API keys for the React dashboard.
	 *
	 * @return WP_REST_Response
	 */
	public function list_keys(): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'keys' => $this->token_manager->list_keys(),
			),
			200
		);
	}

	/**
	 * Create a new API key linked to a WordPress Agent User.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_key( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$name          = sanitize_text_field( (string) $request->get_param( 'name' ) );
		$agent_user_id = (int) ( $request->get_param( 'agent_user_id' ) ?? get_current_user_id() );
		$permissions   = $request->get_param( 'permissions' );

		if ( ! is_array( $permissions ) || empty( $permissions ) ) {
			$permissions = array( 'read', 'write' );
		}

		$result = $this->token_manager->generate_key( $name, $agent_user_id, $permissions );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return new WP_REST_Response( $result, 201 );
	}

	/**
	 * Revoke or permanently delete an API key.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function revoke_or_delete_key( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$key_id    = (int) $request->get_param( 'id' );
		$permanent = (bool) $request->get_param( 'permanent' );

		$success = $permanent
			? $this->token_manager->delete_key( $key_id )
			: $this->token_manager->revoke_key( $key_id );

		if ( ! $success ) {
			return new WP_Error(
				'agentpress_key_action_failed',
				__( 'Unable to revoke or delete the specified API key.', 'agentpress' ),
				array( 'status' => 400 )
			);
		}

		return new WP_REST_Response(
			array(
				'id'      => $key_id,
				'revoked' => ! $permanent,
				'deleted' => $permanent,
			),
			200
		);
	}

	/**
	 * List paginated audit logs from `wp_agentpress_logs`.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return WP_REST_Response
	 */
	public function list_logs( WP_REST_Request $request ): WP_REST_Response {
		$limit  = (int) ( $request->get_param( 'limit' ) ?? 50 );
		$offset = (int) ( $request->get_param( 'offset' ) ?? 0 );

		return new WP_REST_Response(
			array(
				'logs'  => $this->logger->get_logs( $limit, $offset ),
				'total' => $this->logger->count_logs(),
			),
			200
		);
	}

	/**
	 * List WordPress users eligible to be assigned as Agent Users.
	 *
	 * @return WP_REST_Response
	 */
	public function list_agent_users(): WP_REST_Response {
		$users = get_users(
			array(
				'fields'  => array( 'ID', 'user_login', 'display_name', 'user_email' ),
				'orderby' => 'display_name',
				'order'   => 'ASC',
				'number'  => 200,
			)
		);

		$formatted = array_map(
			static function ( object $u ): array {
				$user_obj = get_userdata( (int) $u->ID );
				$roles    = $user_obj ? array_values( $user_obj->roles ) : array();

				return array(
					'id'           => (int) $u->ID,
					'username'     => (string) $u->user_login,
					'display_name' => (string) $u->display_name,
					'email'        => (string) $u->user_email,
					'roles'        => $roles,
				);
			},
			$users
		);

		return new WP_REST_Response( array( 'users' => $formatted ), 200 );
	}

	/**
	 * Retrieve current AgentPress publishing settings for the React dashboard.
	 *
	 * @return WP_REST_Response
	 */
	public function get_settings(): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'settings' => MemoryController::get_publishing_settings(),
			),
			200
		);
	}

	/**
	 * Update AgentPress publishing settings from the React dashboard.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function update_settings( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$current = MemoryController::get_publishing_settings();

		$default_status = $request->get_param( 'default_post_status' );
		if ( null !== $default_status ) {
			$clean_status = sanitize_key( (string) $default_status );
			if ( ! in_array( $clean_status, MemoryController::ALLOWED_STATUSES, true ) ) {
				return new WP_Error(
					'agentpress_invalid_default_status',
					__( 'Invalid default post status. Choose draft, publish, pending, or private.', 'agentpress' ),
					array( 'status' => 400 )
				);
			}
			$current['default_post_status'] = $clean_status;
		}

		if ( null !== $request->get_param( 'allow_status_override' ) ) {
			$current['allow_status_override'] = (bool) $request->get_param( 'allow_status_override' );
		}

		if ( null !== $request->get_param( 'render_markdown_frontend' ) ) {
			$current['render_markdown_frontend'] = (bool) $request->get_param( 'render_markdown_frontend' );
		}

		update_option( MemoryController::SETTINGS_OPTION, $current );

		return new WP_REST_Response(
			array(
				'settings' => $current,
				'saved'    => true,
			),
			200
		);
	}
}
