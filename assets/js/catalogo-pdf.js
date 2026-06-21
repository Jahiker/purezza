/**
 * Catálogo PDF — renders an uploaded PDF inline, page-by-page, full-width.
 *
 * Each page becomes a <canvas> stacked vertically (scroll), no browser toolbar,
 * no download/new-tab. Pages render lazily via IntersectionObserver and re-render
 * on resize to stay crisp. Config comes from `purezzaPdf` (wp_localize_script).
 */
( function () {
	'use strict';

	var cfg = window.purezzaPdf;
	var container = document.getElementById( 'catalogo-pdf-viewer' );

	if ( ! container || ! cfg || ! cfg.url || typeof window.pdfjsLib === 'undefined' ) {
		return;
	}

	pdfjsLib.GlobalWorkerOptions.workerSrc = cfg.worker;

	// Cap the device pixel ratio so very dense screens don't blow up canvas memory.
	var MAX_DPR = 2;
	var pages = []; // { page, baseViewport, wrapper, canvas, renderedWidth, task }

	function dpr() {
		return Math.min( window.devicePixelRatio || 1, MAX_DPR );
	}

	function showError( msg ) {
		container.innerHTML = '<p class="catalogo-pdf__error">' + msg + '</p>';
	}

	function renderPage( entry ) {
		var targetWidth = container.clientWidth;
		if ( ! targetWidth || entry.renderedWidth === targetWidth ) {
			return; // nothing to do (hidden, or already crisp at this width)
		}

		// Cancel any in-flight render (e.g. a resize fired mid-render).
		if ( entry.task ) {
			entry.task.cancel();
			entry.task = null;
		}

		var scale = ( targetWidth / entry.baseViewport.width ) * dpr();
		var viewport = entry.page.getViewport( { scale: scale } );

		var canvas = entry.canvas || document.createElement( 'canvas' );
		canvas.className = 'catalogo-pdf__canvas';
		canvas.width = Math.floor( viewport.width );
		canvas.height = Math.floor( viewport.height );

		var task = entry.page.render( {
			canvasContext: canvas.getContext( '2d' ),
			viewport: viewport,
		} );
		entry.task = task;

		task.promise.then( function () {
			entry.task = null;
			entry.renderedWidth = targetWidth;
			if ( ! entry.canvas ) {
				entry.canvas = canvas;
				entry.wrapper.innerHTML = '';
				entry.wrapper.appendChild( canvas );
			}
		} ).catch( function ( err ) {
			// RenderingCancelledException is expected on resize; ignore it.
			if ( err && err.name !== 'RenderingCancelledException' ) {
				entry.task = null;
			}
		} );
	}

	// Render pages a little before they scroll into view.
	var observer = new IntersectionObserver( function ( entries ) {
		entries.forEach( function ( io ) {
			if ( io.isIntersecting ) {
				var entry = pages[ Number( io.target.dataset.pageIndex ) ];
				if ( entry ) {
					renderPage( entry );
				}
			}
		} );
	}, { root: null, rootMargin: '300px 0px', threshold: 0.01 } );

	// Re-render visible pages at the new width (debounced) so they stay sharp.
	var resizeTimer = null;
	window.addEventListener( 'resize', function () {
		if ( resizeTimer ) {
			clearTimeout( resizeTimer );
		}
		resizeTimer = setTimeout( function () {
			pages.forEach( function ( entry ) {
				if ( entry.canvas ) {
					entry.renderedWidth = -1; // force re-render at current width
					renderPage( entry );
				}
			} );
		}, 200 );
	} );

	pdfjsLib.getDocument( cfg.url ).promise.then( function ( pdf ) {
		var jobs = [];
		for ( var n = 1; n <= pdf.numPages; n++ ) {
			jobs.push( pdf.getPage( n ) );
		}
		return Promise.all( jobs );
	} ).then( function ( pdfPages ) {
		container.innerHTML = '';

		pdfPages.forEach( function ( page, index ) {
			var baseViewport = page.getViewport( { scale: 1 } );

			var wrapper = document.createElement( 'div' );
			wrapper.className = 'catalogo-pdf__page';
			wrapper.dataset.pageIndex = String( index );
			// Reserve the correct aspect ratio so scroll position is stable before render.
			wrapper.style.aspectRatio = baseViewport.width + ' / ' + baseViewport.height;

			container.appendChild( wrapper );

			pages.push( {
				page: page,
				baseViewport: baseViewport,
				wrapper: wrapper,
				canvas: null,
				renderedWidth: -1,
				task: null,
			} );

			observer.observe( wrapper );
		} );
	} ).catch( function () {
		showError( 'No se pudo cargar el PDF.' );
	} );
}() );
