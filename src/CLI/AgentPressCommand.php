<?php
/**
 * WP-CLI Commands for terminal-first management of AgentPress.
 *
 * @package AgentPress\CLI
 */

declare(strict_types=1);

namespace AgentPress\CLI;

use AgentPress\API\MemoryController;
use AgentPress\Auth\Authenticator;
use AgentPress\Auth\TokenManager;
use AgentPress\Database\Logger;
use AgentPress\Database\Migrator;
use WP_CLI;
use WP_CLI\Utils;
use WP_Post;
use WP_Query;

/**
 * Manage AgentPress API keys, structured Markdown memory, database migrations, and audit logs.
 *
 * ## EXAMPLES
 *
 *     # Generate a read/write API key for user ID 1
 *     $ wp agentpress key_generate "n8n RAG Worker" --user=1 --permissions=read,write
 *
 *     # List all provisioned API keys
 *     $ wp agentpress key_list
 *
 *     # Revoke API key #3
 *     $ wp agentpress key_revoke 3
 *
 *     # Inspect recent agent audit logs
 *     $ wp agentpress logs --limit=20
 *
 *     # Preview Markdown RAG output for recent posts
 *     $ wp agentpress memory --post_type=post --limit=5
 */
final class AgentPressCommand {

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
	 * MemoryController service.
	 *
	 * @var MemoryController
	 */
	private MemoryController $memory_controller;

	/**
	 * Constructor.
	 *
	 * @param TokenManager     $token_manager     Token manager service.
	 * @param Logger           $logger            Audit logger service.
	 * @param MemoryController $memory_controller Memory REST controller.
	 */
	public function __construct(
		TokenManager $token_manager,
		Logger $logger,
		MemoryController $memory_controller
	) {
		$this->token_manager     = $token_manager;
		$this->logger            = $logger;
		$this->memory_controller = $memory_controller;
	}

	/**
	 * Generate a new AgentPress API key linked to a WordPress Agent User.
	 *
	 * ## OPTIONS
	 *
	 * <name>
	 * : Human-readable label for the API key (e.g., "Antigravity Agent").
	 *
	 * [--user=<user>]
	 * : WordPress User ID, login, or email to link the key to. Defaults to 1.
	 * ---
	 * default: 1
	 * ---
	 *
	 * [--permissions=<permissions>]
	 * : Comma-separated permission scopes (read,write,admin).
	 * ---
	 * default: read,write
	 * ---
	 *
	 * [--porcelain]
	 * : Output only the raw generated API key string for scripting.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp agentpress key_generate "Antigravity Agent" --user=admin --permissions=read,write
	 *     $ wp agentpress key_generate "CI Runner" --user=1 --porcelain
	 *
	 * @subcommand key-generate
	 * @alias key_generate
	 *
	 * @param array<int, string>    $args       Positional arguments.
	 * @param array<string, string> $assoc_args Associative flags.
	 * @return void
	 */
	public function key_generate( array $args, array $assoc_args ): void {
		$name     = (string) ( $args[0] ?? '' );
		$user_arg = (string) Utils\get_flag_value( $assoc_args, 'user', '1' );
		$perms    = (string) Utils\get_flag_value( $assoc_args, 'permissions', 'read,write' );
		$porcelain = (bool) Utils\get_flag_value( $assoc_args, 'porcelain', false );

		$user_id = $this->resolve_user_id( $user_arg );
		if ( null === $user_id ) {
			WP_CLI::error( sprintf( 'WordPress user "%s" not found.', $user_arg ) );
			return;
		}

		$permissions = array_filter( array_map( 'trim', explode( ',', $perms ) ) );
		$result      = $this->token_manager->generate_key( $name, $user_id, $permissions );

		if ( is_wp_error( $result ) ) {
			WP_CLI::error( $result->get_error_message() );
			return;
		}

		if ( $porcelain ) {
			WP_CLI::line( (string) $result['api_key'] );
			return;
		}

		WP_CLI::success( sprintf( 'Generated AgentPress API key #%d for user @%s.', $result['id'], $result['agent_username'] ) );
		WP_CLI::line( '' );
		WP_CLI::line( '  API Key (Copy now — shown once): ' . (string) $result['api_key'] );
		WP_CLI::line( '  Permissions:                     ' . implode( ', ', $result['permissions'] ) );
		WP_CLI::line( '' );
	}

