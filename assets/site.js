/* United for the Fight: the few things that need a browser. Everything works without it (state list, sorted table,
   copy-able link); this adds ZIP lookup, distance sorting, table sorting and the share sheet.
   A ZIP is looked up in a file from this site (/data/zips/<first 3 digits>.json) and never sent anywhere. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var STATES = null, zipCache = {};

  function getJSON(u) { return fetch(u, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function states() { return STATES ? Promise.resolve(STATES) : getJSON('/data/states.json').then(function (d) { STATES = d; return d; }); }
  function zipInfo(zip) {
    var k = zip.slice(0, 3);
    var p = zipCache[k] ? Promise.resolve(zipCache[k]) : getJSON('/data/zips/' + k + '.json').then(function (d) { zipCache[k] = d; return d; });
    return p.then(function (d) { return d[zip] || null; }).catch(function () { return null; });
  }
  function miles(a, b, c, d) {
    var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 7918 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  function norm(s) { return s.toLowerCase().replace(/[^a-z]/g, ''); }

  /* find your state: a state name, a two-letter code, or a ZIP */
  $$('[data-finder]').forEach(function (f) {
    var input = $('input', f), msg = $('.msg', f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value.trim();
      msg.textContent = '';
      if (!q) { msg.textContent = 'Type a state or a ZIP code.'; input.focus(); return; }
      states().then(function (st) {
        if (/^\d{5}$/.test(q)) {
          return zipInfo(q).then(function (z) {
            if (!z) { msg.textContent = 'That ZIP code isn’t in our list. Try your state’s name.'; return; }
            for (var slug in st) if (st[slug][0] === z[2]) { location.href = '/states/' + slug + '/#zip=' + q; return;  /* a #fragment never reaches the server */ }
            msg.textContent = 'That ZIP is outside the 50 states.';
          });
        }
        var n = norm(q);
        for (var s in st) if (norm(st[s][1]) === n || st[s][0].toLowerCase() === n) { location.href = '/states/' + s + '/'; return; }
        for (var t in st) if (norm(st[t][1]).indexOf(n) === 0 && n.length > 2) { location.href = '/states/' + t + '/'; return; }
        msg.textContent = 'No state matches “' + q + '”. Try the full name or a 5-digit ZIP.';
      }).catch(function () { msg.textContent = 'Couldn’t load the state list. Use the list below.'; });
    });
  });

  /* sort a state's protest list by distance from a ZIP (also from #zip= after a ZIP search) */
  function sortByZip(form, zip) {
    var list = $('[data-events]'), msg = $('.msg', form);
    return zipInfo(zip).then(function (z) {
      if (!z) { msg.textContent = 'ZIP not found.'; return; }
      var items = $$('.ev', list);
      items.forEach(function (li) {
        var la = parseFloat(li.dataset.lat), lo = parseFloat(li.dataset.lon), d = (isNaN(la) || isNaN(lo)) ? 1e9 : miles(z[0], z[1], la, lo);
        li.dataset.d = d;
        var span = $('.dist', li); if (span) span.textContent = d < 1e9 ? ' · ' + (d < 1 ? 'under 1' : Math.round(d)) + ' mi away' : '';
      });
      items.sort(function (a, b) { return a.dataset.d - b.dataset.d; }).forEach(function (li) { list.appendChild(li); });
      msg.textContent = 'Sorted by distance from ' + zip + '.';
    });
  }
  $$('[data-zipsort]').forEach(function (form) {
    var input = $('input', form);
    form.addEventListener('submit', function (e) { e.preventDefault(); if (/^\d{5}$/.test(input.value.trim())) sortByZip(form, input.value.trim()); else $('.msg', form).textContent = 'Type a 5-digit ZIP.'; });
    var m = location.hash.match(/^#zip=(\d{5})$/);
    if (m) { history.replaceState(null, '', location.pathname); input.value = m[1]; sortByZip(form, m[1]); }
  });

  /* protests near a ZIP, across the whole country */
  $$('[data-nearme]').forEach(function (form) {
    var input = $('input', form), out = $('[data-near]'), msg = $('.msg', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var zip = input.value.trim();
      if (!/^\d{5}$/.test(zip)) { msg.textContent = 'Type a 5-digit ZIP.'; return; }
      Promise.all([zipInfo(zip), getJSON('/data/protests.json')]).then(function (r) {
        var z = r[0], evs = r[1];
        if (!z) { msg.textContent = 'ZIP not found.'; return; }
        evs.forEach(function (e) { e.km = (e.la == null) ? 1e9 : miles(z[0], z[1], e.la, e.lo); });
        evs.sort(function (a, b) { return a.km - b.km; });
        var near = evs.filter(function (e) { return e.km < 100; }).slice(0, 25);
        out.innerHTML = '';
        near.forEach(function (e) {
          var li = document.createElement('li'); li.className = 'ev';
          var t = document.createElement('time'); t.textContent = e.d; var sm = document.createElement('small'); sm.textContent = e.h; t.appendChild(sm);
          var d = document.createElement('div');
          var h = document.createElement('h3'); var tg = document.createElement('span'); tg.className = 'ttag'; tg.textContent = e.g; h.appendChild(tg); h.appendChild(document.createTextNode(e.t));
          var m1 = document.createElement('p'); m1.className = 'meta'; m1.textContent = e.o + ' · ' + e.c + ', ' + e.s + ' · ' + Math.round(e.km) + ' mi away';
          var go = document.createElement('p'); go.className = 'go';
          var a1 = document.createElement('a'); a1.href = e.u; a1.rel = 'noopener'; a1.textContent = 'Details and sign-up';
          var a2 = document.createElement('a'); a2.href = e.dr; a2.rel = 'noopener'; a2.textContent = 'Directions';
          go.appendChild(a1); go.appendChild(a2);
          d.appendChild(h); d.appendChild(m1); if (e.a) { var m2 = document.createElement('p'); m2.className = 'meta'; m2.textContent = e.a; d.appendChild(m2); } d.appendChild(go);
          li.appendChild(t); li.appendChild(d); out.appendChild(li);
        });
        out.hidden = false;
        msg.textContent = near.length ? near.length + ' upcoming within 100 miles of ' + zip + ', nearest first.' : 'Nothing listed within 100 miles of ' + zip + ' yet.';
      }).catch(function () { msg.textContent = 'Couldn’t load events. Use the state list.'; });
    });
  });

  /* sortable table */
  $$('table[data-sortable]').forEach(function (tbl) {
    var btns = $$('.sortbtn', tbl), body = $('tbody', tbl);
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var k = +b.dataset.k, num = b.hasAttribute('data-num');
        var dir = b.getAttribute('aria-sort') === 'ascending' ? 'descending' : b.getAttribute('aria-sort') === 'descending' ? 'ascending' : (num ? 'descending' : 'ascending');
        btns.forEach(function (x) { x.removeAttribute('aria-sort'); });
        b.setAttribute('aria-sort', dir);
        var rows = $$('tr', body);
        rows.sort(function (r1, r2) {
          var a = r1.children[k].dataset.v, c = r2.children[k].dataset.v;
          var res = num ? (parseFloat(a) - parseFloat(c)) : a.localeCompare(c);
          return dir === 'ascending' ? res : -res;
        }).forEach(function (r) { body.appendChild(r); });
      });
    });
  });

  /* share: copy the link; the share sheet where the browser has one */
  $$('[data-share]').forEach(function (box) {
    var input = $('input', box), copy = $('[data-copy]', box), sheet = $('[data-sharesheet]', box);
    copy.addEventListener('click', function () {
      input.select();
      var done = function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(input.value).then(done, function () { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
    if (navigator.share) {
      sheet.hidden = false;
      sheet.addEventListener('click', function () { navigator.share({ title: box.dataset.title, text: box.dataset.title + ' #UniteForTheFight', url: input.value }).catch(function () {}); });
    }
  });
})();
