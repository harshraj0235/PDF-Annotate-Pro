// annotator.js — Core PDF annotation engine

'use strict';

// ── State ──────────────────────────────────────────────────────────
let pdfDoc = null, currentPage = 1, totalPages = 0, scale = 1.5, rotation = 0;
let activeTool = 'highlight', activeColor = '#ffd600', strokeSize = 4, opacity = 0.6;
let isDrawing = false, startX = 0, startY = 0, lastX = 0, lastY = 0;
let annotations = {};   // { pageNum: [annObjects] }
let undoStack = {};     // { pageNum: [[snapshots]] }
let redoStack = {};
let isPro = false;
let signatureDataUrl = null;
let pendingSigPlace = false;
let activeStamp = null;
let fileName = 'document.pdf';

// ── Canvas refs ────────────────────────────────────────────────────
const pdfCanvas  = document.getElementById('pdf-canvas');
const annCanvas  = document.getElementById('ann-canvas');
const ctx        = pdfCanvas.getContext('2d');
const annCtx     = annCanvas.getContext('2d');
const canvasWrap = document.getElementById('canvas-wrap');
const dropzone   = document.getElementById('dropzone');
const loadingEl  = document.getElementById('loading');

// ── Toolbar refs ───────────────────────────────────────────────────
const pageInfo     = document.getElementById('page-info');
const btnPrev      = document.getElementById('btn-prev');
const btnNext      = document.getElementById('btn-next');
const zoomLabel    = document.getElementById('zoom-label');
const strokeSizeEl = document.getElementById('stroke-size');
const strokeValEl  = document.getElementById('stroke-size-val');
const opacityEl    = document.getElementById('opacity-slider');
const opacityValEl = document.getElementById('opacity-val');
const planChip     = document.getElementById('plan-chip');
const statusText   = document.getElementById('status-text');
const annCountEl   = document.getElementById('status-ann-count');
const coordsEl     = document.getElementById('status-coords');
const fileNameEl   = document.getElementById('status-file-name');
const textOverlay  = document.getElementById('text-input-overlay');
const pageThumbs   = document.getElementById('page-thumbs');

// ── Init: Check plan & load PDF from URL params ────────────────────
(async function init() {
  await checkPlan();
  const params = new URLSearchParams(location.search);
  const loadPending = params.get('load_pending');
  if (loadPending === '1') {
    chrome.storage.local.get(['pending_pdf_data', 'pending_pdf_name'], async data => {
      if (data.pending_pdf_data) {
        fileName = data.pending_pdf_name || 'document.pdf';
        document.title = fileName + ' — PDF Annotate Pro';
        if (fileNameEl) fileNameEl.textContent = fileName;
        
        const base64Marker = ';base64,';
        const base64Index = data.pending_pdf_data.indexOf(base64Marker) + base64Marker.length;
        const base64 = data.pending_pdf_data.substring(base64Index);
        const raw = atob(base64);
        const rawLength = raw.length;
        const array = new Uint8Array(new ArrayBuffer(rawLength));
        for(let i = 0; i < rawLength; i++) {
          array[i] = raw.charCodeAt(i);
        }
        
        await loadPdfFromArrayBuffer(array);
        chrome.storage.local.remove(['pending_pdf_data', 'pending_pdf_name']);
      }
    });
  } else {
    const pdfParam = params.get('pdf');
    if (pdfParam) {
      const decoded = decodeURIComponent(pdfParam);
      fileName = params.get('name') || 'document.pdf';
      document.title = fileName + ' — PDF Annotate Pro';
      if (fileNameEl) fileNameEl.textContent = fileName;
      await loadPdfFromUrl(decoded);
    }
  }
  setupDragDrop();
})();

// ── Plan check ────────────────────────────────────────────────────
async function checkPlan() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'checkPlan' }, res => {
      if (!res) return resolve();
      isPro = res.plan === 'pro';
      if (isPro) {
        planChip.textContent = '⚡ Pro Plan';
        planChip.classList.add('pro');
        unlockProTools();
      } else {
        planChip.textContent = `Free · ${5 - res.exportsUsed} exports left`;
      }
      resolve();
    });
  });
}