	/**
	 * List all provisioned AgentPress API keys.
	 *
	 * ## OPTIONS
	 *
	 * [--status=<status>]
	 * : Filter keys by status (active, revoked, all).
	 * ---
	 * default: all
	 * options:
	 *   - all
	 *   - active
	 *   - revoked
	 * ---
	 *
	 * [--format=<format>]
	 * : Render output in a particular format.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp agentpress key-list
	 *     $ wp agentpress key-list --status=active --format=json
	 *
	 * @subcommand key-list
	 * @alias key_list
	 *
	 * @param array<int, string>    $args       Positional arguments.
	 * @param array<string, string> $assoc_args Associative flags.
	 * @return void
	 */
	public function key_list( array $args, array $assoc_args ): void {
		$status = (string) Utils\get_flag_value( $assoc_args, 'status', 'all' );
		$format = (string) Utils\get_flag_value( $assoc_args, 'format', 'table' );

		$keys = $this->token_manager->list_keys();

		if ( 'all' !== $status ) {
			$keys = array_values(
				array_filter(
					$keys,
					static fn( array $k ): bool => $k['status'] === $status
				)
			);
		}

		$rows = array_map(
			static function ( array $k ): array {
				return array(
					'id'          => $k['id'],
					'name'        => $k['name'],
					'key_prefix'  => $k['key_prefix'] . '••••••',
					'user'        => $k['agent_username'] . ' (#' . $k['agent_user_id'] . ')',
					'permissions' => implode( ',', $k['permissions'] ),
					'status'      => $k['status'],
					'last_used'   => $k['last_used'] ?? 'Never',
					'created_at'  => $k['created_at'],
				);
			},
			$keys
		);

		Utils\format_items(
			$format,
			$rows,
			array( 'id', 'name', 'key_prefix', 'user', 'permissions', 'status', 'last_used', 'created_at' )
		);
	}

	/**
	 * Revoke or permanently delete an AgentPress API key.
	 *
	 * ## OPTIONS
	 *
	 * <id>
	 * : The numeric ID of the API key in `wp_agentpress_keys`.
	 *
	 * [--delete]
	 * : Permanently delete the key row from the database instead of marking it revoked.
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp agentpress key-revoke 2
	 *     $ wp agentpress key-revoke 2 --delete
	 *
	 * @subcommand key-revoke
	 * @alias key_revoke
	 *
	 * @param array<int, string>    $args       Positional arguments.
	 * @param array<string, string> $assoc_args Associative flags.
	 * @return void
	 */
	public function key_revoke( array $args, array $assoc_args ): void {
		$key_id    = absint( $args[0] ?? 0 );
		$permanent = (bool) Utils\get_flag_value( $assoc_args, 'delete', false );

		if ( $key_id <= 0 ) {
			WP_CLI::error( 'Please provide a valid numeric API key ID.' );
			return;
		}

		$success = $permanent
			? $this->token_manager->delete_key( $key_id )
			: $this->token_manager->revoke_key( $key_id );

		if ( ! $success ) {
			WP_CLI::error( sprintf( 'Could not %s API key #%d.', $permanent ? 'delete' : 'revoke', $key_id ) );
			return;
		}

		WP_CLI::success(
			sprintf(
				'API key #%d has been %s.',
				$key_id,
				$permanent ? 'permanently deleted' : 'revoked'
			)
		);
	}

	/**
	 * View recent AI agent audit logs from `wp_agentpress_logs`.
	 *
	 * ## OPTIONS
	 *
	 * [--limit=<limit>]
	 * : Maximum number of log entries to display.
	 * ---
	 * default: 25
	 * ---
	 *
	 * [--offset=<offset>]
	 * : Number of records to skip.
	 * ---
	 * default: 0
	 * ---
	 *
	 * [--format=<format>]
	 * : Render output in a particular format.
	 * ---
	 * default: table
	 * options:
	 *   - table
	 *   - json
	 *   - csv
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp agentpress logs --limit=20
	 *     $ wp agentpress logs --format=json
	 *
	 * @param array<int, string>    $args       Positional arguments.
	 * @param array<string, string> $assoc_args Associative flags.
	 * @return void
	 */
	public function logs( array $args, array $assoc_args ): void {
		$limit  = absint( Utils\get_flag_value( $assoc_args, 'limit', 25 ) );
		$offset = absint( Utils\get_flag_value( $assoc_args, 'offset', 0 ) );
		$format = (string) Utils\get_flag_value( $assoc_args, 'format', 'table' );

		$logs = $this->logger->get_logs( $limit, $offset );

		Utils\format_items(
			$format,
			$logs,
			array( 'id', 'timestamp', 'request_method', 'endpoint', 'agent_username', 'payload_size', 'status_code' )
		);
	}

