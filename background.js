// Gemini AI Translator - Background Service Worker (Evolved Tier-1 Architecture)

const DEFAULT_SYSTEM_PROMPT = `You are a premier bilingual translator and localization authority specializing in flawless, culturally nuanced, and natural translation into Georgian (ქართული ენა).

Strict Professional Translation Principles:
1. Purity of Output: Return ONLY the final translated text. Never include conversational filler ("Here is the translation:"), greetings, preambles, notes, or prefixes like "თარგმანი:".
2. Idiomatic & Natural Georgian: Strictly avoid word-for-word calques ("არ თარგმნო კალკით"). Re-engineer sentence syntax to adhere to natural Georgian ergonomics and cadence while preserving 100% of the original meaning.
3. Grammatical Integrity & Screeves: Ensure all Georgian grammatical cases, verb screeves, ergative alignment, and polypersonal subject-object agreements are 100% accurate.
4. Georgian Typographical Standards: Use authentic Georgian quotation marks („...“) instead of Western straight quotes ("...").
5. Acronyms & Foreign Technical Terms:
   - When declining foreign IT/business acronyms and established English names in Georgian, use a hyphen for case suffixes (e.g., API-ს, API-ის, CI/CD-ის, PR-ის, Docker-ის, AWS-ზე, SaaS-ის).
   - For standard technical concepts with established Georgian terminology (e.g. „მონაცემთა ბაზა“, „დაპროგრამება“, „შემუშავება“), use proper Georgian terms. If industry standard jargon is universally recognized in English, preserve the English term with original spelling.
6. Tone, Register & Style: Faithfully mirror the register of the source (academic, formal, journalistic, technical, or conversational).
7. Formatting Preservation: Faithfully preserve markdown formatting, line breaks, code blocks, variables, numbers, dates, and punctuation.
8. Completeness & Full Coverage: You MUST translate the ENTIRE provided text completely from the first word to the very end. Never truncate, summarize, or omit any sentences, paragraphs, or bullet points.`;

const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "gemini-3.8-flash",
  targetLanguage: "Georgian (ქართული)",
  tone: "natural",
  showFloatingIcon: true,
  autoDetectLanguage: true,
  enableHoverOriginal: true,
  enableFailover: true,
  customGlossary: [],
  customPrompt: DEFAULT_SYSTEM_PROMPT
};

const CANDIDATE_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview"
];

// In-Memory & Persistent LRU Cache
const translationCache = new Map();
const MAX_CACHE_SIZE = 150;

function getCacheKey(text, targetLang, tone, model, glossary = null) {
  const m = model || "gemini-3.8-flash";
  const l = targetLang || "Georgian (ქართული)";
  const t = tone || "natural";
  let gHash = "";
  if (Array.isArray(glossary) && glossary.length > 0) {
    const valid = glossary
      .filter((e) => e && e.source && e.target)
      .map((e) => `${e.source.trim().toLowerCase()}:${e.target.trim()}`)
      .sort()
      .join("|");
    if (valid) {
      gHash = `:::g:${valid}`;
    }
  }
  return `gtc:::${m}:::${l}:::${t}${gHash}:::${text.trim()}`;
}

/**
 * Format user-defined glossary rules to inject into Gemini system instructions
 */
function formatGlossaryPrompt(glossary) {
  if (!Array.isArray(glossary) || glossary.length === 0) return "";
  const validEntries = glossary.filter(
    (item) => item && item.source && item.source.trim() && item.target && item.target.trim()
  );
  if (validEntries.length === 0) return "";

  let prompt = "\n\nUser-Defined Domain Glossary & Terminology Rules (MANDATORY):\n";
  prompt += "Strictly adhere to the following terminology mappings whenever the source term appears in the text:\n";
  for (const entry of validEntries) {
    prompt += `- "${entry.source.trim()}" -> "${entry.target.trim()}"\n`;
  }
  prompt += "If the target is a preserved English word, keep it in English. When declining preserved foreign terms with Georgian cases, use hyphens (e.g. Docker-ის, API-ს).\n";
  return prompt;
}