function unlockProTools() {
  ['tool-rect','tool-arrow','tool-signature'].forEach(id => {
    const btn = document.getElementById(id);
    btn.classList.remove('locked');
    btn.querySelector('.lock-badge')?.remove();
  });
  document.getElementById('sidebar-pro-banner').style.display = 'none';
}

// ── Load PDF ──────────────────────────────────────────────────────
async function loadPdfFromUrl(url) {
  showLoading(true);
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    const loadTask = pdfjsLib.getDocument({ url, withCredentials: false });
    pdfDoc = await loadTask.promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;
    annotations = {};
    undoStack = {};
    redoStack = {};

    // Load saved annotations
    chrome.storage.local.get(['annotations'], data => {
      if (data.annotations) annotations = data.annotations;
    });

    dropzone.style.display = 'none';
    canvasWrap.style.display = 'inline-block';
    if (pageThumbs) generateThumbnails();
    await renderPage(currentPage);
    setStatus('PDF loaded — ' + totalPages + ' page(s)');
  } catch (e) {
    showToast('Failed to load PDF: ' + e.message, 'error');
    showLoading(false);
  }
}

async function loadPdfFromFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const typedArray = new Uint8Array(e.target.result);
    if (fileNameEl) fileNameEl.textContent = file.name;
    await loadPdfFromArrayBuffer(typedArray);
  };
  reader.readAsArrayBuffer(file);
}

async function loadPdfFromArrayBuffer(typedArray) {
  showLoading(true);
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
    pdfDoc = await pdfjsLib.getDocument({ data: typedArray }).promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;
    annotations = {};
    dropzone.style.display = 'none';
    canvasWrap.style.display = 'inline-block';
    if (pageThumbs) generateThumbnails();
    await renderPage(currentPage);
    setStatus('PDF loaded — ' + totalPages + ' page(s)');
  } catch(e) {
    showToast('Failed to load PDF', 'error');
    showLoading(false);
  }
}

// ── Render Page ───────────────────────────────────────────────────
async function renderPage(pageNum) {
  showLoading(true);
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale, rotation });
  
  pdfCanvas.width  = viewport.width;
  pdfCanvas.height = viewport.height;
  annCanvas.width  = viewport.width;
  annCanvas.height = viewport.height;
  
  await page.render({ canvasContext: ctx, viewport }).promise;
  redrawAnnotations(pageNum);
  updatePageUI();
  
  if (pageThumbs) {
    document.querySelectorAll('.page-thumb').forEach(t => t.classList.remove('active'));
    const t = document.getElementById('thumb-' + pageNum);
    if (t) {
      t.classList.add('active');
      t.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  
  showLoading(false);
}

// ── Thumbnails ────────────────────────────────────────────────────
async function generateThumbnails() {
  if (!pageThumbs) return;
  pageThumbs.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const thumb = document.createElement('div');
    thumb.className = 'page-thumb' + (i === currentPage ? ' active' : '');
    thumb.id = 'thumb-' + i;
    thumb.innerHTML = `<div class="page-thumb-num">${i}</div><div class="page-thumb-label">Page ${i}</div>`;
    thumb.addEventListener('click', async () => {
      if (i !== currentPage) { currentPage = i; await renderPage(i); }
    });
    pageThumbs.appendChild(thumb);
  }
}

// ── Annotations: Draw & Redraw ────────────────────────────────────
function redrawAnnotations(pageNum) {
  annCtx.clearRect(0, 0, annCanvas.width, annCanvas.height);
  const anns = annotations[pageNum] || [];
  anns.forEach(drawAnnotation);
  updateAnnList();
  updateAnnCount();
}

