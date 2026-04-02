document.documentElement.lang = chrome.i18n.getUILanguage();

const statusEl = document.getElementById("status");
const exportBtn = document.getElementById("exportBtn");

function t(messageName, substitutions) {
  return chrome.i18n.getMessage(messageName, substitutions);
}

function setStatus(message) {
  statusEl.textContent = message;
}

// アクティブタブの content script に依頼し、Zendesk 記事を CSV でダウンロードする
exportBtn.addEventListener("click", async () => {
  setStatus(t("statusRunning"));
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error(t("errorNoActiveTab"));
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXPORT_ZENDESK_ARTICLES"
    });

    if (!response?.ok) {
      throw new Error(response?.error || t("errorExportFailed"));
    }

    setStatus(t("statusDone", [String(response.count)]));
  } catch (error) {
    setStatus(t("statusError", [error.message]));
  }
});
