// background.js — Service worker that handles API calls and orchestration
'use strict';

let apiKey = '';
let detectionMode = 'openrouter';

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(['apiKey', 'detectionMode', 'minWords', 'maxParagraphs'], function (items) {
    apiKey = items.apiKey || '';
    detectionMode = items.detectionMode || 'openrouter';
  });
});

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
    chrome.storage.local.get(['apiKey', 'detectionMode', 'minWords', 'maxParagraphs'], function (items) {
      sendResponse(items);
    });
    return true;
  }

  if (msg.action === 'detectParagraphs') {
    const paragraphs = msg.paragraphs;
    const mode = msg.mode || detectionMode;
    detectParagraphs(paragraphs, mode).then(function (results) {
      sendResponse(results);
    }).catch(function (err) {
      sendResponse({ error: err.message });
    });
    return true;
  }
});

async function detectParagraphs(paragraphs, mode) {
  const results = [];

  for (const para of paragraphs) {
    let aiProb = null;
    let method = 'heuristic';

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
      const heuristic = heuristicScore(para.text);
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

async function callOpenRouter(text) {
  const truncated = text.substring(0, 1000);
  const escaped = truncated.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://chrome-ai-detector.local',
      'X-Title': 'AI Detector Extension'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
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

  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  try {
    const parsed = JSON.parse(content);
    return Math.max(0, Math.min(1, parsed.ai_probability));
  } catch (e) {
    const match = content.match(/ai_probability["\s:]+(\d+\.?\d*)/);
    if (match) {
      return Math.max(0, Math.min(1, parseFloat(match[1])));
    }
    throw new Error('Could not parse OpenRouter response');
  }
}

function heuristicScore(text) {
  const sentences = text.split(/[.!?]+/).filter(function (s) { return s.trim().length > 3; });
  if (sentences.length < 2) return 0.3;

  // 1. Sentence length variance
  const lengths = sentences.map(function (s) { return s.trim().split(/\s+/).length; });
  const avgLen = lengths.reduce(function (a, b) { return a + b; }, 0) / lengths.length;
  const variance = lengths.reduce(function (sum, l) { return sum + Math.pow(l - avgLen, 2); }, 0) / lengths.length;
  const cv = Math.sqrt(variance) / (avgLen || 1);
  const uniformityScore = Math.max(0, 1 - (cv / 0.8));

  // 2. Vocabulary richness (type-token ratio)
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  const uniqueWords = new Set(words);
  const ttr = words.length > 0 ? uniqueWords.size / words.length : 0;
  const richnessScore = Math.max(0, 1 - (ttr / 0.5));

  // 3. Common AI phrases
  const aiPhrases = [
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
  const textLower = text.toLowerCase();
  let aiPhraseCount = 0;
  aiPhrases.forEach(function (phrase) {
    if (textLower.indexOf(phrase) !== -1) aiPhraseCount++;
  });
  const phraseScore = Math.min(1, aiPhraseCount / 5);

  // 4. Repetition of sentence starters
  const starters = sentences.map(function (s) {
    return s.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
  });
  const starterCounts = {};
  starters.forEach(function (s) { starterCounts[s] = (starterCounts[s] || 0) + 1; });
  const maxStarterRep = Math.max.apply(null, Object.values(starterCounts));
  const repetitionScore = Math.min(1, (maxStarterRep - 1) / 3);

  // 5. Hedging / qualifier density
  const hedges = ['may', 'might', 'could', 'potentially', 'possibly', 'seems', 'appears', 'likely', 'tends to'];
  let hedgeCount = 0;
  hedges.forEach(function (h) {
    const regex = new RegExp('\\b' + h + '\\b', 'g');
    const matches = textLower.match(regex);
    if (matches) hedgeCount += matches.length;
  });
  const hedgeScore = Math.min(1, hedgeCount / sentences.length);

  const score = (
    uniformityScore * 0.25 +
    richnessScore * 0.20 +
    phraseScore * 0.25 +
    repetitionScore * 0.15 +
    hedgeScore * 0.15
  );

  return Math.max(0, Math.min(1, score));
}