<?php
/**
 * Catalog Section CPT and conditional asset enqueue.
 */

add_action( 'init', 'purezza_register_catalog_section_cpt' );
function purezza_register_catalog_section_cpt() {
	register_post_type( 'catalog_section', [
		'labels' => [
			'name'               => 'Catálogo',
			'singular_name'      => 'Sección',
			'add_new'            => 'Agregar sección',
			'add_new_item'       => 'Agregar nueva sección',
			'edit_item'          => 'Editar sección',
			'new_item'           => 'Nueva sección',
			'view_item'          => 'Ver sección',
			'search_items'       => 'Buscar secciones',
			'not_found'          => 'No se encontraron secciones',
			'not_found_in_trash' => 'No hay secciones en la papelera',
			'all_items'          => 'Todas las secciones',
			'menu_name'          => 'Catálogo',
		],
		'public'            => false,
		'show_ui'           => true,
		'show_in_menu'      => true,
		'show_in_nav_menus' => true, // selectable in Apariencia > Menús (drives the catalog index)
		'show_in_rest'      => false,
		'menu_icon'    => 'dashicons-images-alt2',
		'menu_position' => 20,
		'supports'     => [ 'title', 'page-attributes' ], // page-attributes = parent selector + menu_order
		'hierarchical' => true,
		'has_archive'  => false,
		'rewrite'      => false,
	] );
}

add_action( 'after_setup_theme', 'purezza_register_catalog_menu_location' );
function purezza_register_catalog_menu_location() {
	// Menu assigned here drives the auto-index slide (Apariencia > Menús > Ubicaciones).
	register_nav_menu( 'catalog_index', 'Índice del Catálogo' );
}

add_action( 'wp_enqueue_scripts', 'purezza_enqueue_catalog_assets' );
function purezza_enqueue_catalog_assets() {
	if ( ! is_page_template( 'page-catalog.php' ) ) {
		return;
	}

	// spec: specs/portfolio-slider-vertical.md — FR-09: assets condicionales al modo.
	// Portafolio carga Swiper + GSAP; Presentación NO (stack con scroll nativo + IO).
	$mode = get_field( 'display_mode', get_queried_object_id() ) ?: 'portfolio';

	if ( 'presentation' === $mode ) {
		wp_enqueue_style(
			'purezza-catalog',
			get_stylesheet_directory_uri() . '/assets/css/catalog.css',
			[],
			filemtime( get_stylesheet_directory() . '/assets/css/catalog.css' )
		);

		wp_enqueue_script(
			'purezza-catalog',
			get_stylesheet_directory_uri() . '/assets/js/catalog.js',
			[],
			filemtime( get_stylesheet_directory() . '/assets/js/catalog.js' ),
			true
		);
		return;
	}

	// Portafolio (default)
	wp_enqueue_style(
		'purezza-swiper',
		get_stylesheet_directory_uri() . '/assets/css/vendor/swiper.min.css',
		[],
		'11.0.0'
	);

	wp_enqueue_style(
		'purezza-catalog',
		get_stylesheet_directory_uri() . '/assets/css/catalog.css',
		[ 'purezza-swiper' ],
		filemtime( get_stylesheet_directory() . '/assets/css/catalog.css' )
	);

	wp_enqueue_script(
		'purezza-gsap',
		get_stylesheet_directory_uri() . '/assets/js/vendor/gsap.min.js',
		[],
		'3.0.0',
		true
	);

	wp_enqueue_script(
		'purezza-swiper',
		get_stylesheet_directory_uri() . '/assets/js/vendor/swiper.min.js',
		[],
		'11.0.0',
		true
	);

	wp_enqueue_script(
		'purezza-catalog',
		get_stylesheet_directory_uri() . '/assets/js/catalog.js',
		[ 'purezza-gsap', 'purezza-swiper' ],
		filemtime( get_stylesheet_directory() . '/assets/js/catalog.js' ),
		true
	);
}

add_action( 'wp_enqueue_scripts', 'purezza_disable_elementor_on_catalog' );
function purezza_disable_elementor_on_catalog() {
	if ( ! is_page_template( 'page-catalog.php' ) ) {
		return;
	}
	add_filter( 'elementor/frontend/should_load_styles', '__return_false' );
}

