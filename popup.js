console.log("popup.js 已加载");

document.addEventListener("DOMContentLoaded", () => {
  const pdfBtn = document.getElementById("exportpdf");
  const mdBtn = document.getElementById("exportmd");

  pdfBtn.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        alert("❌ 未检测到活动标签页，请重试。");
        return;
      }

      console.log("开始注入脚本：jsPDF.min.js 和 content.js");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["jspdf.min.js", "content.js"]
      });

      console.log("准备执行导出函数...");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          alert("✅ 开始导出：正在提取 PPT 与字幕，请稍候...");
          if (typeof window.startZhiyunExport === "function") {
            window.startZhiyunExport("pdf");
          } else {
            console.error("❌ content.js 未正确加载或未定义 window.startZhiyunExport");
            alert("⚠️ 未检测到导出函数，请刷新页面后重试。");
          }
        }
      });
    } catch (err) {
      console.error("执行 PDF 导出时出错：", err);
      alert("❌ 导出失败，请查看控制台日志。");
    }
  });

  mdBtn.addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        alert("❌ 未检测到活动标签页，请重试。");
        return;
      }

      console.log("开始注入脚本：jszip.min.js 和 content.js（Markdown 模式）");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["jszip.min.js", "content.js"]
      });

      console.log("准备执行导出函数...");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          alert("✅ 开始导出：正在生成 Markdown + 图片 ZIP，请稍候...");
          if (typeof window.startZhiyunExport === "function") {
            window.startZhiyunExport("markdown");
          } else {
            console.error("❌ content.js 未正确加载或未定义 window.startZhiyunExport");
            alert("⚠️ 未检测到导出函数，请刷新页面后重试。");
          }
        }
      });
    } catch (err) {
      console.error("执行 Markdown 导出时出错：", err);
      alert("❌ 导出失败，请查看控制台日志。");
    }
  });
});
