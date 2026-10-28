<?php
/**
 * REST API Controller for `/wp-json/agentpress/v1/memory`.
 *
 * @package AgentPress\API
 */

declare(strict_types=1);

namespace AgentPress\API;

use AgentPress\Auth\Authenticator;
use AgentPress\Database\Logger;
use WP_Error;
use WP_Post;
use WP_Query;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * Class MemoryController
 *
 * Exposes AI-optimized `/wp-json/agentpress/v1/memory` endpoints that strictly
 * output clean Markdown and structured metadata (`author`, `citations`, `review_date`)
 * for RAG ingestion and autonomous agent workflows.
 */
final class MemoryController extends WP_REST_Controller {

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
	 * Allowed post statuses when creating or updating posts via the API.
	 *
	 * @var array<int, string>
	 */
	public const ALLOWED_STATUSES = array( 'draft', 'publish', 'pending', 'private' );

	/**
	 * Option key for AgentPress publishing settings.
	 */
	public const SETTINGS_OPTION = 'agentpress_settings';

	/**
	 * Retrieve current AgentPress publishing settings with defaults.
	 *
	 * @return array{default_post_status: string, allow_status_override: bool, render_markdown_frontend: bool}
	 */
	public static function get_publishing_settings(): array {
		$saved = get_option( self::SETTINGS_OPTION, array() );
		if ( ! is_array( $saved ) ) {
			$saved = array();
		}

		$default_status = isset( $saved['default_post_status'] ) ? sanitize_key( (string) $saved['default_post_status'] ) : 'draft';
		if ( ! in_array( $default_status, self::ALLOWED_STATUSES, true ) ) {
			$default_status = 'draft';
		}

		return array(
			'default_post_status'      => $default_status,
			'allow_status_override'    => isset( $saved['allow_status_override'] ) ? (bool) $saved['allow_status_override'] : true,
			'render_markdown_frontend' => isset( $saved['render_markdown_frontend'] ) ? (bool) $saved['render_markdown_frontend'] : true,
		);
	}

	/**
	 * Constructor.
	 *
	 * @param Authenticator $authenticator Request authenticator service.
	 * @param Logger        $logger        Audit logger service.
	 */
	public function __construct( Authenticator $authenticator, Logger $logger ) {
		$this->namespace     = AGENTPRESS_REST_NAMESPACE;
		$this->rest_base     = 'memory';
		$this->authenticator = $authenticator;
		$this->logger        = $logger;
	}

	/**
	 * Register the `/wp-json/agentpress/v1/memory` routes.
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
					'callback'            => array( $this, 'get_memory_items' ),
					'permission_callback' => array( $this, 'check_read_permission' ),
					'args'                => $this->get_collection_params(),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( $this, 'create_or_update_memory_item' ),
					'permission_callback' => array( $this, 'check_write_permission' ),
					'args'                => $this->get_write_params(),
				),
			)
		);
	}

	/**
	 * Permission callback for `GET /wp-json/agentpress/v1/memory`.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return bool|WP_Error
	 */
	public function check_read_permission( WP_REST_Request $request ): bool|WP_Error {
		return $this->authenticator->authenticate( $request, 'read' );
	}

	/**
	 * Permission callback for `POST /wp-json/agentpress/v1/memory`.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return bool|WP_Error
	 */
	public function check_write_permission( WP_REST_Request $request ): bool|WP_Error {
		return $this->authenticator->authenticate( $request, 'write' );
	}