function drawAnnotation(ann) {
  annCtx.save();
  annCtx.globalAlpha = ann.opacity || 0.6;
  annCtx.strokeStyle = ann.color || '#ffd600';
  annCtx.fillStyle   = ann.color || '#ffd600';
  annCtx.lineWidth   = ann.size  || 4;
  annCtx.lineCap = 'round';
  annCtx.lineJoin = 'round';

  switch (ann.type) {
    case 'highlight': {
      annCtx.globalAlpha = Math.min(ann.opacity || 0.4, 0.6);
      annCtx.fillStyle = ann.color;
      annCtx.fillRect(ann.x, ann.y, ann.w, ann.h);
      break;
    }
    case 'pen': {
      if (!ann.points || ann.points.length < 2) break;
      annCtx.beginPath();
      annCtx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) {
        annCtx.lineTo(ann.points[i].x, ann.points[i].y);
      }
      annCtx.stroke();
      break;
    }
    case 'text': {
      annCtx.globalAlpha = 1;
      annCtx.font = `${ann.size * 3 || 16}px Inter, sans-serif`;
      annCtx.fillText(ann.text, ann.x, ann.y);
      break;
    }
    case 'rect': {
      annCtx.globalAlpha = ann.opacity || 0.8;
      annCtx.strokeRect(ann.x, ann.y, ann.w, ann.h);
      break;
    }
    case 'arrow': {
      annCtx.globalAlpha = ann.opacity || 0.9;
      drawArrow(annCtx, ann.x1, ann.y1, ann.x2, ann.y2, ann.size);
      break;
    }
    case 'signature': {
      if (ann.dataUrl) {
        const img = new Image();
        img.onload = () => {
          annCtx.save();
          annCtx.globalAlpha = ann.opacity || 0.95;
          annCtx.drawImage(img, ann.x, ann.y, ann.w, ann.h);
          annCtx.restore();
        };
        img.src = ann.dataUrl;
      }
      break;
    }
    case 'circle': {
      annCtx.globalAlpha = ann.opacity || 0.8;
      annCtx.beginPath();
      annCtx.arc(ann.x + ann.w / 2, ann.y + ann.h / 2, Math.abs(ann.w) / 2, 0, Math.PI * 2);
      annCtx.stroke();
      break;
    }
    case 'stamp': {
      annCtx.globalAlpha = ann.opacity || 0.95;
      annCtx.font = `bold ${ann.size * 5 || 24}px Inter, sans-serif`;
      annCtx.fillStyle = ann.color;
      annCtx.strokeStyle = ann.color;
      annCtx.lineWidth = 3;
      const metrics = annCtx.measureText(ann.text);
      const padX = 16, padY = 12;
      annCtx.strokeRect(ann.x, ann.y - (ann.size * 5 || 24), metrics.width + padX * 2, (ann.size * 5 || 24) + padY * 2);
      annCtx.fillText(ann.text, ann.x + padX, ann.y + padY);
      break;
    }
  }
  annCtx.restore();
}

function drawArrow(c, x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 12 + size;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - len * Math.cos(angle - 0.4), y2 - len * Math.sin(angle - 0.4));
  c.lineTo(x2 - len * Math.cos(angle + 0.4), y2 - len * Math.sin(angle + 0.4));
  c.closePath(); c.fill();
}

// ── Save Annotation ───────────────────────────────────────────────
function saveAnnotation(ann) {
  if (!annotations[currentPage]) annotations[currentPage] = [];
  pushUndo(currentPage);
  annotations[currentPage].push(ann);
  chrome.storage.local.set({ annotations });
  updateAnnList();
  updateAnnCount();
}

function pushUndo(page) {
  if (!undoStack[page]) undoStack[page] = [];
  undoStack[page].push(JSON.stringify(annotations[page] || []));
  if (undoStack[page].length > 20) undoStack[page].shift();
  redoStack[page] = [];
}

// ── Mouse / Touch Events ──────────────────────────────────────────
function getPos(e) {
  const r = annCanvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - r.left, y: src.clientY - r.top };
}

let penPoints = [];
let liveRect = null;

annCanvas.addEventListener('mousedown', onDown);
annCanvas.addEventListener('mousemove', onMove);
annCanvas.addEventListener('mouseup',   onUp);
annCanvas.addEventListener('mouseleave', onUp);
annCanvas.addEventListener('touchstart', e => { e.preventDefault(); onDown(e); }, { passive: false });
annCanvas.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e); }, { passive: false });
annCanvas.addEventListener('touchend',   e => { e.preventDefault(); onUp(e); });

