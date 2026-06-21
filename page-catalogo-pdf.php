<?php
/**
 * Template Name: Catálogo PDF
 *
 * Renders an uploaded PDF inline, page-by-page, full-width (via PDF.js).
 * The PDF URL is passed to assets/js/catalogo-pdf.js through wp_localize_script.
 */

$pdf = get_field( 'catalog_pdf' );
$url = is_array( $pdf ) ? ( $pdf['url'] ?? '' ) : (string) $pdf;

get_header();
?>

<main class="catalogo-pdf">
	<?php if ( $url ) : ?>
		<div id="catalogo-pdf-viewer" class="catalogo-pdf__viewer" aria-label="<?php echo esc_attr( get_the_title() ); ?>"></div>
	<?php else : ?>
		<p class="catalogo-pdf__empty">No se ha cargado ningún PDF para esta página.</p>
	<?php endif; ?>
</main>

<?php
get_footer();
