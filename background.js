// background.js — Service worker that handles API calls and orchestration
'use strict';

// ─── Configuration ────────────────────────────────────────────────────────────
// Change this to your deployed Vercel URL (e.g. https://ai-scan.vercel.app)
var BACKEND_URL = 'http://localhost:3000';

var apiKey = '';
var detectionMode = 'openrouter';
var authToken = '';
var authUser = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(
    ['apiKey', 'detectionMode', 'minWords', 'maxParagraphs', 'authToken', 'authUser', 'backendUrl'],
    function (items) {
      apiKey = items.apiKey || '';
      detectionMode = items.detectionMode || 'openrouter';
      authToken = items.authToken || '';
      authUser = items.authUser || null;
      if (items.backendUrl) BACKEND_URL = items.backendUrl;
    }
  );
});

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.action === 'saveKey') {
    apiKey = msg.apiKey;
    detectionMode = msg.mode;
    chrome.storage.local.set({
      apiKey: msg.apiKey,
      detectionMode: msg.mode,
      minWords: msg.minWords,
      maxParagraphs: msg.maxParagraphs
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'getSettings') {
    chrome.storage.local.get(
      ['apiKey', 'detectionMode', 'minWords', 'maxParagraphs', 'authToken', 'authUser', 'backendUrl'],
      function (items) {
        sendResponse(items);
      }
    );
    return true;
  }

  if (msg.action === 'signIn') {
    signInWithGoogle().then(function (result) {
      sendResponse(result);
    }).catch(function (err) {
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (msg.action === 'signOut') {
    authToken = '';
    authUser = null;
    chrome.storage.local.remove(['authToken', 'authUser']);
    // Also revoke the Chrome identity token cache
    chrome.identity.getAuthToken({ interactive: false }, function (token) {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token: token });
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'detectParagraphs') {
    var paragraphs = msg.paragraphs;
    var mode = msg.mode || detectionMode;
    detectParagraphs(paragraphs, mode).then(function (results) {
      sendResponse(results);
    }).catch(function (err) {
      sendResponse({ error: err.message });
    });
    return true;
  }
});

// ─── Web OAuth Sign-In via launchWebAuthFlow ─────────────────────────────────

async function signInWithGoogle() {
  return new Promise(function (resolve, reject) {
    var redirectUrl = chrome.identity.getRedirectURL();
    var authUrl = BACKEND_URL + '/api/auth/signin?callbackUrl=' + encodeURIComponent(BACKEND_URL + '/dashboard');

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async function (responseUrl) {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(new Error(chrome.runtime.lastError?.message || 'Web sign-in closed or failed'));
          return;
        }

        try {
          var res = await fetch(BACKEND_URL + '/api/status', {
            headers: { 'Content-Type': 'application/json' }
          });
          var data = await res.json().catch(function () { return {}; });

          authToken = 'web-session';
          authUser = { name: 'Signed-in User' };

          chrome.storage.local.set({
            authToken: authToken,
            authUser: authUser
          });

          resolve({ ok: true, user: authUser });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

// ─── Detection orchestration ──────────────────────────────────────────────────

async function detectParagraphs(paragraphs, mode) {
  // Try backend first (server-side OpenRouter key, no user key needed)
  if (authToken && (mode === 'openrouter' || mode === 'hybrid')) {
    try {
      return await detectViaBackend(paragraphs, mode);
    } catch (e) {
      console.warn('Backend detection failed, falling back to direct:', e.message);
    }
  }

  // Fall back to direct OpenRouter (user needs their own key)
  return await detectDirect(paragraphs, mode);
}

async function detectViaBackend(paragraphs, mode) {
  var res = await fetch(BACKEND_URL + '/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + authToken
    },
    body: JSON.stringify({ paragraphs: paragraphs, mode: mode })
  });

  if (!res.ok) {
    var errData = await res.json().catch(function () { return {}; });
    throw new Error(errData.error || 'Backend scan failed (' + res.status + ')');
  }

  return await res.json();
}

async function detectDirect(paragraphs, mode) {
  var results = [];

  for (var i = 0; i < paragraphs.length; i++) {
    var para = paragraphs[i];
    var aiProb = null;
    var method = 'heuristic';

    if ((mode === 'openrouter' || mode === 'hybrid') && apiKey) {
      try {
        aiProb = await callOpenRouter(para.text);
        method = 'openrouter';
      } catch (e) {
        console.warn('OpenRouter detection failed:', e.message);
      }
    }

    if (aiProb === null) {
      aiProb = heuristicScore(para.text);
      method = 'heuristic';
    }

    if (mode === 'hybrid') {
      var heuristic = heuristicScore(para.text);
      aiProb = aiProb * 0.7 + heuristic * 0.3;
      method = 'hybrid';
    }

    results.push({
      index: para.index,
      text: para.text,
      wordCount: para.wordCount,
      aiProbability: aiProb,
      method: method
    });
  }

  return results;
}

// ─── Direct OpenRouter call (fallback when not signed in) ─────────────────────

async function callOpenRouter(text) {
  var truncated = text.substring(0, 1000);
  var escaped = truncated.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

  var response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://chrome-ai-detector.local',
      'X-Title': 'AI Detector Extension'
    },
    body: JSON.stringify({
      model: 'openai/gpt-5.6-luna',
      messages: [
        {
          role: 'system',
          content: 'You are an AI text detector. Analyze the provided text and return ONLY a JSON object with a single field "ai_probability" (a number between 0 and 1). No other text.'
        },
        {
          role: 'user',
          content: 'Text: "' + escaped + '"\n\nReturn JSON: {"ai_probability": <number>}'
        }
      ],
      temperature: 0.0,
      max_tokens: 50
    })
  });

  if (!response.ok) {
    throw new Error('OpenRouter API returned ' + response.status);
  }

  var data = await response.json();
  var content = data.choices[0].message.content.trim();

  try {
    var parsed = JSON.parse(content);
    return Math.max(0, Math.min(1, parsed.ai_probability));
  } catch (e) {
    var match = content.match(/ai_probability["\\s:]+(\\d+\\.?\\d*)/);
    if (match) {
      return Math.max(0, Math.min(1, parseFloat(match[1])));
    }
    throw new Error('Could not parse OpenRouter response');
  }
}

// ─── Heuristic scoring (fully offline) ────────────────────────────────────────

function heuristicScore(text) {
  var sentences = text.split(/[.!?]+/).filter(function (s) { return s.trim().length > 3; });
  if (sentences.length < 2) return 0.3;

  // 1. Sentence length variance
  var lengths = sentences.map(function (s) { return s.trim().split(/\s+/).length; });
  var avgLen = lengths.reduce(function (a, b) { return a + b; }, 0) / lengths.length;
  var variance = lengths.reduce(function (sum, l) { return sum + Math.pow(l - avgLen, 2); }, 0) / lengths.length;
  var cv = Math.sqrt(variance) / (avgLen || 1);
  var uniformityScore = Math.max(0, 1 - (cv / 0.8));

  // 2. Vocabulary richness (type-token ratio)
  var words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  var uniqueWords = new Set(words);
  var ttr = words.length > 0 ? uniqueWords.size / words.length : 0;
  var richnessScore = Math.max(0, 1 - (ttr / 0.5));

  // 3. Common AI phrases
  var aiPhrases = [
    'in conclusion', 'furthermore', 'moreover', 'it is important to note',
    'additionally', 'in summary', 'delve into', 'tapestry', 'landscape',
    'crucial', 'pivotal', 'testament', 'seamless', 'foster', 'nuanced',
    'broader', 'multifaceted', 'serves as a', 'plays a crucial role',
    'it is worth noting', 'it is important to recognize', "in today's world",
    'in the modern era', 'a testament to', 'serves as', 'plays a',
    'demonstrates a', 'exhibits a', 'represents a', 'signals a',
    'it is clear that', 'it is evident that', 'it should be noted',
    'one must consider', 'a closer look', 'at first glance',
    'by examining', 'when we look', 'it is undeniable', 'undeniably',
    'certainly', 'indeed', 'notably', 'particularly', 'essentially',
    'fundamentally', 'significantly', 'remarkably', 'interestingly',
    'it is worth mentioning', 'it is worth highlighting', 'needless to say',
    'without a doubt', 'in essence', 'in other words', 'to put it differently'
  ];
  var textLower = text.toLowerCase();
  var aiPhraseCount = 0;
  aiPhrases.forEach(function (phrase) {
    if (textLower.indexOf(phrase) !== -1) aiPhraseCount++;
  });
  var phraseScore = Math.min(1, aiPhraseCount / 5);

  // 4. Repetition of sentence starters
  var starters = sentences.map(function (s) {
    return s.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
  });
  var starterCounts = {};
  starters.forEach(function (s) { starterCounts[s] = (starterCounts[s] || 0) + 1; });
  var maxStarterRep = Math.max.apply(null, Object.values(starterCounts));
  var repetitionScore = Math.min(1, (maxStarterRep - 1) / 3);

  // 5. Hedging / qualifier density
  var hedges = ['may', 'might', 'could', 'potentially', 'possibly', 'seems', 'appears', 'likely', 'tends to'];
  var hedgeCount = 0;
  hedges.forEach(function (h) {
    var regex = new RegExp('\\b' + h + '\\b', 'g');
    var matches = textLower.match(regex);
    if (matches) hedgeCount += matches.length;
  });
  var hedgeScore = Math.min(1, hedgeCount / sentences.length);

  var score = (
    uniformityScore * 0.25 +
    richnessScore * 0.20 +
    phraseScore * 0.25 +
    repetitionScore * 0.15 +
    hedgeScore * 0.15
  );

  return Math.max(0, Math.min(1, score));
}