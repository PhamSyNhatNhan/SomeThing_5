// background.js - Complete version without Firebase Auth

let sentErrors = 0

// Configuration for your local API
const CONFIG = {
    apiUrl: "http://localhost:3000/api", // Change to your API URL
    maxErrors: 10
}

// Utility functions
function isMobile() {
    const userAgentDataMobile = navigator?.userAgentData?.mobile

    if (userAgentDataMobile === undefined) {
        return navigator.userAgent.toLowerCase().includes("mobile")
    }

    return userAgentDataMobile
}

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function blobToImage(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result.replace("application/octet-stream", "image/jpeg"))
        reader.readAsDataURL(blob)
    })
}

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch(error => {
        sendError(error, "on message")
        sendResponse({ success: false, content: { error: "Something went wrong. Contact support." } })
    })

    // Updated message types list (removed auth-related ones)
    if (
        msg.type === "translate-image" ||
        msg.type === "inpaint" ||
        msg.type === "storage" ||
        msg.type === "edit" ||
        msg.type === "keep-alive" ||
        msg.type === "screenshot" ||
        msg.type === "command_contextmenu" ||
        msg.type === "command_screencrop" ||
        msg.type === "command_translate" ||
        msg.type === "command_screenshot" ||
        msg.type === "contextmenu_screenshot" ||
        msg.type === "contextmenu_translate" ||
        msg.type === "contextmenu_screencrop" ||
        msg.type === "contextmenu_repeatscreencrop" ||
        msg.type === "contextmenu_edit" ||
        msg.type === "contextmenu_auto"
    ) {
        return true
    }
})

async function handleMessage(msg) {
    if (msg.type === "translate-image") {
        return await translateImage(msg.url, msg.site, msg.blob, msg.actionType)
    } else if (msg.type === "inpaint") {
        return await inpaintImage(msg.image, msg.mask)
    } else if (msg.type === "storage") {
        return await getStorageImages(msg.storageURLs)
    } else if (msg.type === "edit") {
        return await getImageForEdit(msg.url, msg.site)
    } else if (msg.type === "keep-alive") {
        return { success: true }
    } else if (msg.type === "screenshot") {
        return await takeScreenshot()
    }

    // Return error for unknown message types
    console.log("Unknown message type:", msg.type)
    return { success: false, content: { error: "Unknown message type" } }
}

// Main translation function
async function translateImage(url, site, blobData, actionType) {
    try {
        const form = new FormData()

        // Handle blob data
        if (blobData) {
            const imageArray = new Uint8Array(blobData)
            const imageBlob = new Blob([imageArray])
            form.append("file", imageBlob)
        }

        // Handle URL
        if (url && !url.startsWith("blob")) {
            form.append("url", url)
        }

        // Get settings from storage
        const settings = await chrome.storage.sync.get({
            torii_target_lang: "en",
            torii_font: "wildwords",
            translation_model: "gemini-2.0-flash",
            torii_stroke_enabled: true,
            torii_light_novel_mode: false,
            torii_legacy_inpaint: false
        })

        // Prepare headers (no authentication needed)
        const headers = {
            "X-Target-Lang": settings["torii_target_lang"],
            "X-Translator": settings["translation_model"],
            "X-Font": settings["torii_font"],
            "X-Stroke-Disabled": !settings["torii_stroke_enabled"],
            "X-Light-Novel-Mode": settings["torii_light_novel_mode"],
            "X-Legacy-Inpaint": settings["torii_legacy_inpaint"],
            "X-Image-URL": site,
            "X-Action": actionType,
            "X-API-Version": "v1"
        }

        // Call your local API instead of Torii
        const response = await fetch(`${CONFIG.apiUrl}/translate-image`, {
            method: "POST",
            body: form,
            headers: headers,
            signal: AbortSignal.timeout(100000),
        })

        if (!response.ok) {
            const errorText = await response.text()
            return {
                success: false,
                content: { error: errorText }
            }
        }

        const result = await response.json()

        if (!result.success) {
            return {
                success: false,
                content: { error: result.error || "Failed to process image" }
            }
        }

        return {
            success: true,
            content: {
                translated: result.translated_image,
                original: result.original_image,
                inpainted: result.inpainted_image,
                text: result.detected_text
            }
        }

    } catch (error) {
        await sendError(error, "translate image from: " + site)
        return { success: false, content: { error: "Failed to process image." } }
    }
}

