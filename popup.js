const statusEl = document.getElementById("status");
const exportBtn = document.getElementById("exportBtn");

function setStatus(message) {
  statusEl.textContent = message;
}

exportBtn.addEventListener("click", async () => {
  setStatus("実行中...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error("アクティブなタブが取得できませんでした。");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EXPORT_ZENDESK_ARTICLES"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "エクスポートに失敗しました。");
    }

    setStatus(`完了: ${response.count} 件をCSV出力しました`);
  } catch (error) {
    setStatus(`エラー: ${error.message}`);
  }
});