async function getFromCache(key) {
  if (translationCache.has(key)) {
    return translationCache.get(key);
  }
  try {
    const res = await chrome.storage.local.get(key);
    if (res && res[key]) {
      translationCache.set(key, res[key]);
      return res[key];
    }
  } catch (e) {
    // Ignore storage errors
  }
  return null;
}

async function saveToCache(key, data) {
  if (translationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = translationCache.keys().next().value;
    translationCache.delete(firstKey);
  }
  translationCache.set(key, data);
  try {
    chrome.storage.local.set({ [key]: data }).catch(() => {});
  } catch (e) {}
}

async function clearTranslationCache() {
  translationCache.clear();
  try {
    const all = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter((k) => k.startsWith("gtc:::") || k.includes(":::"));
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    return { success: true, count: keysToRemove.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function getCacheStats() {
  try {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith("gtc:::") || k.includes(":::"));
    const count = Math.max(translationCache.size, keys.length);
    return { success: true, count: count };
  } catch (e) {
    return { success: true, count: translationCache.size };
  }
}

/**
 * Configure low-latency generation settings (turn off unnecessary reasoning chains)
 * Per official Google Gemini specs:
 * - Gemini 3.8 & 3.7 Flash & 3.1 Pro only support "LOW", "MEDIUM", "HIGH" ("MINIMAL" returns 400 error!)
 * - Gemini 3.6 & 3.5 Flash support "MINIMAL" and "LOW"
 * - Gemini 3.5 Flash-Lite supports "MINIMAL" by default
 */
function getGenerationConfigForModel(modelName) {
  const config = {
    temperature: 0.1,
    maxOutputTokens: 8192
  };

  if (!modelName) return config;

  if (modelName.includes("3.8") || modelName.includes("3.7") || modelName.includes("3.1-pro")) {
    config.thinkingConfig = {
      thinkingLevel: "low"
    };
  } else if (modelName.includes("3.6") || modelName.includes("3.5-flash") || modelName.includes("flash-lite")) {
    config.thinkingConfig = {
      thinkingLevel: "minimal"
    };
  } else if (modelName.includes("gemini-2.5")) {
    config.thinkingConfig = {
      thinkingBudget: 0
    };
  }
  return config;
}

// Initialize extension defaults and Context Menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS), (stored) => {
    const toSet = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (stored[key] === undefined) {
        toSet[key] = value;
      }
    }
    if (Object.keys(toSet).length > 0) {
      chrome.storage.sync.set(toSet);
    }
  });

  chrome.contextMenus.create({
    id: "gemini-translate-selection",
    title: "Translate with Gemini (Alt+T)",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "gemini-translate-page",
    title: "Translate Full Page with Gemini (მთლიანი გვერდის თარგმნა)",
    contexts: ["page"]
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "gemini-translate-selection" && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "triggerContextMenuTranslation",
      selectedText: info.selectionText
    }).catch((err) => {
      console.warn("Could not send message to tab:", err);
    });
  } else if (info.menuItemId === "gemini-translate-page" && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: "triggerFullPageTranslation"
    }).catch((err) => {
      console.warn("Could not send full page trigger to tab:", err);
    });
  }
});

// Handle Global Keyboard Shortcut (Alt+T, Alt+Shift+P)
chrome.commands.onCommand.addListener((command) => {
  if (command === "translate-selection") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "triggerShortcutTranslation"
        }).catch((err) => {
          console.warn("Could not trigger shortcut translation:", err);
        });
      }
    });
  } else if (command === "translate-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "triggerFullPageTranslation"
        }).catch((err) => {
          console.warn("Could not trigger full page shortcut translation:", err);
        });
      }
    });
  }
});

