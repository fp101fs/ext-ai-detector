// popup.js — UI logic for the extension popup
(function () {
  'use strict';

  var apiKeyInput = document.getElementById('apiKey');
  var saveKeyBtn = document.getElementById('saveKey');
  var keyStatus = document.getElementById('keyStatus');
  var scanBtn = document.getElementById('scanBtn');
  var resultsDiv = document.getElementById('results');
  var loadingDiv = document.getElementById('loading');
  var scoreCircle = document.getElementById('scoreCircle');
  var scoreLabel = document.getElementById('scoreLabel');
  var paraResults = document.getElementById('paragraphResults');
  var summaryDiv = document.getElementById('summary');

  // Auth elements
  var signInBtn = document.getElementById('signInBtn');
  var signOutBtn = document.getElementById('signOutBtn');
  var signedOutDiv = document.getElementById('signedOut');
  var signedInDiv = document.getElementById('signedIn');
  var userNameSpan = document.getElementById('userName');
  var apiKeySection = document.getElementById('apiKeySection');
  var orDivider = document.getElementById('orDivider');

  // ─── Init ───────────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    chrome.storage.local.get(
      ['apiKey', 'detectionMode', 'minWords', 'maxParagraphs', 'authToken', 'authUser'],
      function (items) {
        if (items.apiKey) apiKeyInput.value = items.apiKey;
        if (items.detectionMode) {
          var radio = document.querySelector('input[name="mode"][value="' + items.detectionMode + '"]');
          if (radio) radio.checked = true;
        }
        if (items.minWords) document.getElementById('minWords').value = items.minWords;
        if (items.maxParagraphs) document.getElementById('maxParagraphs').value = items.maxParagraphs;

        // Update auth UI
        if (items.authToken && items.authUser) {
          showSignedIn(items.authUser);
        } else {
          showSignedOut();
        }
      }
    );
  });

  // ─── Auth handlers ──────────────────────────────────────────────────────────

  signInBtn.addEventListener('click', function () {
    signInBtn.disabled = true;
    signInBtn.textContent = 'Signing in...';

    chrome.runtime.sendMessage({ action: 'signIn' }, function (resp) {
      if (resp && resp.ok && resp.user) {
        showSignedIn(resp.user);
      } else {
        signInBtn.disabled = false;
        signInBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.547 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google';
        var errMsg = (resp && resp.error) || 'Sign-in failed';
        keyStatus.textContent = errMsg;
        keyStatus.className = 'status err';
        setTimeout(function () { keyStatus.textContent = ''; keyStatus.className = 'status'; }, 5000);
      }
    });
  });

  signOutBtn.addEventListener('click', function () {
    chrome.runtime.sendMessage({ action: 'signOut' }, function () {
      showSignedOut();
    });
  });

  function showSignedIn(user) {
    signedOutDiv.classList.add('hidden');
    signedInDiv.classList.remove('hidden');
    userNameSpan.textContent = user.name || user.email || 'Signed in';

    // Hide API key section — signed-in users don't need it
    apiKeySection.classList.add('hidden');
    orDivider.classList.add('hidden');
  }

  function showSignedOut() {
    signedOutDiv.classList.remove('hidden');
    signedInDiv.classList.add('hidden');
    userNameSpan.textContent = '';

    // Show API key section as fallback
    apiKeySection.classList.remove('hidden');
    orDivider.classList.remove('hidden');

    // Reset sign-in button
    signInBtn.disabled = false;
    signInBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.547 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg> Sign in with Google';
  }

  // ─── Save settings ──────────────────────────────────────────────────────────

  saveKeyBtn.addEventListener('click', function () {
    var key = apiKeyInput.value.trim();
    var mode = document.querySelector('input[name="mode"]:checked').value;
    var minWords = parseInt(document.getElementById('minWords').value) || 20;
    var maxParagraphs = parseInt(document.getElementById('maxParagraphs').value) || 50;

    chrome.runtime.sendMessage({
      action: 'saveKey',
      apiKey: key,
      mode: mode,
      minWords: minWords,
      maxParagraphs: maxParagraphs
    }, function (resp) {
      if (resp && resp.ok) {
        keyStatus.textContent = 'Saved';
        keyStatus.className = 'status ok';
      } else {
        keyStatus.textContent = 'Error';
        keyStatus.className = 'status err';
      }
      setTimeout(function () { keyStatus.textContent = ''; keyStatus.className = 'status'; }, 3000);
    });
  });

  // ─── Scan handler ───────────────────────────────────────────────────────────

  scanBtn.addEventListener('click', function () {
    resultsDiv.classList.add('hidden');
    loadingDiv.classList.remove('hidden');
    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning page';

    var mode = document.querySelector('input[name="mode"]:checked').value;
    var minWords = parseInt(document.getElementById('minWords').value) || 20;
    var maxParagraphs = parseInt(document.getElementById('maxParagraphs').value) || 50;

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs.length) {
        loadingDiv.textContent = 'No active tab found.';
        loadingDiv.classList.remove('hidden');
        scanBtn.disabled = false;
        scanBtn.textContent = 'Scan This Page';
        return;
      }

      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: scanParagraphs,
        args: [{ minWords: minWords, maxParagraphs: maxParagraphs }]
      }, function (results) {
        if (chrome.runtime.lastError || !results || !results.length || !results[0].result) {
          loadingDiv.textContent = 'Error scanning page. Try refreshing the tab.';
          loadingDiv.classList.remove('hidden');
          scanBtn.disabled = false;
          scanBtn.textContent = 'Scan This Page';
          return;
        }

        var pageData = results[0].result;
        if (!pageData.paragraphs || !pageData.paragraphs.length) {
          loadingDiv.textContent = 'No qualifying paragraphs found (need ' + minWords + '+ words per paragraph).';
          loadingDiv.classList.remove('hidden');
          scanBtn.disabled = false;
          scanBtn.textContent = 'Scan This Page';
          return;
        }

        chrome.runtime.sendMessage({
          action: 'detectParagraphs',
          paragraphs: pageData.paragraphs,
          mode: mode
        }, function (detectionResults) {
          if (chrome.runtime.lastError || !detectionResults) {
            loadingDiv.textContent = 'Detection error.';
            loadingDiv.classList.remove('hidden');
            scanBtn.disabled = false;
            scanBtn.textContent = 'Scan This Page';
            return;
          }

          if (detectionResults.error) {
            loadingDiv.textContent = 'Error: ' + detectionResults.error;
            loadingDiv.classList.remove('hidden');
            scanBtn.disabled = false;
            scanBtn.textContent = 'Scan This Page';
            return;
          }

          var scores = detectionResults.map(function (r) { return r.aiProbability; }).filter(function (s) { return s !== null && s !== undefined; });
          var overallScore = scores.length > 0
            ? scores.reduce(function (a, b) { return a + b; }, 0) / scores.length
            : 0;

          displayResults(overallScore, detectionResults, pageData);

          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'highlight',
            results: detectionResults
          });

          loadingDiv.classList.add('hidden');
          scanBtn.disabled = false;
          scanBtn.textContent = 'Scan This Page';
        });
      });
    });
  });

  // ─── Display results ────────────────────────────────────────────────────────

  function displayResults(overallScore, results, pageData) {
    resultsDiv.classList.remove('hidden');

    var pct = Math.round(overallScore * 100);
    scoreCircle.textContent = pct + '%';
    scoreCircle.className = 'score-circle';
    if (pct < 30) scoreCircle.classList.add('low');
    else if (pct < 60) scoreCircle.classList.add('medium');
    else scoreCircle.classList.add('high');

    scoreLabel.textContent = 'AI Probability';

    paraResults.innerHTML = '';
    var sorted = results.slice().sort(function (a, b) { return b.aiProbability - a.aiProbability; });
    sorted.forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'para-item ' + (r.aiProbability >= 0.5 ? 'ai' : 'human');
      var preview = (r.text || '').substring(0, 120);
      if (r.text && r.text.length > 120) preview += '...';
      item.innerHTML = '<span class="para-score">' + Math.round(r.aiProbability * 100) + '%</span>' +
        '<span class="para-text">' + escapeHtml(preview) + '</span>';
      paraResults.appendChild(item);
    });

    var aiCount = results.filter(function (r) { return r.aiProbability >= 0.5; }).length;
    var humanCount = results.filter(function (r) { return r.aiProbability < 0.5; }).length;
    var methods = {};
    results.forEach(function (r) { methods[r.method] = true; });
    var methodKeys = Object.keys(methods);

    summaryDiv.innerHTML = '<strong>Summary</strong><br>' +
      'Scanned: ' + results.length + ' paragraphs<br>' +
      'AI-like: ' + aiCount + ' | Human-like: ' + humanCount + '<br>' +
      'Method: ' + methodKeys.join(', ') + '<br>' +
      'Page: ' + escapeHtml(pageData.title) + '<br>' +
      'URL: ' + escapeHtml(pageData.url);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Paragraph scanner (injected into page) ────────────────────────────────

  function scanParagraphs(options) {
    var minWords = options.minWords || 20;
    var maxParagraphs = options.maxParagraphs || 50;

    var allPs = Array.from(document.querySelectorAll('p'));
    var visiblePs = allPs.filter(function (p) {
      var style = window.getComputedStyle(p);
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        p.offsetParent !== null &&
        p.textContent.trim().length > 0;
    });

    var qualified = visiblePs.filter(function (p) {
      return p.textContent.trim().split(/\s+/).length >= minWords;
    });

    var sorted = qualified.sort(function (a, b) {
      return b.textContent.trim().length - a.textContent.trim().length;
    });
    var toScan = sorted.slice(0, maxParagraphs);

    return {
      url: window.location.href,
      title: document.title,
      totalParagraphs: allPs.length,
      visibleParagraphs: visiblePs.length,
      scannedParagraphs: toScan.length,
      paragraphs: toScan.map(function (p, i) {
        return {
          index: i,
          text: p.textContent.trim(),
          wordCount: p.textContent.trim().split(/\s+/).length
        };
      })
    };
  }
})();