function onDown(e) {
  if (!pdfDoc) return;
  const { x, y } = getPos(e);
  startX = lastX = x; startY = lastY = y;

  if (activeTool === 'text') { placeTextInput(x, y); return; }
  if (activeTool === 'signature') {
    if (!isPro) { showUpgradeModal(); return; }
    if (signatureDataUrl && pendingSigPlace) {
      const w = 200, h = 80;
      saveAnnotation({ type: 'signature', x, y, w, h, dataUrl: signatureDataUrl, opacity, color: activeColor });
      redrawAnnotations(currentPage);
      pendingSigPlace = false;
      signatureDataUrl = null;
      setStatus('Signature placed');
    }
    return;
  }
  if (activeTool === 'stamp') {
    if (!isPro) { showUpgradeModal(); return; }
    if (activeStamp) {
      saveAnnotation({ type: 'stamp', x, y, text: activeStamp, color: activeColor, size: strokeSize, opacity });
      redrawAnnotations(currentPage);
    } else {
      document.getElementById('stamp-modal').classList.remove('hidden');
    }
    return;
  }
  if (['rect','arrow','circle'].includes(activeTool) && !isPro) { showUpgradeModal(); return; }

  isDrawing = true;
  penPoints = [{ x, y }];
  annCanvas.style.cursor = activeTool === 'eraser' ? 'cell' : 'crosshair';
}

function onMove(e) {
  const { x, y } = getPos(e);
  coordsEl.textContent = `x: ${Math.round(x)}  y: ${Math.round(y)}`;
  if (!isDrawing) return;

  annCtx.save();
  annCtx.globalAlpha = opacity;
  annCtx.strokeStyle = activeColor;
  annCtx.fillStyle   = activeColor;
  annCtx.lineWidth   = strokeSize;
  annCtx.lineCap = 'round'; annCtx.lineJoin = 'round';

  if (activeTool === 'pen') {
    annCtx.beginPath();
    annCtx.moveTo(lastX, lastY);
    annCtx.lineTo(x, y);
    annCtx.stroke();
    penPoints.push({ x, y });
  }

  if (activeTool === 'eraser') {
    annCtx.clearRect(x - strokeSize * 3, y - strokeSize * 3, strokeSize * 6, strokeSize * 6);
  }

  if (activeTool === 'highlight' || activeTool === 'rect' || activeTool === 'arrow' || activeTool === 'circle') {
    redrawAnnotations(currentPage); // clear live preview
    annCtx.globalAlpha = activeTool === 'highlight' ? 0.35 : opacity;
    if (activeTool === 'highlight') {
      annCtx.fillRect(startX, startY, x - startX, y - startY);
    } else if (activeTool === 'rect') {
      annCtx.strokeRect(startX, startY, x - startX, y - startY);
    } else if (activeTool === 'arrow') {
      drawArrow(annCtx, startX, startY, x, y, strokeSize);
    } else if (activeTool === 'circle') {
      annCtx.beginPath();
      annCtx.arc(startX + (x - startX)/2, startY + (y - startY)/2, Math.abs(x - startX)/2, 0, Math.PI * 2);
      annCtx.stroke();
    }
  }

  annCtx.restore();
  lastX = x; lastY = y;
}

function onUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  const { x, y } = getPos(e) || { x: lastX, y: lastY };

  if (activeTool === 'pen' && penPoints.length > 1) {
    saveAnnotation({ type: 'pen', points: penPoints, color: activeColor, size: strokeSize, opacity });
  }
  if (activeTool === 'highlight') {
    const w = x - startX, h = y - startY;
    if (Math.abs(w) > 5 && Math.abs(h) > 5)
      saveAnnotation({ type: 'highlight', x: startX, y: startY, w, h, color: activeColor, opacity: Math.min(opacity, 0.5) });
  }
  if (activeTool === 'rect' && isPro) {
    saveAnnotation({ type: 'rect', x: startX, y: startY, w: x - startX, h: y - startY, color: activeColor, size: strokeSize, opacity });
  }
  if (activeTool === 'circle' && isPro) {
    saveAnnotation({ type: 'circle', x: startX, y: startY, w: x - startX, h: y - startY, color: activeColor, size: strokeSize, opacity });
  }
  if (activeTool === 'arrow' && isPro) {
    saveAnnotation({ type: 'arrow', x1: startX, y1: startY, x2: x, y2: y, color: activeColor, size: strokeSize, opacity });
  }
  if (activeTool === 'eraser') {
    // Rebuild annotations without erased region
    const { x: ex, y: ey } = { x: lastX, y: lastY };
    if (annotations[currentPage]) {
      annotations[currentPage] = annotations[currentPage].filter(ann => !hitTest(ann, ex, ey, strokeSize * 3));
      chrome.storage.local.set({ annotations });
    }
  }
  redrawAnnotations(currentPage);
  penPoints = [];
}

