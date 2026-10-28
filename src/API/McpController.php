<?php
/**
 * Model Context Protocol (MCP) Server Controller for `/wp-json/agentpress/v1/mcp`.
 *
 * @package AgentPress\API
 */

declare(strict_types=1);

namespace AgentPress\API;

use AgentPress\Auth\Authenticator;
use AgentPress\Database\Logger;
use WP_Error;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Class McpController
 *
 * Exposes the Model Context Protocol (MCP) tool discovery and execution
 * endpoints (`read_wp_memory` and `write_wp_draft`) for MCP-compatible agents.
 */
final class McpController extends WP_REST_Controller {

	/**
	 * Authenticator service.
	 *
	 * @var Authenticator
	 */
	private Authenticator $authenticator;

	/**
	 * Audit Logger service.
	 *
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * MemoryController instance for executing underlying read/write operations.
	 *
	 * @var MemoryController
	 */
	private MemoryController $memory_controller;

	/**
	 * Constructor.
	 *
	 * @param Authenticator    $authenticator     Request authenticator service.
	 * @param Logger           $logger            Audit logger service.
	 * @param MemoryController $memory_controller Memory REST controller.
	 */
	public function __construct(
		Authenticator $authenticator,
		Logger $logger,
		MemoryController $memory_controller
	) {
		$this->namespace         = AGENTPRESS_REST_NAMESPACE;
		$this->rest_base         = 'mcp';
		$this->authenticator     = $authenticator;
		$this->logger            = $logger;
		$this->memory_controller = $memory_controller;
	}

