const presets = {
  '40x20': { width: 40, height: 20 },
  '40x40': { width: 40, height: 40 },
  '60x40': { width: 60, height: 40 },
  '60x60': { width: 60, height: 60 },
  '80x40': { width: 80, height: 40 },
};

const state = { parts: [] };

let resizeTimer;

const els = {
  profilePreset: document.getElementById('profilePreset'),
  tubeWidth: document.getElementById('tubeWidth'),
  tubeHeight: document.getElementById('tubeHeight'),
  stockLength: document.getElementById('stockLength'),
  kerf: document.getElementById('kerf'),
  partForm: document.getElementById('partForm'),
  partName: document.getElementById('partName'),
  partLength: document.getElementById('partLength'),
  partQty: document.getElementById('partQty'),
  partAngleLeft: document.getElementById('partAngleLeft'),
  partAngleRight: document.getElementById('partAngleRight'),
  partsBody: document.getElementById('partsBody'),
  partsVisual: document.getElementById('partsVisual'),
  optimizeBtn: document.getElementById('optimizeBtn'),
  demoBtn: document.getElementById('demoBtn'),
  clearBtn: document.getElementById('clearBtn'),
  summary: document.getElementById('summary'),
  plan: document.getElementById('plan'),
};

function round(value) {
  return Math.round(value * 100) / 100;
}

function normalizeAngle(angle) {
  const n = Number(angle);
  if (!Number.isFinite(n)) return 90;
  return Math.max(-90, Math.min(90, n));
}

function miterDeviation(angle) {
  return Math.abs(90 - Math.abs(normalizeAngle(angle)));
}

function miterAllowance(angle, diagonal) {
  const deviation = miterDeviation(angle);
  if (deviation < 0.01) return 0;
  return (diagonal / 2) * Math.tan((deviation * Math.PI) / 180);
}

function getCutLineAngle(angle, side) {
  const a = normalizeAngle(angle);
  if (Math.abs(a) >= 89.9) return 0;
  const base = 90 - Math.abs(a);
  const sign = a >= 0 ? 1 : -1;
  return side === 'left' ? sign * base : -sign * base;
}

function getVisualStyle(part) {
  return [
    `--left-line-angle:${getCutLineAngle(part.angleLeft, 'left')}deg`,
    `--right-line-angle:${getCutLineAngle(part.angleRight, 'right')}deg`,
  ].join(';');
}

function getTube() {
  return {
    width: Number(els.tubeWidth.value),
    height: Number(els.tubeHeight.value),
  };
}

function calcEffectiveLength(part, kerf, tube) {
  const diagonal = Math.hypot(tube.width, tube.height);
  const left = miterAllowance(part.angleLeft, diagonal);
  const right = miterAllowance(part.angleRight, diagonal);
  return round(part.length + left + right + kerf);
}

function renderPartsVisual() {
  const kerf = Number(els.kerf.value);
  const tube = getTube();

  if (!state.parts.length) {
    els.partsVisual.innerHTML = '<p class="muted">Добавьте детали, визуализация появится автоматически.</p>';
    return;
  }

  const cards = [];
  state.parts.forEach((part) => {
    const effective = calcEffectiveLength(part, kerf, tube);
    const visualStyle = getVisualStyle(part);
    for (let i = 0; i < part.qty; i += 1) {
      cards.push(`
      <article class="part-visual-card">
        <div class="part-shape" style="${visualStyle}"></div>
        <div class="part-visual-meta">
          <strong>${part.name} #${i + 1}</strong>
          <span>${part.length} мм · ${part.angleLeft}°/${part.angleRight}° · учтено ${effective} мм</span>
        </div>
      </article>`);
    }
  });

  els.partsVisual.innerHTML = cards.join('');
}

function rerenderParts() {
  const kerf = Number(els.kerf.value);
  const tube = getTube();

  els.partsBody.innerHTML = state.parts
    .map((part, i) => {
      const effective = calcEffectiveLength(part, kerf, tube);
      return `
      <tr>
        <td>${part.name}</td>
        <td>${part.length} мм</td>
        <td>${part.qty}</td>
        <td>${part.angleLeft}° / ${part.angleRight}°</td>
        <td>${effective} мм</td>
        <td><button data-remove="${i}" class="secondary">Удалить</button></td>
      </tr>`;
    })
    .join('');

  renderPartsVisual();
}

function flattenParts(parts, kerf, tube) {
  const expanded = [];
  parts.forEach((part) => {
    const effective = calcEffectiveLength(part, kerf, tube);
    for (let i = 0; i < part.qty; i += 1) {
      expanded.push({ ...part, effective, id: `${part.name}-${i + 1}` });
    }
  });
  return expanded.sort((a, b) => b.effective - a.effective);
}

