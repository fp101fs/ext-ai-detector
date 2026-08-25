// background.js — Service worker that handles API calls, ZeroGPT burstiness, and OpenRouter orchestration
'use strict';

/**
 * Hybrid Statistical Stylometric Engine (GPTZero + ZeroGPT Fused Signals)
 * Matches ai-scan-backend lib/heuristics.ts formulation exactly.
 */

let apiKey = '';
let detectionMode = 'hybrid';
let detectionModel = 'openai/gpt-4o-mini';
let backendUrl = 'https://ai-scan-backend.vercel.app';
let activeScan = null;

const AI_PHRASES = [
  /\bfurthermore\b/gi,
  /\bmoreover\b/gi,
  /\bin conclusion\b/gi,
  /\bto summarize\b/gi,
  /\bin summary\b/gi,
  /\bit is important to note\b/gi,
  /\bit is worth noting\b/gi,
  /\bdelve(?:s|d|ing)? into\b/gi,
  /\btestament to\b/gi,
  /\btapestry\b/gi,
  /\bbustling\b/gi,
  /\bparamount\b/gi,
  /\bseamlessly\b/gi,
  /\bharnessing the power\b/gi,
  /\bin today's rapidly\b/gi,
  /\bplays a crucial role\b/gi,
  /\bplays a pivotal role\b/gi,
  /\bnot only.*but also\b/gi,
  /\bnavigating the complexities\b/gi,
  /\bstands as a\b/gi,
];

const PASSIVE_REGEX = /\b(is|are|was|were|be|been|being)\s+([a-z]+ed|[a-z]+en|built|done|made|seen|written|found|given|taken|known)\b/gi;

const SYSTEM_PROMPT = `You are GPTZero-Sim, an advanced statistical text-analysis engine trained to detect AI-generated content. Your task is to evaluate the provided target text using the core metrics of natural language statistical unpredictability and machine-learning stylometrics.

### ANALYSIS INSTRUCTIONS
Analyze the input text across four specific dimensions:
1. Perplexity (Predictability & Lexical entropy)
2. Burstiness (Sentence & Rhythm Variation)
3. Structural & Syntax Uniformity
4. Synthetic Markers & Transition Densities

CRITICAL: You MUST respond ONLY with valid, unformatted JSON containing exactly one field "ai_probability" with a float value between 0.0 and 1.0. Example: {"ai_probability": 0.85}. Do not include markdown code blocks, explanations, or any other characters.`;

function loadSettings() {
  chrome.storage.local.get(['apiKey', 'detectionMode', 'detectionModel', 'backendUrl'], function (items) {
    apiKey = typeof items.apiKey === 'string' ? items.apiKey : '';
    detectionMode = items.detectionMode || 'hybrid';
    detectionModel = items.detectionModel || 'openai/gpt-4o-mini';
    backendUrl = items.backendUrl || 'https://ai-scan-backend.vercel.app';
  });
}

chrome.runtime.onInstalled.addListener(function () {
  loadSettings();
});

loadSettings();

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.action === 'saveKey') {
    apiKey = msg.apiKey || '';
    detectionMode = msg.mode || 'hybrid';
    detectionModel = msg.model || 'openai/gpt-4o-mini';
    chrome.storage.local.set({
      apiKey: apiKey,
      detectionMode: detectionMode,
      detectionModel: detectionModel,
      minWords: msg.minWords,
      maxParagraphs: msg.maxParagraphs
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'getSettings') {
    chrome.storage.local.get(['apiKey', 'detectionMode', 'detectionModel', 'minWords', 'maxParagraphs', 'backendUrl'], function (items) {
      sendResponse(items);
    });
    return true;
  }

  if (msg.action === 'detectParagraphs') {
    const paragraphs = Array.isArray(msg.paragraphs) ? msg.paragraphs : [];
    const mode = msg.mode || detectionMode;
    const model = msg.model || detectionModel;
    const generation = msg.generation || 0;

    if (activeScan) {
      activeScan.controller.abort();
    }
    const scan = { controller: new AbortController(), generation: generation };
    activeScan = scan;
    chrome.storage.local.set({ scanState: { status: 'scanning', results: [], total: paragraphs.length } });

    detectParagraphs(paragraphs, mode, model, scan.controller.signal, generation).then(function (results) {
      chrome.storage.local.set({ scanState: { status: 'complete', results: results, total: paragraphs.length } });
      chrome.runtime.sendMessage({
        action: 'scanComplete',
        results: results
      });
    }).catch(function (err) {
      chrome.storage.local.set({ scanState: { status: err.name === 'AbortError' ? 'cancelled' : 'error', results: [], total: paragraphs.length, error: err.message } });
      chrome.runtime.sendMessage({
        action: 'scanComplete',
        error: err.message,
        cancelled: err.name === 'AbortError'
      });
    }).finally(function () {
      if (activeScan === scan) activeScan = null;
    });
    sendResponse({ ok: true, started: true });
    return false;
  }

  if (msg.action === 'cancelScan') {
    if (activeScan) {
      activeScan.controller.abort();
      activeScan = null;
      sendResponse({ ok: true, cancelled: true });
    } else {
      sendResponse({ ok: false, cancelled: false });
    }
    return false;
  }
});

