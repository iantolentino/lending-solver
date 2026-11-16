(function () {
  var $ = function (id) { return document.getElementById(id); };
  var method = "flat";
  var lastText = "";
  var lastData = null;
  var imageShown = false;

  var fmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });
  function money(n) { return fmt.format(n); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function pct(n) { return n.toFixed(2) + "%"; }

  // Default start date: today
  (function setDefaultDate() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    $("startDate").value = d.getFullYear() + "-" + m + "-" + day;
  })();

  function addMonths(isoDate, n) {
    var p = isoDate.split("-");
    var y = +p[0], m = +p[1] - 1, d = +p[2];
    var target = new Date(y, m + n, 1);
    var last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d, last));
    return target;
  }
  var dateFmt = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" });

  function buildSchedule(loan, months, rate, kind) {
    var rows = [];
    var rem = loan;
    var i, interest, principal, payment;

    if (kind === "flat") {
      var totalInt = r2(loan * rate * months);
      var basePay = r2((loan + totalInt) / months);
      var baseInt = r2(totalInt / months);
      var intLeft = totalInt;
      for (i = 1; i <= months; i++) {
        if (i === months) {
          interest = r2(intLeft);
          principal = r2(rem);
        } else {
          interest = baseInt;
          principal = r2(basePay - interest);
        }
        payment = r2(principal + interest);
        intLeft = r2(intLeft - interest);
        rem = r2(rem - principal);
        if (rem < 0) rem = 0;
        rows.push({ n: i, payment: payment, interest: interest, principal: principal, balance: rem });
      }
    } else {
      var pay;
      if (rate === 0) pay = r2(loan / months);
      else pay = r2(loan * rate / (1 - Math.pow(1 + rate, -months)));
      for (i = 1; i <= months; i++) {
        interest = r2(rem * rate);
        if (i === months) principal = r2(rem);
        else principal = r2(pay - interest);
        payment = r2(principal + interest);
        rem = r2(rem - principal);
        if (rem < 0) rem = 0;
        rows.push({ n: i, payment: payment, interest: interest, principal: principal, balance: rem });
      }
    }
    return rows;
  }

  // Monthly rate r where PV of payments equals the net amount released
  function effectiveRate(net, rows) {
    if (net <= 0 || !rows.length) return 0;
    function pv(r) {
      var s = 0;
      for (var i = 0; i < rows.length; i++) s += rows[i].payment / Math.pow(1 + r, i + 1);
      return s;
    }
    var lo = 0, hi = 5;
    if (pv(0) <= net) return 0;
    for (var k = 0; k < 80; k++) {
      var mid = (lo + hi) / 2;
      if (pv(mid) > net) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function showError(msg) {
    $("error").textContent = msg;
    ["loanAmount", "months", "interestRate", "feeRate"].forEach(function (id) {
      $(id).removeAttribute("aria-invalid");
    });
  }

  function clearResults() {
    $("monthlyPayment").textContent = money(0);
    $("totalInterest").textContent = money(0);
    $("totalPayment").textContent = money(0);
    $("netProceeds").textContent = money(0);
    $("effRate").textContent = pct(0);
    $("termSub").textContent = "";
    $("scheduleBody").innerHTML = "";
    $("scheduleFoot").innerHTML = "";
    $("barP").style.width = "0"; $("barI").style.width = "0"; $("barF").style.width = "0";
    $("lgP").textContent = ""; $("lgI").textContent = ""; $("lgF").textContent = "";
    lastText = "";
    lastData = null;
    if (imageShown) { $("imgPreview").hidden = true; $("saveImgBtn").hidden = true; imageShown = false; }
  }

  function calculate() {
    var loan = parseFloat($("loanAmount").value);
    var months = parseInt($("months").value, 10);
    var rate = parseFloat($("interestRate").value);
    var feePct = parseFloat($("feeRate").value);
    if (isNaN(feePct)) feePct = 0;

    var msg = "", bad = null;
    if (isNaN(loan) || loan <= 0) { msg = "Enter a loan amount greater than 0."; bad = "loanAmount"; }
    else if (isNaN(months) || months < 1 || months > 120) { msg = "Enter a term between 1 and 120 months."; bad = "months"; }
    else if (isNaN(rate) || rate < 0) { msg = "Enter an interest rate of 0 or more."; bad = "interestRate"; }
    else if (feePct < 0 || feePct >= 100) { msg = "Enter a processing fee between 0 and 99.9%."; bad = "feeRate"; }

    if (msg) {
      clearResults();
      $("error").textContent = msg;
      $(bad).setAttribute("aria-invalid", "true");
      return;
    }
    showError("");

    var mr = rate / 100;
    var rows = buildSchedule(loan, months, mr, method);

    var totalInterest = 0, totalPayment = 0, totalPrincipal = 0;
    rows.forEach(function (r) {
      totalInterest += r.interest; totalPayment += r.payment; totalPrincipal += r.principal;
    });
    totalInterest = r2(totalInterest); totalPayment = r2(totalPayment); totalPrincipal = r2(totalPrincipal);

    var fee = r2(loan * feePct / 100);
    var net = r2(loan - fee);
    var firstPay = rows[0].payment;
    var samePay = rows.every(function (r) { return Math.abs(r.payment - firstPay) < 0.011; });
    var eff = effectiveRate(net, rows) * 100;

    $("monthlyPayment").textContent = money(firstPay);
    $("termSub").textContent = samePay ? ("for " + months + (months === 1 ? " month" : " months")) :
      ("for " + months + " months (last payment " + money(rows[rows.length - 1].payment) + ")");
    $("totalInterest").textContent = money(totalInterest);
    $("totalPayment").textContent = money(totalPayment);
    $("netProceeds").textContent = money(net);
    $("effRate").textContent = pct(eff) + " / mo";

    // Bar: principal, interest and fee as shares of total cost to borrower
    var cost = totalPrincipal + totalInterest + fee;
    var wp = cost ? totalPrincipal / cost * 100 : 0;
    var wi = cost ? totalInterest / cost * 100 : 0;
    var wf = cost ? fee / cost * 100 : 0;
    $("barP").style.width = wp + "%";
    $("barI").style.width = wi + "%";
    $("barF").style.width = wf + "%";
    $("lgP").textContent = money(totalPrincipal) + " (" + wp.toFixed(1) + "%)";
    $("lgI").textContent = money(totalInterest) + " (" + wi.toFixed(1) + "%)";
    $("lgF").textContent = money(fee) + " (" + wf.toFixed(1) + "%)";
    $("lgFWrap").style.display = fee > 0 ? "" : "none";
    $("barF").style.display = fee > 0 ? "" : "none";

    var methodName = method === "flat" ? "flat rate" : "reducing balance";
    var html = "A loan of <strong>" + money(loan) + "</strong> over <strong>" + months +
      (months === 1 ? " month" : " months") + "</strong> at <strong>" + rate + "% per month</strong> (" + methodName + ") " +
      "costs <strong>" + money(totalInterest) + "</strong> in interest. The borrower repays <strong>" + money(totalPayment) + "</strong> in total";
    if (fee > 0) html += " and receives <strong>" + money(net) + "</strong> after the " + feePct + "% fee";
    html += ". Measured against the amount actually released, the true cost is <strong>" + pct(eff) + " per month</strong>.";

    var d = $("startDate").value;
    var offset = parseInt($("firstPay").value, 10) || 0;
    var body = $("scheduleBody");
    body.innerHTML = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      var due = d ? dateFmt.format(addMonths(d, r.n - 1 + offset)) : "-";
      tr.innerHTML = '<td data-label="Month">' + r.n + '</td><td data-label="Due date">' + due +
        '</td><td data-label="Payment">' + money(r.payment) + '</td><td data-label="Interest">' +
        money(r.interest) + '</td><td data-label="Principal">' + money(r.principal) +
        '</td><td data-label="Balance">' + money(r.balance) + '</td>';
      body.appendChild(tr);
    });
    $("scheduleFoot").innerHTML = '<tr><td data-label="Total">Total</td><td></td><td data-label="Payment">' + money(totalPayment) +
      '</td><td data-label="Interest">' + money(totalInterest) + '</td><td data-label="Principal">' +
      money(totalPrincipal) + '</td><td></td></tr>';

    lastData = {
      loan: loan, months: months, rate: rate, methodName: methodName, rows: rows,
      totalInterest: totalInterest, totalPayment: totalPayment, totalPrincipal: totalPrincipal,
      fee: fee, net: net, eff: eff, firstPay: firstPay, startDate: d, offset: offset
    };
    if (imageShown) renderImage();

    lastText = "Loan: " + money(loan) + " for " + months + " months at " + rate + "% per month (" + methodName + ")\n" +
      "Monthly payment: " + money(firstPay) + "\n" +
      "Total interest: " + money(totalInterest) + "\n" +
      "Total repayment: " + money(totalPayment) +
      (fee > 0 ? "\nProcessing fee: " + money(fee) + "\nAmount released: " + money(net) : "") +
      "\nEffective rate: " + pct(eff) + " per month";
  }

  function setMethodHint() {}

  (function buildMonthSelect() {
    var sel = $("monthSelect");
    var o = document.createElement("option");
    o.value = ""; o.textContent = "Custom"; sel.appendChild(o);
    for (var i = 1; i <= 60; i++) {
      var op = document.createElement("option");
      op.value = String(i); op.textContent = i + (i === 1 ? " month" : " months");
      sel.appendChild(op);
    }
  })();

  $("monthSelect").addEventListener("change", function () {
    if (!this.value) { $("months").focus(); return; }
    $("months").value = this.value;
    syncPresets();
    calculate();
  });

  function syncPresets() {
    var m = parseInt($("months").value, 10);
    $("monthSelect").value = (m >= 1 && m <= 60) ? String(m) : "";
    var isPreset = false;
    document.querySelectorAll("#termPresets button").forEach(function (b) {
      var on = +b.dataset.months === m;
      if (on) isPreset = true;
      b.setAttribute("aria-pressed", String(on));
    });
    $("months").classList.toggle("custom-active", !isPreset && !isNaN(m));
  }

  document.querySelectorAll("#termPresets button").forEach(function (b) {
    b.addEventListener("click", function () {
      $("months").value = b.dataset.months;
      syncPresets();
      calculate();
    });
  });

  document.querySelectorAll("#methodToggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      method = b.dataset.method;
      document.querySelectorAll("#methodToggle button").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      setMethodHint();
      calculate();
    });
  });

  ["loanAmount", "months", "interestRate", "feeRate", "startDate", "firstPay"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      if (id === "months") syncPresets();
      calculate();
    });
  });

  $("copyBtn").addEventListener("click", function () {
    var status = $("copyStatus");
    if (!lastText) { status.textContent = "Nothing to copy yet."; return; }
    function done(ok) {
      status.textContent = ok ? "Summary copied." : "Copy is blocked here. Select and copy the summary text instead.";
      setTimeout(function () { status.textContent = ""; }, 3000);
    }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = lastText;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        done(ok);
      } catch (e) { done(false); }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(lastText).then(function () { done(true); }, fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  });


  // ---------- Schedule image ----------
  var canvas = document.createElement("canvas");
  var downloadsApi = null;

  var imageMode = "lender";

  function drawSchedule(mode) {
    var d = lastData;
    if (!d) return false;
    var borrower = mode === "borrower";
    var S = 2, pad = 40, rowH = 46, headH = 50;
    var cols = borrower ? [
      { t: "Month", w: 120, a: "left" },
      { t: "Due date", w: 260, a: "left" },
      { t: "Payment", w: 240, a: "right" }
    ] : [
      { t: "Month", w: 90, a: "left" },
      { t: "Due date", w: 170, a: "left" },
      { t: "Payment", w: 150, a: "right" },
      { t: "Interest", w: 140, a: "right" },
      { t: "Principal", w: 150, a: "right" },
      { t: "Balance", w: 150, a: "right" },
      { t: "Status", w: 270, a: "left" }
    ];
    var tableW = cols.reduce(function (s, k) { return s + k.w; }, 0);
    var W = tableW + pad * 2;

    var lines;
    if (borrower) {
      lines = [
        "Loan amount " + money(d.loan) + "   |   Term " + d.months + (d.months === 1 ? " month" : " months"),
        "Interest rate " + d.rate + "% per month   |   Monthly payment " + money(d.firstPay)
      ];
    } else {
      lines = [
        "Loan " + money(d.loan) + " for " + d.months + (d.months === 1 ? " month" : " months") +
          " at " + d.rate + "% per month (" + d.methodName + ")",
        "Monthly payment " + money(d.firstPay) + "   |   Total interest " + money(d.totalInterest) +
          "   |   Total repayment " + money(d.totalPayment)
      ];
      if (d.fee > 0) lines.push("Processing fee " + money(d.fee) + "   |   Amount released " + money(d.net));
    }
    var topH = 56 + 32 * lines.length + 20;
    var H = pad + topH + headH + rowH * d.rows.length + rowH + pad + 24;
    canvas.width = W * S; canvas.height = H * S;
    var c = canvas.getContext("2d");
    c.setTransform(S, 0, 0, S, 0, 0);
    var font = '"IBM Plex Sans", "Segoe UI", Arial, sans-serif';

    c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
    c.textBaseline = "middle";

    c.fillStyle = "#13202b";
    c.font = "700 30px " + font; c.textAlign = "left";
    c.fillText("Payment schedule", pad, pad + 16);
    c.font = "400 18px " + font; c.fillStyle = "#3d4f5c";
    lines.forEach(function (t, i) { c.fillText(t, pad, pad + 56 + 32 * i); });

    var y = pad + topH;

    c.fillStyle = "#13202b"; c.fillRect(pad, y, tableW, headH);
    c.fillStyle = "#ffffff"; c.font = "600 17px " + font;
    var x = pad;
    cols.forEach(function (k) {
      if (k.a === "right") { c.textAlign = "right"; c.fillText(k.t, x + k.w - 14, y + headH / 2); }
      else { c.textAlign = "left"; c.fillText(k.t, x + 14, y + headH / 2); }
      x += k.w;
    });
    y += headH;

    c.font = "400 17px " + font;
    d.rows.forEach(function (r, idx) {
      if (idx % 2 === 1) { c.fillStyle = "#f3f6f8"; c.fillRect(pad, y, tableW, rowH); }
      var due = d.startDate ? dateFmt.format(addMonths(d.startDate, r.n - 1 + d.offset)) : "";
      var cells = borrower
        ? [String(r.n), due, money(r.payment)]
        : [String(r.n), due, money(r.payment), money(r.interest), money(r.principal), money(r.balance), ""];
      c.fillStyle = "#13202b";
      var cx = pad;
      cols.forEach(function (k, i) {
        if (k.a === "right") { c.textAlign = "right"; c.fillText(cells[i], cx + k.w - 14, y + rowH / 2); }
        else { c.textAlign = "left"; c.fillText(cells[i], cx + 14, y + rowH / 2); }
        cx += k.w;
      });
      y += rowH;
    });

    c.fillStyle = "#e3eaee"; c.fillRect(pad, y, tableW, rowH);
    c.fillStyle = "#13202b"; c.font = "700 17px " + font;
    var tcells = borrower
      ? ["Total", "", money(d.totalPayment)]
      : ["Total", "", money(d.totalPayment), money(d.totalInterest), money(d.totalPrincipal), "", ""];
    var tx = pad;
    cols.forEach(function (k, i) {
      if (k.a === "right") { c.textAlign = "right"; c.fillText(tcells[i], tx + k.w - 14, y + rowH / 2); }
      else { c.textAlign = "left"; c.fillText(tcells[i], tx + 14, y + rowH / 2); }
      tx += k.w;
    });
    var bottom = y + rowH;

    c.strokeStyle = "#b9c6cf"; c.lineWidth = 1;
    var top = pad + topH + headH;
    for (var ry = top; ry <= bottom; ry += rowH) {
      c.beginPath(); c.moveTo(pad, ry + 0.5); c.lineTo(pad + tableW, ry + 0.5); c.stroke();
    }
    var gx = pad;
    for (var i = 0; i <= cols.length; i++) {
      c.beginPath(); c.moveTo(gx + 0.5, top - headH); c.lineTo(gx + 0.5, bottom); c.stroke();
      if (i < cols.length) gx += cols[i].w;
    }
    c.strokeStyle = "#13202b"; c.lineWidth = 2;
    c.strokeRect(pad, top - headH, tableW, bottom - (top - headH));

    c.fillStyle = "#6b7c88"; c.font = "400 14px " + font; c.textAlign = "left";
    c.fillText("Generated " + dateFmt.format(new Date()), pad, bottom + 28);
    return true;
  }

  function renderImage() {
    if (!drawSchedule(imageMode)) { $("imgStatus").textContent = "Enter valid loan details first."; return; }
    $("scheduleImg").src = canvas.toDataURL("image/png");
    $("scheduleImg").alt = imageMode === "borrower"
      ? "Borrower payment schedule showing month, due date and payment"
      : "Payment schedule with a blank status column";
    $("imgPreview").hidden = false;
    imageShown = true;
    $("imgStatus").textContent = "";
    $("saveImgBtn").hidden = false;
  }

  function generate(mode) {
    imageMode = mode;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(renderImage, renderImage);
    } else { renderImage(); }
  }

  $("genImgBtn").addEventListener("click", function () { generate("lender"); });
  $("genBorrowerBtn").addEventListener("click", function () { generate("borrower"); });

  $("saveImgBtn").addEventListener("click", function () {
    var st = $("imgStatus");
    if (!lastData) return;
    drawSchedule(imageMode);
    canvas.toBlob(function (blob) {
      if (!blob) { st.textContent = "Could not create the image."; return; }
      var name = imageMode === "borrower" ? "payment-schedule-borrower.png" : "payment-schedule.png";
      if (downloadsApi) {
        downloadsApi.save({ filename: name, data: blob }).then(
          function () { st.textContent = "Picture saved."; },
          function (err) {
            st.textContent = (err && err.code === "declined") ? "Save cancelled." : "Saving is not available here. Press and hold the picture instead.";
          }
        );
      } else {
        try {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
          st.textContent = "Picture saved to your downloads.";
        } catch (e) {
          st.textContent = "Saving is not available here. Press and hold the picture instead.";
        }
      }
    }, "image/png");
  });

  // Enable direct saving when the viewer grants it
  (function () {
    try {
      if (window.claude && typeof window.claude.use === "function") {
        window.claude.use("downloads").then(function (api) {
          downloadsApi = api || null;
          if (imageShown) renderImage();
        }, function () {});
      }
    } catch (e) {}
  })();

  function todayISO() {
    var t = new Date();
    return t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
  }

  $("resetBtn").addEventListener("click", function () {
    $("loanAmount").value = "23000";
    $("months").value = "3";
    $("interestRate").value = "5.73";
    $("feeRate").value = "0";
    $("startDate").value = todayISO();
    $("firstPay").value = "1";
    method = "flat";
    document.querySelectorAll("#methodToggle button").forEach(function (x) {
      x.setAttribute("aria-pressed", String(x.dataset.method === "flat"));
    });
    setMethodHint();
    syncPresets();
    calculate();
    $("loanAmount").focus();
  });

  setMethodHint();
  syncPresets();
  calculate();
})();

// ---------- Phone/tablet shortcut bar (display only) ----------
(function () {
  var dock = document.getElementById("dock");
  var src = document.getElementById("monthlyPayment");
  var out = document.getElementById("dockPay");
  var summary = document.getElementById("summary");
  if (!dock || !src || !out) return;

  function mirror() { out.textContent = src.textContent; }
  mirror();
  if (window.MutationObserver) {
    new MutationObserver(mirror).observe(src, { childList: true, characterData: true, subtree: true });
  }

  // Hide the bar while the summary itself is on screen
  if (summary && window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      dock.classList.toggle("is-hidden", entries[0].isIntersecting);
    }, { threshold: 0.25 }).observe(summary);
  }
})();

// ---------- Light / dark switch (appearance only) ----------
(function () {
  var btn = document.getElementById("themeBtn");
  var root = document.documentElement;
  if (!btn) return;
  try {
    var saved = localStorage.getItem("loan-theme");
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) {}
  btn.addEventListener("click", function () {
    var now = root.getAttribute("data-theme");
    if (!now) now = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    var next = now === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("loan-theme", next); } catch (e) {}
  });
})();
