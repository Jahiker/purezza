<?php
/**
 * Template Name: Catálogo
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

if ( ! function_exists( 'purezza_flatten_sections' ) ) {
	/**
	 * Recursively flatten the section tree into a slide array (depth-first).
	 *
	 * @param array[] $children_map  Map of post_parent → WP_Post[]
	 * @param WP_Post[] $sections    Sections to process at this level
	 * @param array[]  &$slides      Output flat slide array
	 * @param int[]    &$first_slide Map of post_id → first slide index for that section
	 */
	function purezza_flatten_sections( $children_map, $sections, &$slides, &$first_slide ) {
		$counter = 0;   // counts only section-type posts (for the "01." number displayed on portadas)
		foreach ( $sections as $section ) {
			$type         = get_field( 'section_type', $section->ID ) ?: 'section';
			if ( 'section' === $type ) {
				$counter++;
			}
			$current_idx  = count( $slides );
			$first_slide[ $section->ID ] = $current_idx;

			if ( 'cover' === $type ) {
				$img      = get_field( 'cover_image', $section->ID );
				$img_m    = get_field( 'cover_image_mobile', $section->ID );
				$slides[] = [
					'type'             => 'cover',
					'image_url'        => $img ? $img['url'] : '',
					'image_url_mobile' => $img_m ? $img_m['url'] : '',   // fallback a desktop en JS si vacío
					'alt'              => $img ? ( $img['alt'] ?: $section->post_title ) : $section->post_title,
					'fetchpriority'    => $current_idx === 0 ? 'high' : null,
					'_hotspots_raw'    => get_field( 'hotspots', $section->ID ) ?: [],
				];

			} elseif ( 'index' === $type ) {
				// Nav items resolved in second pass (target indices not yet known).
				$slides[] = [
					'type' => 'index',
					'nav'  => [],
					'_id'  => $section->ID,
				];

			} elseif ( 'section' === $type ) {
				$children = $children_map[ $section->ID ] ?? [];
				// Only section-type children appear in the nav list.
				$nav = [];
				foreach ( $children as $child ) {
					if ( ( get_field( 'section_type', $child->ID ) ?: 'section' ) !== 'section' ) {
						continue;
					}
					$nav[] = [
						'label'        => $child->post_title,
						'target_index' => null,   // resolved in second pass
						'_child_id'    => $child->ID,
					];
				}
				$slides[] = [
					'type'   => 'section',
					'number' => str_pad( $counter, 2, '0', STR_PAD_LEFT ),
					'title'  => $section->post_title,
					'nav'    => $nav,
					'_id'    => $section->ID,
				];
				// Recurse into children (galleries + sub-sections).
				if ( $children ) {
					purezza_flatten_sections( $children_map, $children, $slides, $first_slide );
				}
				continue; // already recursed — skip generic recurse below

			} elseif ( 'gallery' === $type ) {
				$images = get_field( 'gallery_images', $section->ID ) ?: [];
				foreach ( $images as $i => $img ) {
					$slides[] = [
						'type'          => 'gallery_image',
						'image_url'     => $img['url'],
						'alt'           => $img['alt'] ?: $section->post_title,
						'fetchpriority' => ( $i === 0 && $current_idx === 0 ) ? 'high' : null,
					];
				}
			}

			// Generic recurse for cover, index, gallery (unlikely to have children but handled).
			$children = $children_map[ $section->ID ] ?? [];
			if ( $children ) {
				purezza_flatten_sections( $children_map, $children, $slides, $first_slide );
			}
		}
	}
}

