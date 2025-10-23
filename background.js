console.log("✅ background.js 已启动");
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchProxy") {
    console.log("🌐 接收到 fetchProxy 请求:", message.url);

    fetch(message.url, {
      method: "GET",
      credentials: "include",
    })
      .then(async (res) => {
        const text = await res.text();
        let jsonData = null;
        try {
          jsonData = JSON.parse(text);
        } catch {
          jsonData = text;
        }

        sendResponse({
          ok: res.ok,
          status: res.status,
          json: jsonData,
        });
      })
      .catch((err) => {
        console.error("❌ background.js 请求失败:", err);
        sendResponse({
          ok: false,
          error: err.message || String(err),
        });
      });
    return true;
  }
  if (message.action === "startZhiyunExport") {
    console.log("📥 收到 popup 导出指令");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => window.startZhiyunExport && window.startZhiyunExport(),
        });
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});
