const loader = document.getElementById("loader")
const content = document.getElementById("content")
const footer = document.getElementById("footer")
const header = document.getElementById("header")

if (isMobile()) {
    console.log("Mobile detected")
}

const home = document.getElementById("home")
const homeButton = document.getElementById("home-button")
const settings = document.getElementById("settings")
const settingsButton = document.getElementById("settings-button")

const languageSelect = document.getElementById("language-select")
const modelSelect = document.getElementById("model-select")
const fontSelect = document.getElementById("font-select")

const enabled = document.getElementById("enabled")
const defaultEnabled = document.getElementById("default-enabled")
const strokeEnabled = document.getElementById("stroke-enabled")
const lightNovelMode = document.getElementById("light-novel-mode")
const legacyInpaint = document.getElementById("legacy-inpaint")

const toriiTL = document.getElementById("torii-tl")
const toriiTR = document.getElementById("torii-tr")

const languages = {
    en: "English",
    vi: "Vietnamese"
}

// Khởi tạo trực tiếp khi DOM loaded
document.addEventListener('DOMContentLoaded', function() {
    showExtension()
    initialize()
    loader.classList.replace("flex", "hidden")
})

function showExtension() {
    // Hiển thị extension interface trực tiếp
    content.classList.replace("hidden", "flex")
    header.classList.replace("hidden", "flex")
    footer.classList.replace("hidden", "flex")
}

// Load settings và setup language select
chrome.storage.sync.get({ torii_target_lang: "en", torii_error: false }, (result) => {
    const targetLanguage = result["torii_target_lang"]
    const toriiError = result["torii_error"]

    if (toriiError) {
        console.error("Torii Error:", toriiError)
        chrome.storage.sync.set({ torii_error: false })
    }

    // Populate language select
    for (const [key, value] of Object.entries(languages)) {
        const languageOption = document.createElement("option")
        languageOption.classList.add("text-gray")
        languageOption.value = key
        languageOption.text = value

        if (key === targetLanguage) {
            languageOption.selected = true
        }

        languageSelect.appendChild(languageOption)
    }
})

// Event listeners for settings
fontSelect.addEventListener("change", (event) => {
    chrome.storage.sync.set({ torii_font: event.target.value })
})

languageSelect.addEventListener("change", (event) => {
    chrome.storage.sync.set({ torii_target_lang: event.target.value })
})

modelSelect.addEventListener("change", (event) => {
    chrome.storage.sync.set({ translation_model: event.target.value })
})

function setPage(page) {
    home.classList.replace("flex", "hidden")
    settings.classList.replace("flex", "hidden")

    homeButton.querySelector("svg").classList.replace("fill-blue-400", "fill-neutral-600")
    homeButton.querySelector("span").classList.replace("text-blue-400", "text-neutral-600")

    settingsButton.querySelector("svg").classList.replace("fill-blue-400", "fill-neutral-600")
    settingsButton.querySelector("span").classList.replace("text-blue-400", "text-neutral-600")

    if (page === "home") {
        home.classList.replace("hidden", "flex")
        homeButton.querySelector("svg").classList.replace("fill-neutral-600", "fill-blue-400")
        homeButton.querySelector("span").classList.replace("text-neutral-600", "text-blue-400")
    } else if (page === "settings") {
        settings.classList.replace("hidden", "flex")
        settingsButton.querySelector("svg").classList.replace("fill-neutral-600", "fill-blue-400")
        settingsButton.querySelector("span").classList.replace("text-neutral-600", "text-blue-400")
    }
}

homeButton.addEventListener("click", function () {
    setPage("home")
})

settingsButton.addEventListener("click", function () {
    setPage("settings")
})

// Settings event listeners
defaultEnabled.addEventListener("change", (event) => {
    chrome.storage.sync.set({ torii_default_enabled: defaultEnabled.checked })
})

strokeEnabled.addEventListener("change", (event) => {
    chrome.storage.sync.set({ torii_stroke_enabled: strokeEnabled.checked })
})

lightNovelMode.addEventListener("change", (event) => {
    chrome.storage.sync.set({ torii_light_novel_mode: lightNovelMode.checked })
})

legacyInpaint.addEventListener("change", (event) => {
    chrome.storage.sync.set({ torii_legacy_inpaint: legacyInpaint.checked })
})

toriiTL.addEventListener("click", (event) => {
    setToriiLocation("tl")
    chrome.storage.sync.set({ torii_location: "tl" })
})

toriiTR.addEventListener("click", (event) => {
    setToriiLocation("tr")
    chrome.storage.sync.set({ torii_location: "tr" })
})

enabled.addEventListener("change", (event) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        chrome.storage.sync.set({ ["torii_" + tabs[0].url.split("/")[2]]: enabled.checked })
    })
})

// Helper functions
function setEnabled(checked) {
    enabled.checked = checked
}

function setDefaultEnabled(checked) {
    defaultEnabled.checked = checked
}

function setStrokeEnabled(checked) {
    strokeEnabled.checked = checked
}

function setLightNovelMode(checked) {
    lightNovelMode.checked = checked
}

function setLegacyInpaint(checked) {
    legacyInpaint.checked = checked
}

function setToriiLocation(location) {
    const loc = document.getElementById(`torii-${location}`)

    toriiTL.classList.replace("bg-blue-400", "bg-neutral-400")
    toriiTR.classList.replace("bg-blue-400", "bg-neutral-400")
    loc.classList.replace("bg-neutral-400", "bg-blue-400")
}

function setTranslationModel(model) {
    modelSelect.value = model
}

function setFont(font) {
    fontSelect.value = font
}

function initialize() {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        let stored_url = "torii_extension"
        try {
            stored_url = "torii_" + tabs[0].url.split("/")[2]
        } catch (error) {
            console.log("Focused window is extension.")
        }

        chrome.storage.sync.get(
            {
                [stored_url]: "na",
                torii_default_enabled: true,
                translation_model: "gemini-2.0-flash",
                torii_font: "wildwords",
                torii_stroke_enabled: true,
                torii_light_novel_mode: false,
                torii_legacy_inpaint: false,
                torii_location: "tl",
            },
            (result) => {
                setPage("home")
                setTranslationModel(result["translation_model"])
                setFont(result["torii_font"])
                setDefaultEnabled(result["torii_default_enabled"])
                setStrokeEnabled(result["torii_stroke_enabled"])
                setLightNovelMode(result["torii_light_novel_mode"])
                setLegacyInpaint(result["torii_legacy_inpaint"])
                setToriiLocation(result["torii_location"])

                if (result[stored_url] === "na") {
                    setEnabled(result["torii_default_enabled"])
                } else {
                    setEnabled(result[stored_url])
                }
            }
        )
    })
}

function isMobile() {
    const userAgentDataMobile = navigator?.userAgentData?.mobile

    if (userAgentDataMobile === undefined) {
        return navigator.userAgent.toLowerCase().includes("mobile")
    }

    return userAgentDataMobile
}