if ( ! function_exists( 'purezza_build_index_nav_from_menu' ) ) {
	/**
	 * Build the index slide nav from the menu assigned to the `catalog_index` location.
	 *
	 * Mirrors the shape consumed by catalog.js: top-level items → section cards;
	 * level-2 items with children → groups (label + items); level-2 leaves → flat items;
	 * level-3 items → group items. Menu items pointing at a catalog_section post resolve
	 * to that post's first slide index; custom links (e.g. group labels) get a null target.
	 *
	 * @param string $location    Registered nav menu location slug.
	 * @param int[]  $first_slide Map of post_id → first slide index.
	 * @return array Index nav array, or [] if no menu is assigned / it is empty.
	 */
	function purezza_build_index_nav_from_menu( $location, $first_slide ) {
		$locations = get_nav_menu_locations();
		if ( empty( $locations[ $location ] ) ) {
			return [];
		}
		$menu = wp_get_nav_menu_object( $locations[ $location ] );
		if ( ! $menu ) {
			return [];
		}
		$items = wp_get_nav_menu_items( $menu->term_id ) ?: [];
		if ( ! $items ) {
			return [];
		}

		// Group items by their parent menu-item id (already ordered by menu_order).
		$by_parent = [];
		foreach ( $items as $it ) {
			$by_parent[ (int) $it->menu_item_parent ][] = $it;
		}

		// Resolve a menu item to a slide index (null for custom links / unresolved posts).
		$resolve = function ( $it ) use ( $first_slide ) {
			if ( 'post_type' === $it->type && isset( $first_slide[ (int) $it->object_id ] ) ) {
				return $first_slide[ (int) $it->object_id ];
			}
			return null;
		};

		// Menu titles are entity-encoded by WP (e.g. "&" → "&#038;"); decode once so the
		// single escHtml() in catalog.js re-encodes correctly instead of double-escaping.
		$label = function ( $it ) {
			return html_entity_decode( $it->title, ENT_QUOTES, 'UTF-8' );
		};

		$nav = [];
		$num = 0;
		foreach ( $by_parent[0] ?? [] as $top ) {        // level 1 → section cards
			$num++;
			$groups = [];
			$flat   = [];
			foreach ( $by_parent[ $top->ID ] ?? [] as $child ) {   // level 2
				$grandchildren = $by_parent[ $child->ID ] ?? [];
				if ( $grandchildren ) {
					$groups[] = [
						'label'        => $label( $child ),
						'target_index' => $resolve( $child ),
						'items'        => array_map( function ( $gc ) use ( $resolve, $label ) {
							return [ 'label' => $label( $gc ), 'target_index' => $resolve( $gc ) ];
						}, $grandchildren ),
					];
				} else {
					$flat[] = [ 'label' => $label( $child ), 'target_index' => $resolve( $child ) ];
				}
			}
			$nav[] = [
				'label'        => $label( $top ),
				'number'       => str_pad( $num, 2, '0', STR_PAD_LEFT ),
				'target_index' => $resolve( $top ),
				'groups'       => $groups,
				'items'        => $flat,
			];
		}
		return $nav;
	}
}

// ── Build slides data ─────────────────────────────────────────────────────────

$slides_data = [];
$first_slide = [];   // post_id → first slide index

$all_sections = get_pages( [
	'post_type'   => 'catalog_section',
	'post_status' => 'publish',
	'sort_column' => 'menu_order,post_title',
	'sort_order'  => 'ASC',
	'number'      => 0,
] );

