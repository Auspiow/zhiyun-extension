chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log("Intercepted:", details.url);
  },
  { urls: ["*://interactivemeta.cmc.zju.edu.cn/*"] }
);
