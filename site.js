/* Md. Yosuf portfolio: menu, citation copy, old-link redirects, image guards, document viewer and photo lightbox.
   No tracking, no external requests. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;

  /* The viewer needs <dialog>; where it is missing the document buttons are hidden and photo links go to the gallery. */
  if (typeof HTMLDialogElement !== 'function') root.classList.add('no-viewer');

  /* Copy-citation buttons stay hidden unless the clipboard API exists. */
  var status = d.querySelector('[data-copy-status]');
  Array.prototype.forEach.call(d.querySelectorAll('[data-copy]'), function (b) {
    if (!(navigator.clipboard && navigator.clipboard.writeText)) return;
    b.hidden = false;
    b.addEventListener('click', function () {
      navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () {
        var label = b.textContent;
        b.textContent = 'Copied';
        if (status) status.textContent = 'Citation copied to the clipboard.';
        setTimeout(function () { b.textContent = label; if (status) status.textContent = ''; }, 2000);
      }, function () {
        if (status) status.textContent = 'Copy failed. Select the citation text instead.';
      });
    });
  });

  /* Menu button: closes on a link, an outside click or tap, and Escape. */
  var menu = d.querySelector('.site-header .menu');
  if (menu) {
    menu.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) menu.open = false;
    });
    d.addEventListener('click', function (e) {
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) {
        menu.open = false;
        var s = menu.querySelector('summary');
        if (s) s.focus();
      }
    });
  }

  /* Links to the old one-page site (#awards, #about ...) go to the matching page. */
  if (d.body.getAttribute('data-page') === 'home' && location.hash.length > 1) {
    var map = {
      about: 'about.html', education: 'education.html', expertise: 'expertise.html', experience: 'experience.html',
      projects: 'projects.html', publications: 'publications.html', skills: 'skills.html', awards: 'honours.html',
      leadership: 'leadership.html', volunteering: 'volunteering.html', conferences: 'conferences.html',
      magazine: 'magazine.html', certifications: 'certifications.html', affiliations: 'affiliations.html',
      contact: 'contact.html'
    };
    var target = map[location.hash.slice(1)];
    if (target) location.replace(target);
  }

  /* Documents are view-only: no context menu or dragging on protected images and the viewer. */
  function guard(e) {
    if (e.target.closest && e.target.closest('.doc-img, .doc-btn, .page-btn')) e.preventDefault();
  }
  d.addEventListener('contextmenu', guard);
  d.addEventListener('dragstart', guard);
})();


/* Viewer. Documents (certificates, letters, lists) are drawn into a canvas from a shared sheet image, so the dialog holds no <img>
   to save, drag or copy. Photographs open in the same dialog as an ordinary image. */