	/**
	 * Handle `GET /wp-json/agentpress/v1/memory`.
	 *
	 * Retrieves posts formatted specifically for RAG ingestion with clean
	 * `content_markdown` and explicit structured metadata.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get_memory_items( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$post_id   = $request->get_param( 'post_id' );
		$post_type = sanitize_key( (string) ( $request->get_param( 'post_type' ) ?? 'post' ) );
		$limit     = max( 1, min( 100, (int) ( $request->get_param( 'limit' ) ?? 10 ) ) );
		$offset    = max( 0, (int) ( $request->get_param( 'offset' ) ?? 0 ) );
		$category  = $request->get_param( 'category' );

		if ( ! post_type_exists( $post_type ) ) {
			return new WP_Error(
				'agentpress_invalid_post_type',
				sprintf(
					/* translators: %s: post type slug */
					__( 'Post type "%s" does not exist.', 'agentpress' ),
					$post_type
				),
				array( 'status' => 400 )
			);
		}

		$query_args = array(
			'post_type'           => $post_type,
			'post_status'         => array( 'publish', 'draft', 'pending', 'private' ),
			'posts_per_page'      => $limit,
			'offset'              => $offset,
			'orderby'             => 'date',
			'order'               => 'DESC',
			'ignore_sticky_posts' => true,
			'no_found_rows'       => false,
		);

		if ( null !== $post_id && (int) $post_id > 0 ) {
			$query_args['p']         = (int) $post_id;
			$query_args['post_type'] = 'any';
		}

		if ( ! empty( $category ) ) {
			if ( is_numeric( $category ) ) {
				$query_args['cat'] = (int) $category;
			} else {
				$query_args['category_name'] = sanitize_title( (string) $category );
			}
		}

		$query = new WP_Query( $query_args );
		$items = array();

		foreach ( $query->posts as $post ) {
			if ( $post instanceof WP_Post ) {
				$items[] = $this->format_post_for_rag( $post );
			}
		}

		$response_data = array(
			'count'       => count( $items ),
			'total'       => (int) $query->found_posts,
			'limit'       => $limit,
			'offset'      => $offset,
			'items'       => $items,
		);

		$this->record_audit_log( $request, $response_data, 200 );

		return new WP_REST_Response( $response_data, 200 );
	}

	/**
	 * Handle `POST /wp-json/agentpress/v1/memory`.
	 *
	 * Creates or updates a WordPress post from clean Markdown and structured metadata.
	 *
	 * @param WP_REST_Request $request Incoming REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function create_or_update_memory_item( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$settings         = self::get_publishing_settings();
		$post_id          = $request->get_param( 'id' );
		$title            = sanitize_text_field( (string) $request->get_param( 'title' ) );
		$content_markdown = MarkdownConverter::sanitize_markdown( (string) $request->get_param( 'content_markdown' ) );
		$requested_status = $request->get_param( 'status' );
		$post_type        = sanitize_key( (string) ( $request->get_param( 'post_type' ) ?? 'post' ) );
		$meta             = $request->get_param( 'meta' );

		// Determine effective post status from Dashboard Settings + optional API override.
		if ( ! $settings['allow_status_override'] || null === $requested_status || '' === trim( (string) $requested_status ) ) {
			$status = $settings['default_post_status'];
		} else {
			$status = sanitize_key( (string) $requested_status );
		}

		if ( '' === $title ) {
			return new WP_Error(
				'agentpress_missing_title',
				__( 'A non-empty "title" field is required.', 'agentpress' ),
				array( 'status' => 400 )
			);
		}

		if ( ! in_array( $status, self::ALLOWED_STATUSES, true ) ) {
			return new WP_Error(
				'agentpress_invalid_status',
				sprintf(
					/* translators: %s: comma-separated list of valid statuses */
					__( 'Invalid post status. Allowed values: %s.', 'agentpress' ),
					implode( ', ', self::ALLOWED_STATUSES )
				),
				array( 'status' => 400 )
			);
		}

		if ( ! post_type_exists( $post_type ) ) {
			return new WP_Error(
				'agentpress_invalid_post_type',
				sprintf(
					/* translators: %s: post type slug */
					__( 'Post type "%s" does not exist.', 'agentpress' ),
					$post_type
				),
				array( 'status' => 400 )
			);
		}

		$current_key   = $this->authenticator->get_current_key();
		$agent_user_id = isset( $current_key['agent_user_id'] ) ? (int) $current_key['agent_user_id'] : get_current_user_id();

		$post_content = $settings['render_markdown_frontend']
			? MarkdownConverter::to_html( $content_markdown )
			: $content_markdown;

		$post_data = array(
			'post_title'   => $title,
			'post_content' => $post_content,
			'post_status'  => $status,
			'post_type'    => $post_type,
			'post_author'  => $agent_user_id,
		);

		$is_update = false;
		if ( null !== $post_id && (int) $post_id > 0 ) {
			$existing = get_post( (int) $post_id );
			if ( ! $existing ) {
				return new WP_Error(
					'agentpress_post_not_found',
					__( 'The specified Post ID to update does not exist.', 'agentpress' ),
					array( 'status' => 404 )
				);
			}
			$post_data['ID'] = (int) $post_id;
			$is_update       = true;
			$result_id       = wp_update_post( wp_slash( $post_data ), true );
		} else {
			$result_id = wp_insert_post( wp_slash( $post_data ), true );
		}

		if ( is_wp_error( $result_id ) ) {
			return $result_id;
		}

		$saved_post_id = (int) $result_id;

		// Persist raw Markdown in post meta for lossless round-trip retrieval.
		update_post_meta( $saved_post_id, '_agentpress_raw_markdown', $content_markdown );

		// Persist structured metadata schema (Author, Citations, Review Date, plus custom keys).
		if ( is_array( $meta ) ) {
			$this->save_structured_meta( $saved_post_id, $meta );
		}

		$saved_post    = get_post( $saved_post_id );
		$status_code   = $is_update ? 200 : 201;
		$response_body = array(
			'id'      => $saved_post_id,
			'status'  => $status,
			'created' => ! $is_update,
			'updated' => $is_update,
			'item'    => $saved_post instanceof WP_Post ? $this->format_post_for_rag( $saved_post ) : null,
		);

		$this->record_audit_log( $request, $response_body, $status_code );

		return new WP_REST_Response( $response_body, $status_code );
	}

	/**
	 * Format a `WP_Post` object into a token-efficient RAG payload with
	 * `content_markdown` and explicit structured metadata.
	 *
	 * @param WP_Post $post WordPress post instance.
	 * @return array<string, mixed>
	 */
	public function format_post_for_rag( WP_Post $post ): array {
		$raw_markdown = get_post_meta( $post->ID, '_agentpress_raw_markdown', true );
		if ( is_string( $raw_markdown ) && '' !== trim( $raw_markdown ) ) {
			$content_markdown = MarkdownConverter::sanitize_markdown( $raw_markdown );
		} else {
			$content_markdown = MarkdownConverter::to_markdown( (string) $post->post_content );
		}

		$wp_author_name = get_the_author_meta( 'display_name', (int) $post->post_author );
		$meta_author    = (string) get_post_meta( $post->ID, '_agentpress_author', true );
		$citations_raw  = (string) get_post_meta( $post->ID, '_agentpress_citations', true );
		$review_date    = (string) get_post_meta( $post->ID, '_agentpress_review_date', true );
		$custom_meta    = get_post_meta( $post->ID, '_agentpress_custom_meta', true );

		$citations = array();
		if ( '' !== $citations_raw ) {
			$decoded = json_decode( $citations_raw, true );
			if ( is_array( $decoded ) ) {
				$citations = array_values( array_map( 'strval', $decoded ) );
			}
		}

		$categories = wp_get_post_categories( $post->ID, array( 'fields' => 'slugs' ) );
		$tags       = wp_get_post_tags( $post->ID, array( 'fields' => 'slugs' ) );

		return array(
			'id'               => (int) $post->ID,
			'title'            => html_entity_decode( get_the_title( $post ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ),
			'slug'             => (string) $post->post_name,
			'post_type'        => (string) $post->post_type,
			'status'           => (string) $post->post_status,
			'permalink'        => (string) get_permalink( $post ),
			'date_gmt'         => (string) $post->post_date_gmt,
			'modified_gmt'     => (string) $post->post_modified_gmt,
			'content_markdown' => $content_markdown,
			'meta'             => array(
				'author'      => '' !== $meta_author ? $meta_author : (string) $wp_author_name,
				'citations'   => $citations,
				'review_date' => '' !== $review_date ? $review_date : substr( (string) $post->post_modified_gmt, 0, 10 ),
				'custom'      => is_array( $custom_meta ) ? $custom_meta : new \stdClass(),
			),
			'taxonomies'       => array(
				'categories' => is_array( $categories ) ? array_values( $categories ) : array(),
				'tags'       => is_array( $tags ) ? array_values( $tags ) : array(),
			),
		);
	}

	/**
	 * Persist structured metadata (`author`, `citations`, `review_date`, and custom fields).
	 *
	 * @param int                  $post_id WordPress Post ID.
	 * @param array<string, mixed> $meta    Incoming metadata associative array.
	 * @return void
	 */
	private function save_structured_meta( int $post_id, array $meta ): void {
		if ( isset( $meta['author'] ) ) {
			update_post_meta(
				$post_id,
				'_agentpress_author',
				sanitize_text_field( (string) $meta['author'] )
			);
		}

		if ( isset( $meta['citations'] ) && is_array( $meta['citations'] ) ) {
			$clean_citations = array_values(
				array_filter(
					array_map(
						static fn( $item ): string => sanitize_text_field( trim( (string) $item ) ),
						$meta['citations']
					)
				)
			);
			update_post_meta(
				$post_id,
				'_agentpress_citations',
				(string) wp_json_encode( $clean_citations )
			);
		}

		if ( isset( $meta['review_date'] ) ) {
			update_post_meta(
				$post_id,
				'_agentpress_review_date',
				sanitize_text_field( (string) $meta['review_date'] )
			);
		}

		// Store any additional custom metadata keys safely after recursive sanitization.
		$reserved_keys = array( 'author', 'citations', 'review_date' );
		$extra_meta    = array();

		foreach ( $meta as $key => $value ) {
			$clean_key = sanitize_key( (string) $key );
			if ( '' === $clean_key || in_array( $clean_key, $reserved_keys, true ) ) {
				continue;
			}
			if ( is_scalar( $value ) ) {
				$extra_meta[ $clean_key ] = sanitize_text_field( (string) $value );
			} elseif ( is_array( $value ) ) {
				$extra_meta[ $clean_key ] = array_map(
					static fn( $v ): string => is_scalar( $v ) ? sanitize_text_field( (string) $v ) : '',
					$value
				);
			}
		}

		if ( ! empty( $extra_meta ) ) {
			update_post_meta( $post_id, '_agentpress_custom_meta', $extra_meta );
		}
	}

	/**
	 * Record the request in `wp_agentpress_logs`.
	 *
	 * @param WP_REST_Request      $request       REST request.
	 * @param array<string, mixed> $response_body Response payload array.
	 * @param int                  $status_code   HTTP status code.
	 * @return void
	 */
	private function record_audit_log( WP_REST_Request $request, array $response_body, int $status_code ): void {
		$current_key   = $this->authenticator->get_current_key();
		$agent_user_id = isset( $current_key['agent_user_id'] ) ? (int) $current_key['agent_user_id'] : get_current_user_id();
		$key_id        = isset( $current_key['id'] ) ? (int) $current_key['id'] : null;

		$request_size  = strlen( (string) $request->get_body() );
		$response_size = strlen( (string) wp_json_encode( $response_body ) );
		$payload_size  = $request_size > 0 ? $request_size : $response_size;

		$this->logger->log_request(
			$agent_user_id,
			$request->get_route(),
			$request->get_method(),
			$payload_size,
			$status_code,
			$key_id
		);
	}

	/**
	 * Define query parameter schema for `GET /wp-json/agentpress/v1/memory`.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	public function get_collection_params(): array {
		return array(
			'post_id'   => array(
				'description'       => __( 'Specific Post ID to fetch.', 'agentpress' ),
				'type'              => 'integer',
				'sanitize_callback' => 'absint',
			),
			'post_type' => array(
				'description'       => __( 'WordPress post type slug.', 'agentpress' ),
				'type'              => 'string',
				'default'           => 'post',
				'sanitize_callback' => 'sanitize_key',
			),
			'limit'     => array(
				'description'       => __( 'Maximum number of posts to return (1-100).', 'agentpress' ),
				'type'              => 'integer',
				'default'           => 10,
				'minimum'           => 1,
				'maximum'           => 100,
				'sanitize_callback' => 'absint',
			),
			'offset'    => array(
				'description'       => __( 'Number of posts to skip for pagination.', 'agentpress' ),
				'type'              => 'integer',
				'default'           => 0,
				'minimum'           => 0,
				'sanitize_callback' => 'absint',
			),
			'category'  => array(
				'description'       => __( 'Filter by category slug or term ID.', 'agentpress' ),
				'type'              => 'string',
				'sanitize_callback' => 'sanitize_text_field',
			),
		);
	}

	/**
	 * Define body parameter schema for `POST /wp-json/agentpress/v1/memory`.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	private function get_write_params(): array {
		return array(
			'id'               => array(
				'description'       => __( 'Optional existing Post ID to update.', 'agentpress' ),
				'type'              => 'integer',
				'sanitize_callback' => 'absint',
			),
			'title'            => array(
				'description'       => __( 'Post title.', 'agentpress' ),
				'type'              => 'string',
				'required'          => true,
				'sanitize_callback' => 'sanitize_text_field',
			),
			'content_markdown' => array(
				'description' => __( 'Clean Markdown body content.', 'agentpress' ),
				'type'        => 'string',
				'required'    => true,
			),
			'status'           => array(
				'description'       => __( 'Post publication status (draft, publish, pending, private). Omit to use Dashboard default.', 'agentpress' ),
				'type'              => 'string',
				'enum'              => self::ALLOWED_STATUSES,
				'sanitize_callback' => 'sanitize_key',
			),
			'post_type'        => array(
				'description'       => __( 'Target WordPress post type.', 'agentpress' ),
				'type'              => 'string',
				'default'           => 'post',
				'sanitize_callback' => 'sanitize_key',
			),
			'meta'             => array(
				'description' => __( 'Structured metadata object (author, citations, review_date).', 'agentpress' ),
				'type'        => 'object',
				'default'     => array(),
			),
		);
	}
}
