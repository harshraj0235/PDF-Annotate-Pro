// background.js — Service Worker (Manifest V3)

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openAnnotator') {
    const pdfUrl = encodeURIComponent(message.url);
    const annotatorUrl = chrome.runtime.getURL(`annotator/annotator.html?pdf=${pdfUrl}`);
    chrome.tabs.create({ url: annotatorUrl });
    sendResponse({ success: true });
  }

  if (message.action === 'checkPlan') {
    chrome.storage.sync.get(['plan', 'exports', 'lastReset', 'licenseKey'], (data) => {
      const now = Date.now();
      const oneMonth = 30 * 24 * 60 * 60 * 1000;
      let exports = data.exports || 0;
      let lastReset = data.lastReset || now;

      // Reset monthly counter
      if (now - lastReset > oneMonth) {
        exports = 0;
        lastReset = now;
        chrome.storage.sync.set({ exports: 0, lastReset });
      }

      sendResponse({
        plan: data.plan || 'free',
        exportsUsed: exports,
        exportsLimit: 5,
        canExport: (data.plan === 'pro') || exports < 5
      });
    });
    return true; // async
  }

  if (message.action === 'incrementExport') {
    chrome.storage.sync.get(['exports'], (data) => {
      const exports = (data.exports || 0) + 1;
      chrome.storage.sync.set({ exports });
      sendResponse({ exports });
    });
    return true;
  }

  if (message.action === 'activateLicense') {
    const key = message.key;
    const clean = key ? key.replace(/-/g, '') : '';
    if (clean.length >= 16) {
      chrome.storage.sync.set({ plan: 'pro', licenseKey: key });
      sendResponse({ success: true, plan: 'pro' });
    } else {
      sendResponse({ success: false, error: 'Invalid license key' });
    }
    return true;
  }
});

// On install: initialize storage defaults
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      plan: 'free',
      exports: 0,
      lastReset: Date.now(),
      annotations: {}
    });
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('upgrade/upgrade.html?welcome=true')
    });
  }
});