	/**
	 * Register MCP discovery and tool execution routes.
	 *
	 * @return void
	 */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/' . $this->rest_base,
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( $this, 'get_manifest' ),
					'permission_callback' => array( $this, 'check_read_permission' ),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'handle_mcp_request' ),
					'permission_callback' => array( $this, 'check_mcp_permission' ),
				),
			)
		);
	}

	/**
	 * Authenticate `GET /wp-json/agentpress/v1/mcp` manifest discovery requests.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return bool|WP_Error
	 */
	public function check_read_permission( WP_REST_Request $request ): bool|WP_Error {
		return $this->authenticator->authenticate( $request, 'read' );
	}

	/**
	 * Authenticate `POST /wp-json/agentpress/v1/mcp` tool invocations.
	 *
	 * Requires `write` permission when calling `write_wp_draft`, or `read` otherwise.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return bool|WP_Error
	 */
	public function check_mcp_permission( WP_REST_Request $request ): bool|WP_Error {
		$params    = $request->get_json_params() ?? array();
		$tool_name = (string) ( $params['name'] ?? ( $params['params']['name'] ?? '' ) );

		$required = ( 'write_wp_draft' === $tool_name ) ? 'write' : 'read';

		return $this->authenticator->authenticate( $request, $required );
	}

	/**
	 * Return the MCP server manifest and tool definitions (`mcp.json`).
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return WP_REST_Response
	 */
	public function get_manifest( WP_REST_Request $request ): WP_REST_Response {
		$manifest_path = AGENTPRESS_PATH . 'mcp.json';
		$manifest      = array();

		if ( file_exists( $manifest_path ) ) {
			$raw = file_get_contents( $manifest_path );
			if ( is_string( $raw ) ) {
				$decoded = json_decode( $raw, true );
				if ( is_array( $decoded ) ) {
					$manifest = $decoded;
				}
			}
		}

		$manifest['site'] = array(
			'name'     => get_bloginfo( 'name' ),
			'url'      => get_site_url(),
			'rest_url' => rest_url( AGENTPRESS_REST_NAMESPACE ),
		);

		$current_key   = $this->authenticator->get_current_key();
		$agent_user_id = isset( $current_key['agent_user_id'] ) ? (int) $current_key['agent_user_id'] : get_current_user_id();
		$key_id        = isset( $current_key['id'] ) ? (int) $current_key['id'] : null;

		$this->logger->log_request(
			$agent_user_id,
			$request->get_route(),
			$request->get_method(),
			strlen( (string) wp_json_encode( $manifest ) ),
			200,
			$key_id
		);

		return new WP_REST_Response( $manifest, 200 );
	}

	/**
	 * Handle MCP JSON-RPC 2.0 or direct tool invocation requests.
	 *
	 * Supports:
	 * - `initialize`
	 * - `tools/list`
	 * - `tools/call` (`read_wp_memory`, `write_wp_draft`)
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function handle_mcp_request( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$body    = $request->get_json_params() ?? array();
		$rpc_id  = $body['id'] ?? null;
		$method  = (string) ( $body['method'] ?? 'tools/call' );

		if ( 'initialize' === $method ) {
			return new WP_REST_Response(
				array(
					'jsonrpc' => '2.0',
					'id'      => $rpc_id,
					'result'  => array(
						'protocolVersion' => '2024-11-05',
						'capabilities'    => array(
							'tools' => new \stdClass(),
						),
						'serverInfo'      => array(
							'name'    => 'agentpress',
							'version' => AGENTPRESS_VERSION,
						),
					),
				),
				200
			);
		}

		if ( 'tools/list' === $method ) {
			$manifest_response = $this->get_manifest( $request );
			$manifest_data     = $manifest_response->get_data();

			return new WP_REST_Response(
				array(
					'jsonrpc' => '2.0',
					'id'      => $rpc_id,
					'result'  => array(
						'tools' => $manifest_data['tools'] ?? array(),
					),
				),
				200
			);
		}

		// Extract tool name and arguments from either JSON-RPC `params` or direct payload.
		$tool_name = (string) ( $body['params']['name'] ?? ( $body['name'] ?? '' ) );
		$arguments = $body['params']['arguments'] ?? ( $body['arguments'] ?? array() );

		if ( ! is_array( $arguments ) ) {
			$arguments = array();
		}

		if ( 'read_wp_memory' === $tool_name ) {
			$sub_request = new WP_REST_Request( 'GET', '/' . AGENTPRESS_REST_NAMESPACE . '/memory' );
			foreach ( $arguments as $k => $v ) {
				$sub_request->set_param( (string) $k, $v );
			}

			$result = $this->memory_controller->get_memory_items( $sub_request );
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return new WP_REST_Response(
				array(
					'jsonrpc' => '2.0',
					'id'      => $rpc_id,
					'result'  => array(
						'content' => array(
							array(
								'type' => 'text',
								'text' => (string) wp_json_encode( $result->get_data(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ),
							),
						),
						'data'    => $result->get_data(),
					),
				),
				200
			);
		}

		if ( 'write_wp_draft' === $tool_name ) {
			$sub_request = new WP_REST_Request( 'POST', '/' . AGENTPRESS_REST_NAMESPACE . '/memory' );
			foreach ( $arguments as $k => $v ) {
				$sub_request->set_param( (string) $k, $v );
			}
			if ( ! isset( $arguments['status'] ) ) {
				$sub_request->set_param( 'status', 'draft' );
			}

			$result = $this->memory_controller->create_or_update_memory_item( $sub_request );
			if ( is_wp_error( $result ) ) {
				return $result;
			}

			return new WP_REST_Response(
				array(
					'jsonrpc' => '2.0',
					'id'      => $rpc_id,
					'result'  => array(
						'content' => array(
							array(
								'type' => 'text',
								'text' => (string) wp_json_encode( $result->get_data(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ),
							),
						),
						'data'    => $result->get_data(),
					),
				),
				201
			);
		}

		return new WP_Error(
			'agentpress_unknown_mcp_tool',
			sprintf(
				/* translators: %s: requested MCP tool name */
				__( 'Unknown MCP tool "%s". Supported tools: read_wp_memory, write_wp_draft.', 'agentpress' ),
				$tool_name
			),
			array( 'status' => 400 )
		);
	}
}
