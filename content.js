// content.js — Injected into all pages to detect PDFs

(function () {
  // Only intercept if this page IS a PDF
  if (document.contentType === 'application/pdf') {
    const pdfUrl = encodeURIComponent(window.location.href);
    const annotatorUrl = chrome.runtime.getURL(
      `annotator/annotator.html?pdf=${pdfUrl}`
    );
    window.location.href = annotatorUrl;
    return;
  }

  // Also watch for PDF links on regular pages (optional context menu hook)
  // This listens for the extension asking us to open a URL
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'ping') {
      return true;
    }
  });
})();