// Inpaint function
async function inpaintImage(imageData, maskData) {
    try {
        const imageArray = new Uint8Array(imageData)
        const imageBlob = new Blob([imageArray])

        const maskArray = new Uint8Array(maskData)
        const maskBlob = new Blob([maskArray])

        const formData = new FormData()
        formData.append("image", imageBlob)
        formData.append("mask", maskBlob)

        const response = await fetch(`${CONFIG.apiUrl}/inpaint`, {
            method: "POST",
            body: formData,
            signal: AbortSignal.timeout(60000),
        })

        if (!response.ok) {
            return { success: false, content: { error: "Failed to inpaint image." } }
        }

        const result = await response.json()

        if (!result.success) {
            return { success: false, content: { error: result.error || "Failed to inpaint image." } }
        }

        return {
            success: true,
            content: { inpaintedImageSrc: result.inpainted_image }
        }

    } catch (error) {
        await sendError(error, "inpaint")
        return { success: false, content: { error: "Failed to inpaint image." } }
    }
}

// Storage function
async function getStorageImages(storageURLs) {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/storage?urls=${encodeURIComponent(JSON.stringify(storageURLs))}`, {
            method: "GET",
            signal: AbortSignal.timeout(100000),
        })

        if (!response.ok) {
            return { success: false, content: { error: "Failed to get storage images." } }
        }

        const data = await response.json()
        return { success: true, content: data }

    } catch (error) {
        await sendError(error, "get storage images")
        return { success: false, content: { error: "Failed to get storage images." } }
    }
}

// Edit function
async function getImageForEdit(url, site) {
    try {
        const image = await fetch(url, {
            headers: {
                "Referer": site,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
            }
        })

        if (image.ok) {
            const imageBlob = await image.blob()
            const src = await blobToImage(imageBlob)
            return { success: true, content: { src: src } }
        }

        return { success: false, content: { error: "Failed to get image." } }

    } catch (error) {
        await sendError(error, "get image for edit")
        return { success: false, content: { error: "Failed to get image." } }
    }
}

// Screenshot function
async function takeScreenshot() {
    try {
        const dataURL = await chrome.tabs.captureVisibleTab(null, { format: "png" })
        return { success: true, content: { dataURL } }
    } catch (error) {
        await sendError(error, "take screenshot")
        return { success: false, content: { error: "Failed to take screenshot." } }
    }
}

// Error logging function (simplified)
async function sendError(error, loc) {
    try {
        if (error?.message?.includes?.("because the client is offline")) {
            return
        }

        sentErrors += 1

        if (sentErrors > CONFIG.maxErrors) {
            return
        }

        // Simple console logging (you can enhance this)
        console.error(`Error in ${loc}:`, error)

        // Optional: Send to your own error reporting API
        // const report = {
        //     stack_trace: error?.stack,
        //     message: error?.message,
        //     created: new Date().toISOString(),
        //     location: loc,
        //     meta: {
        //         agent: navigator?.userAgent || null,
        //         platform: navigator?.userAgentData?.platform || null,
        //     }
        // }

        // await fetch(`${CONFIG.apiUrl}/report-error`, {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify(report)
        // })

    } catch (reportError) {
        console.error("Failed to report error:", reportError)
    }
}

// Simplified uninstall URL function
async function setUninstallURL() {
    try {
        const url = `https://your-website.com/feedback?reason=uninstall`
        await chrome.runtime.setUninstallURL(url)
    } catch (error) {
        console.error("Failed to set uninstall URL:", error)
    }
}