function hitTest(ann, x, y, r) {
  if (ann.type === 'pen') return ann.points.some(p => Math.hypot(p.x - x, p.y - y) < r);
  if (ann.type === 'highlight' || ann.type === 'rect' || ann.type === 'circle' || ann.type === 'stamp') {
    const cx = ann.type === 'circle' ? ann.x + ann.w/2 : ann.x;
    const cy = ann.type === 'circle' ? ann.y + ann.h/2 : ann.y;
    // Simple bounding box test is good enough for most things
    return x > ann.x && x < ann.x + (ann.w || 100) && y > ann.y && y < ann.y + (ann.h || 50);
  }
  return false;
}

// ── Text Tool ─────────────────────────────────────────────────────
function placeTextInput(x, y) {
  textOverlay.style.display = 'block';
  textOverlay.style.left = x + 'px';
  textOverlay.style.top  = y + 'px';
  textOverlay.value = '';
  textOverlay.focus();
}

textOverlay.addEventListener('blur', () => {
  const txt = textOverlay.value.trim();
  if (txt) {
    const x = parseInt(textOverlay.style.left);
    const y = parseInt(textOverlay.style.top) + 16;
    saveAnnotation({ type: 'text', x, y, text: txt, color: activeColor, size: strokeSize, opacity: 1 });
    redrawAnnotations(currentPage);
  }
  textOverlay.style.display = 'none';
});

textOverlay.addEventListener('keydown', e => {
  if (e.key === 'Escape') { textOverlay.style.display = 'none'; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textOverlay.blur(); }
});

// ── Toolbar Wiring ────────────────────────────────────────────────
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('locked')) { showUpgradeModal(); return; }
    if (btn.id === 'tool-signature') { openSignatureModal(); return; }
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTool = btn.dataset.tool;
    annCanvas.className = activeTool === 'text' ? 'tool-text' : activeTool === 'eraser' ? 'tool-select' : '';
    setStatus('Tool: ' + activeTool);
  });
});

// Colors
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    activeColor = dot.dataset.color;
    document.getElementById('custom-color').value = activeColor;
  });
});
document.getElementById('custom-color').addEventListener('input', e => {
  activeColor = e.target.value;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
});

// Sliders
strokeSizeEl.addEventListener('input', e => { strokeSize = +e.target.value; strokeValEl.textContent = strokeSize + 'px'; });
opacityEl.addEventListener('input',   e => { opacity = e.target.value / 100; opacityValEl.textContent = e.target.value + '%'; });

// Page nav
btnPrev.addEventListener('click', async () => { if (currentPage > 1) { currentPage--; await renderPage(currentPage); } });
btnNext.addEventListener('click', async () => { if (currentPage < totalPages) { currentPage++; await renderPage(currentPage); } });

// Zoom
document.getElementById('btn-zoom-in').addEventListener('click',  async () => { if (scale < 3)   { scale = +(scale + 0.25).toFixed(2); await renderPage(currentPage); zoomLabel.textContent = Math.round(scale / 1.5 * 100) + '%'; } });
document.getElementById('btn-zoom-out').addEventListener('click', async () => { if (scale > 0.5) { scale = +(scale - 0.25).toFixed(2); await renderPage(currentPage); zoomLabel.textContent = Math.round(scale / 1.5 * 100) + '%'; } });

// Undo / Redo
document.getElementById('btn-undo').addEventListener('click', () => {
  const stack = undoStack[currentPage];
  if (!stack || !stack.length) { showToast('Nothing to undo'); return; }
  if (!redoStack[currentPage]) redoStack[currentPage] = [];
  redoStack[currentPage].push(JSON.stringify(annotations[currentPage] || []));
  annotations[currentPage] = JSON.parse(stack.pop());
  chrome.storage.local.set({ annotations });
  redrawAnnotations(currentPage);
});

document.getElementById('btn-redo').addEventListener('click', () => {
  const stack = redoStack[currentPage];
  if (!stack || !stack.length) { showToast('Nothing to redo'); return; }
  pushUndo(currentPage);
  annotations[currentPage] = JSON.parse(stack.pop());
  chrome.storage.local.set({ annotations });
  redrawAnnotations(currentPage);
});

