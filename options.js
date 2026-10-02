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
  const glossaryCategoryTabs = document.getElementById("glossaryCategoryTabs");
  const glossaryApplyMode = document.getElementById("glossaryApplyMode");
  const resetCategoryBtn = document.getElementById("resetCategoryBtn");
  const glossaryTableBody = document.getElementById("glossaryTableBody");
  const glossaryEmptyMsg = document.getElementById("glossaryEmptyMsg");
  const addGlossaryRowBtn = document.getElementById("addGlossaryRowBtn");
  const clearGlossaryBtn = document.getElementById("clearGlossaryBtn");

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

  const DEFAULT_CATEGORIES = {
    it: {
      id: "it",
      name: "💻 IT & Dev",
      isCustom: false,
      items: JSON.parse(JSON.stringify(IT_PRESETS))
    },
    academic: {
      id: "academic",
      name: "🎓 აკადემიური & ფილოსოფია",
      isCustom: false,
      items: JSON.parse(JSON.stringify(ACADEMIC_PRESETS))
    },
    custom: {
      id: "custom",
      name: "📝 ჩემი ლექსიკონი",
      isCustom: false,
      items: []
    }
  };

  let categoriesState = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  let currentCatId = "it";
  let applyModeState = "all";

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

  function getTableRowsData() {
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

  function saveCurrentCategoryFromDOM() {
    if (!categoriesState[currentCatId]) return;
    categoriesState[currentCatId].items = getTableRowsData();
    updateTabBadges();
  }

  function updateTabBadges() {
    Object.keys(categoriesState).forEach((catId) => {
      const badge = document.getElementById(`badge-${catId}`);
      if (badge && categoriesState[catId]) {
        badge.textContent = categoriesState[catId].items.length;
      }
    });
  }

  function renderCategoryTabs() {
    if (!glossaryCategoryTabs) return;
    glossaryCategoryTabs.innerHTML = "";

    const catIds = Object.keys(categoriesState);
    catIds.forEach((catId) => {
      const cat = categoriesState[catId];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `glossary-tab-btn ${catId === currentCatId ? "active" : ""}`;
      btn.dataset.catId = catId;
      btn.innerHTML = `
        <span>${escapeHtml(cat.name)}</span>
        <span class="glossary-count-badge" id="badge-${catId}">${cat.items.length}</span>
        ${cat.isCustom ? `<span class="del-cat-btn" title="კატეგორიის წაშლა">&times;</span>` : ""}
      `;

      btn.addEventListener("click", (e) => {
        if (e.target.classList.contains("del-cat-btn")) {
          e.stopPropagation();
          if (confirm(`წავშალოთ კატეგორია "${cat.name}"?`)) {
            delete categoriesState[catId];
            if (currentCatId === catId) {
              currentCatId = "it";
            }
            renderCategoryTabs();
            renderGlossaryTable(categoriesState[currentCatId]?.items || []);
          }
          return;
        }

        if (catId !== currentCatId) {
          saveCurrentCategoryFromDOM();
          currentCatId = catId;
          renderCategoryTabs();
          renderGlossaryTable(categoriesState[currentCatId]?.items || []);
        }
      });

      glossaryCategoryTabs.appendChild(btn);
    });

    // Add Category button
    const addCatBtn = document.createElement("button");
    addCatBtn.type = "button";
    addCatBtn.className = "glossary-tab-btn btn-add-category";
    addCatBtn.innerHTML = `<span>➕ ახალი კატეგორია</span>`;
    addCatBtn.addEventListener("click", () => {
      const name = prompt("შეიყვანეთ ახალი კატეგორიის სახელი (მაგ. 🔬 მედიცინა, ⚖️ სამართალი):");
      if (name && name.trim()) {
        saveCurrentCategoryFromDOM();
        const newId = "cat_" + Date.now();
        categoriesState[newId] = {
          id: newId,
          name: name.trim(),
          isCustom: true,
          items: []
        };
        currentCatId = newId;
        renderCategoryTabs();
        renderGlossaryTable([]);
      }
    });
    glossaryCategoryTabs.appendChild(addCatBtn);
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
      saveCurrentCategoryFromDOM();
    });

    glossaryTableBody.appendChild(tr);
    updateGlossaryEmptyState();
    return tr;
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
  }

  if (addGlossaryRowBtn) {
    addGlossaryRowBtn.addEventListener("click", () => {
      const newRow = addGlossaryRow();
      newRow?.querySelector(".glossary-src")?.focus();
      saveCurrentCategoryFromDOM();
    });
  }

  if (glossaryTableBody) {
    glossaryTableBody.addEventListener("input", () => {
      saveCurrentCategoryFromDOM();
    });
  }

  if (clearGlossaryBtn) {
    clearGlossaryBtn.addEventListener("click", () => {
      if (!glossaryTableBody || glossaryTableBody.querySelectorAll("tr").length === 0) return;
      if (confirm(`გავასუფთავოთ მიმდინარე კატეგორია?`)) {
        glossaryTableBody.innerHTML = "";
        updateGlossaryEmptyState();
        saveCurrentCategoryFromDOM();
      }
    });
  }

  if (resetCategoryBtn) {
    resetCategoryBtn.addEventListener("click", () => {
      if (currentCatId === "it") {
        categoriesState.it.items = JSON.parse(JSON.stringify(IT_PRESETS));
        renderGlossaryTable(categoriesState.it.items);
        updateTabBadges();
      } else if (currentCatId === "academic") {
        categoriesState.academic.items = JSON.parse(JSON.stringify(ACADEMIC_PRESETS));
        renderGlossaryTable(categoriesState.academic.items);
        updateTabBadges();
      } else {
        categoriesState[currentCatId].items = [];
        renderGlossaryTable([]);
        updateTabBadges();
      }
    });
  }

  if (glossaryApplyMode) {
    glossaryApplyMode.addEventListener("change", () => {
      applyModeState = glossaryApplyMode.value;
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
      glossaryCategories: null,
      glossaryActiveCategoryId: "it",
      glossaryApplyMode: "all",
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

      // Initialize Glossary Categories
      if (items.glossaryCategories && typeof items.glossaryCategories === "object" && Object.keys(items.glossaryCategories).length > 0) {
        categoriesState = items.glossaryCategories;
      } else if (Array.isArray(items.customGlossary) && items.customGlossary.length > 0) {
        // Upgrade from older flat customGlossary
        categoriesState.it.items = items.customGlossary;
      }

      if (items.glossaryActiveCategoryId && categoriesState[items.glossaryActiveCategoryId]) {
        currentCatId = items.glossaryActiveCategoryId;
      } else {
        currentCatId = "it";
      }

      if (items.glossaryApplyMode) {
        applyModeState = items.glossaryApplyMode;
        if (glossaryApplyMode) glossaryApplyMode.value = applyModeState;
      }

      renderCategoryTabs();
      renderGlossaryTable(categoriesState[currentCatId]?.items || []);
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
    saveCurrentCategoryFromDOM();

    // Calculate effective glossary for translation
    let effectiveGlossary = [];
    if (applyModeState === "active") {
      effectiveGlossary = categoriesState[currentCatId]?.items || [];
    } else {
      // Merge all categories without duplicates (case-insensitive source)
      const seen = new Set();
      Object.keys(categoriesState).forEach((catId) => {
        const cat = categoriesState[catId];
        if (cat && Array.isArray(cat.items)) {
          cat.items.forEach((item) => {
            if (item && item.source && item.target) {
              const key = item.source.trim().toLowerCase();
              if (!seen.has(key)) {
                seen.add(key);
                effectiveGlossary.push({ source: item.source.trim(), target: item.target.trim() });
              }
            }
          });
        }
      });
    }

    const newSettings = {
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
      targetLanguage: targetLangSelect.value,
      tone: toneSelect.value,
      showFloatingIcon: showFloatingIcon.checked,
      enableHoverOriginal: enableHoverOriginal ? enableHoverOriginal.checked : true,
      enableFailover: enableFailover.checked,
      customGlossary: effectiveGlossary,
      glossaryCategories: categoriesState,
      glossaryActiveCategoryId: currentCatId,
      glossaryApplyMode: applyModeState,
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
