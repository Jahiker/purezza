/**
 * Catálogo PDF — renders an uploaded PDF inline, page-by-page, full-width.
 *
 * Each page becomes a <canvas> stacked vertically (scroll), no browser toolbar,
 * no download/new-tab. Pages render lazily via IntersectionObserver and re-render
 * on resize to stay crisp. Config comes from `purezzaPdf` (wp_localize_script).
 */
( function () {
	'use strict';

	/* ─── Config de enlaces del índice ────────────────────────────────────────
	   El PDF no trae enlaces internos, así que mapeamos a mano las zonas
	   clickeables del índice → página destino. Coordenadas en fracciones (0–1)
	   relativas a la página del índice. `page`/`target` son números 1-based.
	   Específico del PDF actual (Purezza Profile UX). Editar si cambia el PDF. */
	var INDEX_LINKS = {
		page: 3,           // página donde está el índice
		scrollOffset: 0,   // px a restar si un header fijo tapa el destino
		links: [
			{ target: 4,  x: 0.25, y: 0.11, w: 0.16, h: 0.23, label: 'Pisos' },
			{ target: 71, x: 0.40, y: 0.37, w: 0.15, h: 0.27, label: 'Cielos & Enchapes' },
			{ target: 79, x: 0.52, y: 0.02, w: 0.14, h: 0.27, label: 'Decks' },
			{ target: 85, x: 0.66, y: 0.37, w: 0.16, h: 0.22, label: 'Pérgolas' },
			{ target: 90, x: 0.80, y: 0.11, w: 0.19, h: 0.23, label: 'Showroom' }
		]
	};

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
				// insertBefore (no innerHTML='') para no borrar los hotspots del índice.
				entry.wrapper.insertBefore( canvas, entry.wrapper.firstChild );
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

	function scrollToPage( pageIndex ) {
		var entry = pages[ pageIndex ];
		if ( ! entry ) {
			return;
		}
		var top = entry.wrapper.getBoundingClientRect().top + window.pageYOffset
			- ( INDEX_LINKS.scrollOffset || 0 );
		window.scrollTo( { top: top, behavior: 'smooth' } );
	}

	// Overlay clickable hotspots on the index page that jump to each section.
	function addIndexLinks() {
		var source = pages[ INDEX_LINKS.page - 1 ];
		if ( ! source ) {
			return;
		}
		INDEX_LINKS.links.forEach( function ( lk ) {
			var dest = pages[ lk.target - 1 ];
			if ( ! dest ) {
				return; // página destino fuera de rango: omitir
			}
			var a = document.createElement( 'a' );
			a.className = 'catalogo-pdf__hotspot';
			a.href = '#' + dest.wrapper.id;             // fallback accesible sin JS
			a.setAttribute( 'aria-label', 'Ir a ' + ( lk.label || ( 'página ' + lk.target ) ) );
			a.style.left = ( lk.x * 100 ) + '%';
			a.style.top = ( lk.y * 100 ) + '%';
			a.style.width = ( lk.w * 100 ) + '%';
			a.style.height = ( lk.h * 100 ) + '%';
			a.addEventListener( 'click', function ( e ) {
				e.preventDefault();
				scrollToPage( lk.target - 1 );
			} );
			source.wrapper.appendChild( a );
		} );
	}

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
			wrapper.id = 'catalogo-pdf-page-' + ( index + 1 );
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

		addIndexLinks();
	} ).catch( function () {
		showError( 'No se pudo cargar el PDF.' );
	} );
}() );
