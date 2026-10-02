// Options Page Logic

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
7. Formatting Preservation: Preserve markdown formatting, line breaks, code blocks, variables, numbers, dates, and punctuation faithfully.
8. Completeness & Full Coverage: You MUST translate the ENTIRE provided text completely from the first word to the very end. Never truncate, summarize, or omit any sentences, paragraphs, or bullet points.`;

document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const toggleApiKeyBtn = document.getElementById("toggleApiKey");
  const testApiKeyBtn = document.getElementById("testApiKeyBtn");
  const apiTestResult = document.getElementById("apiTestResult");
  const modelSelect = document.getElementById("modelSelect");
  const targetLangSelect = document.getElementById("targetLangSelect");
  const toneSelect = document.getElementById("toneSelect");
  const showFloatingIcon = document.getElementById("showFloatingIcon");
  const enableHoverOriginal = document.getElementById("enableHoverOriginal");
  const enableFailover = document.getElementById("enableFailover");
  const customPrompt = document.getElementById("customPrompt");
  const resetPromptBtn = document.getElementById("resetPromptBtn");
  const saveBtn = document.getElementById("saveBtn");
  const saveStatus = document.getElementById("saveStatus");
  const cacheCountText = document.getElementById("cacheCountText");
  const clearCacheBtn = document.getElementById("clearCacheBtn");

  function updateCacheStats() {
    if (!cacheCountText) return;
    chrome.runtime.sendMessage({ action: "getCacheStats" }, (res) => {
      if (res && res.success) {
        cacheCountText.textContent = `${res.count || 0} ფრაგმენტი`;
      } else {
        cacheCountText.textContent = "0 ფრაგმენტი";
      }
    });
  }

  updateCacheStats();

  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", () => {
      clearCacheBtn.textContent = "⏳ იშლება...";
      clearCacheBtn.disabled = true;
      chrome.runtime.sendMessage({ action: "clearCache" }, () => {
        clearCacheBtn.textContent = "✓ გასუფთავებულია";
        updateCacheStats();
        setTimeout(() => {
          clearCacheBtn.textContent = "🗑️ ქეშის გასუფთავება";
          clearCacheBtn.disabled = false;
        }, 1500);
      });
    });
  }

  // Load saved options
  chrome.storage.sync.get(
    {
      apiKey: "",
      model: "gemini-3.8-flash",
      targetLanguage: "Georgian (ქართული)",
      tone: "natural",
      showFloatingIcon: true,
      enableHoverOriginal: true,
      enableFailover: true,
      customPrompt: DEFAULT_SYSTEM_PROMPT
    },
    (items) => {
      apiKeyInput.value = items.apiKey;
      let activeModel = items.model;
      if (activeModel === "gemini-2.0-flash") {
        activeModel = "gemini-3.8-flash";
      }
      modelSelect.value = activeModel;
      targetLangSelect.value = items.targetLanguage;
      toneSelect.value = items.tone;
      showFloatingIcon.checked = items.showFloatingIcon;
      if (enableHoverOriginal) {
        enableHoverOriginal.checked = items.enableHoverOriginal !== false;
      }
      enableFailover.checked = items.enableFailover !== false;
      customPrompt.value = items.customPrompt || DEFAULT_SYSTEM_PROMPT;

      if (items.apiKey && items.apiKey.trim().length > 10) {
        loadDynamicModels(true);
      }
    }
  );

  // Toggle API Key visibility
  toggleApiKeyBtn.addEventListener("click", () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleApiKeyBtn.textContent = "🔒";
    } else {
      apiKeyInput.type = "password";
      toggleApiKeyBtn.textContent = "👁️";
    }
  });

  // Reset System Prompt to default
  resetPromptBtn.addEventListener("click", () => {
    customPrompt.value = DEFAULT_SYSTEM_PROMPT;
  });

  const fetchModelsBtn = document.getElementById("fetchModelsBtn");
  const modelHint = document.getElementById("modelHint");

  function loadDynamicModels(quiet = false) {
    const key = apiKeyInput.value.trim();
    if (!key) {
      if (!quiet) {
        modelHint.style.color = "#dc2626";
        modelHint.textContent = "⚠️ ჯერ შეიყვანეთ API Key მოდელების ჩამოსატვირთად.";
      }
      return;
    }

    if (!quiet) {
      fetchModelsBtn.textContent = "⏳ იტვირთება...";
      fetchModelsBtn.disabled = true;
    }

    chrome.runtime.sendMessage(
      { action: "fetchAvailableModels", apiKey: key },
      (res) => {
        if (!quiet) {
          fetchModelsBtn.textContent = "🔄 სიის განახლება API-დან";
          fetchModelsBtn.disabled = false;
        }

        if (res && res.success && res.models && res.models.length > 0) {
          const currentSelected = modelSelect.value;
          modelSelect.innerHTML = "";

          // Populate with models from Google API
          res.models.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m.id;
            opt.textContent = `${m.displayName} (${m.id})`;
            modelSelect.appendChild(opt);
          });

          // Restore previous selection if present, or keep currentSelected option
          if (Array.from(modelSelect.options).some((o) => o.value === currentSelected)) {
            modelSelect.value = currentSelected;
          } else if (currentSelected) {
            const opt = document.createElement("option");
            opt.value = currentSelected;
            opt.textContent = `${currentSelected} (არჩეული)`;
            modelSelect.insertBefore(opt, modelSelect.firstChild);
            modelSelect.value = currentSelected;
          }

          modelHint.style.color = "#16a34a";
          modelHint.textContent = `✓ Google API-დან ჩამოიტვირთა ${res.models.length} აქტიური მოდელი.`;
        } else if (!quiet) {
          modelHint.style.color = "#dc2626";
          modelHint.textContent = `⚠️ ${res?.error || "მოდელების სია ვერ ჩამოიტვირთა."}`;
        }
      }
    );
  }

  fetchModelsBtn.addEventListener("click", () => loadDynamicModels(false));

  // Test API Key
  testApiKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      apiTestResult.className = "test-result error";
      apiTestResult.textContent = "⚠️ გთხოვთ ჯერ ჩაწეროთ API Key.";
      return;
    }

    apiTestResult.className = "test-result";
    apiTestResult.style.display = "block";
    apiTestResult.style.color = "#64748b";
    apiTestResult.textContent = "⏳ Gemini API მოწმდება...";

    chrome.runtime.sendMessage(
      {
        action: "testApiKey",
        apiKey: key,
        model: modelSelect.value
      },
      (res) => {
        if (res && res.success) {
          if (res.warning) {
            apiTestResult.className = "test-result";
            apiTestResult.style.display = "block";
            apiTestResult.style.color = "#d97706";
            apiTestResult.textContent = res.warning;
          } else {
            apiTestResult.className = "test-result success";
            apiTestResult.textContent = "✓ კავშირი წარმატებულია! API Key მუშაობს იდეალურად.";
          }
          // Automatically refresh model list on test success
          loadDynamicModels(true);
        } else {
          apiTestResult.className = "test-result error";
          apiTestResult.textContent = `⚠️ შეცდომა: ${res?.error || "ვერ დამყარდა კავშირი."}`;
        }
      }
    );
  });

  // Save Settings
  saveBtn.addEventListener("click", () => {
    const newSettings = {
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      targetLanguage: targetLangSelect.value,
      tone: toneSelect.value,
      showFloatingIcon: showFloatingIcon.checked,
      enableHoverOriginal: enableHoverOriginal ? enableHoverOriginal.checked : true,
      enableFailover: enableFailover.checked,
      customPrompt: customPrompt.value
    };

    chrome.storage.sync.set(newSettings, () => {
      saveStatus.textContent = "✓ პარამეტრები შენახულია!";
      saveStatus.classList.add("visible");
      setTimeout(() => {
        saveStatus.classList.remove("visible");
      }, 2500);
    });
  });
});
