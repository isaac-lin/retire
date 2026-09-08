/* 退休水位 — 逐年資產模擬。全部在瀏覽器內計算。 */
(function () {
  'use strict';

  var END_AGE = 100;        // 模擬到 100 歲
  var TARGET_AGE = 95;      // 「最早可退休」與「缺口」的存活目標
  var WAN = 10000;          // 萬 → 億 的換算門檻

  var DEFAULTS = {
    currentAge: 42, retireAge: 56, assets: 1400, save: 3,
    spend: 10, pension: 2.4, loan: 2.5, loanEndAge: 68,
    slowAge: 75, slowPct: 85, careAge: 85, carePct: 110,
    rPre: 6, rPost: 3.5, infl: 2.5, pensionAge: 65
  };
  var KEYS = Object.keys(DEFAULTS);   // 皆為數值欄位；smile 是勾選框，另外處理
  var SMILE_ON = true;

  var el = {};
  KEYS.forEach(function (k) { el[k] = document.getElementById(k); });
  el.smile = document.getElementById('smile');

  var $ = function (id) { return document.getElementById(id); };
  var bars = $('bars'), axis = $('axis'), strip = $('strip'), probe = $('probe');
  var markRetire = $('markRetire'), markDry = $('markDry'), markLoan = $('markLoan');
  var ledgerBody = $('ledgerBody');

  var lastRows = [], lastStart = 0;

  /* ── 格式 ─────────────────────────────────────── */
  function wan(v) {
    var neg = v < 0, a = Math.abs(v);
    var s;
    if (a >= WAN) s = (a / WAN).toFixed(a >= WAN * 10 ? 1 : 2) + ' 億';
    else s = Math.round(a).toLocaleString('en-US') + ' 萬';
    return (neg ? '−' : '') + s;
  }
  function wanPlain(v) {
    var neg = v < 0;
    return (neg ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('en-US');
  }

  /* ── 讀取輸入 ─────────────────────────────────── */
  function num(input, fallback) {
    var v = parseFloat(input.value);
    if (!isFinite(v)) return fallback;
    var lo = parseFloat(input.min), hi = parseFloat(input.max);
    if (isFinite(lo)) v = Math.max(lo, v);
    if (isFinite(hi)) v = Math.min(hi, v);
    return v;
  }
  function read() {
    var p = {};
    KEYS.forEach(function (k) { p[k] = num(el[k], DEFAULTS[k]); });
    p.currentAge = Math.round(p.currentAge);
    p.retireAge = Math.max(Math.round(p.retireAge), p.currentAge + 1);
    p.pensionAge = Math.round(p.pensionAge);
    p.loanEndAge = Math.round(p.loanEndAge);
    p.smile = el.smile.checked;
    p.slowAge = Math.round(p.slowAge);
    p.careAge = Math.max(Math.round(p.careAge), p.slowAge);
    return p;
  }

  /* ── 模擬 ─────────────────────────────────────── */
  // 支出微笑曲線：活躍期 100%、平淡期回落、照護期因醫療與長照回升。
  // 關閉時三階段皆為 100%，等同固定實質支出。
  function spendFactor(p, age) {
    if (!p.smile) return 1;
    if (age >= p.careAge) return p.carePct / 100;
    if (age >= p.slowAge) return p.slowPct / 100;
    return 1;
  }

  // 每年：期初生息 → 再加投入 / 扣淨支出。金額單位皆為萬元（名目）。
  function simulate(p, retireAge, endAge) {
    retireAge = retireAge || p.retireAge;
    endAge = endAge || END_AGE;
    var inf = p.infl / 100, rPre = p.rPre / 100, rPost = p.rPost / 100;
    var bal = p.assets, rows = [], dryAge = null, atRetire = null, firstSpend = null;

    for (var age = p.currentAge; age <= endAge; age++) {
      var open = bal;
      var retired = age >= retireAge;
      var rate = retired ? rPost : rPre;
      var growth = open * rate;
      var flow;

      // 房貸月付為名目固定，不隨通膨調整；累積期已隱含在「每月存入」中，
      // 只有退休後才需要從資產扣。
      var loanYear = (retired && age <= p.loanEndAge) ? p.loan * 12 : 0;

      if (!retired) {
        flow = p.save * 12;
      } else {
        var scale = Math.pow(1 + inf, age - p.currentAge);
        var spend = p.spend * 12 * scale * spendFactor(p, age);
        var inc = age >= p.pensionAge ? p.pension * 12 * scale : 0;
        if (firstSpend === null) firstSpend = spend;
        flow = -(spend + loanYear - inc);
      }

      bal = open + growth + flow;
      if (age === retireAge - 1) atRetire = bal;
      if (dryAge === null && bal < 0) dryAge = age;

      rows.push({
        age: age, open: open, growth: growth, flow: flow, loan: loanYear, close: bal,
        phase: dryAge !== null && age >= dryAge ? 'dry' : (retired ? 'draw' : 'accum'),
        retireStart: age === retireAge
      });
    }
    if (atRetire === null) atRetire = p.assets;
    return { rows: rows, dryAge: dryAge, atRetire: atRetire, firstSpend: firstSpend };
  }

  function lastsTo(p, retireAge, save) {
    var q = Object.assign({}, p);
    if (save !== undefined) q.save = save;
    var s = simulate(q, retireAge, TARGET_AGE);
    return s.dryAge === null;
  }

  // 以現在的存法，最早哪一年退休還撐得到 95 歲
  function earliestRetire(p) {
    for (var a = p.currentAge + 1; a <= 80; a++) if (lastsTo(p, a)) return a;
    return null;
  }

  // 二分搜尋：要撐到 95 歲，每月至少得存多少
  function requiredSave(p) {
    var lo = 0, hi = 200;
    if (!lastsTo(p, p.retireAge, hi)) return null;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (lastsTo(p, p.retireAge, mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  /* ── 繪製長條 ─────────────────────────────────── */
  function drawStrip(p, sim) {
    var rows = sim.rows;
    lastRows = rows; lastStart = p.currentAge;

    var maxPos = 0, i;
    for (i = 0; i < rows.length; i++) if (rows[i].close > maxPos) maxPos = rows[i].close;
    var posScale = maxPos > 0 ? maxPos : 1;
    var negScale = Math.max(posScale * 0.35, 1);

    var frag = document.createDocumentFragment();
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var d = document.createElement('div');
      d.className = 'year';
      d.dataset.phase = r.phase;
      d.dataset.i = i;
      if (r.close > 0) d.style.setProperty('--p', (r.close / posScale).toFixed(4));
      else d.style.setProperty('--n', Math.min(1, -r.close / negScale).toFixed(4));
      frag.appendChild(d);
    }
    bars.replaceChildren(frag);

    var span = rows.length;
    function pct(age) { return ((age - p.currentAge + 0.5) / span) * 100; }

    if (p.retireAge <= END_AGE) {
      markRetire.hidden = false;
      markRetire.style.left = pct(p.retireAge) + '%';
    } else { markRetire.hidden = true; }

    if (p.loan > 0 && p.loanEndAge > p.retireAge && p.loanEndAge <= END_AGE) {
      markLoan.hidden = false;
      markLoan.style.left = pct(p.loanEndAge + 1) + '%';
    } else { markLoan.hidden = true; }

    if (sim.dryAge !== null) {
      markDry.hidden = false;
      markDry.style.left = pct(sim.dryAge) + '%';
      markDry.querySelector('.mark-label').textContent = sim.dryAge + ' 歲見底';
    } else { markDry.hidden = true; }

    var ticks = document.createDocumentFragment();
    for (var a = Math.ceil(p.currentAge / 10) * 10; a <= END_AGE; a += 10) {
      var t = document.createElement('span');
      t.className = 'tickmark';
      t.style.left = pct(a) + '%';
      t.textContent = a;
      ticks.appendChild(t);
    }
    axis.replaceChildren(ticks);

    $('stripAlt').textContent = '從 ' + p.currentAge + ' 歲到 ' + END_AGE +
      ' 歲的逐年資產長條圖。' + p.retireAge + ' 歲退休，' +
      (sim.dryAge !== null ? sim.dryAge + ' 歲資產見底。' : '資產可撐過 ' + END_AGE + ' 歲。');
  }

  /* ── 明細表 ───────────────────────────────────── */
  function drawLedger(sim) {
    var thisYear = new Date().getFullYear();
    var base = sim.rows.length ? sim.rows[0].age : 0;
    var names = { accum: '累積', draw: '提領', dry: '赤字' };
    var frag = document.createDocumentFragment();

    sim.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.dataset.phase = r.phase;
      if (r.retireStart) tr.dataset.mark = 'retire';
      var cells = [
        r.age, thisYear + (r.age - base), names[r.phase],
        wanPlain(r.open), r.loan > 0 ? '−' + wanPlain(r.loan) : '—',
        (r.flow >= 0 ? '+' : '') + wanPlain(r.flow),
        (r.growth >= 0 ? '+' : '') + wanPlain(r.growth), wanPlain(r.close)
      ];
      cells.forEach(function (v, idx) {
        var td = document.createElement('td');
        if (idx !== 2) td.className = 'num';
        td.textContent = v;
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    ledgerBody.replaceChildren(frag);
  }

  /* ── 主要更新 ─────────────────────────────────── */
  function update() {
    var p = read();
    if (Math.round(num(el.retireAge, DEFAULTS.retireAge)) !== p.retireAge) {
      el.retireAge.value = p.retireAge;
    }
    if (Math.round(num(el.careAge, DEFAULTS.careAge)) !== p.careAge) {
      el.careAge.value = p.careAge;
    }
    syncRanges(p);

    var sim = simulate(p);
    drawStrip(p, sim);
    drawLedger(sim);

    var dry = sim.dryAge;
    var tone = dry === null ? 'safe' : (dry >= TARGET_AGE ? 'safe' : 'dry');

    $('verdictAge').textContent = dry === null ? '撐得過 100 歲' : dry + ' 歲';
    $('verdict').dataset.tone = tone;
    $('verdictNote').textContent = dry === null
      ? p.retireAge + ' 歲退休，錢一路撐到模擬終點，還有剩。'
      : p.retireAge + ' 歲退休，領了 ' + (dry - p.retireAge) + ' 年之後歸零。';

    $('rDry').textContent = dry === null ? '100+ 歲' : dry + ' 歲';
    $('rDry').closest('.row').dataset.tone = tone;

    var early = earliestRetire(p);
    $('rEarliest').textContent = early === null ? '80 歲後' : early + ' 歲';

    var loanYears = Math.max(0, Math.min(p.loanEndAge, END_AGE) - p.retireAge + 1);
    if (p.loan <= 0 || loanYears <= 0) {
      $('rLoanLeft').textContent = '無';
    } else {
      $('rLoanLeft').textContent = loanYears + ' 年／' + wan(p.loan * 12 * loanYears);
    }

    document.getElementById('form').classList.toggle('no-smile', !p.smile);
    if (!p.smile) {
      $('rPhases').textContent = wan(p.spend * 12) + '（固定）';
    } else {
      var note = '';
      if (dry !== null && dry < p.careAge) note = dry < p.slowAge ? '（未及平淡期）' : '（未及照護期）';
      $('rPhases').textContent = [1, p.slowPct / 100, p.carePct / 100]
        .map(function (f) { return Math.round(p.spend * 12 * f); }).join(' → ') + note;
    }

    $('rAtRetire').textContent = wan(sim.atRetire);
    var years = Math.max(0, p.retireAge - p.currentAge);
    $('rAtRetireReal').textContent = wan(sim.atRetire / Math.pow(1 + p.infl / 100, years));
    $('rFirstSpend').textContent = sim.firstSpend === null ? '—' : wan(sim.firstSpend) + '／年';
    $('rRule4').textContent = sim.firstSpend === null ? '—' : wan(sim.firstSpend / 0.04);

    drawGap(p, sim, dry, early);
  }

  function drawGap(p, sim, dry, early) {
    var box = $('gapBox'), head = $('gapHead'), body = $('gapBody');
    if (dry === null || dry >= TARGET_AGE) {
      box.dataset.tone = 'safe';
      head.textContent = '目前的存法夠用';
      body.innerHTML = '照這組數字，資產可以撐到 ' +
        (dry === null ? '模擬終點 100 歲' : dry + ' 歲') +
        '，超過 ' + TARGET_AGE + ' 歲的目標。若想提早退休，最早可以在 <b>' +
        (early === null ? '80 歲之後' : early + ' 歲') + '</b> 收手。';
      return;
    }
    box.dataset.tone = 'dry';
    head.textContent = '缺口';
    var need = requiredSave(p);
    var msgs = ['要讓錢撐到 ' + TARGET_AGE + ' 歲，維持 ' + p.retireAge + ' 歲退休的話，'];
    if (need === null) {
      msgs.push('光靠提高存款率補不回來，得往下調支出、往後挪退休年齡，或兩者一起。');
    } else {
      var more = need - p.save;
      msgs.push('每月要存到 <b>' + need.toFixed(1) + ' 萬</b>，比現在多 <b>' +
        more.toFixed(1) + ' 萬</b>。');
      if (early !== null && early > p.retireAge) {
        msgs.push('或者維持現在的存法，把退休延到 <b>' + early + ' 歲</b>。');
      }
    }
    body.innerHTML = msgs.join('');
  }

  /* ── 輸入連動 ─────────────────────────────────── */
  function syncRanges(p) {
    document.querySelectorAll('.rng').forEach(function (r) {
      var v = p[r.dataset.for];
      if (v === undefined) return;
      var lo = parseFloat(r.min), hi = parseFloat(r.max);
      r.value = Math.min(hi, Math.max(lo, v));
    });
  }

  document.querySelectorAll('.rng').forEach(function (r) {
    r.addEventListener('input', function () {
      el[r.dataset.for].value = r.value;
      update();
    });
  });
  KEYS.forEach(function (k) {
    el[k].addEventListener('input', update);
    el[k].addEventListener('blur', function () {
      el[k].value = num(el[k], DEFAULTS[k]);
      update();
    });
  });
  el.smile.addEventListener('change', update);

  $('reset').addEventListener('click', function () {
    KEYS.forEach(function (k) { el[k].value = DEFAULTS[k]; });
    el.smile.checked = SMILE_ON;
    update();
    el.currentAge.focus();
  });

  /* ── 長條探針 ─────────────────────────────────── */
  var probed = null;
  function showProbe(i) {
    if (!lastRows[i]) return;
    if (probed) probed.classList.remove('is-probed');
    var node = bars.children[i];
    if (node) { node.classList.add('is-probed'); probed = node; }
    var r = lastRows[i];
    probe.innerHTML = r.age + ' 歲　<b>' + wan(r.close) + '</b>';
  }
  function clearProbe() {
    if (probed) probed.classList.remove('is-probed');
    probed = null;
    probe.textContent = '';
  }
  strip.addEventListener('pointermove', function (e) {
    var rect = strip.getBoundingClientRect();
    var i = Math.floor(((e.clientX - rect.left) / rect.width) * lastRows.length);
    showProbe(Math.max(0, Math.min(lastRows.length - 1, i)));
  });
  strip.addEventListener('pointerleave', clearProbe);
  strip.addEventListener('blur', clearProbe);
  strip.addEventListener('keydown', function (e) {
    var cur = probed ? parseInt(probed.dataset.i, 10) : -1;
    if (e.key === 'ArrowRight') { showProbe(Math.min(lastRows.length - 1, cur + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { showProbe(Math.max(0, cur <= 0 ? 0 : cur - 1)); e.preventDefault(); }
    else if (e.key === 'Escape') clearProbe();
  });

  $('year').textContent = new Date().getFullYear();
  update();
})();
