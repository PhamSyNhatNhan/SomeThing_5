// ===== Elements =====
const loader = document.getElementById("loader");
const content = document.getElementById("content");
const footer = document.getElementById("footer");
const header = document.getElementById("header");

const home = document.getElementById("home");
const homeButton = document.getElementById("home-button");
const homeText = document.getElementById("home-text");

const settings = document.getElementById("settings");
const settingsButton = document.getElementById("settings-button");
const settingsText = document.getElementById("settings-text");

const languageSelect = document.getElementById("language-select");
const modelSelect = document.getElementById("model-select");
const fontSelect = document.getElementById("font-select");

const enabled = document.getElementById("enabled");
const defaultEnabled = document.getElementById("default-enabled");
const strokeEnabled = document.getElementById("stroke-enabled");
const lightNovelMode = document.getElementById("light-novel-mode");
const legacyInpaint = document.getElementById("legacy-inpaint");

const toriiTL = document.getElementById("torii-tl");
const toriiTR = document.getElementById("torii-tr");

// ===== Helpers =====
function swap(el, from, to) {
  if (!el) return;
  el.classList.remove(from);
  el.classList.add(to);
}

function setEnabled(checked) { enabled.checked = checked; }
function setDefaultEnabled(checked) { defaultEnabled.checked = checked; }
function setStrokeEnabled(checked) { strokeEnabled.checked = checked; }
function setLightNovelMode(checked) { lightNovelMode.checked = checked; }
function setLegacyInpaint(checked) { legacyInpaint.checked = checked; }
function setToriiLocation(location) {
  const loc = document.getElementById(`torii-${location}`);
  toriiTL.classList.remove("bg-blue-400"); toriiTL.classList.add("bg-neutral-400");
  toriiTR.classList.remove("bg-blue-400"); toriiTR.classList.add("bg-neutral-400");
  if (loc) { loc.classList.remove("bg-neutral-400"); loc.classList.add("bg-blue-400"); }
}
function setTranslationModel(model) { modelSelect.value = model; }
function setFont(font) { fontSelect.value = font; }
function toggleUpdateBadges(beenUpdated) {
  const badges = document.getElementsByClassName("update-badge");
  for (const b of badges) {
    if (beenUpdated) { b.classList.remove("hidden"); b.classList.add("flex"); }
    else { b.classList.remove("flex"); b.classList.add("hidden"); }
  }
}

// ===== Target languages (chỉ en & vi) =====
const languages = { en: "English", vi: "Vietnamese" };

// ===== Page switcher =====
function setPage(page) {
  // hide all
  home.classList.replace("flex", "hidden");
  settings.classList.replace("flex", "hidden");

  // reset nav buttons to neutral
  swap(homeButton.querySelector("svg"), "fill-blue-500", "fill-neutral-600");
  swap(homeText, "text-blue-500", "text-neutral-600");

  swap(settingsButton.querySelector("svg"), "fill-blue-500", "fill-neutral-600");
  swap(settingsText, "text-blue-500", "text-neutral-600");

  // show target page + highlight nav
  if (page === "home") {
    home.classList.replace("hidden", "flex");
    swap(homeButton.querySelector("svg"), "fill-neutral-600", "fill-blue-500");
    swap(homeText, "text-neutral-600", "text-blue-500");
  } else if (page === "settings") {
    settings.classList.replace("hidden", "flex");
    swap(settingsButton.querySelector("svg"), "fill-neutral-600", "fill-blue-500");
    swap(settingsText, "text-neutral-600", "text-blue-500");
  }
}

// ===== Bootstrap =====
(function bootstrap() {
  // Populate only EN & VI, select saved target lang (default en)
  chrome.storage.sync.get({ torii_target_lang: "en" }, (result) => {
    const targetLanguage = result["torii_target_lang"];
    languageSelect.innerHTML = "";
    for (const [key, value] of Object.entries(languages)) {
      const opt = document.createElement("option");
      opt.classList.add("text-gray");
      opt.value = key;
      opt.text = value;
      if (key === targetLanguage) opt.selected = true;
      languageSelect.appendChild(opt);
    }
  });

  // Show sections immediately (no auth flow)
  content.classList.replace("hidden", "flex");
  header.classList.replace("hidden", "flex");
  footer.classList.replace("hidden", "flex");

  initialize();
})();

// ===== Events =====
fontSelect.addEventListener("change", (e) =>
  chrome.storage.sync.set({ torii_font: e.target.value })
);
languageSelect.addEventListener("change", (e) =>
  chrome.storage.sync.set({ torii_target_lang: e.target.value })
);
modelSelect.addEventListener("change", (e) =>
  chrome.storage.sync.set({ translation_model: e.target.value })
);

homeButton.addEventListener("click", () => setPage("home"));
settingsButton.addEventListener("click", () => setPage("settings"));

// Settings toggles
defaultEnabled.addEventListener("change", () =>
  chrome.storage.sync.set({ torii_default_enabled: defaultEnabled.checked })
);
strokeEnabled.addEventListener("change", () =>
  chrome.storage.sync.set({ torii_stroke_enabled: strokeEnabled.checked })
);
lightNovelMode.addEventListener("change", () =>
  chrome.storage.sync.set({ torii_light_novel_mode: lightNovelMode.checked })
);
legacyInpaint.addEventListener("change", () =>
  chrome.storage.sync.set({ torii_legacy_inpaint: legacyInpaint.checked })
);
toriiTL.addEventListener("click", () => {
  setToriiLocation("tl");
  chrome.storage.sync.set({ torii_location: "tl" });
});
toriiTR.addEventListener("click", () => {
  setToriiLocation("tr");
  chrome.storage.sync.set({ torii_location: "tr" });
});

// Per-site enabled toggle
enabled.addEventListener("change", () => {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const host = (() => { try { return new URL(tabs[0].url).host; } catch { return null; }})();
    if (!host) return;
    chrome.storage.sync.set({ ["torii_" + host]: enabled.checked });
  });
});

// "What's new?" badge
document.getElementById("updates").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "update_seen" }, (response) => {
    if (response?.success) chrome.storage.sync.set({ torii_new_version: false });
  });
});

// ===== Initialize state (no auth, no credits, no feedback) =====
function initialize() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    let stored_url = "torii_extension";
    try { stored_url = "torii_" + new URL(tabs[0].url).host; } catch (_) { /* ignore */ }

    chrome.storage.sync.get(
      {
        [stored_url]: "na",
        torii_default_enabled: true,
        translation_model: "gemini-2.0-flash",
        torii_new_version: false,
        torii_font: "wildwords",
        torii_stroke_enabled: true,
        torii_light_novel_mode: false,
        torii_legacy_inpaint: false,
        torii_location: "tl",
        torii_target_lang: "en",
      },
      (result) => {
        setPage("home");
        setTranslationModel(result["translation_model"]);
        setFont(result["torii_font"]);
        setDefaultEnabled(result["torii_default_enabled"]);
        setStrokeEnabled(result["torii_stroke_enabled"]);
        setLightNovelMode(result["torii_light_novel_mode"]);
        setLegacyInpaint(result["torii_legacy_inpaint"]);
        setToriiLocation(result["torii_location"]);
        toggleUpdateBadges(result["torii_new_version"]);

        if (result[stored_url] === "na") setEnabled(result["torii_default_enabled"]);
        else setEnabled(result[stored_url]);
      }
    );
  });
}
