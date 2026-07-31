// content.js — Injected into pages for highlighting detected AI paragraphs
(function () {
  'use strict';

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'highlight') {
      highlightResults(msg.results);
      sendResponse({ ok: true });
      return false;
    }
    if (msg.action === 'clearHighlights') {
      clearHighlights();
      sendResponse({ ok: true });
      return false;
    }
  });

  function highlightResults(results) {
    clearHighlights();

    results.forEach(function (r) {
      // Find the paragraph by matching text content
      var allPs = document.querySelectorAll('p');
      var target = null;
      var targetText = (r.text || '').trim();

      for (var i = 0; i < allPs.length; i++) {
        var pText = allPs[i].textContent.trim();
        // Match if the paragraph starts with the same text or contains it
        if (pText.length > 0 && targetText.length > 0) {
          if (pText.indexOf(targetText.substring(0, Math.min(50, targetText.length))) !== -1 ||
              targetText.indexOf(pText.substring(0, Math.min(50, pText.length))) !== -1) {
            target = allPs[i];
            break;
          }
        }
      }

      if (!target) return;

      // Add outline
      target.style.outline = r.aiProbability >= 0.5
        ? '2px solid rgba(233, 69, 96, 0.5)'
        : '2px solid rgba(0, 200, 0, 0.3)';
      target.style.outlineOffset = '2px';
      target.style.transition = 'outline 0.3s ease';

      // Add badge
      var badge = document.createElement('span');
      badge.className = 'ai-detector-badge';
      badge.textContent = Math.round(r.aiProbability * 100) + '% AI';
      badge.style.cssText =
        'display:inline-block;font-size:10px;padding:1px 5px;border-radius:3px;' +
        'margin-left:4px;background:' + (r.aiProbability >= 0.5 ? 'rgba(233,69,96,0.15)' : 'rgba(0,200,0,0.1)') + ';' +
        'color:' + (r.aiProbability >= 0.5 ? '#e94560' : '#0f0') + ';' +
        'cursor:pointer;vertical-align:middle;';
      badge.title = 'AI probability: ' + Math.round(r.aiProbability * 100) + '% (' + (r.method || 'unknown') + ')';

      // Click to show detail
      (function (prob, m, wc) {
        badge.addEventListener('click', function () {
          var detail = document.createElement('div');
          detail.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
            'background:#1a1a2e;color:#eee;padding:16px;border-radius:8px;z-index:99999;' +
            'max-width:400px;font-size:12px;border:1px solid #333;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
          detail.innerHTML = '<strong>AI Detection Detail</strong><br>' +
            'Probability: ' + Math.round(prob * 100) + '%<br>' +
            'Method: ' + (m || 'unknown') + '<br>' +
            'Word count: ' + wc + '<br>' +
            '<button onclick="this.parentElement.remove()" style="margin-top:8px;padding:4px 12px;' +
            'background:#e94560;color:white;border:none;border-radius:4px;cursor:pointer;">Close</button>';
          document.body.appendChild(detail);
        });
      })(r.aiProbability, r.method, r.wordCount);

      if (target.firstChild) {
        target.insertBefore(badge, target.firstChild);
      } else {
        target.appendChild(badge);
      }
    });
  }

  function clearHighlights() {
    var badges = document.querySelectorAll('.ai-detector-badge');
    for (var i = 0; i < badges.length; i++) {
      badges[i].remove();
    }
    var outlined = document.querySelectorAll('p');
    for (var j = 0; j < outlined.length; j++) {
      var el = outlined[j];
      if (el.style.outline && el.style.outline.indexOf('rgba') !== -1) {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }
    }
  }
})();