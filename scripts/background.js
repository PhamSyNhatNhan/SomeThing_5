// background.js — no auth, no credits, no feedback

// =========================
// Utils
// =========================
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blobToImage(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(reader.result.replace("application/octet-stream", "image/jpeg"));
    reader.readAsDataURL(blob);
  });
}

async function getIP() {
  try {
    const response = await fetch("https://api64.ipify.org?format=json", {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    if (response.status === 200) {
      const json = await response.json();
      return json?.ip ?? null;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

let sentErrors = 0;
async function sendError(error, loc) {
  try {
    // tránh spam & bỏ qua lỗi offline noise
    if (error?.message?.includes?.("because the client is offline")) return;

    sentErrors += 1;
    if (sentErrors > 10) return;

    const ip = await getIP();

    const report = {
      stack_trace: error?.stack ?? null,
      message: error?.message ?? String(error),
      created: new Date().toISOString(),
      email: null,         // no auth
      location: loc ?? null,
      meta: {
        agent: navigator?.userAgent || null,
        platform: navigator?.userAgentData?.platform || null,
        brands: navigator?.userAgentData?.brands || null,
      },
      ip,
      fingerprint: null,   // no fingerprint
    };

    // Nếu muốn tắt hoàn toàn reporting, xoá khối fetch dưới:
    await fetch("https://api.toriitranslate.com/api/reporting", {
      method: "POST",
      body: JSON.stringify(report, (k, v) => (v === undefined ? null : v)),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.log("Failed to send error. Error: ", e);
  }
}

function showBadge(text) {
  try {
    chrome.action.setBadgeText({ text: text });
    if (text !== "") {
      chrome.action.setBadgeTextColor({ color: [255, 255, 255, 255] });
      chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    }
  } catch (error) {
    sendError(error, "show badge");
  }
}

function showUpdateBadge() {
  showBadge("1");
  chrome.storage.sync.set({ torii_new_version: true });
}

function removeUpdateBadge() {
  showBadge("");
  chrome.storage.sync.set({ torii_new_version: false });
}

// =========================
// API helpers (no auth)
// =========================
async function sendImage(url, site, blob, actionType) {
  try {
    const form = new FormData();
    if (blob) form.append("file", blob);
    if (url && !url.startsWith("blob")) form.append("url", url);

    const settings = await chrome.storage.sync.get({
      torii_target_lang: "en",
      torii_font: "wildwords",
      translation_model: "gemini-2.0-flash",
      torii_stroke_enabled: true,
      torii_light_novel_mode: false,
      torii_legacy_inpaint: false,
    });

    // KHÔNG Authorization. Nếu có API key riêng của bạn, thêm vào header tại đây.
    const headers = {
      target_lang: settings["torii_target_lang"],
      translator: settings["translation_model"],
      font: settings["torii_font"],
      stroke_disabled: !settings["torii_stroke_enabled"],
      light_novel_mode: settings["torii_light_novel_mode"],
      legacy_inpaint: settings["torii_legacy_inpaint"],
      image_url: site,
      action: actionType,
      api_version: "v1",
      // "X-Api-Key": "YOUR_KEY_HERE"
    };

    const response = await fetch("https://api.toriitranslate.com/api/upload", {
      method: "POST",
      body: form,
      headers,
      signal: AbortSignal.timeout(100000),
    });

    if (response.headers.get("success") === "false") {
      return { success: false, content: { error: await response.text() } };
    }

    return {
      success: true,
      content: {
        image: await blobToImage(await response.blob()),
        original: response.headers.get("original"),
        inpainted: response.headers.get("inpainted"),
        text: response.headers.get("text"),
      },
    };
  } catch (error) {
    await sendError(error, "send image from: " + site);
    return { success: false, content: { error: "Failed to process image." } };
  }
}

// =========================
// Message Handler
// =========================
async function handleMessage(msg) {
  // chỉ giữ các type cần thiết, không có feedback / user / login / credits

  if (msg.type === "keep-alive") {
    return { success: true };
  }

  if (msg.type === "translate") {
    let response = null;
    try {
      if (msg.buffer) {
        const uint8Array = new Uint8Array(msg.buffer);
        const blob = new Blob([uint8Array]);
        response = await sendImage(msg.url, msg.site, blob, msg.actionType);
      } else {
        const image = await fetch(msg.url, {
          headers: {
            Referer: msg.site,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          },
        });
        if (image.ok) {
          const imageBlob = await image.blob();
          response = await sendImage(msg.url, msg.site, imageBlob, msg.actionType);
        } else {
          response = await sendImage(msg.url, msg.site, null, msg.actionType);
        }
      }
    } catch (_) {
      response = await sendImage(msg.url, msg.site, null, msg.actionType);
    }

    if (!response?.success) {
      return { success: false, content: { error: response?.content?.error || "Failed to translate image." } };
    }

    try {
      return {
        success: true,
        content: {
          translated: response.content.image,
          original: response.content.original,
          inpainted: response.content.inpainted,
          text: response.content.text,
        },
      };
    } catch (error) {
      await sendError(error, "blob to image");
      return { success: false, content: { error: "Failed to process image." } };
    }
  }

  if (msg.type === "edit") {
    try {
      const image = await fetch(msg.url, {
        headers: {
          Referer: msg.site,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        },
      });
      if (!image.ok) return { success: false, content: { error: "Failed to get image." } };

      const imageBlob = await image.blob();
      const src = await blobToImage(imageBlob);
      return { success: true, content: { src } };
    } catch (error) {
      await sendError(error, "edit");
      return { success: false, content: { error: "Failed to get image." } };
    }
  }

  if (msg.type === "inpaint") {
    try {
      const imageArray = new Uint8Array(msg.image);
      const imageBlob = new Blob([imageArray]);

      const maskArray = new Uint8Array(msg.mask);
      const maskBlob = new Blob([maskArray]);

      const formData = new FormData();
      formData.append("image", imageBlob);
      formData.append("mask", maskBlob);

      const response = await fetch("https://api.toriitranslate.com/api/inpaint", {
        method: "POST",
        body: formData,
        // headers: { "X-Api-Key": "YOUR_KEY_HERE" },
        signal: AbortSignal.timeout(60000),
      });

      if (response.headers.get("success") == "false") {
        return { success: false, content: { error: "Failed to inpaint image." } };
      }

      const inpaintedImageSrc = await blobToImage(await response.blob());
      return { success: true, content: { inpaintedImageSrc } };
    } catch (error) {
      await sendError(error, "inpaint");
      return { success: false, content: { error: "Failed to inpaint image." } };
    }
  }

  if (msg.type === "storage") {
    try {
      const storageURLs = msg.storageURLs;

      const response = await fetch("https://api.toriitranslate.com/api/storage", {
        method: "GET",
        headers: {
          storage_urls: storageURLs,
          // "X-Api-Key": "YOUR_KEY_HERE"
        },
        signal: AbortSignal.timeout(100000),
      });

      if (response.headers.get("success") == "false") {
        return { success: false, content: { error: "Failed to get original image." } };
      }

      let data = await response.json();
      if (!data?.success && typeof data === "string") {
        try { data = JSON.parse(data); } catch { /* ignore */ }
      }

      return { success: true, content: data };
    } catch (error) {
      await sendError(error, "storage");
      return { success: false, content: { error: "Failed to get original image." } };
    }
  }

  if (msg.type === "update_seen") {
    try {
      removeUpdateBadge();
      return { success: true };
    } catch (error) {
      await sendError(error, "update_seen");
      return { success: false };
    }
  }

  if (msg.type === "error") {
    await sendError({ message: msg.message, stack: msg.stack }, msg.loc);
    return { success: true };
  }

  if (msg.type === "screenshot") {
    while (true) {
      try {
        const dataURL = await chrome.tabs.captureVisibleTab(null, { format: "png" });
        return { success: true, content: { dataURL } };
      } catch (error) {
        if (String(error?.message || "").includes("exceeds")) {
          await wait(200);
        } else {
          await sendError(error, "screenshot");
          return { success: false, content: { error: "Failed to capture screenshot." } };
        }
      }
    }
  }

  // Unknown
  await sendError({ message: "Unknown msg: " + JSON.stringify(msg), stack: "N/A" }, "handle message");
  return { success: false, content: { error: "Unknown request." } };
}

// =========================
// Listeners
// =========================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((error) => {
      sendError(error, "onMessage");
      sendResponse({ success: false, content: { error: "Internal error." } });
    });

  if (
    msg.type == "translate" ||
    msg.type == "inpaint" ||
    msg.type == "error" ||
    msg.type == "update_seen" ||
    msg.type == "screenshot" ||
    msg.type == "storage" ||
    msg.type == "edit" ||
    msg.type == "keep-alive"
  ) {
    // giữ kênh async
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    const previousVersion = details.previousVersion;
    const reason = details.reason;

    if (reason == "update") {
      const previousVersionDigits = previousVersion?.split?.(".") ?? [];
      const currentVersionDigits = currentVersion?.split?.(".") ?? [];
      const significantPrevious =
        previousVersionDigits[previousVersionDigits.length - 2];
      const significantCurrent =
        currentVersionDigits[currentVersionDigits.length - 2];
      const isSignificantUpdate = significantPrevious != significantCurrent;
      const sameLength = previousVersionDigits.length == currentVersionDigits.length;

      if (isSignificantUpdate && sameLength) {
        showUpdateBadge();
      }
    }
    // reason == "install": không đặt uninstall URL nữa (no user/email)
  } catch (error) {
    await sendError(error, "onInstalled");
  }

  // context menus
  try {
    chrome.contextMenus.create({
      id: "torii_contextmenu",
      title: "Torii (Alt+Shift+D)",
      contexts: ["all"],
    });

    chrome.contextMenus.create({
      id: "torii_screenshot",
      title: "Screenshot Image (Alt+Shift+C)",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_translate",
      title: "Translate Image (Alt+Shift+Z)",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_screencrop",
      title: "Screen Crop Image (Alt+Shift+X)",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_repeatscreencrop",
      title: "Repeat Last Screen Crop",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_edit",
      title: "Edit Image",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_auto",
      title: "Toggle Auto Translate",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });
  } catch (error) {
    console.log("Failed to create context menus. Error: ", error);
  }
});

// keyboard shortcuts
try {
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (tab && command == "torii_contextmenu") {
      chrome.tabs.sendMessage(tab.id, { type: "command_contextmenu" }).catch(() => {});
    }
    if (tab && command == "torii_screencrop") {
      chrome.tabs.sendMessage(tab.id, { type: "command_screencrop" }).catch(() => {});
    }
    if (tab && command == "torii_repeatscreencrop") {
      chrome.tabs.sendMessage(tab.id, { type: "command_repeatscreencrop" }).catch(() => {});
    }
    if (tab && command == "torii_translate") {
      chrome.tabs.sendMessage(tab.id, { type: "command_translate" }).catch(() => {});
    }
    if (tab && command == "torii_screenshot") {
      chrome.tabs.sendMessage(tab.id, { type: "command_screenshot" }).catch(() => {});
    }
    if (tab && command == "torii_edit") {
      chrome.tabs.sendMessage(tab.id, { type: "command_edit" }).catch(() => {});
    }
  });
} catch (error) {
  console.log("Failed to create command listener. Error: ", error);
}

// context menu click routing
try {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId == "torii_screenshot") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_screenshot" }).catch(() => {});
    } else if (info.menuItemId == "torii_translate") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_translate" }).catch(() => {});
    } else if (info.menuItemId == "torii_screencrop") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_screencrop" }).catch(() => {});
    } else if (info.menuItemId == "torii_repeatscreencrop") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_repeatscreencrop" }).catch(() => {});
    } else if (info.menuItemId == "torii_edit") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_edit" }).catch(() => {});
    } else if (info.menuItemId == "torii_auto") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_auto" }).catch(() => {});
    }
  });

  chrome.storage.sync.set({ torii_contextmenu: true });
} catch (error) {
  chrome.storage.sync.set({ torii_contextmenu: false });
}
