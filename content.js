// content.js — Injected into pages for paragraph extraction and highlighting detected AI paragraphs
(function () {
  'use strict';

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'extractParagraphs') {
      var minWords = msg.minWords || 15;
      var maxParagraphs = msg.maxParagraphs || 50;
      var extracted = extractPageParagraphs(minWords, maxParagraphs);
      sendResponse({ ok: true, paragraphs: extracted });
      return false;
    }
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

  function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).filter(Boolean).length;
  }

  function extractPageParagraphs(minWords, maxParagraphs) {
    var pElements = Array.from(document.querySelectorAll('p, article p, main p, div[class*="content"] p'));
    var seen = new Set();
    var results = [];

    for (var i = 0; i < pElements.length; i++) {
      var el = pElements[i];
      // Skip hidden or non-visible elements
      if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      
      var rawText = el.textContent ? el.textContent.trim() : '';
      var words = countWords(rawText);

      if (words >= minWords && !seen.has(rawText)) {
        seen.add(rawText);
        results.push({
          index: results.length,
          text: rawText,
          wordCount: words,
        });

        if (results.length >= maxParagraphs) break;
      }
    }

    // Fallback: If no standard <p> elements are found, extract block text from main/article
    if (results.length === 0) {
      var mainBody = document.querySelector('main') || document.querySelector('article') || document.body;
      if (mainBody) {
        var blocks = (mainBody.innerText || '').split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
        for (var b = 0; b < blocks.length; b++) {
          var bWords = countWords(blocks[b]);
          if (bWords >= minWords && !seen.has(blocks[b])) {
            seen.add(blocks[b]);
            results.push({
              index: results.length,
              text: blocks[b],
              wordCount: bWords,
            });
            if (results.length >= maxParagraphs) break;
          }
        }
      }
    }

    return results;
  }

  function highlightResults(results) {
    var badges = document.querySelectorAll('.ai-detector-badge');
    for (var i = 0; i < badges.length; i++) {
      badges[i].remove();
    }
    var detailCards = document.querySelectorAll('.ai-detector-detail');
    for (var j = 0; j < detailCards.length; j++) {
      detailCards[j].remove();
    }

    results.forEach(function (r) {
      var allPs = document.querySelectorAll('p, article p, main p');
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

      // Add outline with smooth color gradation
      target.style.outline = r.aiProbability >= 0.5
        ? '2px solid rgba(239, 68, 68, 0.7)'
        : '2px solid rgba(34, 197, 94, 0.6)';
      target.style.outlineOffset = '4px';
      target.style.borderRadius = '4px';
      target.style.transition = 'outline 0.3s ease';

      // Add badge
      var badge = document.createElement('span');
      badge.className = 'ai-detector-badge';
      badge.textContent = Math.round(r.aiProbability * 100) + '% AI';
      badge.style.cssText =
        'display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;' +
        'border-radius:9999px;margin-left:8px;' +
        'background:' + (r.aiProbability >= 0.5 ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.15)') + ';' +
        'color:' + (r.aiProbability >= 0.5 ? '#ef4444' : '#22c55e') + ';' +
        'border:1px solid ' + (r.aiProbability >= 0.5 ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)') + ';' +
        'cursor:pointer;vertical-align:middle;transition:all 0.15s ease;';
      badge.title = 'Click to inspect: ' + Math.round(r.aiProbability * 100) + '% AI (' + (r.method || 'hybrid') + ')';

      badge.addEventListener('mouseenter', function () {
        badge.style.transform = 'scale(1.05)';
        badge.style.boxShadow = '0 0 8px ' + (r.aiProbability >= 0.5 ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)');
      });
      badge.addEventListener('mouseleave', function () {
        badge.style.transform = 'scale(1.0)';
        badge.style.boxShadow = 'none';
      });

      // Click to show rich detail card
      (function (res) {
        badge.addEventListener('click', function () {
          var existing = document.querySelector('.ai-detector-detail');
          if (existing) existing.remove();

          var detail = document.createElement('div');
          detail.className = 'ai-detector-detail';
          detail.style.cssText =
            'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
            'background:#0a0a1a;color:#e2e8f0;padding:24px;border-radius:14px;z-index:999999;' +
            'max-width:440px;font-size:13px;border:1px solid rgba(99,102,241,0.3);' +
            'box-shadow:0 16px 48px rgba(0,0,0,0.7);line-height:1.6;font-family:system-ui,-apple-system,sans-serif;';
          
          detail.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
              '<strong style="font-size:16px;color:#fff;">AI Scan Paragraph Analysis</strong>' +
              '<span style="font-size:11px;padding:2px 8px;border-radius:9999px;background:' + (res.aiProbability >= 0.5 ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)') + ';color:' + (res.aiProbability >= 0.5 ? '#ef4444' : '#22c55e') + ';">' + Math.round(res.aiProbability * 100) + '% AI</span>' +
            '</div>' +
            '<div style="background:rgba(255,255,255,0.05);padding:12px;border-radius:8px;margin-bottom:14px;font-size:12px;color:#94a3b8;">' +
              '<strong>Burstiness Score:</strong> ' + (res.burstinessScore != null ? res.burstinessScore + ' / 100' : 'N/A') + '<br>' +
              '<strong>Perplexity Index:</strong> ' + (res.perplexityScore != null ? res.perplexityScore + ' / 100' : 'N/A') + '<br>' +
              '<strong>Detection Method:</strong> ' + (res.method || 'hybrid') + '<br>' +
              '<strong>Word Count:</strong> ' + res.wordCount + ' words' +
            '</div>' +
            '<p style="font-size:12px;color:#cbd5e1;max-height:120px;overflow-y:auto;font-style:italic;margin-bottom:16px;">"' + res.text + '"</p>' +
            '<button style="width:100%;padding:10px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;' +
            'border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;"' +
            '>Close</button>';

          detail.querySelector('button').addEventListener('click', function () { detail.remove(); });
          document.body.appendChild(detail);
        });
      })(r);

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
    var outlined = document.querySelectorAll('p, article p, main p');
    for (var k = 0; k < outlined.length; k++) {
      var el = outlined[k];
      if (el.style.outline && el.style.outline.indexOf('rgba') !== -1) {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }
    }
  }
})();