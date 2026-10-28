<?php
/**
 * Token-efficient HTML/Gutenberg to Markdown converter and sanitizer.
 *
 * @package AgentPress\API
 */

declare(strict_types=1);

namespace AgentPress\API;

/**
 * Class MarkdownConverter
 *
 * Strips Gutenberg block comments and WordPress shortcodes, converting HTML
 * content into clean, token-efficient Markdown with zero residual HTML tags.
 */
final class MarkdownConverter {

	/**
	 * Convert WordPress post content (Gutenberg blocks / HTML / shortcodes)
	 * into pure Markdown suitable for LLM and RAG ingestion.
	 *
	 * @param string $content Raw `post_content` from WordPress database.
	 * @return string Clean Markdown string with zero HTML tags.
	 */
	public static function to_markdown( string $content ): string {
		if ( '' === trim( $content ) ) {
			return '';
		}

		// 1. Strip Gutenberg block comments: <!-- wp:paragraph --> and <!-- /wp:paragraph -->.
		$text = (string) preg_replace( '/<!--\s*\/?wp:.*?-->/s', '', $content );

		// 2. Strip registered and unregistered WordPress shortcodes.
		if ( function_exists( 'strip_shortcodes' ) ) {
			$text = strip_shortcodes( $text );
		}
		$text = (string) preg_replace( '/\[\/?[a-zA-Z0-9_-]+(?:\s+[^\]]*)?\]/', '', $text );

		// 3. Remove script and style blocks entirely.
		$text = (string) preg_replace( '/<(script|style)\b[^>]*>.*?<\/\1>/is', '', $text );

		// 4. Convert fenced/preformatted code blocks: <pre><code>...</code></pre>.
		$text = (string) preg_replace_callback(
			'/<pre\b[^>]*>\s*(?:<code\b[^>]*>)?(.*?)(?:<\/code>)?\s*<\/pre>/is',
			static function ( array $matches ): string {
				$code = strip_tags( $matches[1] );
				return "\n\n```\n" . trim( $code ) . "\n```\n\n";
			},
			$text
		);

		// 5. Convert inline code: <code>...</code>.
		$text = (string) preg_replace_callback(
			'/<code\b[^>]*>(.*?)<\/code>/is',
			static function ( array $matches ): string {
				$code = strip_tags( $matches[1] );
				return '`' . trim( $code ) . '`';
			},
			$text
		);

		// 6. Convert headings <h1> through <h6>.
		for ( $level = 1; $level <= 6; $level++ ) {
			$hashes = str_repeat( '#', $level );
			$text   = (string) preg_replace_callback(
				'/<h' . $level . '\b[^>]*>(.*?)<\/h' . $level . '>/is',
				static function ( array $matches ) use ( $hashes ): string {
					$heading = trim( strip_tags( $matches[1] ) );
					return "\n\n{$hashes} {$heading}\n\n";
				},
				$text
			);
		}

		// 7. Convert blockquotes: <blockquote>...</blockquote>.
		$text = (string) preg_replace_callback(
			'/<blockquote\b[^>]*>(.*?)<\/blockquote>/is',
			static function ( array $matches ): string {
				$inner = trim( strip_tags( $matches[1] ) );
				$lines = preg_split( '/\r\n|\r|\n/', $inner ) ?: array();
				$quoted = array_map(
					static fn( string $line ): string => '> ' . trim( $line ),
					$lines
				);
				return "\n\n" . implode( "\n", $quoted ) . "\n\n";
			},
			$text
		);

		// 8. Convert links: <a href="...">text</a>.
		$text = (string) preg_replace_callback(
			'/<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/is',
			static function ( array $matches ): string {
				$url   = trim( $matches[1] );
				$label = trim( strip_tags( $matches[2] ) );
				if ( '' === $label ) {
					$label = $url;
				}
				return "[{$label}]({$url})";
			},
			$text
		);

		// 9. Convert images: <img src="..." alt="..." />.
		$text = (string) preg_replace_callback(
			'/<img\b[^>]*>/is',
			static function ( array $matches ): string {
				$tag = $matches[0];
				$src = '';
				$alt = '';
				if ( preg_match( '/src=["\']([^"\']+)["\']/i', $tag, $src_match ) ) {
					$src = trim( $src_match[1] );
				}
				if ( preg_match( '/alt=["\']([^"\']*)["\']/i', $tag, $alt_match ) ) {
					$alt = trim( $alt_match[1] );
				}
				if ( '' === $src ) {
					return '';
				}
				return "![{$alt}]({$src})";
			},
			$text
		);

		// 10. Convert bold and italic tags.
		$text = (string) preg_replace( '/<(strong|b)\b[^>]*>(.*?)<\/\1>/is', '**$2**', $text );
		$text = (string) preg_replace( '/<(em|i)\b[^>]*>(.*?)<\/\1>/is', '*$2*', $text );

		// 11. Convert unordered and ordered lists.
		$text = (string) preg_replace_callback(
			'/<ol\b[^>]*>(.*?)<\/ol>/is',
			static function ( array $matches ): string {
				$index = 1;
				$items = (string) preg_replace_callback(
					'/<li\b[^>]*>(.*?)<\/li>/is',
					static function ( array $item_match ) use ( &$index ): string {
						$line = trim( strip_tags( $item_match[1] ) );
						return ( $index++ ) . '. ' . $line . "\n";
					},
					$matches[1]
				);
				return "\n\n" . trim( $items ) . "\n\n";
			},
			$text
		);

		$text = (string) preg_replace_callback(
			'/<ul\b[^>]*>(.*?)<\/ul>/is',
			static function ( array $matches ): string {
				$items = (string) preg_replace_callback(
					'/<li\b[^>]*>(.*?)<\/li>/is',
					static function ( array $item_match ): string {
						$line = trim( strip_tags( $item_match[1] ) );
						return '- ' . $line . "\n";
					},
					$matches[1]
				);
				return "\n\n" . trim( $items ) . "\n\n";
			},
			$text
		);

		// 12. Convert horizontal rules, line breaks, and paragraphs.
		$text = (string) preg_replace( '/<hr\b[^>]*\/?>/i', "\n\n---\n\n", $text );
		$text = (string) preg_replace( '/<br\b[^>]*\/?>/i', "  \n", $text );
		$text = (string) preg_replace( '/<\/p>/i', "\n\n", $text );
		$text = (string) preg_replace( '/<p\b[^>]*>/i', '', $text );

		// 13. Strip any remaining HTML tags strictly.
		if ( function_exists( 'wp_strip_all_tags' ) ) {
			$text = wp_strip_all_tags( $text, false );
		} else {
			$text = strip_tags( $text );
		}

		// 14. Decode HTML entities and normalize excessive newlines.
		$text = html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$text = str_replace( array( "\r\n", "\r" ), "\n", $text );
		$text = (string) preg_replace( "/\n{3,}/", "\n\n", $text );

		return trim( $text );
	}