// Real-Time Streaming Port Connection (Server-Sent Events)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "gemini-stream") return;

  const abortController = new AbortController();

  port.onDisconnect.addListener(() => {
    // If popup or bubble is closed by user, immediately abort the network request!
    abortController.abort();
  });

  port.onMessage.addListener((msg) => {
    if (msg.action === "streamTranslate") {
      handleStreamingTranslation(msg, port, abortController).catch((err) => {
        if (!abortController.signal.aborted) {
          port.postMessage({ type: "error", error: err.message });
        }
      });
    }
  });
});

// Standard Message Listener for non-streaming requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    handleTranslation(request)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "translateBatch") {
    handleBatchTranslation(request)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "testApiKey") {
    testGeminiApiKey(request.apiKey, request.model)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "fetchAvailableModels") {
    fetchAvailableModels(request.apiKey)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "injectAndTranslatePage") {
    const tabId = request.tabId;
    if (!tabId) {
      sendResponse({ success: false, error: "No tabId provided" });
      return false;
    }

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    }).then(() => {
      // Allow content script a tiny tick to initialize
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: "triggerFullPageTranslation" })
          .then(() => sendResponse({ success: true }))
          .catch((e) => sendResponse({ success: false, error: e.message }));
      }, 50);
    }).catch((err) => {
      console.warn("Could not inject script:", err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return false;
  }

  if (request.action === "clearCache") {
    clearTranslationCache()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "getCacheStats") {
    getCacheStats()
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Handle Real-Time Streaming Translation
 */
async function handleStreamingTranslation(params, port, abortController) {
  const { text, targetLang, bypassCache } = params;
  if (!text || !text.trim()) {
    port.postMessage({ type: "error", error: "ტექსტი ცარიელია." });
    return;
  }

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const apiKey = settings.apiKey ? settings.apiKey.trim() : "";

  if (!apiKey) {
    port.postMessage({
      type: "error",
      code: "NO_API_KEY",
      error: "Gemini API Key არ არის მითითებული. გთხოვთ შეიყვანოთ თქვენი API Key პარამეტრებში."
    });
    return;
  }

  const targetLanguage = targetLang || settings.targetLanguage || "Georgian (ქართული)";
  const tone = settings.tone || "natural";
  const initialModel = settings.model || "gemini-3.8-flash";

  // Check LRU Cache first (0ms instant return!) unless bypassCache is requested
  const cacheKey = getCacheKey(text, targetLanguage, tone, initialModel, settings.customGlossary);
  if (!bypassCache) {
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      port.postMessage({ type: "chunk", text: cachedData.translation, accumulated: cachedData.translation });
      port.postMessage({
        type: "done",
        model: cachedData.model,
        isFallback: false,
        isCached: true,
        targetLanguage: targetLanguage
      });
      return;
    }
  }

  let toneGuidance = "";
  if (tone === "formal") {
    toneGuidance = "\nTranslate in a formal, respectful, and polite register (აკადემიური/ოფიციალური სტილი).";
  } else if (tone === "casual") {
    toneGuidance = "\nTranslate in a natural, casual, and friendly conversational tone.";
  } else if (tone === "technical") {
    toneGuidance = "\nTranslate with precision for software engineering and technical documentation.";
  }

  const glossaryPrompt = formatGlossaryPrompt(settings.customGlossary);
  const fullSystemPrompt = `${settings.customPrompt || DEFAULT_SYSTEM_PROMPT}${toneGuidance}${glossaryPrompt}\nTarget Language: ${targetLanguage}`;
  const prompt = `Translate the entire following source text completely and faithfully into ${targetLanguage}. Translate all paragraphs in full without omitting or summarizing anything:\n\n${text}`;

  const enableFailover = settings.enableFailover !== false;
  const modelsToTry = enableFailover
    ? [initialModel, ...CANDIDATE_FALLBACK_MODELS.filter((m) => m !== initialModel)]
    : [initialModel];

  const payload = {
    system_instruction: { parts: [{ text: fullSystemPrompt }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: getGenerationConfigForModel(initialModel)
  };

  let lastError = "";

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    if (abortController.signal.aborted) return;

    const curModel = modelsToTry[mIdx];
    const isFallback = curModel !== initialModel;
    payload.generationConfig = getGenerationConfigForModel(curModel);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${curModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

    // 15-second network timeout guard
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 15000);

    try {
      let response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      // If the model rejects request with HTTP 400 and thinkingConfig was included, immediately retry without it!
      if (!response.ok && response.status === 400 && payload.generationConfig?.thinkingConfig) {
        delete payload.generationConfig.thinkingConfig;
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: abortController.signal
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData?.error?.message || `HTTP ${response.status} ${response.statusText}`;

        if (response.status === 400 && errorMsg.includes("API key not valid")) {
          port.postMessage({
            type: "error",
            code: "INVALID_API_KEY",
            error: "მითითებული Gemini API Key არასწორია. გადაამოწმეთ პარამეტრებში."
          });
          return;
        }

        lastError = `${curModel}: ${errorMsg}`;

        // If failover is enabled and there are other candidates, try next model
        if (enableFailover && mIdx < modelsToTry.length - 1) {
          console.warn(`Model ${curModel} failed (${errorMsg}), failing over to ${modelsToTry[mIdx + 1]}...`);
          continue;
        } else {
          port.postMessage({
            type: "error",
            error: `მოდელი '${curModel}' ვერ პასუხობს: ${errorMsg}`
          });
          return;
        }
      }

      // Read Server-Sent Events Stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";
      let sseBuffer = "";

      while (true) {
        if (abortController.signal.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop(); // Hold incomplete chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const jsonPart = trimmed.slice(6).trim();
            if (jsonPart === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonPart);
              const parts = parsed.candidates?.[0]?.content?.parts || [];
              for (const part of parts) {
                if (part.thought) continue; // Skip internal thinking tokens
                if (part.text) {
                  accumulatedText += part.text;
                  port.postMessage({
                    type: "chunk",
                    text: part.text,
                    accumulated: accumulatedText,
                    model: curModel,
                    isFallback: isFallback,
                    fallbackReason: isFallback ? `${initialModel} დროებით მიუწვდომელი იყო (${lastError})` : null
                  });
                }
              }
            } catch (jsonErr) {
              // Partial line in stream
            }
          }
        }
      }

      if (accumulatedText.trim().length > 0) {
        // Save to LRU cache with model-aware key
        const finalKey = getCacheKey(text, targetLanguage, tone, curModel, settings.customGlossary);
        saveToCache(finalKey, {
          translation: accumulatedText.trim(),
          model: curModel,
          timestamp: Date.now()
        });
        if (curModel !== initialModel) {
          saveToCache(cacheKey, {
            translation: accumulatedText.trim(),
            model: curModel,
            timestamp: Date.now()
          });
        }

        port.postMessage({
          type: "done",
          model: curModel,
          isFallback: isFallback,
          fallbackReason: isFallback ? `${initialModel} დროებით მიუწვდომელი იყო (${lastError})` : null,
          isCached: false,
          targetLanguage: targetLanguage
        });
        return;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (abortController.signal.aborted) return;
      lastError = err.message;
      console.warn(`Fetch error for ${curModel}:`, err);
    }
  }

  port.postMessage({
    type: "error",
    error: `Gemini სერვერები ამ წამს გადატვირთულია (${lastError}). გთხოვთ სცადოთ რამდენიმე წამში (ან Options-ში აირჩიოთ Gemini 3.5 Flash-Lite).`
  });
}

/**
 * Standard Non-Streaming Translation (Fallback)
 */
async function handleTranslation(params) {
  const { text, targetLang, bypassCache } = params;
  if (!text || !text.trim()) {
    return { success: false, error: "ტექსტი ცარიელია." };
  }

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const apiKey = settings.apiKey ? settings.apiKey.trim() : "";

  if (!apiKey) {
    return {
      success: false,
      code: "NO_API_KEY",
      error: "Gemini API Key არ არის მითითებული. გთხოვთ შეიყვანოთ თქვენი API Key პარამეტრებში."
    };
  }

  const targetLanguage = targetLang || settings.targetLanguage || "Georgian (ქართული)";
  const tone = settings.tone || "natural";
  const initialModel = settings.model || "gemini-3.8-flash";

  // Check cache unless bypassCache is requested
  const cacheKey = getCacheKey(text, targetLanguage, tone, initialModel, settings.customGlossary);
  if (!bypassCache) {
    const cached = await getFromCache(cacheKey);
    if (cached) {
      return {
        success: true,
        translation: cached.translation,
        model: cached.model,
        isFallback: false,
        isCached: true,
        targetLanguage: targetLanguage
      };
    }
  }

  let toneGuidance = "";
  if (tone === "formal") {
    toneGuidance = "\nTranslate in a formal, respectful, and polite register (აკადემიური/ოფიციალური სტილი).";
  } else if (tone === "casual") {
    toneGuidance = "\nTranslate in a natural, casual, and friendly conversational tone.";
  } else if (tone === "technical") {
    toneGuidance = "\nTranslate with precision for software engineering and technical documentation.";
  }

  const glossaryPrompt = formatGlossaryPrompt(settings.customGlossary);
  const fullSystemPrompt = `${settings.customPrompt || DEFAULT_SYSTEM_PROMPT}${toneGuidance}${glossaryPrompt}\nTarget Language: ${targetLanguage}`;
  const prompt = `Translate the entire following source text completely and faithfully into ${targetLanguage}. Translate all paragraphs in full without omitting or summarizing anything:\n\n${text}`;

  const enableFailover = settings.enableFailover !== false;
  const modelsToTry = enableFailover
    ? [initialModel, ...CANDIDATE_FALLBACK_MODELS.filter((m) => m !== initialModel)]
    : [initialModel];

  const payload = {
    system_instruction: { parts: [{ text: fullSystemPrompt }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: getGenerationConfigForModel(initialModel)
  };

  let lastError = "";

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const curModel = modelsToTry[mIdx];
    const isFallback = curModel !== initialModel;
    payload.generationConfig = getGenerationConfigForModel(curModel);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${curModel}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        // If the model rejects thinkingConfig, retry without it
        if (!response.ok && response.status === 400 && payload.generationConfig?.thinkingConfig) {
          delete payload.generationConfig.thinkingConfig;
          response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        }

        const data = await response.json();

        if (response.ok) {
          const candidate = data.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          const translatedText = parts
            .filter((p) => !p.thought)
            .map((p) => p.text || "")
            .join("");

          if (translatedText) {
            const finalKey = getCacheKey(text, targetLanguage, tone, curModel, settings.customGlossary);
            saveToCache(finalKey, {
              translation: translatedText.trim(),
              model: curModel,
              timestamp: Date.now()
            });
            if (curModel !== initialModel) {
              saveToCache(cacheKey, {
                translation: translatedText.trim(),
                model: curModel,
                timestamp: Date.now()
              });
            }

            return {
              success: true,
              translation: translatedText.trim(),
              model: curModel,
              isFallback: isFallback,
              isCached: false,
              targetLanguage: targetLanguage
            };
          }
        }

        const errorMsg = data?.error?.message || `HTTP ${response.status} ${response.statusText}`;

        if (response.status === 400 && errorMsg.includes("API key not valid")) {
          return {
            success: false,
            code: "INVALID_API_KEY",
            error: "მითითებული Gemini API Key არასწორია. გადაამოწმეთ პარამეტრებში."
          };
        }

        const isHighDemand =
          response.status === 503 ||
          response.status === 429 ||
          errorMsg.toLowerCase().includes("high demand") ||
          errorMsg.toLowerCase().includes("resource_exhausted") ||
          errorMsg.toLowerCase().includes("temporarily unavailable");

        if (isHighDemand) {
          lastError = "მაღალი დატვირთვა (High Demand)";
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            continue;
          } else {
            console.warn(`Model ${curModel} busy, trying next in cascade...`);
            break;
          }
        } else {
          break;
        }
      } catch (err) {
        lastError = err.message;
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        break;
      }
    }
  }

  return {
    success: false,
    error: `Gemini სერვერები ამ წამს გადატვირთულია (${lastError}). გთხოვთ სცადოთ რამდენიმე წამში (ან Options-ში აირჩიოთ Gemini 3.5 Flash-Lite).`
  };
}