add_action( 'acf/init', 'purezza_register_catalog_acf_fields' );
function purezza_register_catalog_acf_fields() {
	if ( ! function_exists( 'acf_add_local_field_group' ) ) {
		return;
	}

	// spec: specs/portfolio-slider-vertical.md — FR-09: modalidad del template (página).
	acf_add_local_field_group( [
		'key'      => 'group_catalog_page_fields',
		'title'    => 'Catálogo — Modalidad',
		'fields'   => [
			[
				'key'           => 'field_catalog_display_mode',
				'label'         => 'Modalidad del catálogo',
				'name'          => 'display_mode',
				'type'          => 'radio',
				'instructions'  => 'Portafolio: slider vertical animado. Presentación: stack de imágenes con scroll nativo (tipo documento).',
				'required'      => 0,
				'choices'       => [
					'portfolio'    => 'Portafolio (slider animado)',
					'presentation' => 'Presentación (stack con scroll)',
				],
				'default_value' => 'portfolio',
				'layout'        => 'vertical',
				'return_format' => 'value',
			],
		],
		'location' => [
			[
				[
					'param'    => 'page_template',
					'operator' => '==',
					'value'    => 'page-catalog.php',
				],
			],
		],
	] );

	acf_add_local_field_group( [
		'key'    => 'group_catalog_section_fields',
		'title'  => 'Catalog Section Fields',
		'fields' => [
			[
				'key'           => 'field_catalog_section_type',
				'label'         => 'Tipo de Sección',
				'name'          => 'section_type',
				'type'          => 'radio',
				'instructions'  => 'Define cómo se renderiza este slide en el catálogo.',
				'required'      => 1,
				'choices'       => [
					'cover'   => 'Portada (imagen full-bleed)',
					'index'   => 'Índice automático',
					'section' => 'Portada de sección dinámica',
					'gallery' => 'Galería de imágenes',
				],
				'default_value' => 'section',
				'layout'        => 'horizontal',
				'return_format' => 'value',
			],
			[
				'key'               => 'field_catalog_cover_image',
				'label'             => 'Imagen de Portada',
				'name'              => 'cover_image',
				'type'              => 'image',
				'instructions'      => 'Imagen exportada del catálogo (full-bleed). Solo visible cuando el tipo es "Portada".',
				'required'          => 0,
				'conditional_logic' => [
					[
						[
							'field'    => 'field_catalog_section_type',
							'operator' => '==',
							'value'    => 'cover',
						],
					],
				],
				'return_format'     => 'array',
				'preview_size'      => 'medium',
				'library'           => 'all',
				'mime_types'        => 'jpg,jpeg,png,webp',
			],
			[
				'key'               => 'field_catalog_gallery_images',
				'label'             => 'Imágenes de Galería',
				'name'              => 'gallery_images',
				'type'              => 'gallery',
				'instructions'      => 'Selecciona múltiples imágenes a la vez. Puedes reordenarlas con drag-and-drop.',
				'required'          => 0,
				'conditional_logic' => [
					[
						[
							'field'    => 'field_catalog_section_type',
							'operator' => '==',
							'value'    => 'gallery',
						],
					],
				],
				'return_format'     => 'array',
				'preview_size'      => 'medium',
				'insert'            => 'append',
				'library'           => 'all',
				'min'               => 0,
				'max'               => 0,
				'mime_types'        => 'jpg,jpeg,png,webp',
			],
		],
		'location' => [
			[
				[
					'param'    => 'post_type',
					'operator' => '==',
					'value'    => 'catalog_section',
				],
			],
		],
		'menu_order'            => 0,
		'position'              => 'normal',
		'style'                 => 'default',
		'label_placement'       => 'top',
		'instruction_placement' => 'label',
		'hide_on_screen'        => [
			'the_content', 'excerpt', 'discussion', 'comments',
			'revisions', 'slug', 'author', 'format',
			'featured_image', 'tags', 'send-trackbacks',
		],
	] );
}
