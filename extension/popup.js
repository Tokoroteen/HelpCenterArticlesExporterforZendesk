document.documentElement.lang = chrome.i18n.getUILanguage();

const statusEl = document.getElementById("status");
const exportBtn = document.getElementById("exportBtn");

function getExportFormat() {
  const selected = document.querySelector('input[name="exportFormat"]:checked');
  return selected?.value === "markdown" ? "markdown" : "csv";
}

function setStatus(message) {
  statusEl.textContent = message;
}

// アクティブタブの content script にポートで接続し、API 取得ごとに進捗を受け取りながらエクスポートする
exportBtn.addEventListener("click", async () => {
  exportBtn.disabled = true;
  setStatus("Working...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error("Could not get the active tab.");
    }

    const format = getExportFormat();
    const response = await new Promise((resolve, reject) => {
      let settled = false;
      const port = chrome.tabs.connect(tab.id, { name: "zendesk-export" });

      port.onMessage.addListener((msg) => {
        if (msg.type === "progress") {
          setStatus(`Working... ${msg.count} articles fetched`);
        } else if (msg.type === "done") {
          settled = true;
          port.disconnect();
          if (msg.ok) {
            resolve(msg);
          } else {
            reject(new Error(msg.error || "Export failed."));
          }
        }
      });

      port.onDisconnect.addListener(() => {
        if (settled) return;
        settled = true;
        const reason =
          chrome.runtime.lastError?.message || "Connection to the page was lost.";
        reject(new Error(reason));
      });

      port.postMessage({ type: "EXPORT_ZENDESK_ARTICLES", format });
    });

    if (format === "markdown" && response.fileCount != null) {
      setStatus(
        `Done: ${response.fileCount} markdown file(s), ${response.count} articles`
      );
    } else {
      setStatus(`Done: exported ${response.count} articles to CSV`);
    }
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  } finally {
    exportBtn.disabled = false;
  }
});