// Keyboard shortcuts
document.addEventListener('keydown', async e => {
  if (e.ctrlKey && e.key === 'z') document.getElementById('btn-undo').click();
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) document.getElementById('btn-redo').click();
  if (!e.ctrlKey && e.key === 'h') document.getElementById('tool-highlight').click();
  if (!e.ctrlKey && e.key === 'p') document.getElementById('tool-pen').click();
  if (!e.ctrlKey && e.key === 't') document.getElementById('tool-text').click();
  if (!e.ctrlKey && e.key === 'e') document.getElementById('tool-eraser').click();
  if (e.key === 'ArrowLeft')  btnPrev.click();
  if (e.key === 'ArrowRight') btnNext.click();
});

// Sidebar
document.getElementById('sidebar-toggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('collapsed'));
document.getElementById('sidebar-close-btn').addEventListener('click', () => document.getElementById('sidebar').classList.add('collapsed'));
document.getElementById('sidebar-pro-banner').addEventListener('click', showUpgradeModal);

// Drop zone open
document.getElementById('drop-open-btn').addEventListener('click', () => document.getElementById('hidden-file-input').click());
document.getElementById('hidden-file-input').addEventListener('change', e => {
  if (e.target.files[0]) loadPdfFromFile(e.target.files[0]);
});

// ── Export PDF ────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', async () => {
  if (!pdfDoc) { showToast('Open a PDF first', 'error'); return; }

  const allowed = await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'checkPlan' }, res => {
      if (!res) return resolve(false);
      if (res.plan === 'pro') return resolve(true);
      if (res.canExport) return resolve(true);
      resolve(false);
    });
  });

  if (!allowed) { showUpgradeModal(); return; }

  setStatus('Exporting…');
  showToast('Exporting annotated PDF…');

  try {
    // Load pdf-lib from local lib folder
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('lib/pdf-lib.min.js');
    document.head.appendChild(script);
    await new Promise(r => { script.onload = r; });

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const response = await fetch(pdfDoc.loadingTask.url || '');
    const bytes = await response.arrayBuffer();
    const pdfDocLib = await PDFDocument.load(bytes);
    const pages = pdfDocLib.getPages();
    const font  = await pdfDocLib.embedFont(StandardFonts.Helvetica);

    for (const [pageNumStr, anns] of Object.entries(annotations)) {
      const pg = pages[parseInt(pageNumStr) - 1];
      if (!pg) continue;
      const { height } = pg.getSize();
      const ratio = height / annCanvas.height;

      for (const ann of anns) {
        if (ann.type === 'highlight') {
          const c = hexToRgb(ann.color);
          pg.drawRectangle({ x: ann.x * ratio, y: height - (ann.y + ann.h) * ratio, width: ann.w * ratio, height: ann.h * ratio, color: rgb(c.r, c.g, c.b), opacity: 0.35 });
        } else if (ann.type === 'pen' && ann.points?.length > 1) {
          // approximate with lines (advanced implementation omitted for brevity)
        } else if (ann.type === 'text') {
          const c = hexToRgb(ann.color);
          pg.drawText(ann.text, { x: ann.x * ratio, y: height - ann.y * ratio, font, size: (ann.size * 3 || 16) * ratio, color: rgb(c.r, c.g, c.b) });
        } else if (ann.type === 'rect') {
          const c = hexToRgb(ann.color);
          pg.drawRectangle({ x: ann.x * ratio, y: height - (ann.y + ann.h) * ratio, width: ann.w * ratio, height: ann.h * ratio, borderColor: rgb(c.r, c.g, c.b), borderWidth: ann.size, opacity: 0 });
        } else if (ann.type === 'circle') {
          const c = hexToRgb(ann.color);
          pg.drawEllipse({ x: (ann.x + ann.w/2) * ratio, y: height - (ann.y + ann.h/2) * ratio, xScale: Math.abs(ann.w/2) * ratio, yScale: Math.abs(ann.w/2) * ratio, borderColor: rgb(c.r, c.g, c.b), borderWidth: ann.size, opacity: 0 });
        } else if (ann.type === 'stamp') {
          const c = hexToRgb(ann.color);
          pg.drawText(ann.text, { x: (ann.x + 16) * ratio, y: height - (ann.y - 12) * ratio, font, size: (ann.size * 5 || 24) * ratio, color: rgb(c.r, c.g, c.b) });
          const metrics = annCtx.measureText(ann.text);
          pg.drawRectangle({ x: ann.x * ratio, y: height - (ann.y + 12) * ratio, width: (metrics.width + 32) * ratio, height: ((ann.size * 5 || 24) + 24) * ratio, borderColor: rgb(c.r, c.g, c.b), borderWidth: 3, opacity: 0 });
        } else if (ann.type === 'signature' && ann.dataUrl) {
          const imgBytes = await fetch(ann.dataUrl).then(r => r.arrayBuffer());
          const embImg = await pdfDocLib.embedPng(imgBytes);
          pg.drawImage(embImg, { x: ann.x * ratio, y: height - (ann.y + ann.h) * ratio, width: ann.w * ratio, height: ann.h * ratio });
        }
      }
    }

    const pdfBytes = await pdfDocLib.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'annotated.pdf'; a.click();
    URL.revokeObjectURL(url);

    chrome.runtime.sendMessage({ action: 'incrementExport' });
    showToast('✅ PDF exported successfully!', 'success');
    setStatus('Export complete');
  } catch(err) {
    showToast('Export failed: ' + err.message, 'error');
    setStatus('Export failed');
  }
});

