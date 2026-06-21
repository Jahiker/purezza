(function () {
    'use strict';

    var data = (typeof purezzaCatalog !== 'undefined' && purezzaCatalog.slides) ? purezzaCatalog.slides : [];
    if (!data.length) return;

    // spec: specs/portfolio-slider-vertical.md — FR-09: modo de visualización.
    var mode = (typeof purezzaCatalog !== 'undefined' && purezzaCatalog.mode) ? purezzaCatalog.mode : 'portfolio';

    // Slide index of the auto-generated index (for the gallery "‹ Indice" link); -1 if none.
    var indexSlideIdx = data.findIndex(function (s) { return s.type === 'index'; });

    var DURATION = 0.9;
    var EASE     = 'power4.inOut';

    var isAnimating = false;
    var pendingIdx  = null;   // latest target queued while an animation is running

    /* ── Helpers ─────────────────────────────────────────────────────────── */

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getSlideEl(swiper, index) {
        return swiper.slides
            ? Array.prototype.find.call(swiper.slides, function (el) {
                return parseInt(el.dataset.swiperSlideIndex, 10) === index;
            })
            : null;
    }

    /* ── Slide renderer ──────────────────────────────────────────────────── */

    function renderSlide(slide, index) {
        var isFirst    = index === 0;
        var fetchAttr  = slide.fetchpriority ? ' fetchpriority="' + escHtml(slide.fetchpriority) + '"' : '';
        var loadAttr   = isFirst ? '' : ' loading="lazy"';

        if (slide.type === 'cover') {
            // spec: specs/portfolio-slider-vertical.md — FR-07 v4.0: cover enmarcado (contain)
            // con la misma estructura que galería; hotspots viven DENTRO del figure (FR-06 v4.0).
            var imgHtml;
            if (slide.image_url) {
                var imgTag = '<img class="catalog-cover__img" src="' + escHtml(slide.image_url) + '" alt="' + escHtml(slide.alt) + '"' + fetchAttr + loadAttr + '>';
                // Imagen alternativa para mobile (≤767px); <source> hace el swap nativo + en resize.
                imgHtml = slide.image_url_mobile
                    ? '<picture class="catalog-slide__picture">'
                        + '<source media="(max-width: 767px)" srcset="' + escHtml(slide.image_url_mobile) + '">'
                        + imgTag
                        + '</picture>'
                    : imgTag;
            } else {
                imgHtml = '<div class="catalog-slide__placeholder"></div>';
            }
            // Hotspots posicionados relativos al figure (coords vía --hs-x/--hs-y).
            var hotspotsHtml = (slide.hotspots || []).map(function (hs) {
                var flipClass = hs.x > 60 ? ' catalog-hotspot--flip' : '';
                var previewHtml = hs.preview_url
                    ? '<span class="catalog-hotspot__preview"><img class="catalog-hotspot__preview-img" src="' + escHtml(hs.preview_url) + '" alt="" loading="lazy"></span>'
                    : '';
                // Coords como CSS vars; el media query mobile usa var(--hs-x-m, var(--hs-x)) → fallback por-valor.
                var styleVars = '--hs-x:' + hs.x + '%;--hs-y:' + hs.y + '%;';
                if (typeof hs.x_mobile === 'number') { styleVars += '--hs-x-m:' + hs.x_mobile + '%;'; }
                if (typeof hs.y_mobile === 'number') { styleVars += '--hs-y-m:' + hs.y_mobile + '%;'; }
                return '<span class="catalog-hotspot' + flipClass + '" role="button" tabindex="0"'
                    + ' data-target="' + hs.target_index + '"'
                    + ' aria-label="' + escHtml(hs.label) + '"'
                    + ' style="' + styleVars + '">'
                    + previewHtml
                    + '</span>';
            }).join('');
            // Marco > figure (contain, position:relative) > imagen + hotspots dentro del figure.
            var coverFrame = '<div class="catalog-cover__frame">'
                + '<figure class="catalog-cover__figure">' + imgHtml + hotspotsHtml + '</figure>'
                + '</div>';
            return '<div class="swiper-slide catalog-slide catalog-slide--cover">' + coverFrame + '</div>';
        }

        if (slide.type === 'gallery_image') {
            // spec: specs/portfolio-slider-vertical.md — FR-07: foto completa (contain) en marco
            var inner = slide.image_url
                ? '<img class="catalog-gallery__img" src="' + escHtml(slide.image_url) + '" alt="' + escHtml(slide.alt) + '"' + loadAttr + '>'
                : '<div class="catalog-slide__placeholder"></div>';
            var frameHtml = '<div class="catalog-gallery__frame">'
                + '<figure class="catalog-gallery__figure">' + inner + '</figure>'
                + '</div>';
            // Transparent hit-area over the baked-in "‹ Indice" label → back to index slide.
            var indexLink = indexSlideIdx >= 0
                ? '<button class="catalog-index-link" data-target="' + indexSlideIdx + '" aria-label="Volver al índice"></button>'
                : '';
            return '<div class="swiper-slide catalog-slide catalog-slide--gallery">' + frameHtml + indexLink + '</div>';
        }

        if (slide.type === 'section') {
            var navHtml = '';
            if (slide.nav && slide.nav.length) {
                var items = slide.nav.map(function (item) {
                    return '<li>'
                        + '<button class="catalog-nav-item" data-target="' + item.target_index + '" aria-label="' + escHtml(item.label) + '">'
                        + '<span class="catalog-nav-item__dot">·</span>'
                        + escHtml(item.label)
                        + '</button>'
                        + '</li>';
                }).join('');
                navHtml = '<div class="catalog-section__divider"></div>'
                    + '<ul class="catalog-section__nav">' + items + '</ul>';
            }
            return '<div class="swiper-slide catalog-slide catalog-slide--section">'
                + '<div class="catalog-section">'
                + '<div class="catalog-section__number">' + escHtml(slide.number) + '</div>'
                + '<div class="catalog-section__divider"></div>'
                + '<div class="catalog-section__title">' + escHtml(slide.title) + '</div>'
                + navHtml
                + '</div>'
                + '</div>';
        }

        if (slide.type === 'index') {
            // Render a subitem; navigable (button) when target_index is a valid number.
            var renderSubitem = function (si) {
                var hasTarget = typeof si.target_index === 'number' && !isNaN(si.target_index);
                if (hasTarget) {
                    return '<li class="catalog-index__subitem catalog-index__subitem--nav">· '
                        + '<button class="catalog-index__subitem-btn" data-target="' + si.target_index + '" aria-label="' + escHtml(si.label) + '">'
                        + escHtml(si.label)
                        + '</button>'
                        + '</li>';
                }
                return '<li class="catalog-index__subitem">· ' + escHtml(si.label) + '</li>';
            };
            var cards = (slide.nav || []).map(function (item) {
                var groupsHtml = (item.groups || []).map(function (group) {
                    var subItems = (group.items || []).map(renderSubitem).join('');
                    return '<div class="catalog-index__group">'
                        + '<span class="catalog-index__group-label">' + escHtml(group.label) + '</span>'
                        + '<ul class="catalog-index__subitems">' + subItems + '</ul>'
                        + '</div>';
                }).join('');
                var flatHtml = (item.items || []).length
                    ? '<ul class="catalog-index__subitems catalog-index__subitems--flat">'
                      + (item.items || []).map(renderSubitem).join('')
                      + '</ul>'
                    : '';
                return '<li class="catalog-index__card">'
                    + '<div class="catalog-index__card-number">' + escHtml(item.number) + '</div>'
                    + '<button class="catalog-nav-item catalog-index__card-title" data-target="' + item.target_index + '" aria-label="' + escHtml(item.label) + '">'
                    + escHtml(item.label)
                    + '</button>'
                    + groupsHtml
                    + flatHtml
                    + '</li>';
            }).join('');
            return '<div class="swiper-slide catalog-slide catalog-slide--index">'
                + '<div class="catalog-index">'
                + '<div class="catalog-index__label">INDICE</div>'
                + '<ul class="catalog-index__grid">' + cards + '</ul>'
                + '</div>'
                + '</div>';
        }

        return '<div class="swiper-slide catalog-slide catalog-slide--unknown"></div>';
    }

    /* ── Presentation mode (FR-09): static stack, native scroll, no Swiper/GSAP ── */
    // spec: specs/portfolio-slider-vertical.md — FR-09
    function renderPresentation() {
        var container = document.getElementById('catalog-presentation');
        if (!container) return;

        // Reuse renderSlide per slide; each block is an anchor (#catalog-pres-{index}).
        container.innerHTML = data.map(function (slide, i) {
            return '<div class="catalog-presentation__item" id="catalog-pres-' + i + '">'
                + renderSlide(slide, i)
                + '</div>';
        }).join('');

        // Lazy loading via IntersectionObserver — first block loads eagerly (LCP),
        // the rest defer their src/srcset until they approach the viewport.
        var lazyImgs = [];
        Array.prototype.forEach.call(
            container.querySelectorAll('.catalog-presentation__item'),
            function (item, i) {
                if (i === 0) return; // eager
                Array.prototype.forEach.call(item.querySelectorAll('img'), function (img) {
                    var src = img.getAttribute('src');
                    if (src) { img.dataset.src = src; img.removeAttribute('src'); }
                    var pic = img.parentElement;
                    if (pic && pic.tagName === 'PICTURE') {
                        Array.prototype.forEach.call(pic.querySelectorAll('source'), function (s) {
                            var ss = s.getAttribute('srcset');
                            if (ss) { s.dataset.srcset = ss; s.removeAttribute('srcset'); }
                        });
                    }
                    lazyImgs.push(img);
                });
            }
        );

        var loadImg = function (img) {
            if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
            var pic = img.parentElement;
            if (pic && pic.tagName === 'PICTURE') {
                Array.prototype.forEach.call(pic.querySelectorAll('source'), function (s) {
                    if (s.dataset.srcset) { s.srcset = s.dataset.srcset; delete s.dataset.srcset; }
                });
            }
        };

        if ('IntersectionObserver' in window && lazyImgs.length) {
            var io = new IntersectionObserver(function (entries, obs) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    loadImg(entry.target);
                    obs.unobserve(entry.target);
                });
            }, { rootMargin: '600px 0px' });
            lazyImgs.forEach(function (img) { io.observe(img); });
        } else {
            lazyImgs.forEach(loadImg); // no IO support → load all
        }

        // Nav / hotspots / index-link → scroll to the target anchor (no animation).
        var PRES_NAV = '.catalog-nav-item, .catalog-hotspot, .catalog-index__subitem-btn, .catalog-index-link';
        var scrollToTarget = function (el) {
            if (!el) return;
            var idx = parseInt(el.dataset.target, 10);
            if (isNaN(idx)) return;
            var anchor = document.getElementById('catalog-pres-' + idx);
            if (!anchor) return;
            // behavior:'instant' overrides any CSS scroll-behavior:smooth del tema → "sin animaciones".
            try {
                anchor.scrollIntoView({ behavior: 'instant', block: 'start' });
            } catch (e) {
                window.scrollTo(0, anchor.getBoundingClientRect().top + window.pageYOffset);
            }
        };
        container.addEventListener('click', function (e) {
            scrollToTarget(e.target.closest(PRES_NAV));
        });
        container.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
            var el = e.target.closest(PRES_NAV);
            if (!el) return;
            e.preventDefault();
            scrollToTarget(el);
        });
    }

    if (mode === 'presentation') {
        renderPresentation();
        return; // do not touch Swiper / GSAP in presentation mode
    }

    /* ── Init ────────────────────────────────────────────────────────────── */

    var swiperEl = document.querySelector('.catalog-swiper');
    if (!swiperEl) return;

    var swiper = new Swiper(swiperEl, {
        direction: 'vertical',
        speed: 0,
        // mousewheel handled manually below — fix: specs/fixes/scroll-multi-slide.md
        keyboard: {
            enabled: true,
            onlyInViewport: true,
        },
        touchReleaseOnEdges: true,
        virtual: {
            slides: data,
            renderSlide: renderSlide,
            addSlidesAfter: 2,
            addSlidesBefore: 2,
        },
    });

    /* ── Parallax transition ─────────────────────────────────────────────── */

    // fix: specs/fixes/nav-blank-screen.md — pendingIdx prevents wrapper drift on rapid navigation
    function animateTo(fromIdx, toIdx) {
        var goingDown = toIdx > fromIdx;
        var startY    = -(fromIdx * swiper.height);
        var targetY   = -(toIdx   * swiper.height);
        var extra     = goingDown ? -40 : 40;

        gsap.set(swiper.wrapperEl, { y: startY });
        isAnimating = true;

        // rAF: give Swiper virtual one frame to finish DOM rendering
        requestAnimationFrame(function () {
            var prevEl   = getSlideEl(swiper, fromIdx);
            var activeEl = getSlideEl(swiper, toIdx);

            // Called on animation end — chains next animation if slides were queued
            var settle = function (animatedTo) {
                isAnimating = false;
                if (pendingIdx !== null && pendingIdx !== animatedTo) {
                    var next = pendingIdx;
                    pendingIdx = null;
                    requestAnimationFrame(function () { animateTo(animatedTo, next); });
                }
            };

            if (!activeEl) {
                gsap.set(swiper.wrapperEl, { y: targetY });
                settle(toIdx);
                return;
            }

            var tl = gsap.timeline({
                onComplete: function () {
                    gsap.set(activeEl, { clearProps: 'yPercent' });
                    if (prevEl) gsap.set(prevEl, { clearProps: 'yPercent' });
                    settle(toIdx);
                },
            })
            .to(swiper.wrapperEl, { y: targetY,     duration: DURATION, ease: EASE }, 0)
            .fromTo(activeEl, { yPercent: extra }, { yPercent: 0, duration: DURATION, ease: EASE }, 0);

            if (prevEl) {
                tl.to(prevEl, { yPercent: extra, duration: DURATION, ease: EASE }, 0);
            }
        });
    }

    swiper.on('slideChange', function () {
        if (isAnimating) {
            pendingIdx = swiper.activeIndex;  // queue latest target, don't discard
            return;
        }
        animateTo(swiper.previousIndex, swiper.activeIndex);
    });

    /* ── Section / index navigation ──────────────────────────────────────── */

    var NAV_SELECTOR = '.catalog-nav-item, .catalog-hotspot, .catalog-index__subitem-btn, .catalog-index-link';

    function navFromTarget(el) {
        if (!el || isAnimating) return;
        var idx = parseInt(el.dataset.target, 10);
        if (!isNaN(idx)) swiper.slideTo(idx);
    }

    swiperEl.addEventListener('click', function (e) {
        navFromTarget(e.target.closest(NAV_SELECTOR));
    });

    // Keyboard activation for non-button elements (hotspots use role="button")
    swiperEl.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        var hotspot = e.target.closest('.catalog-hotspot');
        if (!hotspot) return;
        e.preventDefault();
        navFromTarget(hotspot);
    });

    /* ── Wheel handler (replaces Swiper mousewheel module) ──────────────── */
    // fix: specs/fixes/scroll-multi-slide.md — Swiper's built-in mousewheel fires
    // slideNext() before isAnimating is set, causing multi-slide jumps per gesture.
    // Owning the listener means our isAnimating gate runs before any slideNext() call.

    swiperEl.addEventListener('wheel', function (e) {
        var atEdge = (e.deltaY < 0 && swiper.isBeginning) || (e.deltaY > 0 && swiper.isEnd);
        if (atEdge) return; // release scroll to browser at first/last slide
        e.preventDefault();
        if (isAnimating) return;
        if (Math.abs(e.deltaY) < 15) return;
        if (e.deltaY > 0) {
            swiper.slideNext();
        } else {
            swiper.slidePrev();
        }
    }, { passive: false });

    /* ── Gallery loupe (mobile magnifier) ───────────────────────────────── */
    // spec: specs/portfolio-slider-vertical.md — FR-08: lupa circular 2.5× en slides de
    // galería, solo táctil. Activación por long-press (mantener + arrastrar) para no
    // romper el swipe vertical del slider; inhibe el swipe mientras la lupa está activa.
    (function initGalleryLoupe() {
        var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (!coarse) return;                 // desktop: sin lupa (AC-60)

        var ZOOM     = 3;                    // factor de aumento (AC-57, v3.1: 2.5→3)
        var LENS     = 160;                  // diámetro de la lente en px (fallback)
        var HOLD_MS  = 260;                  // long-press antes de activar
        var MOVE_TOL = 12;                   // px de movimiento previo al hold → es swipe

        var holdTimer = null, active = false;
        var figure = null, img = null, lens = null;
        var startX = 0, startY = 0;

        function reset() {
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
            if (lens && lens.parentNode) lens.parentNode.removeChild(lens);
            if (active) swiper.allowTouchMove = true;   // restaura swipe (AC-58/59)
            lens = null; active = false; figure = null; img = null;
        }

        function moveLens(touch) {
            if (!active || !lens || !img) return;
            var box   = img.getBoundingClientRect();
            var frect = figure.getBoundingClientRect();
            // Rectángulo realmente visible de la foto dentro del box (object-fit: contain)
            var nw = img.naturalWidth  || box.width;
            var nh = img.naturalHeight || box.height;
            var scale = Math.min(box.width / nw, box.height / nh);
            var dispW = nw * scale, dispH = nh * scale;
            var offX = (box.width  - dispW) / 2;
            var offY = (box.height - dispH) / 2;
            // Punto tocado relativo a la foto visible (clamp dentro de ella)
            var ix = Math.max(0, Math.min((touch.clientX - box.left) - offX, dispW));
            var iy = Math.max(0, Math.min((touch.clientY - box.top)  - offY, dispH));
            var half = (lens.offsetWidth || LENS) / 2;
            lens.style.backgroundSize = (dispW * ZOOM) + 'px ' + (dispH * ZOOM) + 'px';
            lens.style.backgroundPosition =
                (-(ix * ZOOM - half)) + 'px ' + (-(iy * ZOOM - half)) + 'px';
            lens.style.left = (touch.clientX - frect.left - half) + 'px';
            lens.style.top  = (touch.clientY - frect.top  - half) + 'px';
        }

        function activate(touch) {
            if (!figure || !img) return;
            active = true;
            swiper.allowTouchMove = false;              // inhibe el swipe (AC-59)
            lens = document.createElement('div');
            lens.className = 'catalog-gallery__lens';
            lens.style.backgroundImage = 'url("' + (img.currentSrc || img.src) + '")';
            figure.appendChild(lens);
            moveLens(touch);
        }

        swiperEl.addEventListener('touchstart', function (e) {
            var fig = e.target.closest('.catalog-gallery__figure');
            if (!fig) return;
            var image = fig.querySelector('.catalog-gallery__img');
            if (!image) return;
            var t = e.touches[0];
            figure = fig; img = image; startX = t.clientX; startY = t.clientY;
            holdTimer = setTimeout(function () { holdTimer = null; activate(t); }, HOLD_MS);
        }, { passive: true });

        swiperEl.addEventListener('touchmove', function (e) {
            var t = e.touches[0];
            if (active) {                                // lupa activa → mueve la lente (AC-56)
                e.preventDefault();
                moveLens(t);
                return;
            }
            if (holdTimer) {                             // aún no activa: ¿se movió? → es swipe
                if (Math.abs(t.clientX - startX) > MOVE_TOL ||
                    Math.abs(t.clientY - startY) > MOVE_TOL) reset();
            }
        }, { passive: false });

        swiperEl.addEventListener('touchend', reset);
        swiperEl.addEventListener('touchcancel', reset);
    }());

}());
