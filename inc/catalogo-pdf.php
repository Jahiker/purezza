<?php
/**
 * Catálogo PDF template: ACF field, conditional asset enqueue, Elementor opt-out.
 *
 * Renders an uploaded PDF inline (page-by-page, full-width) via PDF.js.
 * Mirrors the conventions used in inc/catalog-cpt.php.
 */

const PUREZZA_PDF_TEMPLATE = 'page-catalogo-pdf.php';

// ── ACF field group: single PDF file attached to the template ────────────────
add_action( 'acf/init', 'purezza_register_catalogo_pdf_fields' );
function purezza_register_catalogo_pdf_fields() {
	if ( ! function_exists( 'acf_add_local_field_group' ) ) {
		return;
	}

	acf_add_local_field_group( [
		'key'    => 'group_catalogo_pdf_fields',
		'title'  => 'Catálogo PDF',
		'fields' => [
			[
				'key'           => 'field_catalogo_pdf_file',
				'label'         => 'Archivo PDF del catálogo',
				'name'          => 'catalog_pdf',
				'type'          => 'file',
				'instructions'  => 'Subí el PDF que se renderizará página por página dentro de la página.',
				'return_format' => 'array',
				'library'       => 'all',
				'mime_types'    => 'pdf',
			],
		],
		'location' => [
			[
				[
					'param'    => 'page_template',
					'operator' => '==',
					'value'    => PUREZZA_PDF_TEMPLATE,
				],
			],
		],
	] );
}

// ── Conditional assets (only on the Catálogo PDF template) ───────────────────
add_action( 'wp_enqueue_scripts', 'purezza_enqueue_catalogo_pdf_assets' );
function purezza_enqueue_catalogo_pdf_assets() {
	if ( ! is_page_template( PUREZZA_PDF_TEMPLATE ) ) {
		return;
	}

	$dir_uri = get_stylesheet_directory_uri();
	$dir     = get_stylesheet_directory();

	wp_enqueue_script(
		'purezza-pdfjs',
		$dir_uri . '/assets/js/vendor/pdf.min.js',
		[],
		'3.11.174',
		true
	);

	wp_enqueue_style(
		'purezza-catalogo-pdf',
		$dir_uri . '/assets/css/catalogo-pdf.css',
		[],
		filemtime( $dir . '/assets/css/catalogo-pdf.css' )
	);

	wp_enqueue_script(
		'purezza-catalogo-pdf',
		$dir_uri . '/assets/js/catalogo-pdf.js',
		[ 'purezza-pdfjs' ],
		filemtime( $dir . '/assets/js/catalogo-pdf.js' ),
		true
	);

	$pdf = get_field( 'catalog_pdf' );
	$url = is_array( $pdf ) ? ( $pdf['url'] ?? '' ) : (string) $pdf;

	wp_localize_script( 'purezza-catalogo-pdf', 'purezzaPdf', [
		'url'    => $url,
		'worker' => $dir_uri . '/assets/js/vendor/pdf.worker.min.js',
	] );
}

// ── Keep Elementor styles out of this full-bleed template ────────────────────
add_action( 'wp_enqueue_scripts', 'purezza_disable_elementor_on_catalogo_pdf' );
function purezza_disable_elementor_on_catalogo_pdf() {
	if ( ! is_page_template( PUREZZA_PDF_TEMPLATE ) ) {
		return;
	}
	add_filter( 'elementor/frontend/should_load_styles', '__return_false' );
}
