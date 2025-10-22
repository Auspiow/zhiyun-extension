console.log("popup.js 已加载");
document.getElementById("export").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["jsPDF.min.js", "content.js"]
  });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      alert("✅ 开始导出：正在提取 PPT 与字幕...");
      if (typeof window.startZhiyunExport === "function") {
        window.startZhiyunExport();
      } else {
        console.error("content.js 未正确加载");
      }
    }
  });
});
