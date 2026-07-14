(() => {
  "use strict";

  const CSV_PATH = "data/problems.csv";

  const state = {
    all: [],
    pool: [],
    index: 0,
    correctCount: 0,
    answered: false,
    entries: { debit: [], credit: [] },
    accountOptions: [],
    amountOptions: [],
    selectedSlot: null, // { side: 'debit'|'credit', line: number, kind: 'account'|'amount' }
  };

  const el = {
    levelSelect: document.getElementById("levelSelect"),
    difficultySelect: document.getElementById("difficultySelect"),
    progressText: document.getElementById("progressText"),
    scoreText: document.getElementById("scoreText"),
    progressFill: document.getElementById("progressFill"),
    questionLevel: document.getElementById("questionLevel"),
    questionDifficulty: document.getElementById("questionDifficulty"),
    questionText: document.getElementById("questionText"),
    debitEntries: document.getElementById("debitEntries"),
    creditEntries: document.getElementById("creditEntries"),
    addDebitLine: document.getElementById("addDebitLine"),
    addCreditLine: document.getElementById("addCreditLine"),
    accountPool: document.getElementById("accountPool"),
    amountPool: document.getElementById("amountPool"),
    resetBtn: document.getElementById("resetBtn"),
    submitBtn: document.getElementById("submitBtn"),
    nextBtn: document.getElementById("nextBtn"),
    resultBox: document.getElementById("resultBox"),
    resultMessage: document.getElementById("resultMessage"),
    correctAnswerBox: document.getElementById("correctAnswerBox"),
    explanationText: document.getElementById("explanationText"),
  };

  // ---------- CSV parsing (handles quoted fields with commas) ----------
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* skip */ }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.length > 1 || (r[0] && r[0].trim() !== ""));
  }

  function splitMulti(value) {
    return value.split(";").map((s) => s.trim()).filter(Boolean);
  }

  function splitPipe(value) {
    return value.split("|").map((s) => s.trim()).filter(Boolean);
  }

  async function loadQuestions() {
    const res = await fetch(CSV_PATH);
    if (!res.ok) throw new Error("CSVの読み込みに失敗しました: " + res.status);
    const text = await res.text();
    const rows = parseCsv(text);
    const header = rows[0];
    const idx = (name) => header.indexOf(name);
    const cols = {
      id: idx("id"), level: idx("level"), difficulty: idx("difficulty"),
      question: idx("question"), debitAccounts: idx("debit_accounts"),
      debitAmounts: idx("debit_amounts"), creditAccounts: idx("credit_accounts"),
      creditAmounts: idx("credit_amounts"), accountPool: idx("account_pool"),
      explanation: idx("explanation"),
    };
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[cols.id]) continue;
      const debitAccounts = splitMulti(r[cols.debitAccounts]);
      const debitAmounts = splitMulti(r[cols.debitAmounts]).map(Number);
      const creditAccounts = splitMulti(r[cols.creditAccounts]);
      const creditAmounts = splitMulti(r[cols.creditAmounts]).map(Number);
      out.push({
        id: r[cols.id],
        level: r[cols.level],
        difficulty: r[cols.difficulty],
        question: r[cols.question],
        debit: debitAccounts.map((a, i2) => ({ account: a, amount: debitAmounts[i2] })),
        credit: creditAccounts.map((a, i2) => ({ account: a, amount: creditAmounts[i2] })),
        accountPool: splitPipe(r[cols.accountPool]),
        explanation: r[cols.explanation] || "",
      });
    }
    return out;
  }

  // ---------- helpers ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function formatYen(n) {
    return Number(n).toLocaleString("ja-JP") + "円";
  }

  const MIN_OPTIONS = 6;

  function buildAmountOptions(q) {
    const correctAmounts = [...q.debit.map((d) => d.amount), ...q.credit.map((c) => c.amount)];
    const unique = Array.from(new Set(correctAmounts));
    const distractors = new Set();
    const step = (amt) => Math.max(1000, Math.round(amt * 0.1 / 1000) * 1000);

    unique.forEach((amt) => {
      const s = step(amt);
      distractors.add(amt + s);
      distractors.add(Math.max(1000, amt - s));
    });

    let multiplier = 2;
    while (unique.length + distractors.size < MIN_OPTIONS && multiplier < 10) {
      unique.forEach((amt) => {
        const s = step(amt) * multiplier;
        distractors.add(amt + s);
        distractors.add(Math.max(1000, amt - s));
      });
      multiplier++;
    }

    unique.forEach((a) => distractors.delete(a));
    const needed = Math.max(0, MIN_OPTIONS - unique.length);
    const distractorList = shuffle(Array.from(distractors)).slice(0, Math.max(needed, 3));
    return shuffle([...unique, ...distractorList]);
  }

  // ---------- filtering ----------
  function applyFilters() {
    const level = el.levelSelect.value;
    const difficulty = el.difficultySelect.value;
    state.pool = shuffle(state.all.filter((q) =>
      (level === "all" || q.level === level) &&
      (difficulty === "all" || q.difficulty === difficulty)
    ));
    state.index = 0;
    state.correctCount = 0;
    if (state.pool.length === 0) {
      el.questionText.textContent = "条件に合う問題がありません。";
      el.debitEntries.innerHTML = "";
      el.creditEntries.innerHTML = "";
      el.accountPool.innerHTML = "";
      el.amountPool.innerHTML = "";
      updateProgress();
      return;
    }
    loadCurrentQuestion();
  }

  function updateProgress() {
    const total = state.pool.length;
    const current = total ? state.index + 1 : 0;
    el.progressText.textContent = `問題 ${current} / ${total}`;
    el.scoreText.textContent = `正解 ${state.correctCount}`;
    el.progressFill.style.width = total ? `${(state.index / total) * 100}%` : "0%";
  }

  // ---------- question rendering ----------
  function loadCurrentQuestion() {
    const q = state.pool[state.index];
    state.answered = false;
    state.entries = {
      debit: [{ account: null, amount: null }, { account: null, amount: null }],
      credit: [{ account: null, amount: null }, { account: null, amount: null }],
    };
    state.selectedSlot = null;
    state.accountOptions = shuffle(q.accountPool);
    state.amountOptions = buildAmountOptions(q);

    el.questionLevel.textContent = q.level;
    el.questionDifficulty.textContent = q.difficulty;
    el.questionText.textContent = q.question;

    el.resultBox.hidden = true;
    el.resultBox.className = "result-box";
    el.nextBtn.hidden = true;
    el.submitBtn.hidden = false;
    el.submitBtn.disabled = false;

    renderEntries();
    renderPools();
    updateProgress();
  }

  function renderEntries() {
    renderSide("debit", el.debitEntries);
    renderSide("credit", el.creditEntries);
  }

  function renderSide(side, container) {
    container.innerHTML = "";
    state.entries[side].forEach((line, i) => {
      const row = document.createElement("div");
      row.className = "entry-row";
      row.dataset.side = side;
      row.dataset.line = String(i);

      const accountSlot = document.createElement("div");
      accountSlot.className = "entry-slot account-slot";
      accountSlot.tabIndex = 0;
      accountSlot.setAttribute("role", "button");
      accountSlot.setAttribute("aria-label", "勘定科目の枠");
      renderSlotContent(accountSlot, side, i, "account", line.account, formatAccount);
      addSlotHandlers(accountSlot, side, i, "account");

      const amountSlot = document.createElement("div");
      amountSlot.className = "entry-slot amount-slot-wrap";
      amountSlot.tabIndex = 0;
      amountSlot.setAttribute("role", "button");
      amountSlot.setAttribute("aria-label", "金額の枠");
      renderSlotContent(amountSlot, side, i, "amount", line.amount, formatYen);
      addSlotHandlers(amountSlot, side, i, "amount");

      row.appendChild(accountSlot);
      row.appendChild(amountSlot);

      if (state.entries[side].length > 1) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "remove-line-btn";
        removeBtn.textContent = "✕";
        removeBtn.title = "この行を削除";
        removeBtn.addEventListener("click", () => {
          state.entries[side].splice(i, 1);
          renderEntries();
        });
        row.appendChild(removeBtn);
      }

      container.appendChild(row);
    });
  }

  function formatAccount(v) { return v; }

  function renderSlotContent(slotEl, side, line, kind, value, formatter) {
    slotEl.innerHTML = "";
    const isSelected = state.selectedSlot &&
      state.selectedSlot.side === side && state.selectedSlot.line === line && state.selectedSlot.kind === kind;
    slotEl.classList.toggle("drag-over", false);
    slotEl.style.outline = isSelected ? "2px solid var(--accent)" : "none";
    slotEl.style.borderRadius = "8px";

    if (value === null || value === undefined) {
      const ph = document.createElement("span");
      ph.className = "placeholder";
      ph.textContent = kind === "account" ? "科目を選択" : "金額を選択";
      slotEl.appendChild(ph);
    } else {
      const chip = document.createElement("span");
      chip.className = kind === "account" ? "account-chip" : "account-chip";
      chip.textContent = formatter(value);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "chip-remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.entries[side][line][kind] = null;
        renderEntries();
      });
      chip.appendChild(removeBtn);
      slotEl.appendChild(chip);
    }
  }

  function addSlotHandlers(slotEl, side, line, kind) {
    slotEl.addEventListener("click", () => {
      if (state.answered) return;
      state.selectedSlot = { side, line, kind };
      renderEntries();
    });
    slotEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      slotEl.classList.add("drag-over");
    });
    slotEl.addEventListener("dragleave", () => slotEl.classList.remove("drag-over"));
    slotEl.addEventListener("drop", (e) => {
      e.preventDefault();
      slotEl.classList.remove("drag-over");
      if (state.answered) return;
      const data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      const payload = JSON.parse(data);
      if (payload.kind !== kind) return;
      state.entries[side][line][kind] = payload.value;
      renderEntries();
    });
  }

  function renderPools() {
    el.accountPool.innerHTML = "";
    state.accountOptions.forEach((acc) => {
      const item = document.createElement("div");
      item.className = "pool-item";
      item.textContent = acc;
      item.draggable = true;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.addEventListener("click", () => placeValue("account", acc));
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); placeValue("account", acc); }
      });
      item.addEventListener("dragstart", (e) => {
        item.classList.add("dragging");
        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "account", value: acc }));
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      el.accountPool.appendChild(item);
    });

    el.amountPool.innerHTML = "";
    state.amountOptions.forEach((amt) => {
      const item = document.createElement("div");
      item.className = "pool-item amount-item";
      item.textContent = formatYen(amt);
      item.draggable = true;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.addEventListener("click", () => placeValue("amount", amt));
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); placeValue("amount", amt); }
      });
      item.addEventListener("dragstart", (e) => {
        item.classList.add("dragging");
        e.dataTransfer.setData("text/plain", JSON.stringify({ kind: "amount", value: amt }));
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      el.amountPool.appendChild(item);
    });
  }

  function placeValue(kind, value) {
    if (state.answered) return;
    let target = state.selectedSlot && state.selectedSlot.kind === kind ? state.selectedSlot : null;
    if (target && state.entries[target.side][target.line][kind] !== null) target = null;
    if (!target) {
      outer:
      for (const side of ["debit", "credit"]) {
        for (let i = 0; i < state.entries[side].length; i++) {
          if (state.entries[side][i][kind] === null) { target = { side, line: i, kind }; break outer; }
        }
      }
    }
    if (!target) return;
    state.entries[target.side][target.line][kind] = value;
    state.selectedSlot = null;
    renderEntries();
  }

  // ---------- submit / check ----------
  function normalizeLines(lines) {
    return lines
      .filter((l) => l.account !== null && l.amount !== null)
      .map((l) => `${l.account}::${l.amount}`)
      .sort();
  }

  function checkAnswer() {
    const q = state.pool[state.index];
    const userDebit = normalizeLines(state.entries.debit);
    const userCredit = normalizeLines(state.entries.credit);
    const correctDebit = normalizeLines(q.debit);
    const correctCredit = normalizeLines(q.credit);

    const debitOk = arraysEqual(userDebit, correctDebit);
    const creditOk = arraysEqual(userCredit, correctCredit);
    return debitOk && creditOk;
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }

  function submitAnswer() {
    const q = state.pool[state.index];
    const correct = checkAnswer();
    state.answered = true;
    if (correct) state.correctCount++;

    el.resultBox.hidden = false;
    el.resultBox.className = "result-box " + (correct ? "correct" : "wrong");
    el.resultMessage.textContent = correct ? "正解です！" : "不正解です";

    const debitLines = q.debit.map((l) => `${l.account} ${formatYen(l.amount)}`).join(" ／ ");
    const creditLines = q.credit.map((l) => `${l.account} ${formatYen(l.amount)}`).join(" ／ ");
    el.correctAnswerBox.innerHTML =
      `<strong>正しい仕訳</strong><br>借方: ${debitLines}<br>貸方: ${creditLines}`;
    el.explanationText.textContent = q.explanation;

    el.submitBtn.hidden = true;
    el.nextBtn.hidden = false;
    updateProgress();
    renderEntries();
  }

  function goNext() {
    if (state.index < state.pool.length - 1) {
      state.index++;
      loadCurrentQuestion();
    } else {
      el.questionText.textContent = "すべての問題が終了しました。お疲れさまでした！";
      el.debitEntries.innerHTML = "";
      el.creditEntries.innerHTML = "";
      el.accountPool.innerHTML = "";
      el.amountPool.innerHTML = "";
      el.resultBox.hidden = true;
      el.nextBtn.hidden = true;
      el.submitBtn.hidden = true;
      updateProgress();
    }
  }

  function resetCurrent() {
    if (state.answered) return;
    state.entries = {
      debit: [{ account: null, amount: null }, { account: null, amount: null }],
      credit: [{ account: null, amount: null }, { account: null, amount: null }],
    };
    state.selectedSlot = null;
    renderEntries();
  }

  // ---------- events ----------
  el.levelSelect.addEventListener("change", applyFilters);
  el.difficultySelect.addEventListener("change", applyFilters);
  el.addDebitLine.addEventListener("click", () => {
    if (state.answered) return;
    state.entries.debit.push({ account: null, amount: null });
    renderEntries();
  });
  el.addCreditLine.addEventListener("click", () => {
    if (state.answered) return;
    state.entries.credit.push({ account: null, amount: null });
    renderEntries();
  });
  el.submitBtn.addEventListener("click", submitAnswer);
  el.nextBtn.addEventListener("click", goNext);
  el.resetBtn.addEventListener("click", resetCurrent);

  // ---------- init ----------
  (async function init() {
    try {
      state.all = await loadQuestions();
      applyFilters();
    } catch (err) {
      el.questionText.textContent = "問題データの読み込みに失敗しました。ローカルサーバー経由で開いていますか？";
      console.error(err);
    }
  })();
})();