// Installation handler (simplified)
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        const currentVersion = chrome.runtime.getManifest().version
        const previousVersion = details.previousVersion
        const reason = details.reason

        if (reason === "update") {
            console.log(`Extension updated from ${previousVersion} to ${currentVersion}`)
        } else if (reason === "install") {
            console.log("Extension installed")
            // await setUninstallURL() // Optional
        }

    } catch (error) {
        console.error("onInstalled error:", error)
    }

    // Create context menus
    try {
        chrome.contextMenus.create({
            id: "torii_contextmenu",
            title: "Torii (Alt+Shift+D)",
            contexts: ["all"]
        })

        chrome.contextMenus.create({
            id: "torii_screenshot",
            title: "Screenshot Image (Alt+Shift+C)",
            contexts: ["all"],
            parentId: "torii_contextmenu"
        })

        chrome.contextMenus.create({
            id: "torii_translate",
            title: "Translate Image (Alt+Shift+Z)",
            contexts: ["all"],
            parentId: "torii_contextmenu"
        })

        chrome.contextMenus.create({
            id: "torii_screencrop",
            title: "Screen Crop Image (Alt+Shift+X)",
            contexts: ["all"],
            parentId: "torii_contextmenu"
        })

        chrome.contextMenus.create({
            id: "torii_repeatscreencrop",
            title: "Repeat Last Screen Crop",
            contexts: ["all"],
            parentId: "torii_contextmenu"
        })

        chrome.contextMenus.create({
            id: "torii_edit",
            title: "Edit Image",
            contexts: ["all"],
            parentId: "torii_contextmenu"
        })

        chrome.contextMenus.create({
            id: "torii_auto",
            title: "Toggle Auto Translate",
            contexts: ["all"],
            parentId: "torii_contextmenu"
        })
    } catch (error) {
        console.log("Failed to create context menus. Error: ", error)
    }
})

// Commands handler (reduced to 4 shortcuts max)
try {
    chrome.commands.onCommand.addListener(async (command, tab) => {
        if (tab && command === "torii_contextmenu") {
            chrome.tabs.sendMessage(tab.id, { type: "command_contextmenu" }).catch(() => { })
        }

        if (tab && command === "torii_screencrop") {
            chrome.tabs.sendMessage(tab.id, { type: "command_screencrop" }).catch(() => { })
        }

        if (tab && command === "torii_translate") {
            chrome.tabs.sendMessage(tab.id, { type: "command_translate" }).catch(() => { })
        }

        if (tab && command === "torii_screenshot") {
            chrome.tabs.sendMessage(tab.id, { type: "command_screenshot" }).catch(() => { })
        }
    })
} catch (error) {
    console.log("Failed to create command listener. Error: ", error)
}

// Context menu click handler
try {
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (info.menuItemId === "torii_screenshot") {
            chrome.tabs.sendMessage(tab.id, { type: "contextmenu_screenshot" }).catch(() => { })
        } else if (info.menuItemId === "torii_translate") {
            chrome.tabs.sendMessage(tab.id, { type: "contextmenu_translate" }).catch(() => { })
        } else if (info.menuItemId === "torii_screencrop") {
            chrome.tabs.sendMessage(tab.id, { type: "contextmenu_screencrop" }).catch(() => { })
        } else if (info.menuItemId === "torii_repeatscreencrop") {
            chrome.tabs.sendMessage(tab.id, { type: "contextmenu_repeatscreencrop" }).catch(() => { })
        } else if (info.menuItemId === "torii_edit") {
            chrome.tabs.sendMessage(tab.id, { type: "contextmenu_edit" }).catch(() => { })
        } else if (info.menuItemId === "torii_auto") {
            chrome.tabs.sendMessage(tab.id, { type: "contextmenu_auto" }).catch(() => { })
        }
    })

    chrome.storage.sync.set({ torii_contextmenu: true })
} catch (error) {
    chrome.storage.sync.set({ torii_contextmenu: false })
}