/**
 * Executes multi-paragraph detection matching ai-scan-backend exact hybrid logic
 */
async function detectParagraphs(paragraphs, mode, model, signal, generation) {
  const results = [];

  for (const para of paragraphs) {
    if (signal && signal.aborted) {
      const error = new DOMException('Scan cancelled', 'AbortError');
      throw error;
    }

    const text = (para.text || '').trim();
    const heuristicStats = analyzeHeuristics(text);
    let aiProb = heuristicStats.aiProbability;
    let method = 'heuristic';

    if ((mode === 'openrouter' || mode === 'hybrid') && apiKey) {
      try {
        const aiResponse = await callOpenRouter(text, apiKey, model, signal);
        if (mode === 'hybrid') {
          // Weighted average: 65% OpenRouter, 35% ZeroGPT Stylometric Heuristics
          aiProb = Math.round((aiResponse * 0.65 + heuristicStats.aiProbability * 0.35) * 100) / 100;
          method = 'hybrid';
        } else {
          aiProb = aiResponse;
          method = 'openrouter';
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        console.warn('OpenRouter detection failed, using heuristic:', e.message);
        aiProb = heuristicStats.aiProbability;
        method = 'heuristic-fallback';
      }
    }

    const resultItem = {
      index: para.index,
      text: para.text,
      wordCount: heuristicStats.wordCount,
      sentenceCount: heuristicStats.sentenceCount,
      aiProbability: aiProb,
      perplexityScore: heuristicStats.perplexityScore,
      burstinessScore: heuristicStats.burstinessScore,
      vocabularyScore: heuristicStats.vocabularyScore,
      b_sent: heuristicStats.b_sent,
      b_clause: heuristicStats.b_clause,
      aiPhraseCount: heuristicStats.aiPhraseCount,
      method: method
    };

    results.push(resultItem);

    chrome.storage.local.set({
      scanState: { status: 'scanning', results: results.slice(), total: paragraphs.length }
    });

    try {
      chrome.runtime.sendMessage({
        action: 'scanProgress',
        completed: results.length,
        total: paragraphs.length,
        generation: generation,
        result: resultItem
      });
    } catch (e) {
      // Popup might be closed while scanning completes in background
    }
  }

  return results;
}

/**
 * Exact ZeroGPT + GPTZero Stylometric Heuristic Engine
 */
function analyzeHeuristics(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    return {
      perplexityScore: 0,
      burstinessScore: 0,
      vocabularyScore: 0,
      aiProbability: 0,
      sentenceCount: 0,
      wordCount: 0,
      averageSentenceLength: 0,
      b_sent: 0,
      b_clause: 0,
      b_comp: 0,
      aiPhraseCount: 0,
      passiveVoiceCount: 0,
      trigramRepetition: 0,
    };
  }

  // 1. Sentence splitting
  const rawSentences = cleanText.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/).map(function (s) { return s.trim(); }).filter(Boolean);
  const sentences = rawSentences.length > 0 ? rawSentences : [cleanText];
  const sentenceCount = sentences.length;

  // Words and tokens
  const words = cleanText.toLowerCase().match(/\b[a-z0-9'-]+\b/g) || [];
  const wordCount = Math.max(1, words.length);

  // 2. Sentence Lengths L = {l_1, ..., l_k}
  const sentenceLengths = sentences.map(function (s) {
    const sWords = s.match(/\b[a-z0-9'-]+\b/g) || [];
    return sWords.length;
  }).filter(function (len) { return len > 0; });

  const k = Math.max(1, sentenceLengths.length);
  const mu_L = sentenceLengths.reduce(function (a, b) { return a + b; }, 0) / k;
  const variance_L = sentenceLengths.reduce(function (acc, len) { return acc + Math.pow(len - mu_L, 2); }, 0) / k;
  const sigma_L = Math.sqrt(variance_L);

  // ZeroGPT-style sentence burstiness coefficient: B_sent = (sigma - mu) / (sigma + mu)
  const denom_L = sigma_L + mu_L;
  const b_sent = denom_L > 0 ? (sigma_L - mu_L) / denom_L : -1.0;

  // 3. Clause-level burstiness
  const clauseLengths = [];
  for (let i = 0; i < sentences.length; i++) {
    const clauses = sentences[i].split(/[,;:\—\–\-]/).map(function (c) { return c.trim(); }).filter(Boolean);
    for (let j = 0; j < clauses.length; j++) {
      const cWords = clauses[j].match(/\b[a-z0-9'-]+\b/g) || [];
      if (cWords.length > 0) clauseLengths.push(cWords.length);
    }
  }

  const m = Math.max(1, clauseLengths.length);
  const mu_C = clauseLengths.reduce(function (a, b) { return a + b; }, 0) / m;
  const variance_C = clauseLengths.reduce(function (acc, len) { return acc + Math.pow(len - mu_C, 2); }, 0) / m;
  const sigma_C = Math.sqrt(variance_C);
  const denom_C = sigma_C + mu_C;
  const b_clause = denom_C > 0 ? (sigma_C - mu_C) / denom_C : -1.0;

  // Composite burstiness
  const b_comp = 0.55 * b_sent + 0.45 * b_clause;

  // Burstiness AI likelihood
  const burstinessAiProb = 1.0 / (1.0 + Math.exp((b_comp + 0.35) * 5.5));

  // 4. Vocabulary Diversity (Type-Token Ratio - TTR)
  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / wordCount;
  const expectedTtr = Math.min(1, 1.2 / Math.log10(wordCount + 10));
  const vocabUniformity = Math.max(0, Math.min(1, 1 - (ttr / (expectedTtr || 1))));

  // 5. Passive Voice & AI Phrase Matches
  const passiveMatches = cleanText.match(PASSIVE_REGEX) || [];
  const passiveRatio = (passiveMatches.length / sentenceCount);

  let aiPhraseMatches = 0;
  for (let p = 0; p < AI_PHRASES.length; p++) {
    const matches = cleanText.match(AI_PHRASES[p]);
    if (matches) aiPhraseMatches += matches.length;
  }
  const aiPhraseDensity = (aiPhraseMatches / wordCount) * 100;

  // 6. Trigram repetition
  let trigramRepetition = 0;
  if (words.length >= 3) {
    const trigrams = [];
    for (let t = 0; t <= words.length - 3; t++) {
      trigrams.push(words[t] + '_' + words[t + 1] + '_' + words[t + 2]);
    }
    const uniqueTrigrams = new Set(trigrams);
    trigramRepetition = (trigrams.length - uniqueTrigrams.size) / trigrams.length;
  }

  // 7. Fused Probability (ZeroGPT + Stylometric signals)
  const rawLogit =
    2.5 * burstinessAiProb +
    1.8 * vocabUniformity +
    2.2 * Math.min(1.0, aiPhraseDensity / 2.5) +
    1.2 * Math.min(1.0, passiveRatio / 0.8) +
    1.5 * trigramRepetition -
    2.8;

  const aiProbability = Math.round((1.0 / (1.0 + Math.exp(-rawLogit))) * 100) / 100;

  return {
    perplexityScore: Math.round((1 - vocabUniformity) * 100),
    burstinessScore: Math.round((b_comp + 1) * 50),
    vocabularyScore: Math.round(ttr * 100),
    aiProbability: Math.max(0.01, Math.min(0.99, aiProbability)),
    sentenceCount: sentenceCount,
    wordCount: wordCount,
    averageSentenceLength: Math.round(mu_L * 10) / 10,
    b_sent: Math.round(b_sent * 100) / 100,
    b_clause: Math.round(b_clause * 100) / 100,
    b_comp: Math.round(b_comp * 100) / 100,
    aiPhraseCount: aiPhraseMatches,
    passiveVoiceCount: passiveMatches.length,
    trigramRepetition: Math.round(trigramRepetition * 100) / 100,
  };
}

/**
 * OpenRouter AI evaluation using the exact GPTZero-Sim system prompt
 */
async function callOpenRouter(text, userKey, modelName, scanSignal) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Paragraph text is empty');
  }

  const truncated = text.substring(0, 1500);
  const controller = new AbortController();
  const timeoutId = setTimeout(function () { controller.abort(); }, 30000);

  function abortRequest() { controller.abort(); }
  if (scanSignal) {
    if (scanSignal.aborted) abortRequest();
    else scanSignal.addEventListener('abort', abortRequest, { once: true });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + userKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ai-scan-backend.vercel.app',
        'X-Title': 'AI Detector Extension'
      },
      body: JSON.stringify({
        model: modelName || 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: 'Text:\n"""\n' + truncated + '\n"""'
          }
        ],
        temperature: 0.0,
        max_tokens: 256
      }),
      signal: controller.signal
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error('OpenRouter returned invalid JSON');
    }

    if (!response.ok || data.error) {
      const message = data.error && data.error.message ? data.error.message : 'HTTP ' + response.status;
      throw new Error('OpenRouter API error: ' + message);
    }

    const choice = data && data.choices && data.choices[0];
    if (!choice) throw new Error('OpenRouter returned no choices');

    const content = choice.message && choice.message.content ? choice.message.content.trim() : '';
    if (!content) throw new Error('OpenRouter returned empty message');

    try {
      const parsed = JSON.parse(content);
      const probability = Number(parsed.ai_probability);
      if (Number.isFinite(probability)) {
        return Math.max(0, Math.min(1, probability));
      }
    } catch (e) {
      // Regex extractor fallback
    }

    const match = content.match(/ai_probability["\s:=]+(0?\.\d+|1(?:\.0+)?|\d+(?:\.\d+)?)/i);
    if (match) {
      return Math.max(0, Math.min(1, parseFloat(match[1])));
    }

    throw new Error('Could not parse probability from OpenRouter output');
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('OpenRouter request timed out after 30 seconds');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
    if (scanSignal) scanSignal.removeEventListener('abort', abortRequest);
  }
}