// Gemini AI Translator - Content Script (Shadow DOM Isolated & Real-Time Streaming)

(function () {
  let shadowRoot = null;
  let hostElement = null;
  let floatingBtn = null;
  let bubbleElement = null;
  let currentSelectionText = "";
  let lastSelectionRect = null;
  let currentTranslatedText = "";
  let activeStreamPort = null;

  // Available languages for instant switching inside the bubble
  const LANGUAGES = [
    { code: "Georgian (ქართული)", label: "🇬🇪 ქართული" },
    { code: "English", label: "🇺🇸 English" },
    { code: "Russian (Русский)", label: "🇷🇺 Русский" },
    { code: "German (Deutsch)", label: "🇩🇪 Deutsch" },
    { code: "French (Français)", label: "🇫🇷 Français" },
    { code: "Spanish (Español)", label: "🇪🇸 Español" },
    { code: "Turkish (Türkçe)", label: "🇹🇷 Türkçe" },
    { code: "Italian (Italiano)", label: "🇮🇹 Italiano" },
    { code: "Ukrainian (Українська)", label: "🇺🇦 Українська" }
  ];

  // Safe check if extension runtime is still connected
  function isExtensionContextValid() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // Privacy Guard: checks if element is sensitive or password field
  function isSensitiveElement(node) {
    if (!node) return false;
    let current = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      if (
        current.tagName === "INPUT" &&
        (current.type === "password" || current.type === "hidden")
      ) {
        return true;
      }
      if (
        current.getAttribute("data-sensitive") === "true" ||
        current.getAttribute("data-private") === "true" ||
        current.getAttribute("data-vault") === "true" ||
        current.classList.contains("sensitive") ||
        current.classList.contains("password-field")
      ) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  // Initialize Shadow DOM Container
  function initHost() {
    if (!isExtensionContextValid()) return;
    if (hostElement && shadowRoot) return;

    hostElement = document.createElement("div");
    hostElement.id = "gemini-translator-root";
    document.documentElement.appendChild(hostElement);

    shadowRoot = hostElement.attachShadow({ mode: "open" });

    // Link external stylesheet
    const styleLink = document.createElement("link");
    styleLink.rel = "stylesheet";
    try {
      styleLink.href = chrome.runtime.getURL("content.css");
    } catch (e) {
      return;
    }
    shadowRoot.appendChild(styleLink);
  }

  // Gemini Sparkle SVG Icon
  const GEMINI_ICON_SVG = `
    <svg viewBox="0 0 24 24">
      <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
    </svg>
  `;

  // Listen for selection changes on page
  document.addEventListener("mouseup", (e) => {
    // If click was inside our own shadow DOM, don't close or reset
    if (hostElement && hostElement.contains(e.target)) return;

    setTimeout(() => {
      handleTextSelection(e);
    }, 15);
  });

  // Handle clicking outside to dismiss
  document.addEventListener("mousedown", (e) => {
    if (hostElement && hostElement.contains(e.target)) return;

    removeFloatingBtn();

    if (bubbleElement) {
      removeBubble();
    }
  });

  // Listen for Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      removeFloatingBtn();
      removeBubble();
    }
  });

  // Listen for Context Menu & Global Shortcut (Alt+T) triggers
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (
      request.action === "triggerContextMenuTranslation" ||
      request.action === "triggerShortcutTranslation"
    ) {
      initHost();
      const sel = window.getSelection();
      const text = request.selectedText || (sel ? sel.toString().trim() : "");

      if (text) {
        if (sel && sel.anchorNode && isSensitiveElement(sel.anchorNode)) {
          return;
        }
        currentSelectionText = text;
        let rect = null;
        if (sel && sel.rangeCount > 0) {
          rect = sel.getRangeAt(0).getBoundingClientRect();
        }
        showBubble(rect, text);
      }
    } else if (request.action === "triggerFullPageTranslation") {
      triggerFullPageTranslation();
    }
  });

  /**
   * Evaluates text selection and creates floating button
   */
  function handleTextSelection(e) {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";

    if (!text || text.length === 0) {
      removeFloatingBtn();
      return;
    }

    // Privacy Guard
    if (selection.anchorNode && isSensitiveElement(selection.anchorNode)) {
      removeFloatingBtn();
      return;
    }

    if (!isExtensionContextValid()) return;

    try {
      chrome.storage.sync.get({ showFloatingIcon: true }, (items) => {
        if (!isExtensionContextValid()) return;
        if (!items || !items.showFloatingIcon) return;

        currentSelectionText = text;

        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          lastSelectionRect = rect;

          if (bubbleElement && bubbleElement.dataset.sourceText === text) {
            return;
          }

          showFloatingBtn(rect);
        }
      });
    } catch (err) {
      // Tab needs page refresh after reload
    }
  }

  /**
   * Render floating Gemini button next to selection
   */
  function showFloatingBtn(rect) {
    initHost();
    removeFloatingBtn();

    floatingBtn = document.createElement("div");
    floatingBtn.className = "gemini-floating-btn";
    floatingBtn.title = "Translate with Gemini AI (Alt+T)";
    floatingBtn.innerHTML = GEMINI_ICON_SVG;

    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    let top = rect.bottom + scrollY + 6;
    let left = rect.right + scrollX + 4;

    if (left + 35 > window.innerWidth + scrollX) {
      left = window.innerWidth + scrollX - 35;
    }

    floatingBtn.style.top = `${top}px`;
    floatingBtn.style.left = `${left}px`;

    floatingBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });

    floatingBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFloatingBtn();
      showBubble(lastSelectionRect, currentSelectionText);
    });

    shadowRoot.appendChild(floatingBtn);
  }

  function removeFloatingBtn() {
    if (floatingBtn && floatingBtn.parentNode) {
      floatingBtn.parentNode.removeChild(floatingBtn);
      floatingBtn = null;
    }
  }

  /**
   * Show Translation Bubble with Real-Time Streaming
   */
  function showBubble(rect, textToTranslate, targetLangOverride) {
    initHost();
    removeBubble();
    removeFloatingBtn();

    bubbleElement = document.createElement("div");
    bubbleElement.className = "gemini-bubble";
    bubbleElement.dataset.sourceText = textToTranslate;

    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    let top = scrollY + 100;
    let left = scrollX + 50;

    if (rect) {
      top = rect.bottom + scrollY + 10;
      left = rect.left + scrollX;

      if (left + 490 > window.innerWidth + scrollX) {
        left = Math.max(10, window.innerWidth + scrollX - 500);
      }
      if (top + 350 > document.documentElement.scrollHeight) {
        top = Math.max(10, rect.top + scrollY - 320);
      }
    }

    bubbleElement.style.top = `${top}px`;
    bubbleElement.style.left = `${left}px`;

    if (!isExtensionContextValid()) {
      return;
    }

    try {
      chrome.storage.sync.get({ targetLanguage: "Georgian (ქართული)", model: "gemini-3.8-flash" }, (settings) => {
        if (!isExtensionContextValid()) return;
        const activeLang = targetLangOverride || settings.targetLanguage;
        const modelName = (settings.model === "gemini-2.0-flash" ? "3.8-flash" : settings.model).replace("gemini-", "");

        bubbleElement.innerHTML = `
          <div class="gemini-header">
            <div class="gemini-brand">
              ${GEMINI_ICON_SVG}
              <span class="gemini-title">Gemini Translate</span>
              <span class="gemini-badge">${modelName}</span>
            </div>
            <div class="gemini-controls">
              <select class="gemini-lang-select" id="geminiLangSelect">
                ${LANGUAGES.map(l => `<option value="${l.code}" ${l.code === activeLang ? "selected" : ""}>${l.label}</option>`).join("")}
              </select>
              <button class="gemini-close-btn" id="geminiCloseBtn" title="დახურვა (Esc)">&times;</button>
            </div>
          </div>

          <div class="gemini-content" id="geminiContent">
            <div class="gemini-loading">
              <div class="gemini-shimmer"></div>
              <div class="gemini-shimmer"></div>
              <div class="gemini-shimmer"></div>
              <div class="gemini-status-text">
                <span>✨ Gemini თარგმნის რეალურ დროში...</span>
              </div>
            </div>
          </div>

          <div class="gemini-footer">
            <div class="gemini-footer-actions">
              <button class="gemini-action-btn" id="geminiCopyBtn" title="თარგმანის კოპირება">
                <svg viewBox="0 0 24 24"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/></svg>
                <span>დაკოპირება</span>
              </button>
              <button class="gemini-action-btn" id="geminiSpeakBtn" title="გახმოვანება">
                <svg viewBox="0 0 24 24"><path d="M3 9V15H7L12 20V4L7 9H3ZM16.5 12C16.5 10.23 15.48 8.71 14 7.97V16.02C15.48 15.29 16.5 13.77 16.5 12ZM14 3.23V5.29C16.89 6.15 19 8.83 19 12C19 15.17 16.89 17.85 14 18.71V20.77C18.01 19.86 21 16.28 21 12C21 7.72 18.01 4.14 14 3.23Z"/></svg>
                <span>მოსმენა</span>
              </button>
            </div>
            <div id="geminiCopyStatus"></div>
          </div>
        `;

        shadowRoot.appendChild(bubbleElement);
        setupDraggable(bubbleElement);

        const closeBtn = bubbleElement.querySelector("#geminiCloseBtn");
        closeBtn.addEventListener("click", () => removeBubble());

        const langSelect = bubbleElement.querySelector("#geminiLangSelect");
        langSelect.addEventListener("change", (e) => {
          showBubble(rect, textToTranslate, e.target.value);
        });

        const copyBtn = bubbleElement.querySelector("#geminiCopyBtn");
        const copyStatus = bubbleElement.querySelector("#geminiCopyStatus");
        copyBtn.addEventListener("click", () => {
          if (!currentTranslatedText) return;
          navigator.clipboard.writeText(currentTranslatedText).then(() => {
            copyStatus.innerHTML = '<span class="gemini-copied-msg">✓ დაკოპირდა</span>';
            setTimeout(() => {
              if (copyStatus) copyStatus.innerHTML = "";
            }, 2000);
          });
        });

        const speakBtn = bubbleElement.querySelector("#geminiSpeakBtn");
        speakBtn.addEventListener("click", () => {
          if (!currentTranslatedText) return;
          const utterance = new SpeechSynthesisUtterance(currentTranslatedText);
          if (activeLang.includes("Georgian")) utterance.lang = "ka-GE";
          else if (activeLang.includes("English")) utterance.lang = "en-US";
          else if (activeLang.includes("Russian")) utterance.lang = "ru-RU";
          window.speechSynthesis.speak(utterance);
        });

        // Connect Real-Time Streaming Port
        try {
          activeStreamPort = chrome.runtime.connect({ name: "gemini-stream" });
          let streamedText = "";

          activeStreamPort.onMessage.addListener((msg) => {
            const contentArea = bubbleElement ? bubbleElement.querySelector("#geminiContent") : null;
            if (!contentArea) return;

            if (msg.type === "chunk") {
              streamedText = msg.accumulated || (streamedText + msg.text);
              contentArea.textContent = streamedText;
              currentTranslatedText = streamedText;

              // Immediately update badge if fallback occurred
              const badge = bubbleElement ? bubbleElement.querySelector(".gemini-badge") : null;
              if (badge && msg.model) {
                if (msg.isFallback) {
                  badge.textContent = `${msg.model.replace("gemini-", "")} (auto)`;
                  badge.style.background = "#fef3c7";
                  badge.style.color = "#b45309";
                } else {
                  badge.textContent = msg.model.replace("gemini-", "");
                }
              }

              // Smoothly scroll down as text streams in
              contentArea.scrollTop = contentArea.scrollHeight;
            } else if (msg.type === "done") {
              currentTranslatedText = streamedText || contentArea.textContent;
              const badge = bubbleElement ? bubbleElement.querySelector(".gemini-badge") : null;
              if (badge) {
                if (msg.isCached) {
                  badge.textContent = "⚡ ქეში (0ms)";
                  badge.style.background = "#dcfce7";
                  badge.style.color = "#15803d";
                } else if (msg.isFallback) {
                  badge.textContent = `${msg.model.replace("gemini-", "")} (auto)`;
                } else if (msg.model) {
                  badge.textContent = msg.model.replace("gemini-", "");
                }
              }
            } else if (msg.type === "error") {
              const isNoKey = msg?.code === "NO_API_KEY" || msg?.code === "INVALID_API_KEY";
              contentArea.innerHTML = `
                <div class="gemini-error">
                  <div>⚠️ ${msg.error || "თარგმნა ვერ მოხერხდა."}</div>
                  ${isNoKey ? `<button class="gemini-error-action-btn" id="openSettingsBtn">⚙️ პარამეტრების გახსნა</button>` : ""}
                </div>
              `;
              if (isNoKey) {
                const sBtn = contentArea.querySelector("#openSettingsBtn");
                if (sBtn) {
                  sBtn.addEventListener("click", () => chrome.runtime.sendMessage({ action: "openOptions" }));
                }
              }
            }
          });

          activeStreamPort.postMessage({
            action: "streamTranslate",
            text: textToTranslate,
            targetLang: activeLang
          });
        } catch (portErr) {
          console.warn("Stream connection fallback:", portErr);
        }
      });
    } catch (err) {
      // Tab needs page refresh
    }
  }

  function removeBubble() {
    if (activeStreamPort) {
      try {
        activeStreamPort.disconnect();
      } catch (e) {}
      activeStreamPort = null;
    }
    if (bubbleElement && bubbleElement.parentNode) {
      bubbleElement.parentNode.removeChild(bubbleElement);
      bubbleElement = null;
      currentTranslatedText = "";
    }
  }

  /**
   * Enables dragging the translation bubble by its header
   */
  function setupDraggable(element) {
    const header = element.querySelector(".gemini-header");
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "SELECT" || e.target.tagName === "BUTTON") return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = element.offsetLeft;
      initialTop = element.offsetTop;

      function onMouseMove(moveEvent) {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        element.style.left = `${initialLeft + dx}px`;
        element.style.top = `${initialTop + dy}px`;
      }

      function onMouseUp() {
        isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  // ==========================================
  // FULL WEBPAGE TRANSLATION ENGINE
  // ==========================================
  let pageTranslationActive = false;
  let pageBannerElement = null;
  const originalNodeValues = new WeakMap();
  const translatedNodeValues = new WeakMap();
  let allTrackedNodes = [];
  let isPageShowingOriginal = false;
  let abortPageTranslation = false;

  function triggerFullPageTranslation() {
    initHost();
    if (pageTranslationActive && pageBannerElement) {
      pageBannerElement.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    startFullPageTranslation();
  }

  function getTranslatableNodes(root) {
    const IGNORED_TAGS = new Set([
      "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
      "CODE", "PRE", "SVG", "KBD", "SAMP", "AUDIO", "VIDEO", "CANVAS", "IFRAME"
    ]);

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (hostElement && hostElement.contains(node)) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (IGNORED_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest("[translate='no'], .notranslate, #gemini-translator-root")) {
            return NodeFilter.FILTER_REJECT;
          }

          const val = node.nodeValue.trim();
          if (!val || /^[\d\s\p{P}]+$/u.test(val)) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      nodes.push(n);
    }
    return nodes;
  }

  function chunkNodesIntoBatches(nodes, maxBatchSize = 25, maxChars = 2500) {
    const batches = [];
    let currentBatch = [];
    let currentChars = 0;

    for (const node of nodes) {
      const len = node.nodeValue.length;
      if (currentBatch.length >= maxBatchSize || (currentChars + len > maxChars && currentBatch.length > 0)) {
        batches.push(currentBatch);
        currentBatch = [];
        currentChars = 0;
      }
      currentBatch.push(node);
      currentChars += len;
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    return batches;
  }

  function removePageBanner() {
    if (pageBannerElement && pageBannerElement.parentNode) {
      pageBannerElement.parentNode.removeChild(pageBannerElement);
      pageBannerElement = null;
    }
    pageTranslationActive = false;
  }

  async function startFullPageTranslation() {
    if (!isExtensionContextValid()) {
      return;
    }

    removeBubble();
    removePageBanner();

    pageBannerElement = document.createElement("div");
    pageBannerElement.className = "gemini-page-banner";
    pageBannerElement.innerHTML = `
      <div class="gemini-page-banner-left">
        ${GEMINI_ICON_SVG}
        <span class="gemini-page-title">Gemini Translate</span>
        <span class="gemini-page-status" id="geminiPageStatus">გვერდი სკანირდება...</span>
      </div>
      <div class="gemini-page-banner-mid" id="geminiPageProgressArea">
        <div class="gemini-page-progress-bar">
          <div class="gemini-page-progress-fill" id="geminiPageProgressFill" style="width: 0%;"></div>
        </div>
        <span class="gemini-page-pct" id="geminiPagePct">0%</span>
      </div>
      <div class="gemini-page-banner-actions">
        <button class="gemini-banner-btn" id="geminiToggleOriginalBtn" style="display: none;">ორიგინალის ჩვენება</button>
        <button class="gemini-banner-btn danger" id="geminiCancelPageBtn">გაუქმება</button>
        <button class="gemini-banner-close" id="geminiCloseBannerBtn" title="დახურვა">&times;</button>
      </div>
    `;

    shadowRoot.appendChild(pageBannerElement);

    const statusEl = pageBannerElement.querySelector("#geminiPageStatus");
    const progressArea = pageBannerElement.querySelector("#geminiPageProgressArea");
    const fillEl = pageBannerElement.querySelector("#geminiPageProgressFill");
    const pctEl = pageBannerElement.querySelector("#geminiPagePct");
    const toggleBtn = pageBannerElement.querySelector("#geminiToggleOriginalBtn");
    const cancelBtn = pageBannerElement.querySelector("#geminiCancelPageBtn");
    const closeBtn = pageBannerElement.querySelector("#geminiCloseBannerBtn");

    closeBtn.addEventListener("click", () => {
      removePageBanner();
    });

    cancelBtn.addEventListener("click", () => {
      abortPageTranslation = true;
      for (const n of allTrackedNodes) {
        if (originalNodeValues.has(n)) {
          n.nodeValue = originalNodeValues.get(n);
        }
      }
      removePageBanner();
    });

    const nodes = getTranslatableNodes(document.body);
    if (!nodes || nodes.length === 0) {
      statusEl.textContent = "სათარგმნი ტექსტი ვერ მოიძებნა.";
      progressArea.style.display = "none";
      setTimeout(removePageBanner, 2500);
      return;
    }

    abortPageTranslation = false;
    pageTranslationActive = true;
    allTrackedNodes = nodes;
    isPageShowingOriginal = false;

    for (const node of nodes) {
      if (!originalNodeValues.has(node)) {
        originalNodeValues.set(node, node.nodeValue);
      }
    }

    const batches = chunkNodesIntoBatches(nodes, 25, 2500);
    const totalBatches = batches.length;
    let completedBatches = 0;

    statusEl.textContent = `სათარგმნია ${totalBatches} ბლოკი (${nodes.length} ტექსტი)...`;

    const settings = await chrome.storage.sync.get({ targetLanguage: "Georgian (ქართული)" });
    const targetLanguage = settings.targetLanguage || "Georgian (ქართული)";

    let currentBatchIdx = 0;

    async function processWorker() {
      while (currentBatchIdx < batches.length && !abortPageTranslation) {
        const bIdx = currentBatchIdx++;
        const currentBatch = batches[bIdx];
        const texts = currentBatch.map((n) => n.nodeValue);

        try {
          const res = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              {
                action: "translateBatch",
                texts: texts,
                targetLang: targetLanguage
              },
              (response) => resolve(response)
            );
          });

          if (abortPageTranslation) break;

          if (res && res.success && Array.isArray(res.translations)) {
            for (let i = 0; i < currentBatch.length; i++) {
              const trans = res.translations[i];
              if (trans && typeof trans === "string") {
                currentBatch[i].nodeValue = trans;
                translatedNodeValues.set(currentBatch[i], trans);
              }
            }
          }
        } catch (batchErr) {
          console.warn("Batch translation error:", batchErr);
        }

        completedBatches++;
        const pct = Math.round((completedBatches / totalBatches) * 100);
        fillEl.style.width = `${pct}%`;
        pctEl.textContent = `${pct}%`;
        statusEl.textContent = `ითარგმნება... ${pct}% (${completedBatches}/${totalBatches})`;
      }
    }

    // Run up to 2 concurrent batch workers
    await Promise.all([processWorker(), processWorker()]);

    if (abortPageTranslation) return;

    // Completed successfully
    statusEl.textContent = "✓ მთლიანი გვერდი ნათარგმნია ქართულად";
    statusEl.style.color = "#16a34a";
    statusEl.style.fontWeight = "600";
    fillEl.style.width = "100%";
    pctEl.textContent = "100%";

    setTimeout(() => {
      if (progressArea) progressArea.style.display = "none";
    }, 1200);

    cancelBtn.style.display = "none";
    toggleBtn.style.display = "inline-flex";
    toggleBtn.textContent = "ორიგინალის ჩვენება";

    toggleBtn.addEventListener("click", () => {
      if (!isPageShowingOriginal) {
        for (const n of allTrackedNodes) {
          if (originalNodeValues.has(n)) {
            n.nodeValue = originalNodeValues.get(n);
          }
        }
        toggleBtn.textContent = "ქართულად დაბრუნება";
        toggleBtn.classList.add("primary");
        statusEl.textContent = "ორიგინალი აღდგენილია";
        statusEl.style.color = "#64748b";
        isPageShowingOriginal = true;
      } else {
        for (const n of allTrackedNodes) {
          if (translatedNodeValues.has(n)) {
            n.nodeValue = translatedNodeValues.get(n);
          }
        }
        toggleBtn.textContent = "ორიგინალის ჩვენება";
        toggleBtn.classList.remove("primary");
        statusEl.textContent = "✓ მთლიანი გვერდი ნათარგმნია ქართულად";
        statusEl.style.color = "#16a34a";
        isPageShowingOriginal = false;
      }
    });
  }
})();