// ── Signature Modal ───────────────────────────────────────────────
const sigModal   = document.getElementById('sig-modal');
const sigCanvas  = document.getElementById('sig-canvas');
const sigCtx     = sigCanvas.getContext('2d');
let sigDrawing = false;

function openSignatureModal() {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigCtx.strokeStyle = '#ffffff';
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = 'round';
  sigModal.classList.remove('hidden');
}

sigCanvas.addEventListener('mousedown', e => { sigDrawing = true; const r = sigCanvas.getBoundingClientRect(); sigCtx.beginPath(); sigCtx.moveTo(e.clientX - r.left, e.clientY - r.top); });
sigCanvas.addEventListener('mousemove', e => { if (!sigDrawing) return; const r = sigCanvas.getBoundingClientRect(); sigCtx.lineTo(e.clientX - r.left, e.clientY - r.top); sigCtx.stroke(); });
sigCanvas.addEventListener('mouseup',   () => { sigDrawing = false; });

document.getElementById('sig-clear-btn').addEventListener('click',  () => sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height));
document.getElementById('sig-cancel-btn').addEventListener('click', () => sigModal.classList.add('hidden'));
document.getElementById('sig-confirm-btn').addEventListener('click', () => {
  signatureDataUrl = sigCanvas.toDataURL('image/png');
  pendingSigPlace  = true;
  sigModal.classList.add('hidden');
  setStatus('Click on the PDF to place your signature');
  showToast('Click anywhere on the PDF to place signature');
});

// ── Upgrade Modal ─────────────────────────────────────────────────
const upgradeModal = document.getElementById('upgrade-modal');

function showUpgradeModal() { upgradeModal.classList.remove('hidden'); }

document.getElementById('modal-close-btn').addEventListener('click', () => upgradeModal.classList.add('hidden'));

// Plan card selection removed (now single lifetime plan)

document.getElementById('modal-upgrade-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://rzp.io/rzp/sbLSM6ng' });
  upgradeModal.classList.add('hidden');
  showToast('Complete payment, then enter your license key in the popup');
});

// ── Drag-and-Drop PDF ─────────────────────────────────────────────
function setupDragDrop() {
  const area = document.getElementById('canvas-area');
  area.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  area.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') loadPdfFromFile(file);
    else showToast('Please drop a PDF file', 'error');
  });
}

