/* Call script builder (docs/call-script-builder.md). Builds a call script from the issues and asks a visitor picks.
   Name, city, ZIP and reason stay in the page: never stored, sent, or put in a link (U-9). Share links carry only
   the chosen issues and asks, e.g. #script=money.refuse,ice.identify.t ("t" = thank them).
   The script text comes from assemble(), which tools/test_builder.mjs runs in Node against data/call-scripts.yaml. */
(function (root) {
  'use strict';
  var blank = '____';

  function list(xs) {
    return xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
  }

  /* picks: [{issue, ask, thanks}] in chip order; ask "stand" = just ask where they stand */
  function assemble(data, picks, who, you, voicemail) {
    var T = who.title + ' ' + who.last, by = {}, lines = [], stand = [];
    data.issues.forEach(function (i) { by[i.id] = i; });
    picks = picks.filter(function (p) { return by[p.issue]; });
    if (!picks.length) return [];
    lines.push('Hi, my name is ' + (you.name || blank) + ", and I'm a constituent from " + (you.city || blank) + ', ZIP ' + (you.zip || blank) + '.');
    lines.push("I'm calling about " + list(picks.map(function (p) { return by[p.issue].short; })) + '.');
    picks.forEach(function (p) {
      if (p.ask === 'stand') { stand.push(by[p.issue].short); return; }
      var a = by[p.issue].asks.filter(function (x) { return x.id === p.ask; })[0] || by[p.issue].asks[0];
      lines.push(p.thanks ? a.thanks.replace(/\{T\}/g, T) + ' Please keep going.' : a.ask.replace(/\{T\}/g, T));
    });
    if (you.why) lines.push('This matters to me because ' + you.why.replace(/[.\s]+$/, '') + '.');
    if (stand.length) lines.push('Can you tell me where ' + T + ' stands on ' + list(stand) + '?');
    lines.push(voicemail ? 'Please record my position. Thank you.' : 'Please record my position. Thank you for your time.');
    if (voicemail) lines.push('Again, my ZIP is ' + (you.zip || blank) + '.');
    return lines;
  }

  function seconds(lines) {
    var words = lines.join(' ').split(/\s+/).length;
    return Math.max(15, Math.round(words / 2.6 / 5) * 5);
  }

  function encode(picks) {
    return picks.map(function (p) { return p.issue + '.' + p.ask + (p.thanks ? '.t' : ''); }).join(',');
  }

  function decode(data, s) {
    var ok = {}, out = [];
    data.issues.forEach(function (i) { ok[i.id] = { stand: 1 }; i.asks.forEach(function (a) { ok[i.id][a.id] = 1; }); });
    String(s || '').split(',').forEach(function (part) {
      var b = part.split('.');
      if (ok[b[0]] && ok[b[0]][b[1]] && !out.some(function (p) { return p.issue === b[0]; }))
        out.push({ issue: b[0], ask: b[1], thanks: b[2] === 't' && b[1] !== 'stand' });
    });
    return out;
  }

  var api = { assemble: assemble, seconds: seconds, encode: encode, decode: decode };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.CSB = api;

  /* ---------- the page ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var dataEl = document.getElementById('csb-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var tel = function (p) { return 'tel:' + String(p).replace(/[^\d+]/g, ''); };
  var zipCache = {};
  function zipInfo(z) {
    var k = z.slice(0, 3);
    var p = zipCache[k] || (zipCache[k] = fetch('/data/zips/' + k + '.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }));
    return p.then(function (d) { return d[z] || null; });
  }

  $$('[data-csb]').forEach(function (box) {
    var form = $('form', box), out = $('.csb-script', box), live = $('.csb-live', box);
    var who = $('.csb-who', box), meta = $('.csb-len', box), callA = $('.csb-call', box), offices = $('.csb-offices', box);
    var note = $('.csb-many', box), msg = $('.csb-msg', box), vm = $('[name=vm]', box), stateSel = $('[name=state]', box);
    var officials = DATA.officials || null, current = null, zipDistricts = null;

    function people() {
      var st = stateSel ? stateSel.value : box.getAttribute('data-state');
      return st && officials && officials[st] ? officials[st] : [];
    }

    function drawWho() {
      var ps = people(), sel = current && current.k;
      if (!ps.length) { who.innerHTML = '<p class="csb-hint">' + (stateSel ? 'Pick your state to see who to call.' : '') + '</p>'; current = null; return; }
      var sens = ps.filter(function (p) { return p.t === 'Senator'; });
      var reps = ps.filter(function (p) { return p.t === 'Representative'; });
      if (zipDistricts) reps = reps.filter(function (p) { return zipDistricts.indexOf(p.d) >= 0; });
      var h = '<fieldset><legend>Who are you calling?</legend><div class="csb-people">';
      sens.concat(reps.length <= 3 ? reps : []).forEach(function (p) {
        h += '<label class="chip person"><input type="radio" name="who" value="' + p.k + '"' + (p.k === sel ? ' checked' : '') + '><span><b>' + p.t + ' ' + p.n + '</b>' +
          (p.t === 'Representative' ? '<small>' + (p.d ? 'District ' + p.d : 'At large') + '</small>' : '') + '</span></label>';
      });
      h += '</div>';
      if (reps.length > 3) {
        h += '<label class="csb-pick">Your representative <select name="rep"><option value="">Pick your district</option>' +
          reps.map(function (p) { return '<option value="' + p.k + '"' + (p.k === sel ? ' selected' : '') + '>District ' + p.d + ': ' + p.n + '</option>'; }).join('') +
          '</select></label><p class="csb-hint">Type your ZIP below and we’ll pick your district.</p>';
      } else if (zipDistricts && zipDistricts.length > 1) {
        h += '<p class="csb-hint">Your ZIP crosses more than one district. If you’re not sure which is yours, the House lookup at house.gov finds it from your address.</p>';
      }
      who.innerHTML = h + '</fieldset>';
      if (!current || !ps.some(function (p) { return p.k === current.k; })) current = sens[0] || reps[0] || null;
      var r = current && $('[name=who][value="' + current.k + '"]', who);
      if (r) r.checked = true;
    }

    function picks() {
      return $$('[name=issue]', form).filter(function (c) { return c.checked; }).map(function (c) {
        var f = $('fieldset[data-issue="' + c.value + '"]', form), a = $('[name="ask-' + c.value + '"]:checked', f);
        var t = $('[name="thanks-' + c.value + '"]', f);
        return { issue: c.value, ask: a ? a.value : 'stand', thanks: !!(t && t.checked && a && a.value !== 'stand') };
      });
    }

    function you() {
      var g = function (n) { var e = $('[name=' + n + ']', form); return e ? e.value.trim() : ''; };
      return { name: g('yname'), city: g('ycity'), zip: /^\d{5}$/.test(g('yzip')) ? g('yzip') : '', why: g('ywhy') };
    }

    function render(announce) {
      $$('fieldset[data-issue]', form).forEach(function (f) {
        var on = $('[name=issue][value="' + f.getAttribute('data-issue') + '"]', form).checked;
        f.hidden = !on;
        var a = $('[name="ask-' + f.getAttribute('data-issue') + '"]:checked', f), t = $('.tog', f);
        if (t) t.hidden = !a || a.value === 'stand';
      });
      var ps = picks(), w = current ? { title: current.t, last: current.l } : { title: 'my', last: 'senator' };
      var lines = assemble(DATA, ps, w, you(), vm && vm.checked);
      out.innerHTML = lines.length ? lines.map(function (l) { return '<p>' + l.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</p>'; }).join('')
        : '<p class="csb-hint">Pick an issue above and your script appears here.</p>';
      box.classList.toggle('empty', !lines.length);
      meta.textContent = lines.length ? 'About ' + seconds(lines) + ' seconds' : '';
      note.hidden = ps.length <= 3;
      if (current) {
        callA.href = tel(current.p); callA.textContent = 'Call ' + current.t + ' ' + current.l + ' '; var n = document.createElement('span'); n.className = 'nw'; n.textContent = current.p; callA.appendChild(n); callA.hidden = false;
        offices.innerHTML = (current.o || []).map(function (o) { return '<li><a href="' + tel(o[1]) + '">' + o[1] + '</a> · ' + o[0] + ' office</li>'; }).join('');
      } else { callA.hidden = true; offices.innerHTML = ''; }
      if (announce) { live.textContent = ''; setTimeout(function () { live.textContent = 'Script updated'; }, 50); }
    }

    function text() { return $$('p', out).map(function (p) { return p.textContent; }).join('\n'); }
    function say(s) { msg.textContent = s; setTimeout(function () { if (msg.textContent === s) msg.textContent = ''; }, 4000); }
    function copy(s, done) {
      (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(function () { say(done); }, function () {
        var t = document.createElement('textarea'); t.value = s; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); say(done); } catch (e) { say('Select the text and copy it.'); }
        t.remove();
      });
    }

    form.addEventListener('change', function (e) {
      if (e.target.name === 'who' || e.target.name === 'rep') {
        current = people().filter(function (p) { return p.k === e.target.value; })[0] || current;
        if (e.target.name === 'rep') $$('[name=who]', who).forEach(function (r) { r.checked = false; });
      }
      if (e.target.name === 'state') { current = null; zipDistricts = null; drawWho(); }
      render(e.target.type === 'checkbox' || e.target.type === 'radio' || e.target.tagName === 'SELECT');
    });
    form.addEventListener('input', function (e) {
      if (e.target.name === 'yzip' && /^\d{5}$/.test(e.target.value.trim())) {
        zipInfo(e.target.value.trim()).then(function (z) {
          if (!z) return;
          if (stateSel && stateSel.value !== z[2]) { stateSel.value = z[2]; current = null; }
          zipDistricts = z[3] || null;
          drawWho();
          render(false);
        });
      } else render(false);
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    if (vm) vm.addEventListener('change', function () { render(true); });
    $('.csb-copy', box).addEventListener('click', function () { copy(text(), 'Copied. Paste it into your notes or read it from here.'); });
    $('.csb-share', box).addEventListener('click', function () {
      var ps = picks();
      if (!ps.length) { say('Pick at least one issue to share a script.'); return; }
      var url = location.origin + location.pathname + '#script=' + encode(ps);
      if (navigator.share) navigator.share({ title: 'A call script', url: url }).catch(function () {});
      else copy(url, 'Link copied. It holds only the issues you picked, nothing about you.');
    });
    $$('[data-csb-pick]').forEach(function (a) {
      a.addEventListener('click', function () {
        var k = a.getAttribute('data-csb-pick');
        current = people().filter(function (p) { return p.k === k; })[0] || current;
        drawWho(); render(false);
      });
    });

    box.classList.add('live');
    $$('.csb-static', box).forEach(function (e) { e.hidden = true; });
    $$('.csb-js', box).forEach(function (e) { e.hidden = false; });
    function start() {
      var m = /#script=([\w.,]+)/.exec(location.hash);
      if (m) {
        var ps = decode(DATA, m[1]);
        $$('[name=issue]', form).forEach(function (c) { c.checked = false; });
        ps.forEach(function (p) {
          var c = $('[name=issue][value="' + p.issue + '"]', form); if (c) c.checked = true;
          var a = $('[name="ask-' + p.issue + '"][value="' + p.ask + '"]', form); if (a) a.checked = true;
          var t = $('[name="thanks-' + p.issue + '"]', form); if (t) t.checked = p.thanks;
        });
        box.scrollIntoView();
      }
      var z = $('[data-zipsort] input');
      if (z && /^\d{5}$/.test(z.value) && $('[name=yzip]', form) && !$('[name=yzip]', form).value) {
        $('[name=yzip]', form).value = z.value;
        $('[name=yzip]', form).dispatchEvent(new Event('input', { bubbles: true }));
      }
      drawWho(); render(false);
    }
    if (stateSel && !officials) {
      fetch('/data/officials.json').then(function (r) { return r.json(); }).then(function (o) { officials = o; start(); }).catch(start);
    } else start();
  });
})(this);
