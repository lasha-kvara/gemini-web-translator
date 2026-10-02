// Gemini AI Bilingual PDF Reader - Core Logic (Option B)

(function () {
  "use strict";

  // PDF.js Worker Configuration (Local offline MV3 file)
  if (window.pdfjsLib) {
    const workerPath = typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("lib/pdf.worker.min.js")
      : "lib/pdf.worker.min.js";
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
  }

  // Application State
  const state = {
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    scale: 1.15,
    fitWidth: false,
    renderTask: null,
    fileName: "",
    currentParagraphs: [], // Array of strings (original text of current page)
    pageTranslations: new Map(), // pageNum -> Array of { original, translation }
    autoTranslate: false,
    targetLang: "Georgian (ქართული)",
    model: "gemini-3.8-flash",
    isTranslating: false,
    streamPort: null
  };

  // DOM Elements
  const openFileBtn = document.getElementById("openFileBtn");
  const browseBtn = document.getElementById("browseBtn");
  const pdfFileInput = document.getElementById("pdfFileInput");
  const docTitle = document.getElementById("docTitle");
  const dropZone = document.getElementById("dropZone");
  const splitViewer = document.getElementById("splitViewer");

  // Navigation & Zoom
  const navControls = document.getElementById("navControls");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageNumInput = document.getElementById("pageNumInput");
  const pageCountSpan = document.getElementById("pageCount");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomLevelSpan = document.getElementById("zoomLevel");
  const fitWidthBtn = document.getElementById("fitWidthBtn");

  // Header Right
  const readerLangSelect = document.getElementById("readerLangSelect");
  const readerModelBadge = document.getElementById("readerModelBadge");
  const readerOptionsBtn = document.getElementById("readerOptionsBtn");

  // Left Pane (PDF)
  const pdfPane = document.getElementById("pdfPane");
  const pdfScrollContainer = document.getElementById("pdfScrollContainer");
  const pdfCanvasWrapper = document.getElementById("pdfCanvasWrapper");
  const pdfCanvas = document.getElementById("pdfCanvas");
  const pdfTextLayer = document.getElementById("pdfTextLayer");
  const pdfSelectionBubble = document.getElementById("pdfSelectionBubble");
  const bubbleContent = document.getElementById("bubbleContent");
  const bubbleCopyBtn = document.getElementById("bubbleCopyBtn");
  const bubbleCloseBtn = document.getElementById("bubbleCloseBtn");
  const bubbleModelInfo = document.getElementById("bubbleModelInfo");

  // Divider Resizer
  const paneResizer = document.getElementById("paneResizer");
  const transPane = document.getElementById("transPane");

  // Right Pane (Translation)
  const autoTranslateToggle = document.getElementById("autoTranslateToggle");
  const copyAllTransBtn = document.getElementById("copyAllTransBtn");
  const retranslateBtn = document.getElementById("retranslateBtn");
  const translatePageBtn = document.getElementById("translatePageBtn");
  const transProgressBar = document.getElementById("transProgressBar");
  const transProgressFill = document.getElementById("transProgressFill");
  const transEmptyState = document.getElementById("transEmptyState");
  const emptyTranslateBtn = document.getElementById("emptyTranslateBtn");
  const transParagraphsList = document.getElementById("transParagraphsList");
  const transStatusIndicator = document.getElementById("transStatusIndicator");

  // ----------------------------------------------------
  // Initialization & Settings Sync
  // ----------------------------------------------------
  function initSettings() {
    chrome.storage.sync.get(
      {
        targetLanguage: "Georgian (ქართული)",
        model: "gemini-3.8-flash",
        readerAutoTranslate: false
      },
      (items) => {
        state.targetLang = items.targetLanguage || "Georgian (ქართული)";
        state.model = items.model || "gemini-3.8-flash";
        state.autoTranslate = Boolean(items.readerAutoTranslate);

        if (readerLangSelect) readerLangSelect.value = state.targetLang;
        if (readerModelBadge) readerModelBadge.textContent = state.model.replace("gemini-", "");
        if (autoTranslateToggle) autoTranslateToggle.checked = state.autoTranslate;
      }
    );

    // Listen for options changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync") {
        if (changes.targetLanguage) {
          state.targetLang = changes.targetLanguage.newValue;
          if (readerLangSelect) readerLangSelect.value = state.targetLang;
        }
        if (changes.model) {
          state.model = changes.model.newValue;
          if (readerModelBadge) readerModelBadge.textContent = state.model.replace("gemini-", "");
        }
      }
    });
  }

  // ----------------------------------------------------
  // File Loading (Input & Drag and Drop)
  // ----------------------------------------------------
  function setupFileHandlers() {
    openFileBtn.addEventListener("click", () => pdfFileInput.click());
    browseBtn.addEventListener("click", () => pdfFileInput.click());

    pdfFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file && file.type === "application/pdf") {
        loadPdfFile(file);
      }
    });

    // Drag & Drop
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => e.preventDefault());

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.querySelector(".dropzone-card")?.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.querySelector(".dropzone-card")?.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.querySelector(".dropzone-card")?.classList.remove("drag-over");
      const file = e.dataTransfer?.files?.[0];
      if (file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
        loadPdfFile(file);
      }
    });
  }

  function loadPdfFile(file) {
    state.fileName = file.name;
    docTitle.textContent = file.name;
    docTitle.title = file.name;

    const reader = new FileReader();
    reader.onload = async function () {
      const typedarray = new Uint8Array(this.result);
      try {
        const loadingTask = window.pdfjsLib.getDocument({ data: typedarray });
        state.pdfDoc = await loadingTask.promise;
        state.totalPages = state.pdfDoc.numPages;
        state.currentPage = 1;
        state.pageTranslations.clear();

        // Check if there was a saved last page for this document
        const savedPage = localStorage.getItem("gemini_reader_page_" + file.name);
        if (savedPage) {
          const p = parseInt(savedPage, 10);
          if (p >= 1 && p <= state.totalPages) {
            state.currentPage = p;
          }
        }

        // Switch UI from Dropzone to Split Viewer
        dropZone.style.display = "none";
        splitViewer.style.display = "flex";
        navControls.style.visibility = "visible";
        pageCountSpan.textContent = state.totalPages;
        pageNumInput.max = state.totalPages;
        pageNumInput.value = state.currentPage;

        updatePaginationButtons();
        renderCurrentPage();
      } catch (err) {
        alert("PDF ფაილის გახსნა ვერ მოხერხდა: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ----------------------------------------------------
  // PDF Rendering with DevicePixelRatio & TextLayer
  // ----------------------------------------------------
  async function renderCurrentPage() {
    if (!state.pdfDoc) return;

    if (state.renderTask) {
      try {
        state.renderTask.cancel();
      } catch (e) {}
    }

    pageNumInput.value = state.currentPage;
    localStorage.setItem("gemini_reader_page_" + state.fileName, state.currentPage);
    updatePaginationButtons();
    closeSelectionBubble();

    try {
      const page = await state.pdfDoc.getPage(state.currentPage);

      // Scale calculation
      let currentScale = state.scale;
      if (state.fitWidth) {
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const containerWidth = pdfScrollContainer.clientWidth - 48;
        if (containerWidth > 200) {
          currentScale = containerWidth / unscaledViewport.width;
        }
      }
      zoomLevelSpan.textContent = Math.round(currentScale * 100) + "%";

      const viewport = page.getViewport({ scale: currentScale });
      const dpr = window.devicePixelRatio || 1;

      // HiDPI Canvas setup
      pdfCanvas.width = Math.floor(viewport.width * dpr);
      pdfCanvas.height = Math.floor(viewport.height * dpr);
      pdfCanvas.style.width = Math.floor(viewport.width) + "px";
      pdfCanvas.style.height = Math.floor(viewport.height) + "px";

      pdfCanvasWrapper.style.width = Math.floor(viewport.width) + "px";
      pdfCanvasWrapper.style.height = Math.floor(viewport.height) + "px";

      const ctx = pdfCanvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      state.renderTask = page.render(renderContext);
      await state.renderTask.promise;

      // Setup Text Layer
      pdfTextLayer.innerHTML = "";
      pdfTextLayer.style.width = Math.floor(viewport.width) + "px";
      pdfTextLayer.style.height = Math.floor(viewport.height) + "px";
      pdfTextLayer.style.setProperty("--scale-factor", viewport.scale);

      const textContent = await page.getTextContent();
      if (window.pdfjsLib.renderTextLayer) {
        window.pdfjsLib.renderTextLayer({
          textContentSource: textContent,
          container: pdfTextLayer,
          viewport: viewport
        });
      }

      // Extract paragraphs for Translation Pane
      state.currentParagraphs = extractParagraphs(textContent);

      // Check if page already has translation
      if (state.pageTranslations.has(state.currentPage)) {
        renderParagraphCards(state.pageTranslations.get(state.currentPage));
      } else {
        if (state.autoTranslate && state.currentParagraphs.length > 0) {
          translatePageAction(false);
        } else {
          showEmptyTranslationState();
        }
      }
    } catch (err) {
      if (err.name !== "RenderingCancelledException") {
        console.warn("PDF Page render error:", err);
      }
    }
  }

  // ----------------------------------------------------
  // Smart Paragraph Reconstruction from PDF Items
  // ----------------------------------------------------
  function extractParagraphs(textContent) {
    const items = textContent?.items || [];
    if (items.length === 0) return [];

    const rawParagraphs = [];
    let currentPara = "";
    let lastY = null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const text = item.str || "";
      if (!text && !item.hasEOL) continue;

      const y = item.transform ? item.transform[5] : 0;

      // Check for significant line jump (new paragraph / section)
      if (lastY !== null && Math.abs(y - lastY) > 18) {
        if (currentPara.trim().length > 0) {
          rawParagraphs.push(currentPara.trim());
          currentPara = "";
        }
      }

      if (currentPara && !currentPara.endsWith(" ") && !text.startsWith(" ")) {
        currentPara += " ";
      }
      currentPara += text;

      if (item.hasEOL) {
        currentPara += " ";
      }
      lastY = y;
    }

    if (currentPara.trim().length > 0) {
      rawParagraphs.push(currentPara.trim());
    }

    // Clean up: join hyphenated line breaks, discard single-char headers/footers
    const result = [];
    for (let p of rawParagraphs) {
      p = p.replace(/(\w+)-\s+(\w+)/g, "$1$2"); // Un-hyphenate words broken by line-wrap
      p = p.replace(/\s+/g, " ").trim();
      // Ignore standalone page numbers or 1-character artifacts
      if (p.length > 2) {
        result.push(p);
      }
    }

    return result;
  }

  // ----------------------------------------------------
  // Translation Logic (Batch & Streaming)
  // ----------------------------------------------------
  async function translatePageAction(bypassCache = false) {
    if (!state.currentParagraphs || state.currentParagraphs.length === 0) {
      alert("ამ გვერდზე სათარგმნი ტექსტი ვერ მოიძებნა (შესაძლოა სკანირებული გამოსახულებაა).");
      return;
    }

    if (state.isTranslating) return;
    state.isTranslating = true;

    // Show loading skeleton cards
    showSkeletonLoading(state.currentParagraphs.length);
    transProgressBar.style.display = "block";
    transProgressFill.style.width = "20%";
    if (transStatusIndicator) transStatusIndicator.style.background = "#f59e0b";

    try {
      // Send batch request to background service worker
      chrome.runtime.sendMessage(
        {
          action: "translateBatch",
          texts: state.currentParagraphs,
          targetLang: state.targetLang,
          bypassCache: bypassCache
        },
        (response) => {
          state.isTranslating = false;
          transProgressBar.style.display = "none";
          transProgressFill.style.width = "0%";
          if (transStatusIndicator) transStatusIndicator.style.background = "#16a34a";

          if (response && response.success && Array.isArray(response.translations)) {
            const paired = state.currentParagraphs.map((orig, idx) => ({
              original: orig,
              translation: response.translations[idx] || orig
            }));

            state.pageTranslations.set(state.currentPage, paired);
            renderParagraphCards(paired);

            if (readerModelBadge && response.model) {
              readerModelBadge.textContent = response.model.replace("gemini-", "");
            }
          } else {
            showEmptyTranslationState();
            const err = response?.error || "თარგმნისას დაფიქსირდა შეცდომა.";
            alert("შეცდომა: " + err);
          }
        }
      );
    } catch (e) {
      state.isTranslating = false;
      transProgressBar.style.display = "none";
      alert("კავშირის შეცდომა: " + e.message);
    }
  }

  function showSkeletonLoading(count) {
    transEmptyState.style.display = "none";
    transParagraphsList.style.display = "flex";
    transParagraphsList.innerHTML = "";

    const displayCount = Math.min(count, 8);
    for (let i = 0; i < displayCount; i++) {
      const skel = document.createElement("div");
      skel.className = "skeleton-card";
      skel.innerHTML = `
        <div class="skeleton-line" style="width: 25%;"></div>
        <div class="skeleton-line" style="width: 95%;"></div>
        <div class="skeleton-line" style="width: 85%;"></div>
        <div class="skeleton-line" style="width: 60%;"></div>
      `;
      transParagraphsList.appendChild(skel);
    }
  }

  function showEmptyTranslationState() {
    transParagraphsList.style.display = "none";
    transEmptyState.style.display = "flex";
  }

  function renderParagraphCards(pairedItems) {
    transEmptyState.style.display = "none";
    transParagraphsList.style.display = "flex";
    transParagraphsList.innerHTML = "";

    pairedItems.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "para-card";
      card.dataset.index = index;

      card.innerHTML = `
        <div class="para-card-header">
          <span class="para-badge">§ ${index + 1}</span>
          <div class="para-actions">
            <button class="para-btn btn-toggle-orig" title="ორიგინალი ტექსტის ნახვა">👁️ ორიგინალი</button>
            <button class="para-btn btn-copy-para" title="თარგმანის კოპირება">📋 კოპირება</button>
            <button class="para-btn btn-retry-para" title="ამ პარაგრაფის თავიდან თარგმნა">🔄</button>
          </div>
        </div>
        <div class="para-translation">${escapeHtml(item.translation)}</div>
        <div class="para-original-box">${escapeHtml(item.original)}</div>
      `;

      // Event: Toggle Original Box
      const toggleBtn = card.querySelector(".btn-toggle-orig");
      const origBox = card.querySelector(".para-original-box");
      toggleBtn.addEventListener("click", () => {
        origBox.classList.toggle("open");
        toggleBtn.style.color = origBox.classList.contains("open") ? "#4f46e5" : "";
      });

      // Event: Copy Paragraph Translation
      const copyBtn = card.querySelector(".btn-copy-para");
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(item.translation).then(() => {
          const old = copyBtn.textContent;
          copyBtn.textContent = "✓";
          setTimeout(() => (copyBtn.textContent = old), 1500);
        });
      });

      // Event: Re-translate Single Paragraph
      const retryBtn = card.querySelector(".btn-retry-para");
      retryBtn.addEventListener("click", () => {
        retrySingleParagraph(index, item.original, card);
      });

      transParagraphsList.appendChild(card);
    });
  }

  function retrySingleParagraph(index, originalText, cardElement) {
    const transDiv = cardElement.querySelector(".para-translation");
    const retryBtn = cardElement.querySelector(".btn-retry-para");
    retryBtn.disabled = true;
    transDiv.textContent = "✨ ხელახლა ითარგმნება...";

    try {
      const port = chrome.runtime.connect({ name: "gemini-stream" });
      let streamed = "";

      port.onMessage.addListener((msg) => {
        if (msg.type === "chunk") {
          streamed = msg.accumulated || (streamed + msg.text);
          transDiv.textContent = streamed;
        } else if (msg.type === "done") {
          retryBtn.disabled = false;
          // Update cached pair
          const cached = state.pageTranslations.get(state.currentPage);
          if (cached && cached[index]) {
            cached[index].translation = streamed || transDiv.textContent;
          }
        } else if (msg.type === "error") {
          retryBtn.disabled = false;
          transDiv.innerHTML = `<span style="color:#dc2626;">⚠️ ${msg.error}</span>`;
        }
      });

      port.postMessage({
        action: "streamTranslate",
        text: originalText,
        targetLang: state.targetLang,
        bypassCache: true
      });
    } catch (err) {
      retryBtn.disabled = false;
      transDiv.textContent = "კავშირის შეცდომა.";
    }
  }

  // ----------------------------------------------------
  // Floating Selection Translation Bubble (Left Pane)
  // ----------------------------------------------------
  function setupSelectionBubble() {
    pdfPane.addEventListener("mouseup", (e) => {
      // Small timeout to allow browser selection to settle
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : "";

        // If clicked inside the bubble itself, do not close or retrigger
        if (pdfSelectionBubble.contains(e.target)) return;

        if (text && text.length > 1) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const paneRect = pdfPane.getBoundingClientRect();

          // Calculate bubble coordinates relative to pdfPane
          let top = rect.bottom - paneRect.top + 8;
          let left = rect.left - paneRect.left;

          // Guard boundaries
          if (left + 330 > paneRect.width) {
            left = paneRect.width - 340;
          }
          if (left < 10) left = 10;
          if (top + 200 > paneRect.height) {
            top = rect.top - paneRect.top - 180;
          }

          pdfSelectionBubble.style.top = `${Math.max(10, top)}px`;
          pdfSelectionBubble.style.left = `${Math.max(10, left)}px`;
          pdfSelectionBubble.style.display = "flex";

          streamTranslateBubbleText(text);
        } else {
          closeSelectionBubble();
        }
      }, 50);
    });

    bubbleCloseBtn.addEventListener("click", () => closeSelectionBubble());

    bubbleCopyBtn.addEventListener("click", () => {
      const textToCopy = bubbleContent.textContent;
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          bubbleCopyBtn.textContent = "✓";
          setTimeout(() => (bubbleCopyBtn.textContent = "📋"), 1500);
        });
      }
    });
  }

  function closeSelectionBubble() {
    pdfSelectionBubble.style.display = "none";
    if (state.streamPort) {
      try {
        state.streamPort.disconnect();
      } catch (e) {}
      state.streamPort = null;
    }
  }

  function streamTranslateBubbleText(text) {
    bubbleContent.textContent = "✨ ითარგმნება...";
    bubbleModelInfo.textContent = state.model.replace("gemini-", "");

    if (state.streamPort) {
      try {
        state.streamPort.disconnect();
      } catch (e) {}
    }

    try {
      state.streamPort = chrome.runtime.connect({ name: "gemini-stream" });
      let streamed = "";

      state.streamPort.onMessage.addListener((msg) => {
        if (msg.type === "chunk") {
          streamed = msg.accumulated || (streamed + msg.text);
          bubbleContent.textContent = streamed;
        } else if (msg.type === "done") {
          bubbleModelInfo.textContent = msg.isCached ? "⚡ ქეში" : msg.model.replace("gemini-", "");
        } else if (msg.type === "error") {
          bubbleContent.innerHTML = `<span style="color:#ef4444;">⚠️ ${msg.error}</span>`;
        }
      });

      state.streamPort.postMessage({
        action: "streamTranslate",
        text: text,
        targetLang: state.targetLang
      });
    } catch (e) {
      bubbleContent.textContent = "კავშირის შეცდომა.";
    }
  }

  // ----------------------------------------------------
  // Draggable Divider Resizer
  // ----------------------------------------------------
  function setupResizer() {
    let isDragging = false;

    paneResizer.addEventListener("mousedown", (e) => {
      isDragging = true;
      paneResizer.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const totalWidth = splitViewer.clientWidth;
      const mouseX = e.clientX;
      const minWidth = 280;

      if (mouseX > minWidth && mouseX < totalWidth - minWidth) {
        const leftPercent = (mouseX / totalWidth) * 100;
        pdfPane.style.flex = `0 0 ${leftPercent}%`;
        transPane.style.flex = `0 0 ${100 - leftPercent}%`;
      }
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        paneResizer.classList.remove("dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    });
  }

  // ----------------------------------------------------
  // UI Event Handlers (Pagination, Zoom, Actions)
  // ----------------------------------------------------
  function setupUIEvents() {
    // Pagination
    prevPageBtn.addEventListener("click", () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderCurrentPage();
      }
    });

    nextPageBtn.addEventListener("click", () => {
      if (state.currentPage < state.totalPages) {
        state.currentPage++;
        renderCurrentPage();
      }
    });

    pageNumInput.addEventListener("change", () => {
      let val = parseInt(pageNumInput.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > state.totalPages) val = state.totalPages;
      state.currentPage = val;
      renderCurrentPage();
    });

    // Zoom Controls
    zoomInBtn.addEventListener("click", () => {
      state.fitWidth = false;
      state.scale = Math.min(3.0, state.scale + 0.15);
      renderCurrentPage();
    });

    zoomOutBtn.addEventListener("click", () => {
      state.fitWidth = false;
      state.scale = Math.max(0.5, state.scale - 0.15);
      renderCurrentPage();
    });

    fitWidthBtn.addEventListener("click", () => {
      state.fitWidth = !state.fitWidth;
      fitWidthBtn.style.color = state.fitWidth ? "#4f46e5" : "";
      renderCurrentPage();
    });

    // Target Language change
    readerLangSelect.addEventListener("change", () => {
      state.targetLang = readerLangSelect.value;
      // Re-translate if translation is currently shown
      if (state.pageTranslations.has(state.currentPage)) {
        translatePageAction(true);
      }
    });

    // Auto Translate toggle
    autoTranslateToggle.addEventListener("change", () => {
      state.autoTranslate = autoTranslateToggle.checked;
      chrome.storage.sync.set({ readerAutoTranslate: state.autoTranslate });
      if (state.autoTranslate && !state.pageTranslations.has(state.currentPage)) {
        translatePageAction(false);
      }
    });

    // Translation Buttons
    translatePageBtn.addEventListener("click", () => translatePageAction(false));
    emptyTranslateBtn.addEventListener("click", () => translatePageAction(false));
    retranslateBtn.addEventListener("click", () => translatePageAction(true));

    // Copy All Translation of Current Page
    copyAllTransBtn.addEventListener("click", () => {
      const items = state.pageTranslations.get(state.currentPage);
      if (!items || items.length === 0) {
        alert("ჯერ არ არის ნათარგმნი ტექსტი დასაკოპირებლად.");
        return;
      }
      const fullText = items.map((i) => i.translation).join("\n\n");
      navigator.clipboard.writeText(fullText).then(() => {
        const oldText = copyAllTransBtn.textContent;
        copyAllTransBtn.textContent = "✓ დაკოპირდა!";
        setTimeout(() => (copyAllTransBtn.textContent = oldText), 1500);
      });
    });

    // Options Button
    readerOptionsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      if (document.activeElement === pageNumInput) return;

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        if (state.currentPage > 1) {
          state.currentPage--;
          renderCurrentPage();
        }
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        if (state.currentPage < state.totalPages) {
          state.currentPage++;
          renderCurrentPage();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomInBtn.click();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        zoomOutBtn.click();
      }
    });
  }

  function updatePaginationButtons() {
    prevPageBtn.disabled = state.currentPage <= 1;
    nextPageBtn.disabled = state.currentPage >= state.totalPages;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ----------------------------------------------------
  // DOM Ready Entry Point
  // ----------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    initSettings();
    setupFileHandlers();
    setupUIEvents();
    setupResizer();
    setupSelectionBubble();
  });
})();
