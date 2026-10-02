// Popup UI Logic

document.addEventListener("DOMContentLoaded", () => {
  const openOptionsBtn = document.getElementById("openOptionsBtn");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const modelBadge = document.getElementById("modelBadge");

  const inputText = document.getElementById("inputText");
  const quickLangSelect = document.getElementById("quickLangSelect");
  const quickTranslateBtn = document.getElementById("quickTranslateBtn");
  const resultArea = document.getElementById("resultArea");
  const resultContent = document.getElementById("resultContent");
  const quickCopyBtn = document.getElementById("quickCopyBtn");

  const popupThemeBtn = document.getElementById("popupThemeBtn");

  function applyTheme(theme) {
    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    if (popupThemeBtn) {
      popupThemeBtn.textContent = isDark ? "☀️" : "🌙";
      popupThemeBtn.title = isDark ? "ღია თემაზე გადართვა" : "მუქ თემაზე გადართვა";
    }
  }

  if (popupThemeBtn) {
    popupThemeBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const nextTheme = current === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      chrome.storage.sync.set({ theme: nextTheme });
    });
  }

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    chrome.storage.sync.get({ theme: "system" }, (items) => {
      if (items.theme === "system") {
        applyTheme("system");
      }
    });
  });

  // Open Options Page
  openOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Check Settings and API Key Status
  chrome.storage.sync.get(
    {
      apiKey: "",
      model: "gemini-3.8-flash",
      targetLanguage: "Georgian (ქართული)",
      theme: "system"
    },
    (items) => {
      applyTheme(items.theme || "system");
      const activeModel = items.model === "gemini-2.0-flash" ? "gemini-3.8-flash" : items.model;
      modelBadge.textContent = activeModel.replace("gemini-", "");
      quickLangSelect.value = items.targetLanguage;

      if (items.apiKey && items.apiKey.trim().length > 10) {
        statusDot.className = "status-dot active";
        statusText.textContent = "API Key მზადაა";
      } else {
        statusDot.className = "status-dot warning";
        statusText.textContent = "API Key შესაყვანია";
      }
    }
  );

  // Manual Quick Translate with Streaming
  quickTranslateBtn.addEventListener("click", () => {
    const text = inputText.value.trim();
    if (!text) return;

    resultArea.style.display = "block";
    resultContent.textContent = "✨ ითარგმნება...";
    quickTranslateBtn.disabled = true;

    try {
      const port = chrome.runtime.connect({ name: "gemini-stream" });
      let streamed = "";

      port.onMessage.addListener((msg) => {
        if (msg.type === "chunk") {
          streamed = msg.accumulated || (streamed + msg.text);
          resultContent.textContent = streamed;
          currentResult = streamed;
        } else if (msg.type === "done") {
          quickTranslateBtn.disabled = false;
          currentResult = streamed || resultContent.textContent;
          if (modelBadge) {
            if (msg.isCached) {
              modelBadge.textContent = "⚡ ქეში (0ms)";
              modelBadge.style.background = "#dcfce7";
              modelBadge.style.color = "#15803d";
            } else if (msg.isFallback) {
              modelBadge.textContent = `${msg.model.replace("gemini-", "")} (auto)`;
              modelBadge.style.background = "#fef3c7";
              modelBadge.style.color = "#b45309";
              modelBadge.title = msg.fallbackReason || "არჩეული მოდელი Google-ის მხარეს გადატვირთულია. Failover-მა ავტომატურად გადართო.";
            } else if (msg.model) {
              modelBadge.textContent = msg.model.replace("gemini-", "");
              modelBadge.style.background = "";
              modelBadge.style.color = "";
              modelBadge.title = "";
            }
          }
        } else if (msg.type === "error") {
          quickTranslateBtn.disabled = false;
          resultContent.innerHTML = `<span style="color:#dc2626;">⚠️ ${msg.error || "შეცდომა თარგმნისას"}</span>`;
        }
      });

      port.postMessage({
        action: "streamTranslate",
        text: text,
        targetLang: quickLangSelect.value
      });
    } catch (e) {
      quickTranslateBtn.disabled = false;
      resultContent.textContent = "კავშირის შეცდომა.";
    }
  });

  // Quick Copy
  quickCopyBtn.addEventListener("click", () => {
    if (!currentResult) return;
    navigator.clipboard.writeText(currentResult).then(() => {
      const originalText = quickCopyBtn.textContent;
      quickCopyBtn.textContent = "✓ დაკოპირდა!";
      setTimeout(() => {
        quickCopyBtn.textContent = originalText;
      }, 2000);
    });
  });

  // Full Webpage Translation from Popup
  const translatePageBtn = document.getElementById("translatePageBtn");
  if (translatePageBtn) {
    translatePageBtn.addEventListener("click", () => {
      translatePageBtn.disabled = true;
      const originalContent = translatePageBtn.innerHTML;
      translatePageBtn.innerHTML = `
        <span class="action-icon">⏳</span>
        <div class="action-meta">
          <strong>თარგმნა იწყება...</strong>
          <small>გვერდზე გამოჩნდება პროგრესის ზოლი</small>
        </div>
      `;

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].id) {
          translatePageBtn.disabled = false;
          translatePageBtn.innerHTML = originalContent;
          return;
        }

        const tab = tabs[0];
        const url = tab.url || "";
        if (
          url.startsWith("chrome://") ||
          url.startsWith("brave://") ||
          url.startsWith("edge://") ||
          url.startsWith("chrome-extension://") ||
          url.startsWith("view-source:")
        ) {
          alert("ბრაუზერის სისტემურ გვერდებზე (chrome://, brave://) გაფართოების გაშვება შეზღუდულია ბრაუზერის უსაფრთხოების წესებით.\n\nგთხოვთ გახსნათ ჩვეულებრივი ვებ-საიტი (მაგ. Wikipedia, სიახლეები და ა.შ.).");
          translatePageBtn.disabled = false;
          translatePageBtn.innerHTML = originalContent;
          return;
        }

        chrome.tabs.sendMessage(tab.id, { action: "triggerFullPageTranslation" })
          .then(() => {
            setTimeout(() => {
              window.close();
            }, 300);
          })
          .catch(() => {
            // Try programmatic injection fallback
            chrome.runtime.sendMessage(
              { action: "injectAndTranslatePage", tabId: tab.id },
              (res) => {
                if (res && res.success) {
                  setTimeout(() => {
                    window.close();
                  }, 300);
                } else {
                  translatePageBtn.disabled = false;
                  translatePageBtn.innerHTML = originalContent;
                  alert("გთხოვთ ერთხელ დაარეფრეშოთ მიმდინარე გვერდი (F5) და სცადოთ ხელახლა.");
                }
              }
            );
          });
      });
    });
  }

  // Bilingual PDF Reader Action
  const openReaderBtn = document.getElementById("openReaderBtn");
  if (openReaderBtn) {
    openReaderBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("reader.html") });
      window.close();
    });
  }
});