	/**
	 * Fetch and inspect posts formatted as token-efficient Markdown for RAG ingestion.
	 *
	 * ## OPTIONS
	 *
	 * [--post_id=<id>]
	 * : Specific Post ID to inspect.
	 *
	 * [--post_type=<post_type>]
	 * : Post type slug to query.
	 * ---
	 * default: post
	 * ---
	 *
	 * [--limit=<limit>]
	 * : Maximum number of posts to fetch.
	 * ---
	 * default: 5
	 * ---
	 *
	 * [--format=<format>]
	 * : Output format.
	 * ---
	 * default: json
	 * options:
	 *   - json
	 *   - table
	 *   - yaml
	 * ---
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp agentpress memory --limit=3
	 *     $ wp agentpress memory --post_id=42 --format=yaml
	 *
	 * @param array<int, string>    $args       Positional arguments.
	 * @param array<string, string> $assoc_args Associative flags.
	 * @return void
	 */
	public function memory( array $args, array $assoc_args ): void {
		$post_id   = absint( Utils\get_flag_value( $assoc_args, 'post_id', 0 ) );
		$post_type = sanitize_key( (string) Utils\get_flag_value( $assoc_args, 'post_type', 'post' ) );
		$limit     = max( 1, min( 100, absint( Utils\get_flag_value( $assoc_args, 'limit', 5 ) ) ) );
		$format    = (string) Utils\get_flag_value( $assoc_args, 'format', 'json' );

		$query_args = array(
			'post_type'      => $post_id > 0 ? 'any' : $post_type,
			'post_status'    => array( 'publish', 'draft', 'pending', 'private' ),
			'posts_per_page' => $limit,
			'orderby'        => 'date',
			'order'          => 'DESC',
		);

		if ( $post_id > 0 ) {
			$query_args['p'] = $post_id;
		}

		$query = new WP_Query( $query_args );
		$items = array();

		foreach ( $query->posts as $post ) {
			if ( $post instanceof WP_Post ) {
				$items[] = $this->memory_controller->format_post_for_rag( $post );
			}
		}

		if ( 'json' === $format ) {
			WP_CLI::line( (string) wp_json_encode( $items, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
			return;
		}

		Utils\format_items(
			$format,
			$items,
			array( 'id', 'title', 'post_type', 'status', 'date_gmt', 'content_markdown' )
		);
	}

	/**
	 * Run or verify AgentPress custom database table migrations (`wp_agentpress_keys` & `wp_agentpress_logs`).
	 *
	 * ## EXAMPLES
	 *
	 *     $ wp agentpress migrate
	 *
	 * @param array<int, string>    $args       Positional arguments.
	 * @param array<string, string> $assoc_args Associative flags.
	 * @return void
	 */
	public function migrate( array $args, array $assoc_args ): void {
		Migrator::activate();
		WP_CLI::success(
			sprintf(
				'AgentPress database tables (%s, %s) migrated to schema v%s.',
				Migrator::keys_table(),
				Migrator::logs_table(),
				Migrator::DB_VERSION
			)
		);
	}

	/**
	 * Resolve a user ID, login, or email string to a numeric WordPress User ID.
	 *
	 * @param string $user_arg User identifier.
	 * @return int|null
	 */
	private function resolve_user_id( string $user_arg ): ?int {
		if ( is_numeric( $user_arg ) ) {
			$user = get_userdata( (int) $user_arg );
			return $user ? (int) $user->ID : null;
		}

		$user = get_user_by( 'login', $user_arg );
		if ( ! $user && is_email( $user_arg ) ) {
			$user = get_user_by( 'email', $user_arg );
		}

		return $user ? (int) $user->ID : null;
	}
}