/**
 * Batch translation for Full Webpage Translation
 * Translates an array of text snippets preserving order and structure
 */
async function handleBatchTranslation(params) {
  const { texts, targetLang, bypassCache } = params;
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return { success: false, error: "ტექსტების მასივი ცარიელია." };
  }

  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const apiKey = settings.apiKey ? settings.apiKey.trim() : "";

  if (!apiKey) {
    return {
      success: false,
      code: "NO_API_KEY",
      error: "Gemini API Key არ არის მითითებული. გთხოვთ შეიყვანოთ თქვენი API Key პარამეტრებში."
    };
  }

  const targetLanguage = targetLang || settings.targetLanguage || "Georgian (ქართული)";
  const tone = settings.tone || "natural";
  const initialModel = settings.model || "gemini-3.8-flash";

  // Check cache for individual items first (0ms instant hits) unless bypassCache is requested
  const results = new Array(texts.length);
  const missingIndices = [];
  const missingTexts = [];

  for (let i = 0; i < texts.length; i++) {
    if (!bypassCache) {
      const cacheKey = getCacheKey(texts[i], targetLanguage, tone, initialModel, settings.customGlossary);
      const cached = await getFromCache(cacheKey);
      if (cached && cached.translation) {
        results[i] = cached.translation;
        continue;
      }
    }
    missingIndices.push(i);
    missingTexts.push(texts[i]);
  }

  if (missingTexts.length === 0) {
    return { success: true, translations: results, fromCache: true };
  }

  const glossaryPrompt = formatGlossaryPrompt(settings.customGlossary);
  const batchPrompt = `You are a premier bilingual translator specializing in localization into ${targetLanguage}.${glossaryPrompt}
Translate the following JSON array of strings into ${targetLanguage}.
MANDATORY INSTRUCTIONS:
1. Return ONLY a valid JSON array of strings containing EXACTLY ${missingTexts.length} items in the same sequence.
2. Translate naturally, idiomatically, and fluently adhering to authentic Georgian linguistic standards.
3. Preserve all numbers, URLs, dates, proper nouns, brand names, and code elements without modification.
4. Strictly respect any custom glossary mappings defined above.
5. Do NOT output markdown ticks, comments, prefixes, or explanations. Output pure JSON array: ["...", "..."]

Input JSON array:
${JSON.stringify(missingTexts)}`;

  const enableFailover = settings.enableFailover !== false;
  const modelsToTry = enableFailover
    ? [initialModel, ...CANDIDATE_FALLBACK_MODELS.filter((m) => m !== initialModel)]
    : [initialModel];

  let lastError = "";

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const curModel = modelsToTry[mIdx];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${curModel}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ role: "user", parts: [{ text: batchPrompt }] }],
      generationConfig: {
        ...getGenerationConfigForModel(curModel),
        temperature: 0.1
      }
    };

    try {
      let response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok && response.status === 400 && payload.generationConfig?.thinkingConfig) {
        delete payload.generationConfig.thinkingConfig;
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      const data = await response.json();

      if (response.ok) {
        const candidate = data.candidates?.[0];
        const parts = candidate?.content?.parts || [];
        const rawText = parts
          .filter((p) => !p.thought)
          .map((p) => p.text || "")
          .join("")
          .trim();

        if (rawText) {
          let cleaned = rawText;
          if (cleaned.startsWith("```json")) {
            cleaned = cleaned.slice(7);
          } else if (cleaned.startsWith("```")) {
            cleaned = cleaned.slice(3);
          }
          if (cleaned.endsWith("```")) {
            cleaned = cleaned.slice(0, -3);
          }
          cleaned = cleaned.trim();

          let translatedArray;
          try {
            translatedArray = JSON.parse(cleaned);
          } catch (pe) {
            const match = cleaned.match(/\[[\s\S]*\]/);
            if (match) {
              try {
                translatedArray = JSON.parse(match[0]);
              } catch (e) {}
            }
          }

          if (Array.isArray(translatedArray) && translatedArray.length === missingTexts.length) {
            for (let k = 0; k < missingIndices.length; k++) {
              const origIdx = missingIndices[k];
              const transVal = String(translatedArray[k]);
              results[origIdx] = transVal;

              const itemCacheKey = getCacheKey(missingTexts[k], targetLanguage, tone, curModel, settings.customGlossary);
              saveToCache(itemCacheKey, {
                translation: transVal,
                model: curModel,
                timestamp: Date.now()
              });
              if (curModel !== initialModel) {
                const itemInitKey = getCacheKey(missingTexts[k], targetLanguage, tone, initialModel, settings.customGlossary);
                saveToCache(itemInitKey, {
                  translation: transVal,
                  model: curModel,
                  timestamp: Date.now()
                });
              }
            }

            return {
              success: true,
              translations: results,
              model: curModel
            };
          }
        }
      }

      const errorMsg = data?.error?.message || `HTTP ${response.status}`;
      lastError = errorMsg;
      console.warn(`Batch translation with ${curModel} failed: ${errorMsg}`);
    } catch (err) {
      lastError = err.message;
      console.warn(`Batch error on ${curModel}:`, err);
    }
  }

  return {
    success: false,
    error: `გვერდის ბლოკის თარგმნა ვერ მოხერხდა (${lastError}).`
  };
}