(function () {
  'use strict';
  var dlg = document.getElementById('viewer');
  if (!dlg || typeof dlg.showModal !== 'function') return;

  var canvas = dlg.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var photo = dlg.querySelector('.viewer-photo');
  var cap = dlg.querySelector('#viewer-cap');
  var note = dlg.querySelector('[data-viewer-note]');
  var count = dlg.querySelector('[data-viewer-count]');
  var prev = dlg.querySelector('[data-viewer-prev]');
  var next = dlg.querySelector('[data-viewer-next]');
  var gal = dlg.querySelector('[data-viewer-gallery]');
  var stage = dlg.querySelector('.viewer-stage');
  var NOTE_DOC = note ? note.textContent : '';
  var NOTE_PHOTO = 'Use Previous and Next, or the arrow keys, to browse. Press Escape to close.';
  var group = [], index = 0, opener = null, token = 0, kind = 'doc';
  var sheets = {}, sheetOrder = [];

  function mark(w, h) {                       /* faint diagonal watermark for scans without one baked in */
    var size = Math.max(14, Math.round(w / 46)), step = Math.max(150, Math.round(Math.min(w, h) / 3.4));
    var diag = Math.sqrt(w * w + h * h), row = 0;
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#0E3A47';
    ctx.font = '600 ' + size + 'px system-ui, "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 7);
    for (var y = -diag / 2; y < diag / 2; y += step, row++) {
      for (var x = -diag / 2; x < diag / 2; x += step * 2.7) {
        ctx.fillText('mdyosuf.site \u00b7 view only', x + (row % 2 ? step * 1.35 : 0), y);
      }
    }
    ctx.restore();
  }

  function paint(img, box, overlay) {         /* box = x,y,w,h inside a sheet; without it the whole image is drawn */
    var b = box ? box.split(',').map(Number) : [0, 0, img.naturalWidth, img.naturalHeight];
    var s = Math.min(1, 1600 / Math.max(b[2], b[3]));
    var w = Math.max(1, Math.round(b[2] * s)), h = Math.max(1, Math.round(b[3] * s));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, b[0], b[1], b[2], b[3], 0, 0, w, h);
    if (overlay) mark(w, h);
  }

  function failed() {
    canvas.width = 640;
    canvas.height = 140;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 640, 140);
    ctx.fillStyle = '#18323B';
    ctx.font = '20px system-ui, Arial, sans-serif';
    ctx.fillText('This image could not be loaded.', 24, 76);
  }

  function sheet(url, ok, bad) {              /* a sheet is fetched once and kept for the next documents on it */
    if (sheets[url]) return ok(sheets[url]);
    var im = new Image();
    im.decoding = 'async';
    im.onload = function () {
      sheets[url] = im;
      sheetOrder.push(url);
      while (sheetOrder.length > 2) delete sheets[sheetOrder.shift()];
      ok(im);
    };
    im.onerror = bad;
    im.src = url;
  }

  function setKind(k) {
    kind = k;
    dlg.setAttribute('data-kind', k);
    canvas.hidden = k !== 'doc';
    photo.hidden = k !== 'photo';
    if (note) note.textContent = k === 'doc' ? NOTE_DOC : NOTE_PHOTO;
  }

  function show(i) {
    index = (i + group.length) % group.length;
    var el = group[index], mine = ++token;
    var caption = el.getAttribute('data-caption') || '';
    var isPhoto = el.hasAttribute('data-photo');
    setKind(isPhoto ? 'photo' : 'doc');
    cap.textContent = caption;
    count.textContent = group.length > 1 ? (index + 1) + ' of ' + group.length : '';
    prev.hidden = next.hidden = group.length < 2;
    if (gal) {
      var g = el.getAttribute('data-gallery');
      gal.hidden = !g;
      if (g) gal.setAttribute('href', g);
    }
    dlg.setAttribute('aria-busy', 'true');
    if (stage) stage.scrollTop = 0;
    if (isPhoto) {
      photo.onload = function () { if (mine === token) dlg.removeAttribute('aria-busy'); };
      photo.onerror = function () { if (mine === token) dlg.removeAttribute('aria-busy'); };
      photo.alt = caption;
      photo.src = el.getAttribute('data-photo');
      return;
    }
    canvas.setAttribute('aria-label', caption);
    var done = function (img, box) {
      if (mine !== token) return;
      paint(img, box, el.getAttribute('data-overlay') === '1');
      dlg.removeAttribute('aria-busy');
    };
    var bad = function () { if (mine === token) { failed(); dlg.removeAttribute('aria-busy'); } };
    var atlas = el.getAttribute('data-atlas');
    if (atlas) {
      sheet(atlas, function (img) { done(img, el.getAttribute('data-box')); }, bad);
    } else {
      var im = new Image();
      im.decoding = 'async';
      im.onload = function () { done(im, null); };
      im.onerror = bad;
      im.src = el.getAttribute('data-src');
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-viewer]');
    if (!el || el === dlg || dlg.contains(el)) return;
    e.preventDefault();                       /* photo thumbnails are links to the gallery when JavaScript is off */
    var name = el.getAttribute('data-viewer');
    group = Array.prototype.slice.call(document.querySelectorAll('[data-viewer="' + name + '"]'));
    opener = el;
    dlg.setAttribute('data-group', name);
    dlg.showModal();
    show(group.indexOf(el));
  });

  prev.addEventListener('click', function () { show(index - 1); });
  next.addEventListener('click', function () { show(index + 1); });
  dlg.querySelector('[data-viewer-close]').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });   /* backdrop */
  dlg.addEventListener('close', function () {
    token++;
    canvas.width = 1;
    canvas.height = 1;
    photo.removeAttribute('src');
    if (opener && opener.focus) opener.focus();
  });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' && group.length > 1) { e.preventDefault(); show(index - 1); }
    if (e.key === 'ArrowRight' && group.length > 1) { e.preventDefault(); show(index + 1); }
  });

  /* Saving, copying and printing are switched off while a document (not a photograph) is open. */
  ['contextmenu', 'dragstart', 'copy', 'cut', 'selectstart'].forEach(function (ev) {
    dlg.addEventListener(ev, function (e) { if (kind === 'doc') e.preventDefault(); });
  });
  document.addEventListener('keydown', function (e) {
    if (dlg.open && kind === 'doc' && (e.ctrlKey || e.metaKey) && /^[spc]$/i.test(e.key)) e.preventDefault();
  });
})();
