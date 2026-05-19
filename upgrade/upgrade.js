// upgrade.js — Handles payment, license activation, FAQ

var RAZORPAY_URL = 'https://rzp.io/rzp/sbLSM6ng';

// ── Welcome Banner ──────────────────────────────────────────
if (new URLSearchParams(location.search).get('welcome') === 'true') {
  document.getElementById('welcome-banner').style.display = 'block';
}

// ── Generate Unique License Key ─────────────────────────────
function generateLicenseKey() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function block(len) {
    var s = '';
    for (var i = 0; i < len; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
  }
  return block(4) + '-' + block(4) + '-' + block(4) + '-' + block(4);
}

// ── Activate Pro (works in both extension + standalone) ─────
function activatePro(key, callback) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: 'activateLicense', key: key }, function(res) {
      callback(res && res.success);
    });
  } else {
    // Standalone: save locally
    localStorage.setItem('pdf_annotate_pro_plan', 'pro');
    localStorage.setItem('pdf_annotate_pro_key', key);
    callback(true);
  }
}

// ── Pay Now Button ──────────────────────────────────────────
var btnPayNow = document.getElementById('btn-pay-now');
if (btnPayNow) {
  btnPayNow.addEventListener('click', function() {
    // Open Razorpay in new tab
    window.open(RAZORPAY_URL, '_blank');

    // Change button to show countdown
    btnPayNow.disabled = true;
    btnPayNow.style.opacity = '0.7';
    var secondsLeft = 45;
    btnPayNow.innerHTML = '<span class="spinner"></span> Waiting for payment completion...';

    var countdown = setInterval(function() {
      secondsLeft--;
      if (secondsLeft <= 0) {
        clearInterval(countdown);
        btnPayNow.innerHTML = '✅ Payment window opened — confirm below';

        // Auto-show the confirmation section after 45 seconds
        var confirmSection = document.getElementById('payment-confirm');
        if (confirmSection) {
          confirmSection.style.display = 'block';
          confirmSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 1000);
  });
}

// Wire up any .btn-upgrade buttons too
document.querySelectorAll('.btn-upgrade').forEach(function(btn) {
  if (btn.id !== 'btn-pay-now') {
    btn.addEventListener('click', function() {
      window.open(RAZORPAY_URL, '_blank');
    });
  }
});

// ── Confirm Payment Button (auto-generates key) ─────────────
var btnConfirm = document.getElementById('btn-confirm-paid');
if (btnConfirm) {
  btnConfirm.addEventListener('click', function() {
    var resultEl = document.getElementById('confirm-result');
    var key = generateLicenseKey();

    btnConfirm.textContent = '⏳ Activating...';
    btnConfirm.style.opacity = '0.6';
    btnConfirm.disabled = true;

    // Small delay for UX feel
    setTimeout(function() {
      activatePro(key, function(success) {
        if (success) {
          resultEl.className = 'confirm-result ok';
          resultEl.innerHTML =
            '🎉 <strong>Pro activated!</strong> Your license key:' +
            '<div class="confirm-key-display">' + key + '</div>' +
            '<div class="confirm-key-label">Save this key for future reference. You can re-enter it anytime.</div>';
          btnConfirm.textContent = '✅ Pro Activated!';
          btnConfirm.style.background = '#00b88a';
          // Update the pay button too
          if (btnPayNow) {
            btnPayNow.textContent = '✅ Pro Plan Active';
            btnPayNow.style.opacity = '1';
            btnPayNow.style.background = 'linear-gradient(135deg, #00e5a0, #00b88a)';
            btnPayNow.disabled = true;
          }
        } else {
          resultEl.textContent = '❌ Activation failed. Please try the manual key entry below.';
          resultEl.className = 'confirm-result err';
          btnConfirm.textContent = 'Try Again';
          btnConfirm.style.opacity = '1';
          btnConfirm.disabled = false;
        }
      });
    }, 1200);
  });
}

// ── Footer Upgrade Link ─────────────────────────────────────
var footerLink = document.querySelector('footer a');
if (footerLink) {
  footerLink.addEventListener('click', function(e) {
    e.preventDefault();
    window.open(RAZORPAY_URL, '_blank');
  });
}

// ── FAQ Accordion ───────────────────────────────────────────
document.querySelectorAll('.faq-q').forEach(function(q) {
  q.addEventListener('click', function() {
    var item = this.parentElement;
    // Close all other FAQ items
    document.querySelectorAll('.faq-item').forEach(function(other) {
      if (other !== item) other.classList.remove('open');
    });
    // Toggle this one
    item.classList.toggle('open');
  });
});

// ── License Key Input Formatter ─────────────────────────────
var keyInput = document.getElementById('license-key-input');
if (keyInput) {
  keyInput.addEventListener('input', function() {
    var raw = this.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    var parts = [];
    if (raw.length > 0)  parts.push(raw.slice(0, 4));
    if (raw.length > 4)  parts.push(raw.slice(4, 8));
    if (raw.length > 8)  parts.push(raw.slice(8, 12));
    if (raw.length > 12) parts.push(raw.slice(12, 16));
    this.value = parts.join('-');
  });

  keyInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      document.getElementById('btn-activate').click();
    }
  });
}

// ── License Key Validation ──────────────────────────────────
function isValidKey(key) {
  var clean = key.replace(/-/g, '');
  return clean.length >= 16;
}

// ── Manual Activate Button ──────────────────────────────────
var btnActivate = document.getElementById('btn-activate');
if (btnActivate) {
  btnActivate.addEventListener('click', function() {
    var key = keyInput.value.trim();
    var result = document.getElementById('license-result');

    if (!key) {
      result.textContent = '⚠️ Please enter a license key.';
      result.className = 'license-result err';
      return;
    }
    if (!isValidKey(key)) {
      result.textContent = '❌ You are not done payment';
      result.className = 'license-result err';
      return;
    }

    activatePro(key, function(success) {
      if (success) {
        result.textContent = '🎉 Pro plan activated! All features unlocked.';
        result.className = 'license-result ok';
        keyInput.value = '';
      } else {
        result.textContent = '❌ Invalid key. Please check and try again.';
        result.className = 'license-result err';
      }
    });
  });
}

// ── Hero Actions: Redirect to Editor ────────────────────────
var btnHeroEditor = document.getElementById('btn-hero-editor');
if (btnHeroEditor) {
  btnHeroEditor.addEventListener('click', function() {
    window.location.href = '../annotator/annotator.html';
  });
}

var btnHeroUpload = document.getElementById('btn-hero-upload');
var heroUploadInput = document.getElementById('hero-upload-input');
if (btnHeroUpload && heroUploadInput) {
  btnHeroUpload.addEventListener('click', function() {
    heroUploadInput.click();
  });
  heroUploadInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files.length > 0) {
      var file = e.target.files[0]; // just take the first file for now
      var reader = new FileReader();
      reader.onload = function(evt) {
        // Store as base64 in local storage
        var base64data = evt.target.result;
        chrome.storage.local.set({ 
          'pending_pdf_data': base64data,
          'pending_pdf_name': file.name
        }, function() {
          // Redirect
          window.location.href = '../annotator/annotator.html?load_pending=1';
        });
      };
      reader.readAsDataURL(file);
    }
  });
}
