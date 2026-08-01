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
    // Only clear badges and detail cards, not outlines.
    // Outlines are cleared once at the start of a new scan.
    var badges = document.querySelectorAll('.ai-detector-badge');
    for (var i = 0; i < badges.length; i++) {
      badges[i].remove();
    }
    var detailCards = document.querySelectorAll('.ai-detector-detail');
    for (var j = 0; j < detailCards.length; j++) {
      detailCards[j].remove();
    }

    results.forEach(function (r) {
      var allPs = document.querySelectorAll('p');
      var target = null;
      var targetText = (r.text || '').trim();

      for (var i = 0; i < allPs.length; i++) {
        var pText = allPs[i].textContent.trim();
        if (pText.length > 0 && targetText.length > 0) {
          if (pText.indexOf(targetText.substring(0, Math.min(50, targetText.length))) !== -1 ||
              targetText.indexOf(pText.substring(0, Math.min(50, pText.length))) !== -1) {
            target = allPs[i];
            break;
          }
        }
      }

      if (!target) return;

      // Add outline with smooth transition
      target.style.outline = r.aiProbability >= 0.5
        ? '2px solid rgba(239, 68, 68, 0.6)'
        : '2px solid rgba(16, 185, 129, 0.5)';
      target.style.outlineOffset = '3px';
      target.style.transition = 'outline 0.3s ease';

      // Add badge
      var badge = document.createElement('span');
      badge.className = 'ai-detector-badge';
      badge.textContent = Math.round(r.aiProbability * 100) + '%';
      badge.style.cssText =
        'display:inline-block;font-size:10px;font-weight:600;padding:2px 7px;' +
        'border-radius:9999px;margin-left:6px;' +
        'background:' + (r.aiProbability >= 0.5 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)') + ';' +
        'color:' + (r.aiProbability >= 0.5 ? '#ef4444' : '#10b981') + ';' +
        'cursor:pointer;vertical-align:middle;transition:background 0.15s ease;';
      badge.title = 'AI probability: ' + Math.round(r.aiProbability * 100) + '% (' + (r.method || 'unknown') + ')';

      // Hover effect on badge
      badge.addEventListener('mouseenter', function () {
        badge.style.background = r.aiProbability >= 0.5 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.25)';
      });
      badge.addEventListener('mouseleave', function () {
        badge.style.background = r.aiProbability >= 0.5 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)';
      });

      // Click to show detail card
      (function (prob, m, wc) {
        badge.addEventListener('click', function () {
          var existing = document.querySelector('.ai-detector-detail');
          if (existing) existing.remove();

          var detail = document.createElement('div');
          detail.className = 'ai-detector-detail';
          detail.style.cssText =
            'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
            'background:#1a1a2e;color:#e2e2f0;padding:20px;border-radius:12px;z-index:99999;' +
            'max-width:420px;font-size:13px;border:1px solid rgba(255,255,255,0.1);' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.6);line-height:1.6;';
          detail.innerHTML =
            '<strong style="font-size:15px;color:#fff;">AI Detection Detail</strong>' +
            '<div style="margin-top:12px;">' +
            '<span style="color:#8b8ba8;">Probability:</span> ' +
            '<strong style="color:' + (prob >= 0.5 ? '#ef4444' : '#10b981') + ';">' + Math.round(prob * 100) + '%</strong><br>' +
            '<span style="color:#8b8ba8;">Method:</span> ' + (m || 'unknown') + '<br>' +
            '<span style="color:#8b8ba8;">Word count:</span> ' + wc +
            '</div>' +
            '<button style="margin-top:16px;padding:8px 16px;background:#7c3aed;color:white;border:none;' +
            'border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:opacity 0.15s ease;"' +
            'onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1"' +
            '>Close</button>';
          detail.querySelector('button').addEventListener('click', function () { detail.remove(); });
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
    var detailCards = document.querySelectorAll('.ai-detector-detail');
    for (var j = 0; j < detailCards.length; j++) {
      detailCards[j].remove();
    }
    var outlined = document.querySelectorAll('p');
    for (var k = 0; k < outlined.length; k++) {
      var el = outlined[k];
      if (el.style.outline && el.style.outline.indexOf('rgba') !== -1) {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }
    }
  }
})();