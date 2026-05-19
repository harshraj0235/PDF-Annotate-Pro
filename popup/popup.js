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

// ── Recent Files Helpers ─────────────────────────────────────────
function addRecentFile(name, url) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['recentFiles'], (data) => {
      let list = data.recentFiles || [];
      // filter out duplicates
      list = list.filter(f => f.url !== url && f.name !== name);
      // insert at beginning
      list.unshift({ name, url, time: Date.now() });
      if (list.length > 5) list.pop();
      chrome.storage.local.set({ recentFiles: list });
    });
  }
}

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
  addRecentFile(file.name, url);
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
  const trimmedUrl = rawUrl.trim();
  const name = trimmedUrl.substring(trimmedUrl.lastIndexOf('/') + 1) || 'document.pdf';
  addRecentFile(name, trimmedUrl);
  const annotatorUrl = chrome.runtime.getURL(
    `annotator/annotator.html?pdf=${encodeURIComponent(trimmedUrl)}`
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
      const name = tab.title || 'document.pdf';
      addRecentFile(name, url);
      const annotatorUrl = chrome.runtime.getURL(
        `annotator/annotator.html?pdf=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`
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
  chrome.tabs.create({ url: chrome.runtime.getURL('help/help.html') });
  window.close();
});

// ── Recent Files Modal ───────────────────────────────────────────
const recentPanel = document.getElementById('recent-panel');
const recentList = document.getElementById('recent-list');

document.getElementById('link-history').addEventListener('click', () => {
  chrome.storage.local.get(['recentFiles'], (data) => {
    const list = data.recentFiles || [];
    recentList.innerHTML = '';
    if (list.length === 0) {
      recentList.innerHTML = `<div class="recent-empty">No recent files opened yet.<br/>Open a PDF to start your list!</div>`;
    } else {
      list.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'recent-item';
        const formattedTime = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `
          <span class="recent-item-icon">📄</span>
          <div class="recent-item-info">
            <div class="recent-item-name">${item.name}</div>
            <div class="recent-item-meta">${item.url.startsWith('blob:') ? 'Local File' : 'Web URL'} · ${formattedTime}</div>
          </div>
        `;
        div.addEventListener('click', () => {
          if (item.url.startsWith('blob:')) {
            showToast('Local file blobs expire. Please re-open your file.');
          } else {
            const annotatorUrl = chrome.runtime.getURL(
              `annotator/annotator.html?pdf=${encodeURIComponent(item.url)}&name=${encodeURIComponent(item.name)}`
            );
            chrome.tabs.create({ url: annotatorUrl });
            window.close();
          }
        });
        recentList.appendChild(div);
      });
    }
    recentPanel.classList.add('show');
  });
});

document.getElementById('btn-clear-history').addEventListener('click', () => {
  if (confirm('Are you sure you want to clear your recently opened PDF files history?')) {
    chrome.storage.local.remove(['recentFiles'], () => {
      recentList.innerHTML = `<div class="recent-empty">No recent files opened yet.<br/>Open a PDF to start your list!</div>`;
      showToast('🗑️ History cleared successfully');
    });
  }
});

document.getElementById('recent-close').addEventListener('click', () => {
  recentPanel.classList.remove('show');
});

// ── Toast ────────────────────────────────────────────────────────
function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}
