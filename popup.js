// popup.js — UI logic for the extension popup
(function () {
  'use strict';

  var apiKeyInput = document.getElementById('apiKey');
  var saveKeyBtn = document.getElementById('saveKey');
  var keyStatus = document.getElementById('keyStatus');
  var scanBtn = document.getElementById('scanBtn');
  var stopBtn = document.getElementById('stopBtn');
  var resultsDiv = document.getElementById('results');
  var loadingDiv = document.getElementById('loading');
  var scoreCircle = document.getElementById('scoreCircle');
  var scoreLabel = document.getElementById('scoreLabel');
  var paraResults = document.getElementById('paragraphResults');
  var summaryDiv = document.getElementById('summary');
  var activeTabId = null;
  var currentPageData = null;
  var progressiveResults = [];

  function resetScanControls(message) {
    if (message) loadingDiv.textContent = message;
    loadingDiv.classList.remove('hidden');
    scanBtn.disabled = false;
    scanBtn.textContent = 'Scan This Page';
    stopBtn.classList.add('hidden');
    stopBtn.disabled = false;
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.action === 'scanComplete') {
      if (msg.error) {
        resetScanControls(msg.cancelled ? 'Scan stopped.' : 'Error: ' + msg.error);
        return;
      }
      var finalResults = Array.isArray(msg.results) ? msg.results : [];
      progressiveResults = finalResults.slice();
      renderAllResults();
      updateSummary(finalResults, currentPageData);
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan This Page';
      stopBtn.classList.add('hidden');
      stopBtn.disabled = false;
      loadingDiv.classList.add('hidden');
      return;
    }

    if (msg.action !== 'scanProgress') return;
    loadingDiv.textContent = 'Scanning paragraph ' + msg.completed + ' of ' + msg.total;
    if (!msg.result) return;

    var existingIndex = progressiveResults.findIndex(function (result) {
      return result.index === msg.result.index;
    });
    if (existingIndex === -1) {
      progressiveResults.push(msg.result);
    } else {
      progressiveResults[existingIndex] = msg.result;
    }

    updateParagraphResult(msg.result);

    if (currentPageData) {
      resultsDiv.classList.remove('hidden');
      var scores = progressiveResults.map(function (result) { return result.aiProbability; });
      var overallScore = scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length;
      updateOverallScore(overallScore);
    }

    if (activeTabId !== null) {
      chrome.tabs.sendMessage(activeTabId, { action: 'highlight', results: [msg.result] });
    }
  });

  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName !== 'local' || !changes.scanState) return;
    var state = changes.scanState.newValue;
    if (!state || !Array.isArray(state.results) || !state.results.length) return;
    progressiveResults = state.results.slice();
    state.results.forEach(updateParagraphResult);
    var scores = state.results.map(function (result) { return result.aiProbability; });
    if (scores.length) {
      updateOverallScore(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length);
    }
    resultsDiv.classList.remove('hidden');
  });

  document.addEventListener('DOMContentLoaded', function () {
    chrome.storage.local.get(['apiKey', 'detectionMode', 'minWords', 'maxParagraphs'], function (items) {
      if (items.apiKey) apiKeyInput.value = items.apiKey;
      if (items.detectionMode) {
        var radio = document.querySelector('input[name="mode"][value="' + items.detectionMode + '"]');
        if (radio) radio.checked = true;
      }
      if (items.minWords) document.getElementById('minWords').value = items.minWords;
      if (items.maxParagraphs) document.getElementById('maxParagraphs').value = items.maxParagraphs;
    });
  });

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

  scanBtn.addEventListener('click', function () {
    resultsDiv.classList.add('hidden');
    loadingDiv.classList.remove('hidden');
    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning page';
    stopBtn.classList.remove('hidden');
    stopBtn.disabled = false;
    currentPageData = null;
    progressiveResults = [];
    paraResults.innerHTML = '';

    var mode = document.querySelector('input[name="mode"]:checked').value;
    var minWords = parseInt(document.getElementById('minWords').value) || 20;
    var maxParagraphs = parseInt(document.getElementById('maxParagraphs').value) || 50;

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs.length) {
        resetScanControls('No active tab found.');
        return;
      }
      activeTabId = tabs[0].id;

      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: scanParagraphs,
        args: [{ minWords: minWords, maxParagraphs: maxParagraphs }]
      }, function (results) {
        if (chrome.runtime.lastError || !results || !results.length || !results[0].result) {
          resetScanControls('Error scanning page. Try refreshing the tab.');
          return;
        }

        var pageData = results[0].result;
        currentPageData = pageData;
        if (!pageData.paragraphs || !pageData.paragraphs.length) {
          resetScanControls('No qualifying paragraphs found (need ' + minWords + '+ words per paragraph).');
          return;
        }
        initializeParagraphResults(pageData.paragraphs);
        chrome.storage.local.get('scanState', function (items) {
          var state = items.scanState;
          if (!state || !Array.isArray(state.results) || !state.results.length) return;
          progressiveResults = state.results.slice();
          state.results.forEach(updateParagraphResult);
          var scores = progressiveResults.map(function (result) { return result.aiProbability; });
          if (scores.length) {
            updateOverallScore(scores.reduce(function (sum, score) { return sum + score; }, 0) / scores.length);
          }
          resultsDiv.classList.remove('hidden');
        });

        chrome.runtime.sendMessage({
          action: 'detectParagraphs',
          paragraphs: pageData.paragraphs,
          mode: mode
        }, function (detectionResults) {
          if (chrome.runtime.lastError || !detectionResults || !detectionResults.started) {
            resetScanControls('Detection error: ' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Could not start scanner.'));
            return;
          }
        });
      });
    });
  });

  stopBtn.addEventListener('click', function () {
    stopBtn.disabled = true;
    loadingDiv.textContent = 'Stopping scan…';
    chrome.runtime.sendMessage({ action: 'cancelScan' }, function () {
      resetScanControls('Scan stopped.');
    });
  });

  function updateOverallScore(overallScore) {
    resultsDiv.classList.remove('hidden');

    var pct = Math.round(overallScore * 100);
    scoreCircle.textContent = pct + '%';
    scoreCircle.className = 'score-circle';
    if (pct < 30) scoreCircle.classList.add('low');
    else if (pct < 60) scoreCircle.classList.add('medium');
    else scoreCircle.classList.add('high');

    scoreLabel.textContent = 'AI Probability';
  }

  function updateParagraphResult(r) {
    var item = paraResults.querySelector('[data-paragraph-index="' + r.index + '"]');
    if (!item) {
      item = document.createElement('div');
      item.dataset.paragraphIndex = r.index;
      item.className = 'para-item';
      item.innerHTML = '<span class="para-score"></span><span class="para-text"></span>';

      var next = Array.from(paraResults.children).find(function (child) {
        return Number(child.dataset.paragraphIndex) > Number(r.index);
      });
      paraResults.insertBefore(item, next || null);
    }

    item.className = 'para-item ' + (r.aiProbability >= 0.5 ? 'ai' : 'human');
    item.querySelector('.para-score').textContent = Math.round(r.aiProbability * 100) + '%';
    var preview = (r.text || '').substring(0, 120);
    if (r.text && r.text.length > 120) preview += '...';
    item.querySelector('.para-text').textContent = preview;
  }

  function renderAllResults() {
    paraResults.innerHTML = '';
    var sorted = progressiveResults.slice().sort(function (a, b) { return a.index - b.index; });
    sorted.forEach(updateParagraphResult);
  }

  function updateSummary(results, pageData) {
    if (!pageData) return;
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

  function initializeParagraphResults(paragraphs) {
    paraResults.innerHTML = '';
    paragraphs.forEach(function (paragraph) {
      var item = document.createElement('div');
      item.className = 'para-item pending';
      item.dataset.paragraphIndex = paragraph.index;
      item.innerHTML = '<span class="para-score">—</span>' +
        '<span class="para-text">' + escapeHtml((paragraph.text || '').substring(0, 120)) + '</span>';
      paraResults.appendChild(item);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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

    var toScan = qualified.slice(0, maxParagraphs);

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