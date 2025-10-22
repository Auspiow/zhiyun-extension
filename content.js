console.log("content.js 已注入");
(async function () {
  if (window.__zhiyunHooked) {
    console.log("已注入监听，无需重复。");
    return;
  }
  window.__zhiyunHooked = true;

  if (typeof window.jsPDF === "undefined" && typeof window.jspdf === "undefined") {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("jspdf.min.js");
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    console.log("✅ jsPDF 本地脚本加载完毕");
  }
  const { jsPDF } = window.jspdf || window;

  function getClassID(name, url = location.href) {
    try {
      const u = new URL(url);
      let value = u.searchParams.get(name);
      if (value) return value;
      const hash = u.hash || "";
      if (hash.includes("?")) {
        const params = new URLSearchParams(hash.split("?")[1]);
        return params.get(name);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function TryUrl(urls) {
    for (const url of urls) {
      try {
        const resp = await fetch(url, { method: "GET", credentials: "include" });
        if (resp.ok) {
          console.log(`✅ 成功使用接口: ${url}`);
          return { url, data: await resp.json() };
        } else {
          console.warn(`⚠️ 尝试下一个接口`);
        }
      } catch (err) {
        console.warn(`❌ 请求失败: ${url}`, err);
      }
    }
    throw new Error("两个接口都请求失败");
  }

  function formatTime(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString("zh-CN", { hour12: false });
  }

  async function fetchImageAsDataURLNoCreds(url) {
    const fixed = String(url).replace(/^http:/, "https:");
    try {
      const resp = await fetch(fixed, { mode: "cors" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      if (!blob.type || !blob.type.startsWith("image/")) {
        throw new Error(`响应非图片，Content-Type=${blob.type}`);
      }
      return await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      const e = new Error(`${err.message} | ${fixed}`);
      e.cause = err;
      throw e;
    }
  }

  async function makePdf(result) {
    const pdf = new jsPDF({ orientation: "p", unit: "px", format: "a4" });
    const total = result.length;
    for (const [i, page] of result.entries()) {
      try {
        const imgData = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = page.img.replace(/^http:/, "https:");
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/jpeg"));
          };
          img.onerror = (err) => reject(err);
        });
        const header = `第 ${i + 1} 页（${new Date(page.startTime).toLocaleString()}）`;
        pdf.setFontSize(12);
        pdf.text(header, 20, 20);
        pdf.addImage(imgData, "JPEG", 20, 40, 400, 225);
        const text = (page.texts || []).join("\n");
        pdf.setFontSize(10);
        pdf.text(text || "（暂无文字）", 20, 280, { maxWidth: 400 });
        pdf.setFontSize(9);
        pdf.text(`Page ${i + 1} / ${total}`, 400, 560);
        if (i < total - 1) pdf.addPage();
      } catch (err) {
        console.error("插入图片失败:", err, page.img);
      }
    }
    pdf.save("课堂笔记.pdf");
  }

  async function tryFetchSearchPptOnce() {
    const course_id = getClassID("course_id");
    const sub_id = getClassID("sub_id");
    if (!course_id || !sub_id) {
      console.log("❌ 页面 URL 中未找到 course_id 或 sub_id，跳过主动请求。");
      return;
    }
    const ppturls = [
      `https://interactivemeta.cmc.zju.edu.cn/pptnoteapi/v1/schedule/search-ppt?course_id=${encodeURIComponent(course_id)}&sub_id=${encodeURIComponent(sub_id)}&page=1&per_page=100`,
      `https://classroom.zju.edu.cn/pptnote/v1/schedule/search-ppt?course_id=${encodeURIComponent(course_id)}&sub_id=${encodeURIComponent(sub_id)}&page=1&per_page=100`
    ];
    const transurls = [
      `https://interactivemeta.cmc.zju.edu.cn/courseapi/v3/web-socket/search-trans-result?sub_id=${encodeURIComponent(sub_id)}&format=json`,
      `https://yjapi.cmc.zju.edu.cn/courseapi/v3/web-socket/search-trans-result?sub_id=${encodeURIComponent(sub_id)}&format=json`
    ];
    try {
      const { data: pptDataRaw } = await TryUrl(ppturls);
      const { data: transDataRaw } = await TryUrl(transurls);
      const pptList = pptDataRaw.list || [];
      const transList = transDataRaw.list || [];
      const pptData = [];
      const transData = [];
      for (const item of pptList) {
        try {
          const content = JSON.parse(item.content);
          if (content.pptimgurl) {
            pptData.push({ time: new Date(item.create_time).getTime() || 0, img: content.pptimgurl });
          }
        } catch (e) {
          console.warn("⚠️ 解析 pptcontent 失败:", item);
        }
      }
      for (const transItem of transList) {
        const allContent = transItem.all_content || [];
        for (const content of allContent) {
          if (content.Text) {
            transData.push({
              time: (content.BeginSec || 0) * 1000,
              text: content.Text,
              trans: content.TransText || ""
            });
          }
        }
      }
      pptData.sort((a, b) => a.time - b.time);
      transData.sort((a, b) => a.time - b.time);
      const result = pptData.map((slide, idx) => {
        const nextSlideTime = pptData[idx + 1]?.time ?? Infinity;
        const texts = transData.filter((t) => t.time >= slide.time && t.time < nextSlideTime).map((t) => t.text);
        return { img: slide.img, texts, startTime: formatTime(slide.time) };
      });
      console.log("✅ 数据整理完毕，共", result.length, "页");
      await makePdf(result);
    } catch (err) {
      console.error("❌ 请求 search-ppt 失败:", err);
    }
  }

  await tryFetchSearchPptOnce();
  console.log("🎉 智云课堂 search-ppt 工具已就绪");
})();
