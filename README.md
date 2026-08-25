# AI Scan — Chrome Extension Companion

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)](https://github.com/fp101fs/ext-ai-detector)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](https://opensource.org/licenses/MIT)
[![Backend: AI Scan](https://img.shields.io/badge/Backend-AI%20Scan%20(Next.js)-purple)](https://github.com/fp101fs/ai-scan-backend)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-OAuth%20PKCE-purple)](https://openrouter.ai)

> **Official Chrome Extension companion for [AI Scan](https://github.com/fp101fs/ai-scan-backend). In-page AI content detection powered by ZeroGPT-style multi-scale burstiness ($B_{\text{sent}}, B_{\text{clause}}$) and GPTZero-style multi-model perplexity via OpenRouter BYOK.**

---

## ✨ Features

- **In-Page Paragraph Extraction**: Automatically parses paragraphs across any webpage, article, blog, forum, or research paper.
- **Unified Hybrid ML Engine**: Exact same detection formulas as the web platform:
  - **ZeroGPT Multi-Scale Burstiness**: Sentence variance ($B_{\text{sent}} = \frac{\sigma - \mu}{\sigma + \mu}$) and clause cadence ($B_{\text{clause}}$).
  - **Lexical Entropy (TTR)**: Type-Token Ratio and log-scale expected vocabulary distributions.
  - **Transition Cliché Matching**: 20-pattern regex suite scanning for characteristic LLM connector words.
- **Visual In-Page Highlights**: Color-coded glowing outlines (🔴 Red for AI $>50\%$, 🟢 Green for Human $<50\%$) with clickable inspection badges.
- **Interactive Detail Modal**: Click any paragraph badge to see word count, detection method, burstiness index, and perplexity score.
- **Multi-Model Support**: Choose between `OpenAI GPT-4o Mini`, `Google Gemini 2.5 Flash`, `DeepSeek V3`, or `Anthropic Claude 3.5 Haiku`.
- **Zero-Cost Offline Mode**: Run 100% free statistical scans locally in the browser with 0 API tokens and 0 latency.
- **1-Click Web Sync**: Seamlessly links to the [AI Scan Web Dashboard](https://ai-scan-backend.vercel.app/dashboard).

---

## 🔬 Detection Modes

| Mode | Description | Requires API Key? | Cost |
|------|-------------|:-----------------:|:----:|
| **✨ Hybrid (Recommended)** | Fuses OpenRouter AI (65%) + ZeroGPT Stylometrics (35%) | Yes (BYOK) | ~$0.0001 / scan |
| **⚡ ZeroGPT Heuristics** | 100% local mathematical burstiness ($B_{\text{sent}}$), TTR, and transition clichés | No (100% Free) | **$0.00** |
| **🤖 Multi-Model AI** | GPTZero-style statistical token log-probability prompt via OpenRouter | Yes (BYOK) | ~$0.0001 / scan |

---

## 🚀 Installation & Quickstart

1. **Clone or Download the Repository**:
   ```bash
   git clone https://github.com/fp101fs/ext-ai-detector.git
   ```

2. **Load into Google Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Toggle **"Developer mode"** in the top right corner
   - Click **"Load unpacked"** and select the `ext-ai-detector` directory

3. **Configure API Key (Optional)**:
   - Click the **AI Scan** icon in your Chrome toolbar
   - (Optional) Paste your OpenRouter API key (`sk-or-v1-...`) or connect with 1 click via the [Web Platform](https://ai-scan-backend.vercel.app/api/auth/openrouter/login)
   - Click **"Save"**

4. **Scan Any Web Page**:
   - Navigate to any article, Reddit thread, or documentation page
   - Click **"⚡ Scan Active Page"**
   - View real-time paragraph highlights on the page and summary stats in the popup

---

## 📁 File Structure

```
├── manifest.json       # Chrome Manifest V3 configuration & permissions
├── background.js       # Service worker — ZeroGPT heuristics, OpenRouter API calls, orchestration
├── popup.html          # Extension popup UI (score gauge, model selector, metric pills)
├── popup.css           # Modern dark-theme styling matching AI Scan Design System
├── popup.js            # Popup UI logic, settings persistence, message passing
├── content.js          # In-page paragraph scraper & interactive outline/badge injector
├── content.css         # In-page highlight animations & styling
├── icons/              # Extension icons (16px, 48px, 128px)
└── README.md           # Documentation
```

---

## 🔗 Connected Backend

This extension is paired with **[AI Scan Backend](https://github.com/fp101fs/ai-scan-backend)**:
- **Web App**: Full-page document inspector with in-line sentence tooltips
- **OAuth Hub**: 1-click PKCE OpenRouter authentication
- **Python CLI**: Standalone `ai_detector.py` for offline batch scanning and meta-classifier training

---

## 📄 License

MIT © 2026 AI Scan Team