// ── Annotation Sidebar List ───────────────────────────────────────
function updateAnnList() {
  const list  = document.getElementById('ann-list');
  const empty = document.getElementById('ann-empty');
  const allAnns = [];
  for (const [pg, anns] of Object.entries(annotations)) {
    anns.forEach((ann, idx) => allAnns.push({ ann, pg: +pg, idx }));
  }

  if (!allAnns.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  // Remove old items
  list.querySelectorAll('.ann-item').forEach(el => el.remove());

  const icons = { highlight: '🔆', pen: '🖊️', text: '🔤', rect: '⬛', circle: '⭕', arrow: '➡️', stamp: '📌', signature: '✍️' };
  allAnns.forEach(({ ann, pg, idx }) => {
    const item = document.createElement('div');
    item.className = 'ann-item';
    item.innerHTML = `
      <span class="ann-item-icon">${icons[ann.type] || '•'}</span>
      <div class="ann-item-info">
        <div class="ann-item-type">${ann.type.charAt(0).toUpperCase() + ann.type.slice(1)}</div>
        <div class="ann-item-page">Page ${pg}</div>
      </div>
      <button class="ann-item-del" title="Delete">×</button>`;
    item.querySelector('.ann-item-del').addEventListener('click', e => {
      e.stopPropagation();
      annotations[pg].splice(idx, 1);
      if (!annotations[pg].length) delete annotations[pg];
      chrome.storage.local.set({ annotations });
      redrawAnnotations(currentPage);
    });
    item.addEventListener('click', async () => {
      if (pg !== currentPage) { currentPage = pg; await renderPage(pg); }
    });
    list.appendChild(item);
  });
}

// ── Helpers ───────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  return { r, g, b };
}

function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
}

function setStatus(msg) { statusText.textContent = msg; }

function updatePageUI() {
  pageInfo.textContent = `${currentPage} / ${totalPages}`;
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= totalPages;
}

function updateAnnCount() {
  const total = Object.values(annotations).reduce((s, a) => s + a.length, 0);
  annCountEl.textContent = `Annotations: ${total}`;
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = '', 3000);
}

// ── New Action Features ───────────────────────────────────────────
document.getElementById('btn-dark-mode').addEventListener('click', function() {
  this.classList.toggle('active');
  canvasWrap.classList.toggle('dark-mode');
});

document.getElementById('btn-rotate').addEventListener('click', async function() {
  if (!pdfDoc) return;
  rotation = (rotation + 90) % 360;
  await renderPage(currentPage);
  showToast(`Rotated ${rotation}°`);
});

document.getElementById('btn-print').addEventListener('click', () => {
  if (!pdfDoc) return;
  window.print();
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

document.getElementById('btn-clear-all').addEventListener('click', () => {
  if (!pdfDoc) return;
  if (confirm('Clear all annotations on this page?')) {
    pushUndo(currentPage);
    annotations[currentPage] = [];
    chrome.storage.local.set({ annotations });
    redrawAnnotations(currentPage);
    showToast('Annotations cleared');
  }
});

document.getElementById('btn-fit-page').addEventListener('click', async () => {
  if (!pdfDoc) return;
  scale = 1.0;
  await renderPage(currentPage);
  zoomLabel.textContent = 'Fit';
});

// ── Shortcuts Modal ───────────────────────────────────────────────
const shortcutsModal = document.getElementById('shortcuts-modal');
document.getElementById('btn-shortcuts').addEventListener('click', () => shortcutsModal.classList.remove('hidden'));
document.getElementById('shortcuts-close-btn').addEventListener('click', () => shortcutsModal.classList.add('hidden'));

// ── URL Modal ─────────────────────────────────────────────────────
const urlModal = document.getElementById('url-modal');
const urlInput = document.getElementById('url-input');
document.getElementById('drop-url-btn').addEventListener('click', () => urlModal.classList.remove('hidden'));
document.getElementById('url-cancel-btn').addEventListener('click', () => urlModal.classList.add('hidden'));
document.getElementById('url-open-btn').addEventListener('click', () => {
  const url = urlInput.value.trim();
  if (url) {
    urlModal.classList.add('hidden');
    fileName = url.split('/').pop() || 'document.pdf';
    document.title = fileName + ' — PDF Annotate Pro';
    if (fileNameEl) fileNameEl.textContent = fileName;
    loadPdfFromUrl(url);
  }
});

// ── Stamp Modal ───────────────────────────────────────────────────
const stampModal = document.getElementById('stamp-modal');
document.getElementById('stamp-cancel-btn').addEventListener('click', () => stampModal.classList.add('hidden'));
document.querySelectorAll('.stamp-item').forEach(item => {
  item.addEventListener('click', () => {
    activeStamp = item.dataset.stamp;
    activeColor = item.dataset.color;
    stampModal.classList.add('hidden');
    setStatus('Click anywhere to place stamp: ' + activeStamp);
    showToast('Click anywhere on PDF to place stamp');
  });
});
