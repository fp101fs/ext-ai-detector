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
  var verdictText = document.getElementById('verdictText');
  var paraResults = document.getElementById('paragraphResults');
  var summaryDiv = document.getElementById('summary');
  var modelSelect = document.getElementById('detectionModel');
  var modelSection = document.getElementById('modelSection');
  var statBurstiness = document.getElementById('statBurstiness');
  var statPerplexity = document.getElementById('statPerplexity');
  var statVocab = document.getElementById('statVocab');

  var activeTabId = null;
  var currentPageData = null;
  var scanRowElements = {};
  var scanResultsList = [];
  var scanGeneration = 0;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resetScanControls(message) {
    if (message) loadingDiv.textContent = message;
    loadingDiv.classList.remove('hidden');
    scanBtn.disabled = false;
    scanBtn.textContent = '⚡ Scan Active Page';
    stopBtn.classList.add('hidden');
    stopBtn.disabled = false;
  }

  function updateParagraphRow(r) {
    var item = scanRowElements[r.index];
    if (!item) return;
    item.className = 'para-item ' + (r.aiProbability >= 0.5 ? 'ai' : 'human');
    item.querySelector('.para-score').textContent = Math.round(r.aiProbability * 100) + '%';
    var preview = (r.text || '').substring(0, 120);
    if (r.text && r.text.length > 120) preview += '...';
    item.querySelector('.para-text').textContent = preview;
  }

  function updateOverallScore(overallScore) {
    resultsDiv.classList.remove('hidden');
    var pct = Math.round(overallScore * 100);
    scoreCircle.textContent = pct + '%';
    scoreCircle.className = 'score-circle';
    if (pct < 35) {
      scoreCircle.classList.add('low');
      if (verdictText) verdictText.textContent = 'Likely Human-Written';
    } else if (pct < 65) {
      scoreCircle.classList.add('medium');
      if (verdictText) verdictText.textContent = 'Mixed AI & Human';
    } else {
      scoreCircle.classList.add('high');
      if (verdictText) verdictText.textContent = 'Likely AI-Generated';
    }
  }

  function recalcOverallScore() {
    var scores = [];
    var burstinessScores = [];
    var perplexityScores = [];
    var vocabScores = [];

    for (var i = 0; i < scanResultsList.length; i++) {
      var item = scanResultsList[i];
      scores.push(item.aiProbability);
      if (item.burstinessScore != null) burstinessScores.push(item.burstinessScore);
      if (item.perplexityScore != null) perplexityScores.push(item.perplexityScore);
      if (item.vocabularyScore != null) vocabScores.push(item.vocabularyScore);
    }

    if (scores.length) {
      var avg = scores.reduce(function (sum, s) { return sum + s; }, 0) / scores.length;
      updateOverallScore(avg);

      if (burstinessScores.length && statBurstiness) {
        var avgBurst = Math.round(burstinessScores.reduce(function (a, b) { return a + b; }, 0) / burstinessScores.length);
        statBurstiness.textContent = avgBurst + ' / 100';
      }
      if (perplexityScores.length && statPerplexity) {
        var avgPerp = Math.round(perplexityScores.reduce(function (a, b) { return a + b; }, 0) / perplexityScores.length);
        statPerplexity.textContent = avgPerp + ' / 100';
      }
      if (vocabScores.length && statVocab) {
        var avgVocab = Math.round(vocabScores.reduce(function (a, b) { return a + b; }, 0) / vocabScores.length);
        statVocab.textContent = avgVocab + '%';
      }
    }
  }

  function updateSummary(results, pageData) {
    if (!pageData) return;
    var aiCount = results.filter(function (r) { return r.aiProbability >= 0.5; }).length;
    var humanCount = results.filter(function (r) { return r.aiProbability < 0.5; }).length;
    var methods = {};
    results.forEach(function (r) { methods[r.method || 'hybrid'] = true; });
    var methodKeys = Object.keys(methods);

    summaryDiv.innerHTML = '<strong>Scan Summary</strong><br>' +
      'Paragraphs Scanned: ' + results.length + ' (' + aiCount + ' AI-like | ' + humanCount + ' Human-like)<br>' +
      'Engine: ' + methodKeys.join(', ') + '<br>' +
      'Page: ' + escapeHtml(pageData.title);
  }

  function initializeParagraphRows(paragraphs) {
    paraResults.innerHTML = '';
    scanRowElements = {};
    scanResultsList = [];
    paragraphs.forEach(function (paragraph) {
      var item = document.createElement('div');
      item.className = 'para-item pending';
      item.dataset.paragraphIndex = paragraph.index;
      item.innerHTML = '<span class="para-score">—</span>' +
        '<span class="para-text">' + escapeHtml((paragraph.text || '').substring(0, 120)) + '</span>';
      paraResults.appendChild(item);
      scanRowElements[paragraph.index] = item;
    });
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg.action === 'scanComplete') {
      if (msg.error) {
        if (msg.cancelled) {
          loadingDiv.classList.add('hidden');
          scanBtn.disabled = false;
          scanBtn.textContent = '⚡ Scan Active Page';
          stopBtn.classList.add('hidden');
          stopBtn.disabled = false;
        } else {
          resetScanControls('Error: ' + msg.error);
        }
        return;
      }
      var finalResults = Array.isArray(msg.results) ? msg.results : [];
      scanResultsList = finalResults;
      for (var i = 0; i < finalResults.length; i++) {
        updateParagraphRow(finalResults[i]);
      }
      recalcOverallScore();
      updateSummary(finalResults, currentPageData);
      scanBtn.disabled = false;
      scanBtn.textContent = '⚡ Scan Active Page';
      stopBtn.classList.add('hidden');
      stopBtn.disabled = false;
      loadingDiv.classList.add('hidden');
      return;
    }

    if (msg.action !== 'scanProgress') return;
    if (msg.generation !== scanGeneration) return;

    loadingDiv.textContent = 'Scanning paragraph ' + msg.completed + ' of ' + msg.total + '...';
    if (!msg.result) return;

    scanResultsList.push(msg.result);
    updateParagraphRow(msg.result);
    recalcOverallScore();

    if (currentPageData) {
      resultsDiv.classList.remove('hidden');
    }

    if (activeTabId !== null) {
      chrome.tabs.sendMessage(activeTabId, { action: 'highlight', results: [msg.result] });
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    chrome.storage.local.get(['apiKey', 'detectionMode', 'detectionModel', 'minWords', 'maxParagraphs'], function (items) {
      if (items.apiKey) apiKeyInput.value = items.apiKey;
      if (items.detectionMode) {
        var radio = document.querySelector('input[name="mode"][value="' + items.detectionMode + '"]');
        if (radio) radio.checked = true;
        if (items.detectionMode === 'heuristic') {
          modelSection.classList.add('hidden');
        }
      }
      if (items.detectionModel && modelSelect) {
        modelSelect.value = items.detectionModel;
      }
      if (items.minWords) document.getElementById('minWords').value = items.minWords;
      if (items.maxParagraphs) document.getElementById('maxParagraphs').value = items.maxParagraphs;
    });

    document.querySelectorAll('input[name="mode"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (this.value === 'heuristic') {
          modelSection.classList.add('hidden');
        } else {
          modelSection.classList.remove('hidden');
        }
      });
    });

    saveKeyBtn.addEventListener('click', function () {
      var key = apiKeyInput.value.trim();
      var mode = document.querySelector('input[name="mode"]:checked').value;
      var model = modelSelect ? modelSelect.value : 'openai/gpt-4o-mini';
      var minWords = parseInt(document.getElementById('minWords').value, 10) || 15;
      var maxParagraphs = parseInt(document.getElementById('maxParagraphs').value, 10) || 50;

      chrome.runtime.sendMessage({
        action: 'saveKey',
        apiKey: key,
        mode: mode,
        model: model,
        minWords: minWords,
        maxParagraphs: maxParagraphs
      }, function (res) {
        if (res && res.ok) {
          keyStatus.textContent = '✓ Saved';
          setTimeout(function () { keyStatus.textContent = ''; }, 2000);
        }
      });
    });

    scanBtn.addEventListener('click', function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || !tabs.length) return;
        var tab = tabs[0];
        activeTabId = tab.id;
        currentPageData = { url: tab.url, title: tab.title };

        var minWords = parseInt(document.getElementById('minWords').value, 10) || 15;
        var maxParagraphs = parseInt(document.getElementById('maxParagraphs').value, 10) || 50;
        var mode = document.querySelector('input[name="mode"]:checked').value;
        var model = modelSelect ? modelSelect.value : 'openai/gpt-4o-mini';

        scanGeneration++;
        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning...';
        stopBtn.classList.remove('hidden');
        loadingDiv.textContent = 'Extracting paragraphs from page...';
        loadingDiv.classList.remove('hidden');
        resultsDiv.classList.add('hidden');

        chrome.tabs.sendMessage(tab.id, {
          action: 'extractParagraphs',
          minWords: minWords,
          maxParagraphs: maxParagraphs
        }, function (response) {
          if (chrome.runtime.lastError || !response || !response.paragraphs) {
            // Script may need to be injected
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            }, function () {
              chrome.tabs.sendMessage(tab.id, {
                action: 'extractParagraphs',
                minWords: minWords,
                maxParagraphs: maxParagraphs
              }, function (retryResponse) {
                if (!retryResponse || !retryResponse.paragraphs) {
                  resetScanControls('Could not extract text from this page.');
                  return;
                }
                startParagraphScan(retryResponse.paragraphs, mode, model);
              });
            });
            return;
          }
          startParagraphScan(response.paragraphs, mode, model);
        });
      });
    });

    stopBtn.addEventListener('click', function () {
      chrome.runtime.sendMessage({ action: 'cancelScan' }, function () {
        loadingDiv.textContent = 'Scan stopped.';
        stopBtn.classList.add('hidden');
        scanBtn.disabled = false;
        scanBtn.textContent = '⚡ Scan Active Page';
      });
    });
  });

  function startParagraphScan(paragraphs, mode, model) {
    if (!paragraphs.length) {
      resetScanControls('No text paragraphs found on page.');
      return;
    }
    initializeParagraphRows(paragraphs);
    resultsDiv.classList.remove('hidden');
    loadingDiv.textContent = 'Starting detection on ' + paragraphs.length + ' paragraphs...';

    chrome.runtime.sendMessage({
      action: 'detectParagraphs',
      paragraphs: paragraphs,
      mode: mode,
      model: model,
      generation: scanGeneration
    });
  }
})();