	/**
	 * Sanitize incoming Markdown content from an AI agent before storing.
	 *
	 * Strips any raw HTML/script tags injected into the Markdown payload while
	 * preserving Markdown syntax (headings, lists, links, code blocks).
	 *
	 * @param string $markdown Incoming Markdown payload.
	 * @return string Clean, sanitized Markdown.
	 */
	public static function sanitize_markdown( string $markdown ): string {
		// Remove script/style/iframe tags if present in raw input.
		$clean = (string) preg_replace( '/<(script|style|iframe|object|embed)\b[^>]*>.*?<\/\1>/is', '', $markdown );
		// Strip Gutenberg comments if accidentally passed.
		$clean = (string) preg_replace( '/<!--\s*\/?wp:.*?-->/s', '', $clean );
		// Strip remaining raw HTML tags outside code blocks.
		$clean = strip_tags( $clean );
		$clean = str_replace( array( "\r\n", "\r" ), "\n", $clean );

		return trim( $clean );
	}

	/**
	 * Convert sanitized Markdown into clean semantic HTML for WordPress frontend display.
	 *
	 * @param string $markdown Clean Markdown string.
	 * @return string Semantic HTML safe for `post_content`.
	 */
	public static function to_html( string $markdown ): string {
		$text = self::sanitize_markdown( $markdown );
		if ( '' === $text ) {
			return '';
		}

		// Extract fenced code blocks first to protect their contents.
		$code_blocks = array();
		$text        = (string) preg_replace_callback(
			'/```([a-zA-Z0-9_-]*)\n(.*?)```/s',
			static function ( array $matches ) use ( &$code_blocks ): string {
				$placeholder                 = '%%AGENTPRESS_CODE_' . count( $code_blocks ) . '%%';
				$escaped_code                = esc_html( trim( $matches[2] ) );
				$code_blocks[ $placeholder ] = '<pre><code>' . $escaped_code . '</code></pre>';
				return "\n\n" . $placeholder . "\n\n";
			},
			$text
		);

		$blocks     = preg_split( "/\n{2,}/", $text ) ?: array();
		$html_parts = array();

		foreach ( $blocks as $block ) {
			$block = trim( $block );
			if ( '' === $block ) {
				continue;
			}

			if ( isset( $code_blocks[ $block ] ) ) {
				$html_parts[] = $code_blocks[ $block ];
				continue;
			}

			// Headings (# through ######).
			if ( preg_match( '/^(#{1,6})\s+(.+)$/m', $block, $h_match ) && ! str_contains( $block, "\n" ) ) {
				$level        = strlen( $h_match[1] );
				$html_parts[] = sprintf( '<h%d>%s</h%d>', $level, self::format_inline_markdown( $h_match[2] ), $level );
				continue;
			}

			// Horizontal rule.
			if ( preg_match( '/^(-{3,}|\*{3,})$/', $block ) ) {
				$html_parts[] = '<hr />';
				continue;
			}

			// Blockquote.
			if ( str_starts_with( $block, '>' ) ) {
				$lines   = preg_split( '/\n/', $block ) ?: array();
				$cleaned = array_map(
					static fn( string $l ): string => self::format_inline_markdown( (string) preg_replace( '/^>\s?/', '', $l ) ),
					$lines
				);
				$html_parts[] = '<blockquote><p>' . implode( '<br />', $cleaned ) . '</p></blockquote>';
				continue;
			}

			// Unordered list.
			if ( preg_match( '/^[-*]\s+/m', $block ) ) {
				$lines = preg_split( '/\n/', $block ) ?: array();
				$items = array();
				foreach ( $lines as $line ) {
					$item_text = (string) preg_replace( '/^[-*]\s+/', '', trim( $line ) );
					if ( '' !== $item_text ) {
						$items[] = '<li>' . self::format_inline_markdown( $item_text ) . '</li>';
					}
				}
				$html_parts[] = '<ul>' . implode( '', $items ) . '</ul>';
				continue;
			}

			// Ordered list.
			if ( preg_match( '/^\d+\.\s+/m', $block ) ) {
				$lines = preg_split( '/\n/', $block ) ?: array();
				$items = array();
				foreach ( $lines as $line ) {
					$item_text = (string) preg_replace( '/^\d+\.\s+/', '', trim( $line ) );
					if ( '' !== $item_text ) {
						$items[] = '<li>' . self::format_inline_markdown( $item_text ) . '</li>';
					}
				}
				$html_parts[] = '<ol>' . implode( '', $items ) . '</ol>';
				continue;
			}

			// Standard paragraph.
			$lines        = preg_split( '/\n/', $block ) ?: array();
			$formatted    = array_map( array( self::class, 'format_inline_markdown' ), $lines );
			$html_parts[] = '<p>' . implode( '<br />', $formatted ) . '</p>';
		}

		return implode( "\n\n", $html_parts );
	}

	/**
	 * Convert inline Markdown syntax (code, links, bold, italic) to HTML.
	 *
	 * @param string $line Single line of text.
	 * @return string
	 */
	private static function format_inline_markdown( string $line ): string {
		$escaped = esc_html( trim( $line ) );

		// Inline code: `code`.
		$escaped = (string) preg_replace( '/`([^`]+)`/', '<code>$1</code>', $escaped );

		// Links: [label](url).
		$escaped = (string) preg_replace_callback(
			'/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i',
			static function ( array $m ): string {
				return sprintf( '<a href="%s">%s</a>', esc_url( html_entity_decode( $m[2] ) ), $m[1] );
			},
			$escaped
		);

		// Bold: **text**.
		$escaped = (string) preg_replace( '/\*\*([^*]+)\*\*/', '<strong>$1</strong>', $escaped );

		// Italic: *text*.
		$escaped = (string) preg_replace( '/\*([^*]+)\*/', '<em>$1</em>', $escaped );

		return $escaped;
	}
}
