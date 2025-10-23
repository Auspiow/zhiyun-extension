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
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: "fetchProxy", url },
            (response) => resolve(response)
          );
        });

        if (resp.ok) {
          console.log(`✅ 成功使用接口: ${url}`);
          return { url, data: resp.json };
        } else {
          console.warn(`⚠️ 请求失败: ${url}`, resp.error);
        }
      } catch (err) {
        console.warn(`❌ 请求失败: ${url}`, err);
      }
    }
    throw new Error("两个接口都请求失败");
  }

  
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function isSameImage(url1, url2, threshold = 0.78) {
    try {
      const [img1, img2] = await Promise.all([loadImage(url1), loadImage(url2)]);
      const size = 32;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = size;
      canvas.height = size;

      ctx.drawImage(img1, 0, 0, size, size);
      const data1 = ctx.getImageData(0, 0, size, size).data;
      ctx.drawImage(img2, 0, 0, size, size);
      const data2 = ctx.getImageData(0, 0, size, size).data;

      let same = 0;
      for (let i = 0; i < data1.length; i += 4) {
        const diff = Math.abs(data1[i] - data2[i])
                  + Math.abs(data1[i + 1] - data2[i + 1])
                  + Math.abs(data1[i + 2] - data2[i + 2]);
        if (diff < 30) same++;
      }
      const similarity = same / (data1.length / 4);
      return similarity > threshold;
    } catch (e) {
      console.warn("图片比对失败：", e);
      return false;
    }
  }
  
  let fontLoaded = false;
  async function loadChineseFont(pdf) {
    if (fontLoaded) return "SimHei";
    const fontUrl = chrome.runtime.getURL("simhei.txt");
    const base64 = await fetch(fontUrl).then(res => res.text());
    pdf.addFileToVFS("simhei.ttf", base64);
    pdf.addFont("simhei.ttf", "SimHei", "normal");
    fontLoaded = true;
    return "SimHei";
  }

  async function makePdf(result) {
    const pdf = new jsPDF({ orientation: "p", unit: "px", format: "a4" });
    const fontName = await loadChineseFont(pdf);
    pdf.setFont(fontName);

    const total = result.length;
    let finalTotalPages = 0;
    let lastImgUrl = null;

    for (const [i, page] of result.entries()) {
        const currentUrl = page.img.replace(/^http:/, "https:");
        if (lastImgUrl && await isSameImage(lastImgUrl, currentUrl)) {
            continue;
        }
        finalTotalPages++;
        lastImgUrl = currentUrl;
    }

    lastImgUrl = null;
    let pageNum = 0;
    for (const [i, page] of result.entries()) {
      try {
        const currentUrl = page.img.replace(/^http:/, "https:");
        if (lastImgUrl && await isSameImage(lastImgUrl, currentUrl)) {
          continue;
        }

        const img = await loadImage(currentUrl);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imgData = canvas.toDataURL("image/jpeg");

        pageNum++;

        const header = `Page ${pageNum} (${new Date(page.startTime).toLocaleString("en-CA", {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })})`;

        pdf.setFontSize(12);
        pdf.text(header, 20, 20);
        pdf.addImage(imgData, "JPEG", 20, 40, 400, 225);

        pdf.setFont(fontName);
        pdf.setFontSize(10);

        const text = (page.texts || []).join("\n") || "（暂无文字）";
        const lines = pdf.splitTextToSize(text, 400);
        const maxLinesPerPage = 35;
        let currentLine = 0;

        while (currentLine < lines.length) {
          const chunk = lines.slice(currentLine, currentLine + maxLinesPerPage);
          pdf.text(chunk, 20, 280, { maxWidth: 400 });

          currentLine += maxLinesPerPage;
          if (currentLine < lines.length) {
            pdf.addPage();
            const header = `Page ${pageNum} (continued)`;
            pdf.setFontSize(12);
            pdf.text(header, 20, 20);
            pdf.addImage(imgData, "JPEG", 20, 40, 400, 225);

            pdf.setFontSize(9);
            pdf.text(`Page ${pageNum} / ${finalTotalPages}`, 400, 560);

            pdf.setFont(fontName);
            pdf.setFontSize(10);
          }
        }

        pdf.setFontSize(9);
        pdf.text(`Page ${pageNum} / ${finalTotalPages}`, 400, 560);

        lastImgUrl = currentUrl;
        if (pageNum < finalTotalPages-1) pdf.addPage();

      } catch (err) {
        console.error("插入图片失败:", err, page.img);
      }
    }
      const courseTitle = document.querySelector(".title")?.textContent?.trim() || "未知课程";
      const subTitle = document.querySelector(".sub")?.textContent?.trim() || "";
      const fullTitle = subTitle ? `${courseTitle}-${subTitle}` : courseTitle;
      const safeName = `${fullTitle}.pdf`.replace(/[\/\\:*?"<>|]/g, "_");
      pdf.save(safeName);
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

      const courseStartTime =pptList.length > 0 ? new Date(pptList[0].create_time).getTime() : 0;
      for (const transItem of transList) {
        const allContent = transItem.all_content || [];
        for (const content of allContent) {
          if (content.Text) {
            const absTime = courseStartTime + (content.BeginSec || 0) * 1000;
            transData.push({
              time: absTime,
              text: content.Text,
              trans: content.TransText || ""
            });
          }
        }
      }
      pptData.sort((a, b) => a.time - b.time);
      transData.sort((a, b) => a.time - b.time);
      const mergedPpt = [];

      for (const slide of pptData) {
        if (mergedPpt.length === 0) {
          mergedPpt.push({ img: slide.img, startTime: slide.time });
        } else {
          const last = mergedPpt[mergedPpt.length - 1];
          if (last.img === slide.img) {
            continue;
          } else {
            mergedPpt.push({ img: slide.img, startTime: slide.time });
          }
        }
      }
      console.log("✅ 合并后 PPT 数量:", mergedPpt.length);
      const result = mergedPpt.map((slide, idx) => {
        const nextStart = mergedPpt[idx + 1]?.startTime ?? Infinity;
        const texts = transData
          .filter(t => t.time >= slide.startTime && t.time < nextStart)
          .map(t => t.text);

        return {
          img: slide.img,
          texts,
          startTime: slide.startTime,
        };
      });

      console.log("✅ 匹配结果示例:", result.slice(0, 3).map(r => ({
        startTime: new Date(r.startTime).toLocaleString(),
        textPreview: r.texts.slice(0, 2),
      })));

      console.log("✅ 数据整理完毕，共", result.length, "页");
      await makePdf(result);
    } catch (err) {
      console.error("❌ 请求 search-ppt 失败:", err);
    }
  }
  console.log("🎉 智云课堂 search-ppt 工具已注入，可等待 popup 触发");
  window.startZhiyunExport = async function () {
  console.log("📥 收到 popup 调用，开始生成 PDF...");
  await tryFetchSearchPptOnce();
  console.log("✅ 导出完成");
  alert("✅ 导出完成！PDF 已下载。");
};
})();