function optimizeCutting(parts, stockLength) {
  const bins = [];
  for (const part of parts) {
    let placed = false;
    for (const bin of bins) {
      if (bin.used + part.effective <= stockLength) {
        bin.parts.push(part);
        bin.used += part.effective;
        placed = true;
        break;
      }
    }
    if (!placed) {
      bins.push({ used: part.effective, parts: [part] });
    }
  }
  return bins;
}

function renderStockVisual(stock, stockLength) {
  const trackWidth = Math.max(720, Math.min(1400, stockLength * 0.18));
  let cursor = 0;

  const segments = stock.parts
    .map((part, index) => {
      const px = (part.effective / stockLength) * trackWidth;
      const left = (cursor / stockLength) * trackWidth;
      const safeWidth = Math.max(px, 8);
      cursor += part.effective;
      const labelClass = index % 2 === 0 ? 'top' : 'bottom';
      return `<div class="stock-piece ${labelClass}" style="left:${left}px;width:${safeWidth}px;${getVisualStyle(part)}">
          <span class="stock-piece-label">${part.length}мм</span>
        </div>`;
    })
    .join('');

  return `<div class="stock-track" style="width:${trackWidth}px">
    <div class="stock-track-line"></div>
    ${segments}
  </div>`;
}

function renderResult(stocks, stockLength) {
  if (!stocks.length) {
    els.summary.textContent = 'Добавьте детали и нажмите «Оптимизировать раскрой». ';
    els.plan.innerHTML = '';
    return;
  }

  const usedTotal = stocks.reduce((acc, stock) => acc + stock.used, 0);
  const totalLength = stocks.length * stockLength;
  const waste = totalLength - usedTotal;
  const efficiency = totalLength ? (usedTotal / totalLength) * 100 : 0;

  els.summary.innerHTML = `
    <p>
      <span class="badge">Нужно хлыстов ${stockLength} мм: ${stocks.length} шт</span>
      <span class="badge">Расход: ${round(usedTotal)} мм</span>
      <span class="badge">Остаток: ${round(waste)} мм</span>
      <span class="badge">КПД: ${round(efficiency)}%</span>
    </p>
  `;

  els.plan.innerHTML = stocks
    .map((stock, idx) => {
      const remainder = round(stockLength - stock.used);
      const list = stock.parts
        .map(
          (part) =>
            `<li>${part.id}: ${part.length} мм, углы ${part.angleLeft}°/${part.angleRight}°, учтено ${part.effective} мм</li>`,
        )
        .join('');

      return `
      <div class="stock-card">
        <strong>Хлыст #${idx + 1}</strong> — занято ${round(stock.used)} мм, остаток ${remainder} мм
        <div class="stock-visual-wrap">${renderStockVisual(stock, stockLength)}</div>
        <ul>${list}</ul>
      </div>`;
    })
    .join('');
}

els.profilePreset.addEventListener('change', () => {
  const value = els.profilePreset.value;
  if (value === 'custom') return;
  const preset = presets[value];
  els.tubeWidth.value = preset.width;
  els.tubeHeight.value = preset.height;
  rerenderParts();
});

els.partForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.parts.push({
    name: els.partName.value.trim() || `Деталь ${state.parts.length + 1}`,
    length: Number(els.partLength.value),
    qty: Number(els.partQty.value),
    angleLeft: normalizeAngle(els.partAngleLeft.value),
    angleRight: normalizeAngle(els.partAngleRight.value),
  });
  rerenderParts();
});

els.partsBody.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const index = target.dataset.remove;
  if (index === undefined) return;
  state.parts.splice(Number(index), 1);
  rerenderParts();
});

els.optimizeBtn.addEventListener('click', () => {
  const kerf = Number(els.kerf.value);
  const stockLength = Number(els.stockLength.value);
  const tube = getTube();
  const expanded = flattenParts(state.parts, kerf, tube);
  const stocks = optimizeCutting(expanded, stockLength);
  renderResult(stocks, stockLength);
});

els.demoBtn.addEventListener('click', () => {
  state.parts = [
    { name: 'Рама длинная', length: 1450, qty: 4, angleLeft: -45, angleRight: 45 },
    { name: 'Рама короткая', length: 850, qty: 4, angleLeft: 45, angleRight: -45 },
    { name: 'Перемычка', length: 620, qty: 6, angleLeft: 90, angleRight: 90 },
    { name: 'Укосина', length: 540, qty: 8, angleLeft: -45, angleRight: 90 },
  ];
  rerenderParts();
});

els.clearBtn.addEventListener('click', () => {
  state.parts = [];
  rerenderParts();
  renderResult([], Number(els.stockLength.value));
});

[els.kerf, els.tubeWidth, els.tubeHeight].forEach((el) => {
  el.addEventListener('input', rerenderParts);
});

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    rerenderParts();
  }, 120);
});

rerenderParts();
renderResult([], Number(els.stockLength.value));
