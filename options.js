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

  // Custom Glossary Elements
  const glossaryTableBody = document.getElementById("glossaryTableBody");
  const glossaryEmptyMsg = document.getElementById("glossaryEmptyMsg");
  const addGlossaryRowBtn = document.getElementById("addGlossaryRowBtn");
  const clearGlossaryBtn = document.getElementById("clearGlossaryBtn");
  const presetItBtn = document.getElementById("presetItBtn");
  const presetAcademicBtn = document.getElementById("presetAcademicBtn");

  const IT_PRESETS = [
    { source: "Pipeline", target: "პაიპლაინი" },
    { source: "State Machine", target: "მდგომარეობის მანქანა" },
    { source: "Middleware", target: "Middleware" },
    { source: "Framework", target: "ფრეიმვორკი" },
    { source: "Backend", target: "ბექენდი" },
    { source: "Frontend", target: "ფრონტენდი" },
    { source: "Refactor", target: "რეფაქტორინგი" },
    { source: "Deploy", target: "დეპლოი" }
  ];

  const ACADEMIC_PRESETS = [
    { source: "Epistemology", target: "ეპისტემოლოგია" },
    { source: "Phenomenology", target: "ფენომენოლოგია" },
    { source: "Supersensible", target: "ზეგრძნობადი" },
    { source: "Dialectic", target: "დიალექტიკა" },
    { source: "Ontology", target: "ონტოლოგია" },
    { source: "Hermeneutics", target: "ჰერმენევტიკა" }
  ];

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function updateGlossaryEmptyState() {
    if (!glossaryTableBody || !glossaryEmptyMsg) return;
    const count = glossaryTableBody.querySelectorAll("tr").length;
    glossaryEmptyMsg.style.display = count === 0 ? "block" : "none";
  }

  function addGlossaryRow(source = "", target = "") {
    if (!glossaryTableBody) return null;
    const tr = document.createElement("tr");
    tr.className = "glossary-row";
    tr.innerHTML = `
      <td>
        <input type="text" class="glossary-input glossary-src" placeholder="მაგ. Pipeline" value="${escapeHtml(source)}">
      </td>
      <td>
        <input type="text" class="glossary-input glossary-tgt" placeholder="მაგ. პაიპლაინი" value="${escapeHtml(target)}">
      </td>
      <td style="text-align: center;">
        <button type="button" class="btn-delete-row" title="წაშლა">&times;</button>
      </td>
    `;

    const delBtn = tr.querySelector(".btn-delete-row");
    delBtn.addEventListener("click", () => {
      tr.remove();
      updateGlossaryEmptyState();
      checkPresetMatch();
    });

    glossaryTableBody.appendChild(tr);
    updateGlossaryEmptyState();
    return tr;
  }

  function checkPresetMatch() {
    const current = getGlossaryData();
    const isMatch = (preset) => {
      if (current.length !== preset.length) return false;
      return preset.every((p, idx) => 
        p.source.toLowerCase() === current[idx].source.toLowerCase() &&
        p.target.toLowerCase() === current[idx].target.toLowerCase()
      );
    };

    if (presetItBtn) {
      presetItBtn.classList.toggle("active", isMatch(IT_PRESETS));
    }
    if (presetAcademicBtn) {
      presetAcademicBtn.classList.toggle("active", isMatch(ACADEMIC_PRESETS));
    }
  }

  function renderGlossaryTable(entries) {
    if (!glossaryTableBody) return;
    glossaryTableBody.innerHTML = "";
    if (Array.isArray(entries) && entries.length > 0) {
      entries.forEach((item) => {
        if (item && (item.source || item.target)) {
          addGlossaryRow(item.source || "", item.target || "");
        }
      });
    }
    updateGlossaryEmptyState();
    checkPresetMatch();
  }

  function getGlossaryData() {
    if (!glossaryTableBody) return [];
    const rows = glossaryTableBody.querySelectorAll("tr");
    const result = [];
    rows.forEach((row) => {
      const src = row.querySelector(".glossary-src")?.value?.trim();
      const tgt = row.querySelector(".glossary-tgt")?.value?.trim();
      if (src && tgt) {
        result.push({ source: src, target: tgt });
      }
    });
    return result;
  }

  if (addGlossaryRowBtn) {
    addGlossaryRowBtn.addEventListener("click", () => {
      const newRow = addGlossaryRow();
      newRow?.querySelector(".glossary-src")?.focus();
      checkPresetMatch();
    });
  }

  if (glossaryTableBody) {
    glossaryTableBody.addEventListener("input", () => {
      checkPresetMatch();
    });
  }

  if (clearGlossaryBtn) {
    clearGlossaryBtn.addEventListener("click", () => {
      if (!glossaryTableBody || glossaryTableBody.querySelectorAll("tr").length === 0) return;
      if (confirm("დარწმუნებული ხართ, რომ გსურთ მთლიანი ლექსიკონის გასუფთავება?")) {
        glossaryTableBody.innerHTML = "";
        updateGlossaryEmptyState();
        checkPresetMatch();
      }
    });
  }

  function applyPreset(presetList) {
    if (glossaryTableBody) {
      glossaryTableBody.innerHTML = "";
    }
    presetList.forEach((item) => {
      addGlossaryRow(item.source, item.target);
    });
    updateGlossaryEmptyState();
    checkPresetMatch();
  }

  if (presetItBtn) {
    presetItBtn.addEventListener("click", () => {
      applyPreset(IT_PRESETS);
    });
  }

  if (presetAcademicBtn) {
    presetAcademicBtn.addEventListener("click", () => {
      applyPreset(ACADEMIC_PRESETS);
    });
  }

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
      customGlossary: [],
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
      renderGlossaryTable(items.customGlossary || []);
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
      customGlossary: getGlossaryData(),
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