/**
 * Validate API Key with a lightweight test call
 */
async function testGeminiApiKey(apiKey, modelName) {
  const model = modelName || "gemini-3.8-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

  const payload = {
    contents: [{ role: "user", parts: [{ text: "Hello! Reply with 'OK'." }] }],
    generationConfig: {
      ...getGenerationConfigForModel(model),
      maxOutputTokens: 10
    }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok && response.status === 400 && payload.generationConfig?.thinkingConfig) {
        delete payload.generationConfig.thinkingConfig;
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      const data = await response.json();
      if (response.ok) {
        return { success: true };
      }

      const errorMsg = data?.error?.message || `Status: ${response.status}`;
      if (response.status === 400 && errorMsg.includes("API key not valid")) {
        return { success: false, error: "API Key არასწორია (Invalid API key)." };
      }

      const isHighDemand =
        response.status === 503 ||
        response.status === 429 ||
        errorMsg.toLowerCase().includes("high demand");

      if (isHighDemand) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }
        return {
          success: true,
          warning: `API Key სწორია! თუმცა მოდელი '${model}' ამ წამს გადატვირთულია. ჩართული Failover სისტემა თარგმნისას ავტომატურად გადართავს თავისუფალ მოდელზე.`
        };
      }

      return { success: false, error: errorMsg };
    } catch (err) {
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      return { success: false, error: err.message };
    }
  }
}

/**
 * Fetch all available models directly from Google Gemini ModelService
 */
async function fetchAvailableModels(apiKey) {
  let key = apiKey ? apiKey.trim() : "";
  if (!key) {
    const settings = await chrome.storage.sync.get({ apiKey: "" });
    key = settings.apiKey ? settings.apiKey.trim() : "";
  }
  if (!key) {
    return { success: false, error: "API Key არ არის მითითებული." };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data?.error?.message || `HTTP ${response.status}`
      };
    }

    const validModels = (data.models || [])
      .filter((m) => {
        const methods = m.supportedGenerationMethods || [];
        return (
          methods.includes("generateContent") &&
          !m.name.includes("embedding") &&
          !m.name.includes("aqa") &&
          !m.name.includes("imagen")
        );
      })
      .map((m) => {
        const id = m.name.replace("models/", "");
        return {
          id: id,
          displayName: m.displayName || id,
          description: m.description || ""
        };
      });

    return { success: true, models: validModels };
  } catch (err) {
    return { success: false, error: `შეცდომა მოდელების ჩამოტვირთვისას: ${err.message}` };
  }
}
