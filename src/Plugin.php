<?php
/**
 * Core plugin bootstrap and service container.
 *
 * @package AgentPress
 */

declare(strict_types=1);

namespace AgentPress;

use AgentPress\Admin\AdminMenu;
use AgentPress\API\AdminController;
use AgentPress\API\McpController;
use AgentPress\API\MemoryController;
use AgentPress\Auth\Authenticator;
use AgentPress\Auth\TokenManager;
use AgentPress\CLI\AgentPressCommand;
use AgentPress\Database\Logger;
use AgentPress\Database\Migrator;
use WP_CLI;

/**
 * Class Plugin
 *
 * Coordinates initialization of database migrations, authentication,
 * REST API controllers, MCP manifest routes, and the React WP Admin interface.
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Token manager service.
	 *
	 * @var TokenManager
	 */
	private TokenManager $token_manager;

	/**
	 * Request authenticator service.
	 *
	 * @var Authenticator
	 */
	private Authenticator $authenticator;

	/**
	 * Audit logger service.
	 *
	 * @var Logger
	 */
	private Logger $logger;

	/**
	 * Retrieve the singleton instance of the plugin.
	 *
	 * @return self
	 */
	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Private constructor to enforce singleton pattern.
	 */
	private function __construct() {
		$this->token_manager = new TokenManager();
		$this->logger        = new Logger();
		$this->authenticator = new Authenticator( $this->token_manager, $this->logger );
	}

	/**
	 * Initialize WordPress hooks for database schema checks, REST API routes,
	 * custom post meta registration, and the React admin UI.
	 *
	 * @return void
	 */
	public function init(): void {
		Migrator::maybe_upgrade();

		add_action( 'init', array( $this, 'register_structured_meta' ) );
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );

		if ( is_admin() ) {
			$admin_menu = new AdminMenu();
			$admin_menu->register();
		}

		if ( defined( 'WP_CLI' ) && WP_CLI && class_exists( 'WP_CLI' ) ) {
			$memory_controller = new MemoryController( $this->authenticator, $this->logger );
			$cli_command       = new AgentPressCommand( $this->token_manager, $this->logger, $memory_controller );
			WP_CLI::add_command( 'agentpress', $cli_command );
		}
	}

	/**
	 * Register explicit structured metadata fields (`_agentpress_author`,
	 * `_agentpress_citations`, `_agentpress_review_date`) for AI ingestion.
	 *
	 * @hook init
	 * @return void
	 */
	public function register_structured_meta(): void {
		$post_types = get_post_types( array( 'public' => true ), 'names' );

		foreach ( $post_types as $post_type ) {
			register_post_meta(
				$post_type,
				'_agentpress_author',
				array(
					'type'              => 'string',
					'description'       => 'Explicit author or AI agent identifier.',
					'single'            => true,
					'sanitize_callback' => 'sanitize_text_field',
					'show_in_rest'      => false,
				)
			);

			register_post_meta(
				$post_type,
				'_agentpress_citations',
				array(
					'type'         => 'string',
					'description'  => 'JSON-encoded array of citation URLs or references.',
					'single'       => true,
					'show_in_rest' => false,
				)
			);

			register_post_meta(
				$post_type,
				'_agentpress_review_date',
				array(
					'type'              => 'string',
					'description'       => 'ISO-8601 review date for AI provenance.',
					'single'            => true,
					'sanitize_callback' => 'sanitize_text_field',
					'show_in_rest'      => false,
				)
			);
		}
	}

	/**
	 * Register all AgentPress REST API controllers under `/wp-json/agentpress/v1/`.
	 *
	 * @hook rest_api_init
	 * @return void
	 */
	public function register_rest_routes(): void {
		$memory_controller = new MemoryController( $this->authenticator, $this->logger );
		$memory_controller->register_routes();

		$mcp_controller = new McpController( $this->authenticator, $this->logger, $memory_controller );
		$mcp_controller->register_routes();

		$admin_controller = new AdminController( $this->token_manager, $this->logger );
		$admin_controller->register_routes();
	}
}