if ( $all_sections ) {
	// Build parent → children map (already sorted by menu_order from get_pages).
	$children_map = [];
	foreach ( $all_sections as $s ) {
		$children_map[ (int) $s->post_parent ][] = $s;
	}
	$top_level = $children_map[0] ?? [];

	// First pass: build flat slide array with unresolved target_index placeholders.
	purezza_flatten_sections( $children_map, $top_level, $slides_data, $first_slide );

	// Second pass: resolve target_index for nav/hotspot items in all slide types.
	foreach ( $slides_data as &$slide ) {
		if ( 'cover' === $slide['type'] ) {
			$hotspots = [];
			foreach ( $slide['_hotspots_raw'] as $hs ) {
				$target_post = $hs['hotspot_target'] ?? null;
				if ( ! $target_post || ! isset( $first_slide[ $target_post->ID ] ) ) {
					continue;
				}
				$prev_img   = $hs['hotspot_preview_image'] ?? null;
				$label      = $hs['hotspot_label'] ?? '';
				// Coords mobile: null cuando el campo está vacío → el CSS hace fallback a desktop.
				$x_mobile   = ( isset( $hs['hotspot_x_mobile'] ) && '' !== $hs['hotspot_x_mobile'] && null !== $hs['hotspot_x_mobile'] ) ? (float) $hs['hotspot_x_mobile'] : null;
				$y_mobile   = ( isset( $hs['hotspot_y_mobile'] ) && '' !== $hs['hotspot_y_mobile'] && null !== $hs['hotspot_y_mobile'] ) ? (float) $hs['hotspot_y_mobile'] : null;
				$hotspots[] = [
					'x'            => (float) ( $hs['hotspot_x'] ?? 50 ),
					'y'            => (float) ( $hs['hotspot_y'] ?? 50 ),
					'x_mobile'     => $x_mobile,
					'y_mobile'     => $y_mobile,
					'target_index' => $first_slide[ $target_post->ID ],
					'preview_url'  => $prev_img ? $prev_img['url'] : '',
					'label'        => $label ?: $target_post->post_title,
				];
			}
			$slide['hotspots'] = $hotspots;
			unset( $slide['_hotspots_raw'] );

		} elseif ( 'index' === $slide['type'] ) {
			// Prefer the menu assigned to `catalog_index`; fall back to CPT hierarchy.
			$menu_nav = purezza_build_index_nav_from_menu( 'catalog_index', $first_slide );
			if ( ! empty( $menu_nav ) ) {
				$slide['nav'] = $menu_nav;
				unset( $slide['_id'] );
				continue;
			}
			$nav = [];
			$num = 0;
			foreach ( $top_level as $sec ) {
				if ( ( get_field( 'section_type', $sec->ID ) ?: 'section' ) !== 'section' ) {
					continue;
				}
				if ( ! isset( $first_slide[ $sec->ID ] ) ) {
					continue;
				}
				$num++;
				// Build 2-level sub-items: children with grandchildren → groups; leaf children → flat items.
				$groups     = [];
				$flat_items = [];
				foreach ( $children_map[ $sec->ID ] ?? [] as $child ) {
					if ( ( get_field( 'section_type', $child->ID ) ?: 'section' ) !== 'section' ) {
						continue;
					}
					if ( ! isset( $first_slide[ $child->ID ] ) ) {
						continue;
					}
					$grandchildren = array_values( array_filter(
						$children_map[ $child->ID ] ?? [],
						function ( $gc ) use ( $first_slide ) {
							return isset( $first_slide[ $gc->ID ] )
								&& ( get_field( 'section_type', $gc->ID ) ?: 'section' ) === 'section';
						}
					) );
					if ( $grandchildren ) {
						$groups[] = [
							'label'        => $child->post_title,
							'target_index' => $first_slide[ $child->ID ],
							'items'        => array_map( function ( $gc ) use ( $first_slide ) {
								return [
									'label'        => $gc->post_title,
									'target_index' => $first_slide[ $gc->ID ],
								];
							}, $grandchildren ),
						];
					} else {
						$flat_items[] = [
							'label'        => $child->post_title,
							'target_index' => $first_slide[ $child->ID ],
						];
					}
				}
				$nav[] = [
					'label'        => $sec->post_title,
					'number'       => str_pad( $num, 2, '0', STR_PAD_LEFT ),
					'target_index' => $first_slide[ $sec->ID ],
					'groups'       => $groups,
					'items'        => $flat_items,
				];
			}
			$slide['nav'] = $nav;
			unset( $slide['_id'] );

		} elseif ( 'section' === $slide['type'] ) {
			foreach ( $slide['nav'] as &$item ) {
				$item['target_index'] = $first_slide[ $item['_child_id'] ] ?? null;
				unset( $item['_child_id'] );
			}
			unset( $item );
			// Remove any items whose target could not be resolved.
			$slide['nav'] = array_values( array_filter( $slide['nav'], function ( $n ) {
				return null !== $n['target_index'];
			} ) );
			unset( $slide['_id'] );
		}
	}
	unset( $slide );
}

// ── Output ────────────────────────────────────────────────────────────────────

get_header();

// purezza-catalog is registered by wp_enqueue_scripts (fired inside get_header).
wp_localize_script( 'purezza-catalog', 'purezzaCatalog', [
	'slides' => $slides_data,
] );
?>

<main id="catalog-slider" class="catalog-slider" role="main" aria-label="Catálogo Purezza">

	<?php if ( empty( $slides_data ) ) : ?>

		<p class="catalog-empty">No hay contenido disponible.</p>

	<?php else : ?>

		<div class="swiper catalog-swiper">
			<div class="swiper-wrapper"></div>
		</div>

	<?php endif; ?>

</main>

<?php wp_footer(); ?>
</body>
</html>
