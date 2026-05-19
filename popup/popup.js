// popup.js

const planBadge = document.getElementById('plan-badge');
const planName = document.getElementById('plan-name');
const usageCount = document.getElementById('usage-count');
const usageBar = document.getElementById('usage-bar');
const usageRowEl = document.getElementById('usage-row');
const upgradeCta = document.getElementById('upgrade-cta');
const toast = document.getElementById('toast');

// ── Load Plan Info ──────────────────────────────────────────────
function loadPlan() {
  chrome.runtime.sendMessage({ action: 'checkPlan' }, (res) => {
    if (!res) return;
    const { plan, exportsUsed, exportsLimit, canExport } = res;

    if (plan === 'pro') {
      planBadge.className = 'plan-badge pro';
      planName.textContent = 'Pro ⚡';
      usageRowEl.style.display = 'none';
      document.getElementById('usage-bar-wrap').style.display = 'none';
      upgradeCta.style.display = 'none';
    } else {
      planBadge.className = 'plan-badge free';
      planName.textContent = 'Free';
      const pct = Math.min((exportsUsed / exportsLimit) * 100, 100);
      usageCount.textContent = `${exportsUsed} / ${exportsLimit}`;
      usageBar.style.width = `${pct}%`;
      if (exportsUsed >= exportsLimit) {
        usageBar.classList.add('danger');
        usageCount.style.color = '#ff6584';
      }
    }
  });
}
loadPlan();

// ── Open PDF File ────────────────────────────────────────────────
document.getElementById('btn-open-file').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    showToast('Please select a PDF file');
    return;
  }
  const url = URL.createObjectURL(file);
  const annotatorUrl = chrome.runtime.getURL(
    `annotator/annotator.html?pdf=${encodeURIComponent(url)}&name=${encodeURIComponent(file.name)}`
  );
  chrome.tabs.create({ url: annotatorUrl });
  window.close();
});

// ── Open PDF from URL ────────────────────────────────────────────
function openPdfUrl(rawUrl) {
  if (!rawUrl || rawUrl.trim() === '') {
    showToast('Please enter a PDF URL');
    return;
  }
  if (!rawUrl.toLowerCase().includes('.pdf') && !rawUrl.startsWith('blob:')) {
    showToast('URL may not be a PDF — proceeding anyway');
  }
  const annotatorUrl = chrome.runtime.getURL(
    `annotator/annotator.html?pdf=${encodeURIComponent(rawUrl.trim())}`
  );
  chrome.tabs.create({ url: annotatorUrl });
  window.close();
}

document.getElementById('btn-url-go').addEventListener('click', () => {
  openPdfUrl(document.getElementById('url-input').value);
});

document.getElementById('url-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') openPdfUrl(e.target.value);
});

// ── Annotate Current Tab ─────────────────────────────────────────
document.getElementById('btn-current-tab').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;
    const url = tab.url || '';
    if (url.toLowerCase().includes('.pdf') || tab.title?.toLowerCase().includes('pdf')) {
      const annotatorUrl = chrome.runtime.getURL(
        `annotator/annotator.html?pdf=${encodeURIComponent(url)}&name=${encodeURIComponent(tab.title || 'document.pdf')}`
      );
      chrome.tabs.create({ url: annotatorUrl });
      window.close();
    } else {
      showToast('Current tab does not appear to be a PDF');
    }
  });
});

// ── Upgrade CTA ──────────────────────────────────────────────────
document.getElementById('upgrade-cta').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('upgrade/upgrade.html') });
  window.close();
});

// ── License Key ──────────────────────────────────────────────────
document.getElementById('link-license').addEventListener('click', () => {
  const key = prompt('Enter your Pro license key (format: XXXX-XXXX-XXXX-XXXX):');
  if (!key) return;
  chrome.runtime.sendMessage({ action: 'activateLicense', key }, (res) => {
    if (res && res.success) {
      showToast('🎉 Pro plan activated!');
      setTimeout(loadPlan, 500);
    } else {
      showToast('Invalid license key. Check your email.');
    }
  });
});

// ── Help ─────────────────────────────────────────────────────────
document.getElementById('link-help').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com' }); // replace with real help URL
  window.close();
});

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}
