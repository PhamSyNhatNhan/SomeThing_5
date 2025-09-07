let enabled = true
let auto = false
let autoError = false
let minImageSize = 100
let credits = null
let contextMenuPos = null
let takeScreenshot = false
let screencropping = false
let hasContextMenu = true
let contextMenuTargetElement = null
let isEditing = false
let toriiLocation = "tl"
let lastScreencropRect = null
const executingPromises = new Set()
const cursorPos = { x: 0, y: 0 }
const toriiTargets = new Map()
const currentURL = "torii_" + window.location.host

const toriiStyle = document.createElement("link")
toriiStyle.rel = "stylesheet"
toriiStyle.href = chrome.runtime.getURL("css/content.css")

const tailwindStyle = document.createElement("link")
tailwindStyle.rel = "stylesheet"
tailwindStyle.href = chrome.runtime.getURL("css/tailwind.css")

const toriiOverlay = document.createElement("div")
const toriiDOM = toriiOverlay.attachShadow({ mode: "open" })

toriiDOM.appendChild(toriiStyle)
toriiDOM.appendChild(tailwindStyle)
document.body.appendChild(toriiOverlay)

const copyOriginal = new Image()
copyOriginal.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M7 4V2H17V4H20.0066C20.5552 4 21 4.44495 21 4.9934V21.0066C21 21.5552 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5551 3 21.0066V4.9934C3 4.44476 3.44495 4 3.9934 4H7ZM7 6H5V20H19V6H17V8H7V6ZM9 4V6H15V4H9Z'%3E%3C/path%3E%3C/svg%3E"

const copyTranslated = new Image()
copyTranslated.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M6 4V8H18V4H20.0066C20.5552 4 21 4.44495 21 4.9934V21.0066C21 21.5552 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5551 3 21.0066V4.9934C3 4.44476 3.44495 4 3.9934 4H6ZM8 2H16V6H8V2Z'%3E%3C/path%3E%3C/svg%3E"

let globalKeydownCallbacks = new Map()
window.addEventListener("keydown", (e) => {
    if (isEditing) {
        for (const callback of globalKeydownCallbacks.values()) {
            callback(e)
        }

        e.stopPropagation()
        e.stopImmediatePropagation()
    } else {
        if (e.altKey && e.shiftKey) {
            contextMenuPos = structuredClone(cursorPos)
        }
    }

}, { capture: true })

function handleScrollDuringEdit(e) {
    if (!isEditing) return

    const el = toriiDOM.getElementById("working-canvas")?.parentElement

    if (!el) return

    const deltaY = e.deltaY
    const deltaX = e.deltaX

    const tryingToScrollDown = deltaY > 0
    const tryingToScrollUp = deltaY < 0

    const tryingToScrollRight = deltaX > 0
    const tryingToScrollLeft = deltaX < 0

    const canScrollDown = el.scrollTop < el.scrollHeight - el.clientHeight
    const canScrollUp = el.scrollTop > 0

    const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth
    const canScrollLeft = el.scrollLeft > 0

    const canScrollInAttemptedDirection =
        (tryingToScrollDown && canScrollDown) ||
        (tryingToScrollUp && canScrollUp) ||
        (tryingToScrollRight && canScrollRight) ||
        (tryingToScrollLeft && canScrollLeft)

    if (!canScrollInAttemptedDirection) {
        e.preventDefault()
    }
}

document.addEventListener('wheel', handleScrollDuringEdit, { passive: false, capture: true })
document.addEventListener('touchmove', handleScrollDuringEdit, { passive: false, capture: true })

setInterval(() => {
    chrome.runtime.sendMessage({ type: "keep-alive" }).then((response) => { })
}, 2000)

setInterval(async () => {
    for (const [targetElement, toriiData] of toriiTargets) {

        const toriiHash = toriiData.toriiHash

        if (toriiHash) {
            const hash = await hashElement(targetElement)

            if (hash !== toriiHash) {
                removeToriiFromTarget(targetElement, true)
            }
        }
    }
}, 1000);

setInterval(() => {
    try {
        if (auto && credits !== null && !autoError) {
            const images = document.getElementsByTagName("img")
            const canvases = document.getElementsByTagName("canvas")

            for (const image of images) {
                if (toriiTargets.has(image)) {
                    const toriiTarget = toriiTargets.get(image)
                    if (toriiTarget.toriiState == "original") {
                        click(toriiTarget.toriiIcon)
                    }
                } else if ((image.clientHeight > 400 || image.clientHeight > window.innerHeight / 2) && (image.clientWidth > 400 || image.clientWidth > window.innerWidth / 2)) {
                    if (enabled) {
                        createTorii(image, true)
                    } else {
                        contextMenuClick(image)
                    }
                }
            }

            for (const canvas of canvases) {
                if (toriiTargets.has(canvas)) {
                    const toriiTarget = toriiTargets.get(canvas)
                    if (toriiTarget.toriiState == "original") {
                        click(toriiTarget.toriiIcon)
                    }
                } else if ((canvas.clientHeight > 400 || canvas.clientHeight > window.innerHeight / 2) && (canvas.clientWidth > 400 || canvas.clientWidth > window.innerWidth / 2)) {
                    if (enabled) {
                        createTorii(canvas, true)
                    } else {
                        contextMenuClick(canvas)
                    }
                }
            }
        }
    } catch (error) {
        sendError(error, "setInterval auto from: " + window.location.href)

        turnOffAuto()
    }
}, 1000)

chrome.storage.sync.get({ [currentURL]: "na", torii_default_enabled: true, torii_contextmenu: true, torii_location: "tl" }, (result) => {
    if (result[currentURL] == "na") {
        enabled = result["torii_default_enabled"]
    } else {
        enabled = result[currentURL]
    }

    if (window.location.host == "toriitranslate.com" || window.location.host == "torii-image-translator.firebaseapp.com") {
        enabled = false
    }

    hasContextMenu = result["torii_contextmenu"]
    toriiLocation = result["torii_location"]
})

chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (key == currentURL) {
            enabled = newValue

            if (!enabled) {
                for (const [targetElement, toriiData] of toriiTargets) {
                    if (!toriiData.active) continue

                    removeToriiFromTarget(targetElement)
                }
            }
        }

        if (key == "torii_location") {
            toriiLocation = newValue
        }
    }
})

chrome.runtime.sendMessage({ type: "user", sender: "content" }).then((response) => {
    if (response.success) {
        const baseCredits = response.content.credits || 0
        const subscriptionCredits = response.content?.subscription?.credits || 0

        credits = Number(baseCredits) + Number(subscriptionCredits)

        updateCredits(credits)
    }
}).catch((error) => {
    sendError(error, "user")
})

function contextMenuImage(pos) {
    try {
        let targetElement = null

        const element = document.elementFromPoint(pos.x, pos.y)
        if (element.nodeName.toLowerCase() == "img" || element.nodeName.toLowerCase() == "canvas") {
            targetElement = element
        }

        if (!targetElement) {
            const subimage = getSubimage(element, pos)
            if (subimage.nodeName.toLowerCase() == "img" || subimage.nodeName.toLowerCase() == "canvas") {
                targetElement = subimage
            }
        }

        if (!targetElement) {
            const elementsFromPoint = document.elementsFromPoint(pos.x, pos.y)
            for (const elementFromPoint of elementsFromPoint) {
                if (elementFromPoint?.nodeName?.toLowerCase?.() == "img" || elementFromPoint?.nodeName?.toLowerCase?.() == "canvas") {
                    targetElement = elementFromPoint
                    break
                }
            }
        }

        if (auto) {
            turnOffAuto()
        }

        if (!targetElement) {
            showError("No image found. This menu option is only available for images.", null)

            return
        }

        if (toriiTargets.has(targetElement) && (toriiTargets.get(targetElement).toriiState == "original" || toriiTargets.get(targetElement).toriiState == "error")) {
            click(toriiTargets.get(targetElement).toriiIcon)
        } else if (!toriiTargets.has(targetElement) && enabled) {
            createTorii(targetElement, true)
        } else if (!enabled) {
            contextMenuClick(targetElement)
        }
    } catch (error) {
        sendError(error, "contextmenu_screenshot")
    }
}

function contextMenuScreencrop(from) {
    if (credits === null) {
        showError("Please log in with the extension from the popup. Go to your browser's extension menu.", null)
        return
    }

    screencropping = true

    chrome.runtime.sendMessage({ type: "screenshot" }).then((response) => {
        if (response.success) {
            try {
                const toriiScreenImage = document.createElement("img")
                toriiScreenImage.classList.add("torii-screen-image")
                toriiScreenImage.src = response.content.dataURL
                toriiScreenImage.draggable = false

                const toriiScreenInstructions = document.createElement("div")
                toriiScreenInstructions.innerHTML = "Drag the area you want to translate or hit ESC to cancel"
                toriiScreenInstructions.classList.add("torii-screen-instructions")

                if (from == "contextmenu") {
                    const toriiScreenInstructionsHint = document.createElement("div")
                    toriiScreenInstructionsHint.innerHTML = "Hint: you can press 'Alt + Shift + X' to Screen Crop, instead of using the right-click menu."
                    toriiScreenInstructionsHint.classList.add("torii-screen-instructions-hint")

                    toriiScreenInstructions.appendChild(toriiScreenInstructionsHint)
                }

                const toriiCropRect = document.createElement("div")
                toriiCropRect.classList.add("torii-crop-rect")

                const MIN_WIDTH = 50
                const MIN_HEIGHT = 70

                const scrollX = window.scrollX
                const scrollY = window.scrollY

                let startX, startY

                const startRect = (e) => {
                    if (e.target === toriiScreenImage) {
                        toriiScreenInstructions.style.display = "none"
                        toriiScreenImage.setPointerCapture(e.pointerId)
                        startX = e.clientX
                        startY = e.clientY
                        toriiCropRect.style.left = `${startX}px`
                        toriiCropRect.style.top = `${startY}px`
                        toriiCropRect.style.width = "0px"
                        toriiCropRect.style.height = "0px"
                        toriiCropRect.style.border = "2px dashed #60B7D3"
                    }
                }

                const moveRect = (e) => {
                    if (toriiScreenImage.hasPointerCapture(e.pointerId)) {
                        const currentX = e.clientX
                        const currentY = e.clientY

                        let width = Math.abs(currentX - startX)
                        let height = Math.abs(currentY - startY)

                        if (width < MIN_WIDTH) {
                            width = MIN_WIDTH
                        }
                        if (height < MIN_HEIGHT) {
                            height = MIN_HEIGHT
                        }

                        const left = startX < currentX ? startX : startX - width
                        const top = startY < currentY ? startY : startY - height

                        toriiCropRect.style.width = `${width}px`
                        toriiCropRect.style.height = `${height}px`
                        toriiCropRect.style.left = `${left}px`
                        toriiCropRect.style.top = `${top}px`
                    }
                }

                const endRect = (e) => {
                    if (!toriiScreenImage.hasPointerCapture(e.pointerId)) return

                    toriiScreenImage.releasePointerCapture(e.pointerId)
                    toriiScreenImage.removeEventListener("pointerdown", startRect)
                    toriiScreenImage.removeEventListener("pointermove", moveRect)
                    toriiScreenImage.removeEventListener("pointerup", endRect)
                    toriiScreenImage.style.cursor = "not-allowed"

                    if (toriiCropRect.style.width == "0px" || toriiCropRect.style.height == "0px") {
                        toriiCropRect.style.width = `${MIN_WIDTH}px`
                        toriiCropRect.style.height = `${MIN_HEIGHT}px`
                    }

                    toriiCropRect.style.cursor = "grab"

                    const move = (e) => {
                        toriiCropRect.style.left = `${toriiCropRect.offsetLeft + e.movementX}px`
                        toriiCropRect.style.top = `${toriiCropRect.offsetTop + e.movementY}px`
                    }

                    const dragStart = (el, e, cursor) => {
                        if (e.target == el) {
                            el.setPointerCapture(e.pointerId)
                            el.style.cursor = cursor
                        }
                    }
                    const drag = (el, e, action) => el.hasPointerCapture(e.pointerId) && action(e)
                    const dragEnd = (el, e, cursor) => {
                        if (e.target == el) {
                            el.releasePointerCapture(e.pointerId)
                            el.style.cursor = cursor
                        }
                    }

                    toriiCropRect.addEventListener("pointerdown", (e) => dragStart(toriiCropRect, e, "grabbing"))
                    toriiCropRect.addEventListener("pointermove", (e) => drag(toriiCropRect, e, move))
                    toriiCropRect.addEventListener("pointerup", (e) => dragEnd(toriiCropRect, e, "grab"))

                    const toriiResizeElement = document.createElement("div")
                    toriiResizeElement.classList.add("torii-resize-element")

                    const resize = (e) => {
                        const width = toriiCropRect.offsetWidth + e.movementX
                        const height = toriiCropRect.offsetHeight + e.movementY

                        if (width < 50 || height < 70) {
                            return
                        }

                        toriiCropRect.style.width = `${width}px`
                        toriiCropRect.style.height = `${height}px`
                    }

                    toriiResizeElement.addEventListener("pointerdown", (e) => dragStart(toriiResizeElement, e, "nwse-resize"))
                    toriiResizeElement.addEventListener("pointermove", (e) => drag(toriiResizeElement, e, resize))
                    toriiResizeElement.addEventListener("pointerup", (e) => dragEnd(toriiResizeElement, e, "nwse-resize"))

                    const toriiCropTranslate = document.createElement("button")
                    toriiCropTranslate.classList.add("torii-crop-translate")

                    const toriiCropTranslateIcon = document.createElement("img")
                    toriiCropTranslateIcon.src = chrome.runtime.getURL("images/check.svg")
                    toriiCropTranslateIcon.classList.add("torii-crop-translate-icon")

                    const toriiCropCancel = document.createElement("button")
                    toriiCropCancel.classList.add("torii-crop-cancel")

                    const toriiCropCancelIcon = document.createElement("img")
                    toriiCropCancelIcon.src = chrome.runtime.getURL("images/close.svg")
                    toriiCropCancelIcon.classList.add("torii-crop-cancel-icon")

                    toriiCropCancel.addEventListener("pointerup", (e) => {
                        toriiScreenImage.remove()
                        toriiCropRect.remove()
                        document.onkeydown = null
                        screencropping = false
                    })

                    toriiCropTranslate.addEventListener("pointerup", async (e) => {
                        lastScreencropRect = {
                            x: toriiCropRect.offsetLeft,
                            y: toriiCropRect.offsetTop,
                            width: toriiCropRect.offsetWidth,
                            height: toriiCropRect.offsetHeight
                        }

                        const canvas = document.createElement("canvas")
                        const devicePixelRatio = window.devicePixelRatio || 1
                        canvas.width = toriiCropRect.offsetWidth * devicePixelRatio
                        canvas.height = toriiCropRect.offsetHeight * devicePixelRatio

                        const ctx = canvas.getContext("2d")
                        ctx.imageSmoothingEnabled = false
                        ctx.drawImage(
                            toriiScreenImage,
                            toriiCropRect.offsetLeft * devicePixelRatio,
                            toriiCropRect.offsetTop * devicePixelRatio,
                            toriiCropRect.offsetWidth * devicePixelRatio,
                            toriiCropRect.offsetHeight * devicePixelRatio,
                            0,
                            0,
                            toriiCropRect.offsetWidth * devicePixelRatio,
                            toriiCropRect.offsetHeight * devicePixelRatio
                        )

                        const blob = await new Promise((resolve) => canvas.toBlob(resolve))
                        const buffer = await blob.arrayBuffer()
                        const arrayBuffer = Array.from(new Uint8Array(buffer))

                        const toriiCroppedImageWrapper = document.createElement("div")
                        toriiCroppedImageWrapper.style.width = `${toriiCropRect.offsetWidth}px`
                        toriiCroppedImageWrapper.style.height = `${toriiCropRect.offsetHeight}px`
                        toriiCroppedImageWrapper.style.left = `${toriiCropRect.offsetLeft + scrollX}px`
                        toriiCroppedImageWrapper.style.top = `${toriiCropRect.offsetTop + scrollY}px`
                        toriiCroppedImageWrapper.classList.add("torii-cropped-image-wrapper")

                        const mindim = Math.min(toriiCropRect.offsetWidth, toriiCropRect.offsetHeight)
                        const toriiLoaderSize = Math.min(Math.round(mindim / 2), 60)

                        const toriiCroppedImage = document.createElement("img")
                        toriiCroppedImage.src = chrome.runtime.getURL("images/torii.png")
                        toriiCroppedImage.draggable = false
                        toriiCroppedImage.style.width = `${toriiLoaderSize}px`
                        toriiCroppedImage.style.height = `${toriiLoaderSize}px`
                        toriiCroppedImage.classList.add("torii-loading")

                        toriiCroppedImageWrapper.addEventListener("pointerdown", (e) => {
                            if (e.target == toriiCroppedImageWrapper || e.target == toriiCroppedImage) {
                                toriiCroppedImageWrapper.setPointerCapture(e.pointerId)
                                toriiCroppedImageWrapper.style.cursor = "grabbing"
                            }
                        })

                        toriiCroppedImageWrapper.addEventListener("pointermove", (e) => {
                            if (toriiCroppedImageWrapper.hasPointerCapture(e.pointerId)) {
                                toriiCroppedImageWrapper.style.left = `${toriiCroppedImageWrapper.offsetLeft + e.movementX}px`
                                toriiCroppedImageWrapper.style.top = `${toriiCroppedImageWrapper.offsetTop + e.movementY}px`
                            }
                        })

                        toriiCroppedImageWrapper.addEventListener("pointerup", (e) => {
                            if (e.target == toriiCroppedImageWrapper || e.target == toriiCroppedImage) {
                                toriiCroppedImageWrapper.releasePointerCapture(e.pointerId)
                                toriiCroppedImageWrapper.style.cursor = "grab"
                            }
                        })

                        toriiCroppedImageWrapper.appendChild(toriiCroppedImage)
                        toriiDOM.appendChild(toriiCroppedImageWrapper)

                        chrome.runtime.sendMessage({
                            type: "translate",
                            url: null,
                            site: window.location.href,
                            actionType: "menu_crop",
                            buffer: arrayBuffer
                        }).then((response) => {
                            if (response.success) {
                                toriiCroppedImage.src = response.content.translated
                                toriiCroppedImage.classList.remove("torii-loading")
                                toriiCroppedImage.style.width = "100%"
                                toriiCroppedImage.style.height = "100%"

                                const toriiCroppedImageEdit = document.createElement("button")
                                toriiCroppedImageEdit.title = "Edit image"
                                toriiCroppedImageEdit.classList.add("torii-crop-translate")

                                const toriiCroppedImageEditIcon = document.createElement("img")
                                toriiCroppedImageEditIcon.src = chrome.runtime.getURL("images/edit.svg")
                                toriiCroppedImageEditIcon.classList.add("torii-crop-translate-icon")

                                const toriiCroppedImageClose = document.createElement("button")
                                toriiCroppedImageClose.classList.add("torii-crop-cancel")

                                const toriiCroppedImageCloseIcon = document.createElement("img")
                                toriiCroppedImageCloseIcon.src = chrome.runtime.getURL("images/close.svg")
                                toriiCroppedImageCloseIcon.classList.add("torii-crop-cancel-icon")

                                toriiCroppedImageCloseIcon.addEventListener("pointerup", (e) => {
                                    toriiCroppedImageWrapper.remove()
                                })

                                toriiCroppedImageEdit.addEventListener("pointerup", (e) => {
                                    toriiCroppedImageEditIcon.classList.add("torii-rotating")
                                    editImage(toriiCroppedImage)
                                })

                                toriiCroppedImageClose.appendChild(toriiCroppedImageCloseIcon)
                                toriiCroppedImageEdit.appendChild(toriiCroppedImageEditIcon)
                                toriiCroppedImageWrapper.appendChild(toriiCroppedImageClose)
                                toriiCroppedImageWrapper.appendChild(toriiCroppedImageEdit)

                                toriiTargets.set(toriiCroppedImage, {
                                    active: false,
                                    toriiEditIcon: toriiCroppedImageEditIcon,
                                    inpainted: response.content.inpainted,
                                    original: response.content.original,
                                    text: response.content.text,
                                    textObjects: null,
                                    textObjectsTemp: null
                                })
                            } else {
                                showError(response.content.error, null)
                                toriiCroppedImageWrapper.remove()
                                toriiCroppedImage.remove()
                                toriiCroppedImageWrapper.remove()

                                screencropping = false
                                return
                            }
                        }).catch((error) => {
                            showError("Failed to process image.", null)

                            sendError(error, "contextmenu_screencrop_translate")

                            toriiScreenImage.remove()
                            toriiCropRect.remove()
                            toriiScreenInstructions.remove()

                            screencropping = false

                            return
                        })

                        click(toriiCropCancel)
                    })

                    toriiCropCancel.appendChild(toriiCropCancelIcon)
                    toriiCropTranslate.appendChild(toriiCropTranslateIcon)
                    toriiCropRect.appendChild(toriiResizeElement)
                    toriiCropRect.appendChild(toriiCropTranslate)
                    toriiCropRect.appendChild(toriiCropCancel)
                }

                toriiScreenImage.addEventListener("pointerdown", startRect)
                toriiScreenImage.addEventListener("pointermove", moveRect)
                toriiScreenImage.addEventListener("pointerup", endRect)

                toriiDOM.appendChild(toriiScreenImage)
                toriiDOM.appendChild(toriiScreenInstructions)
                toriiDOM.appendChild(toriiCropRect)

                document.onkeydown = (e) => {
                    if (e.key === "Escape") {
                        e.preventDefault()
                        e.stopPropagation()
                        toriiScreenImage.remove()
                        toriiCropRect.remove()
                        toriiScreenInstructions.remove()
                        document.onkeydown = null
                        screencropping = false
                    }
                }
            } catch (error) {
                showError("Something went wrong. Please contact support.", null)

                screencropping = false

                try {
                    if (toriiScreenImage) {
                        toriiScreenImage.remove()
                    }
                } catch (error) {
                    console.log("Failed to remove screen image. Error: ", error)
                }

                try {
                    if (toriiCropRect) {
                        toriiCropRect.remove()
                    }
                } catch (error) {
                    console.log("Failed to remove crop rect. Error: ", error)
                }

                try {
                    if (toriiScreenInstructions) {
                        toriiScreenInstructions.remove()
                    }
                } catch (error) {
                    console.log("Failed to remove screen instructions. Error: ", error)
                }

                document.onkeydown = null

                sendError(error, "contextmenu_screencrop")
            }
        } else {
            showError("Failed to take a screenshot.", null)

            screencropping = false

            sendError(response.content.error, "contextmenu_screencrop")
        }
    })
}

function contextMenuScreencropRepeat(boundingBox) {
    if (credits === null) {
        showError("Please log in with the extension from the popup. Go to your browser's extension menu.", null)
        return
    }

    if (!lastScreencropRect) {
        showError("Please take a normal screen crop first.", null)
        return
    }

    // Validate bounding box input
    if (!boundingBox || typeof boundingBox !== 'object' ||
        !boundingBox.hasOwnProperty('x') || !boundingBox.hasOwnProperty('y') ||
        !boundingBox.hasOwnProperty('width') || !boundingBox.hasOwnProperty('height')) {
        showError("Invalid bounding box. Expected object with x, y, width, height properties.", null)
        return
    }

    const { x, y, width, height } = boundingBox

    // Validate dimensions
    if (width < 50 || height < 70) {
        showError("Bounding box too small. Minimum size is 50x70 pixels.", null)
        return
    }

    screencropping = true

    chrome.runtime.sendMessage({ type: "screenshot" }).then((response) => {
        if (response.success) {
            try {
                const toriiScreenImage = document.createElement("img")
                toriiScreenImage.src = response.content.dataURL
                toriiScreenImage.draggable = false
                toriiScreenImage.style.display = "none" // Hide since we don't need UI

                // Wait for image to load before processing
                toriiScreenImage.onload = async () => {
                    try {
                        const scrollX = window.scrollX
                        const scrollY = window.scrollY

                        // Create canvas for cropping
                        const canvas = document.createElement("canvas")
                        const devicePixelRatio = window.devicePixelRatio || 1
                        canvas.width = width * devicePixelRatio
                        canvas.height = height * devicePixelRatio

                        const ctx = canvas.getContext("2d")
                        ctx.imageSmoothingEnabled = false
                        ctx.drawImage(
                            toriiScreenImage,
                            x * devicePixelRatio,
                            y * devicePixelRatio,
                            width * devicePixelRatio,
                            height * devicePixelRatio,
                            0,
                            0,
                            width * devicePixelRatio,
                            height * devicePixelRatio
                        )

                        const blob = await new Promise((resolve) => canvas.toBlob(resolve))
                        const buffer = await blob.arrayBuffer()
                        const arrayBuffer = Array.from(new Uint8Array(buffer))

                        // Create the result image wrapper
                        const toriiCroppedImageWrapper = document.createElement("div")
                        toriiCroppedImageWrapper.style.width = `${width}px`
                        toriiCroppedImageWrapper.style.height = `${height}px`
                        toriiCroppedImageWrapper.style.left = `${x + scrollX}px`
                        toriiCroppedImageWrapper.style.top = `${y + scrollY}px`
                        toriiCroppedImageWrapper.classList.add("torii-cropped-image-wrapper")

                        const mindim = Math.min(width, height)
                        const toriiLoaderSize = Math.min(Math.round(mindim / 2), 60)

                        const toriiCroppedImage = document.createElement("img")
                        toriiCroppedImage.src = chrome.runtime.getURL("images/torii.png")
                        toriiCroppedImage.draggable = false
                        toriiCroppedImage.style.width = `${toriiLoaderSize}px`
                        toriiCroppedImage.style.height = `${toriiLoaderSize}px`
                        toriiCroppedImage.classList.add("torii-loading")

                        // Add drag functionality to the result
                        toriiCroppedImageWrapper.addEventListener("pointerdown", (e) => {
                            if (e.target == toriiCroppedImageWrapper || e.target == toriiCroppedImage) {
                                toriiCroppedImageWrapper.setPointerCapture(e.pointerId)
                                toriiCroppedImageWrapper.style.cursor = "grabbing"
                            }
                        })

                        toriiCroppedImageWrapper.addEventListener("pointermove", (e) => {
                            if (toriiCroppedImageWrapper.hasPointerCapture(e.pointerId)) {
                                toriiCroppedImageWrapper.style.left = `${toriiCroppedImageWrapper.offsetLeft + e.movementX}px`
                                toriiCroppedImageWrapper.style.top = `${toriiCroppedImageWrapper.offsetTop + e.movementY}px`
                            }
                        })

                        toriiCroppedImageWrapper.addEventListener("pointerup", (e) => {
                            if (e.target == toriiCroppedImageWrapper || e.target == toriiCroppedImage) {
                                toriiCroppedImageWrapper.releasePointerCapture(e.pointerId)
                                toriiCroppedImageWrapper.style.cursor = "grab"
                            }
                        })

                        toriiCroppedImageWrapper.appendChild(toriiCroppedImage)
                        toriiDOM.appendChild(toriiCroppedImageWrapper)

                        // Send for translation
                        chrome.runtime.sendMessage({
                            type: "translate",
                            url: null,
                            site: window.location.href,
                            actionType: "menu_crop",
                            buffer: arrayBuffer
                        }).then((response) => {
                            if (response.success) {
                                toriiCroppedImage.src = response.content.translated
                                toriiCroppedImage.classList.remove("torii-loading")
                                toriiCroppedImage.style.width = "100%"
                                toriiCroppedImage.style.height = "100%"

                                // Add edit button
                                const toriiCroppedImageEdit = document.createElement("button")
                                toriiCroppedImageEdit.title = "Edit image"
                                toriiCroppedImageEdit.classList.add("torii-crop-translate")

                                const toriiCroppedImageEditIcon = document.createElement("img")
                                toriiCroppedImageEditIcon.src = chrome.runtime.getURL("images/edit.svg")
                                toriiCroppedImageEditIcon.classList.add("torii-crop-translate-icon")

                                // Add close button
                                const toriiCroppedImageClose = document.createElement("button")
                                toriiCroppedImageClose.classList.add("torii-crop-cancel")

                                const toriiCroppedImageCloseIcon = document.createElement("img")
                                toriiCroppedImageCloseIcon.src = chrome.runtime.getURL("images/close.svg")
                                toriiCroppedImageCloseIcon.classList.add("torii-crop-cancel-icon")

                                toriiCroppedImageCloseIcon.addEventListener("pointerup", (e) => {
                                    toriiCroppedImageWrapper.remove()
                                })

                                toriiCroppedImageEdit.addEventListener("pointerup", (e) => {
                                    toriiCroppedImageEditIcon.classList.add("torii-rotating")
                                    editImage(toriiCroppedImage)
                                })

                                toriiCroppedImageClose.appendChild(toriiCroppedImageCloseIcon)
                                toriiCroppedImageEdit.appendChild(toriiCroppedImageEditIcon)
                                toriiCroppedImageWrapper.appendChild(toriiCroppedImageClose)
                                toriiCroppedImageWrapper.appendChild(toriiCroppedImageEdit)

                                toriiTargets.set(toriiCroppedImage, {
                                    active: false,
                                    toriiEditIcon: toriiCroppedImageEditIcon,
                                    inpainted: response.content.inpainted,
                                    original: response.content.original,
                                    text: response.content.text,
                                    textObjects: null,
                                    textObjectsTemp: null
                                })

                                // Store the last used rect for potential reuse
                                lastScreencropRect = { x, y, width, height }

                            } else {
                                showError(response.content.error, null)
                                toriiCroppedImageWrapper.remove()
                            }

                            screencropping = false
                        }).catch((error) => {
                            showError("Failed to process image.", null)
                            sendError(error, "repeat_screencrop_translate")
                            toriiCroppedImageWrapper.remove()
                            screencropping = false
                        })

                        // Clean up the hidden image
                        toriiScreenImage.remove()

                    } catch (error) {
                        showError("Failed to process the bounding box.", null)
                        sendError(error, "repeat_screencrop_process")
                        screencropping = false
                        toriiScreenImage.remove()
                    }
                }

            } catch (error) {
                showError("Something went wrong. Please contact support.", null)
                sendError(error, "repeat_screencrop")
                screencropping = false
            }
        } else {
            showError("Failed to take a screenshot.", null)
            sendError(response.content.error, "repeat_screencrop")
            screencropping = false
        }
    }).catch((error) => {
        showError("Failed to communicate with extension.", null)
        sendError(error, "repeat_screencrop_message")
        screencropping = false
    })
}


function contextMenuEdit(pos) {
    try {
        let targetElement = null

        const element = document.elementFromPoint(pos.x, pos.y)
        if (element.nodeName.toLowerCase() == "img" || element.nodeName.toLowerCase() == "canvas") {
            targetElement = element
        }

        if (!targetElement) {
            const subimage = getSubimage(element, pos)
            if (subimage.nodeName.toLowerCase() == "img" || subimage.nodeName.toLowerCase() == "canvas") {
                targetElement = subimage
            }
        }

        if (!targetElement) {
            const elementsFromPoint = document.elementsFromPoint(pos.x, pos.y)
            for (const elementFromPoint of elementsFromPoint) {
                if (elementFromPoint?.nodeName?.toLowerCase?.() == "img" || elementFromPoint?.nodeName?.toLowerCase?.() == "canvas") {
                    targetElement = elementFromPoint
                    break
                }
            }
        }

        if (targetElement) {
            editImage(targetElement)
        } else {
            showError("No image found.", null)
        }
    } catch (error) {
        sendError(error, "contextmenu_edit")
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type == "credits") {
        credits = Number(msg.content.credits || 0)

        updateCredits(credits)
    } else if (msg.type.includes("command")) {
        const command = msg.type.split("_")[1]

        if (command == "translate" || command == "screenshot") {
            takeScreenshot = msg.type.includes("screenshot")
            contextMenuImage(contextMenuPos || cursorPos)
        } else if (command == "screencrop") {
            contextMenuScreencrop("command")
        } else if (command == "repeatscreencrop") {
            contextMenuScreencropRepeat(lastScreencropRect)
        } else if (command == "contextmenu") {
            contextMenuOpen(contextMenuPos || cursorPos)
        } else if (command == "edit") {
            contextMenuEdit(contextMenuPos || cursorPos)
        }
    } else if (msg.type.includes("contextmenu")) {
        const item = msg.type.split("_")[1]

        if (item == "translate" || item == "screenshot") {
            takeScreenshot = item == "screenshot"
            contextMenuImage(contextMenuPos || cursorPos)
        } else if (item == "screencrop") {
            contextMenuScreencrop("contextmenu")
        } else if (item == "edit") {
            contextMenuEdit(contextMenuPos || cursorPos)
        } else if (item == "auto") {
            auto = !auto

            for (const [targetElement, toriiData] of toriiTargets) {
                if (!toriiData.active) continue

                try {
                    const targetToriiAutoIcon = toriiData.toriiAutoIcon

                    if (auto) {
                        targetToriiAutoIcon.classList.add("torii-rotating")
                    } else {
                        targetToriiAutoIcon.classList.remove("torii-rotating")
                    }
                } catch (error) {
                    sendError(error, "show error remove auto")
                }
            }
        }
    }
})

function updateCredits(credits) {
    for (const [targetElement, toriiData] of toriiTargets) {
        if (!toriiData.active) continue

        try {
            toriiData.toriiCredits.innerText = formatCredits(credits)
        } catch (error) {
            sendError(error, "updateCredits")
        }
    }
}

function sendError(error, loc) {
    chrome.runtime.sendMessage({ type: "error", message: error?.message || error, stack: error?.stack || "nothing", loc: loc }).then((response) => {
        console.log("Send error response: ", response)
    }).catch((error) => {
        console.log("Send error error: ", error)
    })
}

function handleMouseMove(e) {
    cursorPos.x = e.clientX || (e.targetTouches && e.targetTouches[0].clientX)
    cursorPos.y = e.clientY || (e.targetTouches && e.targetTouches[0].clientY)
    let targetElement = e.target

    try {
        if (
            enabled &&
            targetElement.nodeName.toLowerCase() != "img" &&
            targetElement.nodeName.toLowerCase() != "canvas"
        ) {
            targetElement = getSubimage(targetElement, { x: cursorPos.x, y: cursorPos.y })
        }
    } catch (error) {
        sendError(error, "mousemove_subimage from: " + window.location.href)
    }

    try {
        if (
            enabled &&
            !toriiTargets.has(targetElement) &&
            (targetElement.nodeName.toLowerCase() == "img" || targetElement.nodeName.toLowerCase() == "canvas") &&
            targetElement.clientHeight > minImageSize &&
            targetElement.clientWidth > minImageSize
        ) {
            createTorii(targetElement, false)
        }
    } catch (error) {
        if (error.message.includes("invalidated")) {
            return
        }

        showError("Something went wrong. Please contact support.", targetElement)

        sendError(error, "mousemove_create from: " + window.location.href)
    }

    try {
        for (const [toriiTarget, toriiData] of toriiTargets) {
            if (!toriiData.active) continue

            const rect = toriiTarget.getBoundingClientRect()

            const toriiClassExceptions = ["torii", "torii-icon", "torii-credits", "torii-notification", "torii-auto", "torii-auto-icon", "torii-utility", "torii-sub-utility", "torii-download", "torii-download-icon", "torii-edit", "torii-edit-icon"]
            const topElement = e.composedPath()[0]
            const isToriiClass = toriiClassExceptions.some((className) => topElement.classList && topElement.classList.contains(className))

            if (!isToriiClass) {
                removeHoverClass(toriiData.toriiIcon, toriiData.toriiUtility)
            }

            if (cursorPos.x < rect.left || cursorPos.x > rect.right || cursorPos.y < rect.top || cursorPos.y > rect.bottom) {
                removeToriiFromTarget(toriiTarget)
            }
        }
    } catch (error) {
        sendError(error, "mousemove_remove from: " + window.location.href)
    }
}

const throttleMouseMove = throttle(handleMouseMove, 100)
document.addEventListener("mousemove", throttleMouseMove)
document.addEventListener("touchstart", handleMouseMove)
document.addEventListener("touchmove", throttleMouseMove)

document.addEventListener("contextmenu", function (e) {
    contextMenuPos = { x: e.clientX, y: e.clientY }
}, true)

function contextMenuOpen(pos) {
    const toriiMenu = document.createElement("div")
    toriiMenu.classList.add("torii-menu")
    toriiMenu.style.left = `${pos.x + 290 < window.innerWidth ? pos.x : pos.x - 290}px`
    toriiMenu.style.top = `${pos.y + 300 < window.innerHeight ? pos.y : pos.y - 300}px`

    const toriiMenuHeader = document.createElement("div")
    toriiMenuHeader.classList.add("torii-menu-header")

    const toriiMenuHeaderIcon = document.createElement("img")
    toriiMenuHeaderIcon.src = chrome.runtime.getURL("images/torii.png")
    toriiMenuHeaderIcon.classList.add("torii-menu-icon")

    const toriiMenuHeaderText = document.createElement("div")
    toriiMenuHeaderText.classList.add("torii-menu-header-text")
    toriiMenuHeaderText.innerText = "Torii Menu"

    const toriiMenuHeaderClose = document.createElement("div")
    toriiMenuHeaderClose.classList.add("torii-menu-header-close")
    toriiMenuHeaderClose.innerText = "✖"

    const toriiMenuScreenshot = document.createElement("div")
    toriiMenuScreenshot.classList.add("torii-menu-item")
    toriiMenuScreenshot.innerText = "Screenshot Image (Alt+Shift+C)"

    const toriiMenuTranslate = document.createElement("div")
    toriiMenuTranslate.classList.add("torii-menu-item")
    toriiMenuTranslate.innerText = "Translate Image (Alt+Shift+Z)"

    const toriiMenuScreencrop = document.createElement("div")
    toriiMenuScreencrop.classList.add("torii-menu-item")
    toriiMenuScreencrop.innerText = "Screen Crop (Alt+Shift+X)"

    const toriiMenuScreencropRepeat = document.createElement("div")
    toriiMenuScreencropRepeat.classList.add("torii-menu-item")
    toriiMenuScreencropRepeat.innerText = "Repeat Last Screen Crop"

    const toriiMenuEdit = document.createElement("div")
    toriiMenuEdit.classList.add("torii-menu-item")
    toriiMenuEdit.innerText = "Edit Image"

    const toriiMenuAuto = document.createElement("div")
    toriiMenuAuto.classList.add("torii-menu-item")
    toriiMenuAuto.innerText = `Turn ${auto ? "Off" : "On"} Auto Translate`

    const toriiMenuDivider1 = document.createElement("div")
    toriiMenuDivider1.classList.add("torii-menu-divider")

    const toriiMenuDivider2 = document.createElement("div")
    toriiMenuDivider2.classList.add("torii-menu-divider")

    const toriiMenuDivider3 = document.createElement("div")
    toriiMenuDivider3.classList.add("torii-menu-divider")

    const toriiMenuDivider4 = document.createElement("div")
    toriiMenuDivider4.classList.add("torii-menu-divider")

    const toriiMenuDivider5 = document.createElement("div")
    toriiMenuDivider5.classList.add("torii-menu-divider")

    toriiMenuHeaderClose.addEventListener("pointerup", function () {
        toriiMenu.remove()
    })

    const menuPos = structuredClone(pos)
    toriiMenuScreenshot.addEventListener("pointerup", function () {
        toriiMenu.remove()
        takeScreenshot = true
        setTimeout(() => {
            contextMenuImage(menuPos)
        }, 150)
    })

    toriiMenuTranslate.addEventListener("pointerup", function () {
        toriiMenu.remove()
        setTimeout(() => {
            contextMenuImage(menuPos)
        }, 150)
    })

    toriiMenuScreencrop.addEventListener("pointerup", function () {
        toriiMenu.remove()
        setTimeout(() => {
            contextMenuScreencrop("contextmenu")
        }, 150)
    })

    toriiMenuScreencropRepeat.addEventListener("pointerup", function () {
        toriiMenu.remove()
        setTimeout(() => {
            contextMenuScreencropRepeat(lastScreencropRect)
        }, 150)
    })

    toriiMenuEdit.addEventListener("pointerup", function () {
        toriiMenu.remove()
        setTimeout(() => {
            contextMenuEdit(menuPos)
        }, 150)
    })

    toriiMenuAuto.addEventListener("pointerup", function () {
        toriiMenu.remove()
        setTimeout(() => {
            auto = !auto

            for (const [targetElement, toriiData] of toriiTargets) {
                if (!toriiData.active) continue

                try {
                    const targetToriiAutoIcon = toriiData.toriiAutoIcon

                    if (auto) {
                        targetToriiAutoIcon.classList.add("torii-rotating")
                    } else {
                        targetToriiAutoIcon.classList.remove("torii-rotating")
                    }
                } catch (error) {
                    sendError(error, "show error remove auto")
                }
            }
        }, 150)
    })

    toriiMenuHeader.addEventListener("pointerup", function () {
        toriiMenu.remove()
    })

    toriiMenuHeader.appendChild(toriiMenuHeaderIcon)
    toriiMenuHeader.appendChild(toriiMenuHeaderText)
    toriiMenuHeader.appendChild(toriiMenuHeaderClose)

    toriiMenu.appendChild(toriiMenuHeader)
    toriiMenu.appendChild(toriiMenuScreenshot)
    toriiMenu.appendChild(toriiMenuDivider1)
    toriiMenu.appendChild(toriiMenuTranslate)
    toriiMenu.appendChild(toriiMenuDivider2)
    toriiMenu.appendChild(toriiMenuScreencrop)
    toriiMenu.appendChild(toriiMenuDivider3)
    toriiMenu.appendChild(toriiMenuScreencropRepeat)
    toriiMenu.appendChild(toriiMenuDivider4)
    toriiMenu.appendChild(toriiMenuEdit)
    toriiMenu.appendChild(toriiMenuDivider5)
    toriiMenu.appendChild(toriiMenuAuto)

    toriiDOM.appendChild(toriiMenu)
}

function screenshot(targetElement) {
    return new Promise(async (resolve, reject) => {
        try {
            if (toriiTargets.has(targetElement)) toriiTargets.get(targetElement).toriiState = "screenshoting"

            let { scrollableParent, isScrollable } = getScrollParent(targetElement);
            let scrollHeight = getScrollHeight(scrollableParent)
            scrollableParent.scrollTo({ top: scrollHeight + 2, left: 0, behavior: "instant" })

            // find actual scrollable parent
            await new Promise((resolve, reject) => {
                let attempts = 0
                const tryScroll = () => {
                    if (attempts > 5) return reject("Failed to scroll")
                    if (scrollableParent == window || !isScrollable) return resolve()

                    attempts++

                    const newScrollHeight = getScrollHeight(scrollableParent)

                    if (scrollHeight == newScrollHeight) {
                        let { scrollableParent, isScrollable } = getScrollParent(targetElement);

                        if (!isScrollable) return resolve()

                        scrollHeight = getScrollHeight(scrollableParent)
                        scrollableParent.scrollTo({ top: scrollHeight + 2, left: 0, behavior: "instant" })

                        setTimeout(tryScroll, 100);
                    } else {
                        resolve()
                    }
                }

                setTimeout(tryScroll, 100);
            })

            const { left, top, width, height } = targetElement.getBoundingClientRect()
            let actualTop = top + getScrollHeight(scrollableParent)
            let actualLeft = left + getScrollWidth(scrollableParent)
            const { clientHeight } = document.documentElement
            const devicePixelRatio = window.devicePixelRatio || 1

            const canvas = document.createElement("canvas")
            canvas.width = width * devicePixelRatio
            canvas.height = height * devicePixelRatio

            const ctx = canvas.getContext("2d")
            ctx.imageSmoothingEnabled = false

            let initialScrollHeight = getScrollHeight(scrollableParent)

            let capturedHeight = 0
            let captures = 0
            let lastCaptureHeight = initialScrollHeight

            if (top < 0) {
                scrollableParent.scrollTo({ top: actualTop, left: 0, behavior: "instant" })
                lastCaptureHeight = actualTop
            }

            let torii = null
            if (toriiTargets.has(targetElement)) {
                torii = toriiTargets.get(targetElement).torii
                torii.style.display = "none"
            }

            const captureAndScroll = () => {
                chrome.runtime.sendMessage({ type: "screenshot" }, (response) => {
                    try {
                        if (response?.success) {
                            const img = new Image
                            img.onload = () => {
                                let offsetFromTop = 0

                                if (captures == 0) {
                                    if (top < 0) {
                                        offsetFromTop = 0
                                    } else {
                                        offsetFromTop = top
                                    }
                                } else if (capturedHeight + clientHeight > height) {
                                    offsetFromTop = actualTop - getScrollHeight(scrollableParent) + capturedHeight
                                }

                                ctx.drawImage(
                                    img,
                                    actualLeft * devicePixelRatio,
                                    offsetFromTop * devicePixelRatio,
                                    width * devicePixelRatio,
                                    clientHeight * devicePixelRatio,
                                    0,
                                    capturedHeight * devicePixelRatio,
                                    width * devicePixelRatio,
                                    clientHeight * devicePixelRatio,
                                )

                                capturedHeight += clientHeight - offsetFromTop

                                if (Math.ceil(capturedHeight) >= height) {
                                    try {
                                        if (torii) torii.style.display = "flex"
                                    } catch (error) {
                                        console.log(error)
                                    }

                                    takeScreenshot = false

                                    scrollableParent.scrollTo({ top: initialScrollHeight, left: 0, behavior: "instant" })

                                    const dataurl = canvas.toDataURL()

                                    return resolve(dataurl)
                                }

                                captures += 1

                                lastCaptureHeight += clientHeight
                                scrollableParent.scrollTo({ top: lastCaptureHeight, left: 0, behavior: "instant" })

                                setTimeout(captureAndScroll, 100);
                            }
                            img.src = response.content.dataURL
                        } else {
                            try {
                                if (torii) torii.style.display = "flex"
                            } catch (error) {
                                console.log(error)
                            }

                            takeScreenshot = false

                            return reject("Failed to take screenshot")
                        }
                    } catch (error) {
                        sendError(error, "screenshot from: " + window.location.href)

                        try {
                            if (torii) torii.style.display = "flex"
                        } catch (error) {
                            console.log(error)
                        }

                        takeScreenshot = false

                        return reject("Failed to take screenshot")
                    }
                })
            }

            setTimeout(captureAndScroll, 100)
        } catch (error) {
            sendError(error, "screenshot from: " + window.location.href)

            try {
                if (torii) torii.style.display = "flex"
            } catch (error) {
                console.log(error)
            }

            takeScreenshot = false

            return reject("Failed to take screenshot")
        }
    })
}

function getScrollParent(element) {
    function isElementScrollable(el) {
        if (!(el instanceof Element)) return false;
        const style = getComputedStyle(el);
        const overflowY = style.overflowY;
        return ["auto", "scroll"].includes(overflowY) && el.scrollHeight > el.clientHeight;
    }

    const parent = element?.parentElement

    if (!parent) return { scrollableParent: window, isScrollable: isElementScrollable(window) }

    const isScrollable = isElementScrollable(parent)

    if (isScrollable) {
        if (parent == document.body || parent == document.documentElement) return { scrollableParent: window, isScrollable: isScrollable }
        return { scrollableParent: parent, isScrollable: isScrollable }
    }

    return getScrollParent(parent)
}

function getScrollHeight(scrollable) {
    return scrollable?.scrollTop != undefined ? scrollable?.scrollTop : scrollable.scrollY
}

function getScrollWidth(scrollable) {
    return scrollable?.scrollLeft != undefined ? scrollable?.scrollLeft : scrollable.scrollX
}

// Some images are hidden within a div for some websites or
// are a part of many which are hidden. We want the only non-hidden one
function getSubimage(targetElement, coords) {
    let subimages = targetElement?.querySelectorAll?.("img, canvas")

    if (!subimages) return targetElement

    subimages = Array.from(subimages).filter((image) => {
        return image?.style?.display != "none" && image?.parentNode?.style?.display != "none"
    })

    if (subimages.length == 1) {
        const rect = subimages[0].getBoundingClientRect()

        if (
            coords.x > rect.left &&
            coords.x < rect.right &&
            coords.y > rect.top &&
            coords.y < rect.bottom
        ) {
            targetElement = subimages[0]
        }
    } else {
        try {
            const visibleElement = getVisibleImageOrCanvasAtPoint(coords.x, coords.y)

            if (visibleElement) {
                return visibleElement
            }
        } catch (error) {
            return targetElement
        }
    }

    return targetElement
}

function getVisibleImageOrCanvasAtPoint(x, y) {
    const elements = document.elementsFromPoint(x, y)

    let found

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        const tag = el?.nodeName?.toLowerCase()

        if (tag === "img" || tag === "canvas") {
            found = el
            break
        }

        const child = Array.from(el.children).find(c =>
            c.nodeName.toLowerCase() === "img" || c.nodeName.toLowerCase() === "canvas"
        )
        const childTag = child?.nodeName?.toLowerCase()
        if (childTag === "img" || childTag === "canvas") {
            found = child
            break
        }

        if (el && isOpaqueAndBlocking(el)) {
            return null
        }

        const allImagesAndCanvases = el.querySelectorAll("img, canvas")

        for (const all of allImagesAndCanvases) {
            const rect = all.getBoundingClientRect()
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return all
            }
        }
    }

    return found || null
}

function isOpaqueAndBlocking(el) {
    const style = getComputedStyle(el)

    if (style.visibility === "hidden" || style.display === "none") {
        return false
    }

    const opacity = parseFloat(style.opacity)
    const backgroundColor = style.backgroundColor

    const isOpaque = opacity > 0.9
    const hasSolidBg = backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent'
    const isBlocking = isOpaque && hasSolidBg
    return isBlocking
}

function createTorii(targetElement, withClick) {
    try {
        const rect = targetElement.getBoundingClientRect()
        const toriiSize = 55

        const torii = document.createElement("div")
        torii.classList.add("torii")

        const toriiIcon = document.createElement("img")
        toriiIcon.src = chrome.runtime.getURL("images/torii.png")
        toriiIcon.classList.add("torii-icon")
        toriiIcon.style.width = `${toriiSize}px`
        toriiIcon.style.height = `${toriiSize}px`

        const toriiCredits = document.createElement("div")
        toriiCredits.classList.add("torii-credits")
        toriiCredits.title = "Amount of credits left"
        toriiCredits.innerText = formatCredits(credits)

        const toriiNotification = document.createElement("div")
        toriiNotification.classList.add("torii-notification")

        const toriiNotificationClose = document.createElement("div")
        toriiNotificationClose.classList.add("torii-notification-close")
        toriiNotificationClose.innerText = "✖"

        const toriiAutoIcon = document.createElement("img")
        toriiAutoIcon.src = chrome.runtime.getURL("images/auto.svg")
        toriiAutoIcon.classList.add("torii-auto-icon")

        const toriiAuto = document.createElement("div")
        toriiAuto.classList.add("torii-auto")
        toriiAuto.title = "Toggle auto translation on/off"
        toriiAuto.appendChild(toriiAutoIcon)
        toriiAuto.addEventListener("pointerup", () => {
            auto = !auto
            autoError = false

            for (const [targetElement, toriiData] of toriiTargets) {
                if (!toriiData.active) continue

                const targetToriiAutoIcon = toriiData.toriiAutoIcon

                if (auto) {
                    targetToriiAutoIcon.classList.add("torii-rotating")
                } else {
                    targetToriiAutoIcon.classList.remove("torii-rotating")
                }
            }
        })
        if (auto) {
            toriiAutoIcon.classList.add("torii-rotating")
        }

        const toriiDownloadIcon = document.createElement("img")
        toriiDownloadIcon.src = chrome.runtime.getURL("images/download.svg")
        toriiDownloadIcon.classList.add("torii-download-icon")

        const toriiDownload = document.createElement("div")
        toriiDownload.classList.add("torii-download")
        toriiDownload.title = "Download the image(s)"
        toriiDownload.appendChild(toriiDownloadIcon)
        toriiDownload.addEventListener("pointerup", () => {
            downloadImages(targetElement)
        })

        const toriiEditIcon = document.createElement("img")
        toriiEditIcon.src = chrome.runtime.getURL("images/edit.svg")
        toriiEditIcon.classList.add("torii-edit-icon")

        const toriiEdit = document.createElement("div")
        toriiEdit.classList.add("torii-edit")
        toriiEdit.title = "Edit the image"
        toriiEdit.addEventListener("pointerup", () => {
            editImage(targetElement)

            toriiEditIcon.classList.add("torii-rotating")
        })

        toriiEdit.appendChild(toriiEditIcon)

        const toriiSubUtility = document.createElement("div")
        toriiSubUtility.classList.add("torii-sub-utility")
        toriiSubUtility.appendChild(toriiAuto)
        toriiSubUtility.appendChild(toriiDownload)
        toriiSubUtility.appendChild(toriiEdit)

        const toriiUtility = document.createElement("div")
        toriiUtility.classList.add("torii-utility")
        toriiUtility.appendChild(toriiCredits)
        toriiUtility.appendChild(toriiSubUtility)
        toriiUtility.style.left = `${toriiSize / 1.4}px`

        toriiNotification.appendChild(toriiNotificationClose)
        torii.appendChild(toriiIcon)
        torii.appendChild(toriiUtility)
        torii.appendChild(toriiNotification)
        toriiDOM.appendChild(torii)

        placeTorii(torii, rect, toriiSize)

        toriiIcon.addEventListener(
            "pointerup",
            (e) => {
                e.stopPropagation()
                e.stopImmediatePropagation()
                e.preventDefault()

                autoError = false
                toriiClick(targetElement)
            },
            true
        )

        addHoverListener(toriiIcon, toriiUtility)
        addHoverListener(toriiUtility, toriiIcon)
        addScaleListener(toriiAuto)
        addScaleListener(toriiCredits)
        addScaleListener(toriiDownload)
        addScaleListener(toriiEdit)

        const toriiObserver = observeRect(targetElement, (rect) => {
            placeTorii(torii, rect, toriiSize)

            if (cursorPos.x < rect.left || cursorPos.x > rect.right || cursorPos.y < rect.top || cursorPos.y > rect.bottom) {
                removeToriiFromTarget(targetElement)
            }
        })

        toriiTargets.set(targetElement, {
            active: true,
            torii: torii,
            toriiIcon: toriiIcon,
            toriiAuto: toriiAuto,
            toriiAutoIcon: toriiAutoIcon,
            toriiUtility: toriiUtility,
            toriiCredits: toriiCredits,
            toriiNotification: toriiNotification,
            toriiDownload: toriiDownload,
            toriiDownloadIcon: toriiDownloadIcon,
            toriiEdit: toriiEdit,
            toriiEditIcon: toriiEditIcon,
            toriiObserver: toriiObserver,
            toriiSize: toriiSize,
            toriiState: "original",
            toriiHash: null,
            originalURL: null,
            inpainted: null,
            inpaintedImage: null,
            original: null,
            text: null,
            textObjects: null,
            textObjectsTemp: null
        })

        if (withClick && !autoError) {
            click(toriiIcon)
        }

        toriiObserver.observe()
    } catch (error) {
        sendError(error, "createTorii from: " + window.location.href + " withClick: " + withClick)
    }
}

function placeTorii(torii, rect, toriiSize) {
    if (toriiLocation == "tl") {
        torii.style.left = `${rect.left + window.scrollX}px`
        torii.style.top = `${Math.min(Math.max(rect.top + window.scrollY, window.scrollY), rect.top + window.scrollY + rect.height - toriiSize)}px`
    } else if (toriiLocation == "tr") {
        torii.style.right = `${window.innerWidth - rect.right + window.scrollX}px`
        torii.style.top = `${Math.min(Math.max(rect.top + window.scrollY, window.scrollY), rect.top + window.scrollY + rect.height - toriiSize)}px`
    }
}

function addScaleListener(toriiElement) {
    toriiElement.addEventListener(
        "mouseenter",
        (e) => {
            toriiElement.classList.add("torii-scaling")
        }
    )

    toriiElement.addEventListener(
        "mouseleave",
        (e) => {
            toriiElement.classList.remove("torii-scaling")
        }
    )

    toriiElement.addEventListener(
        "touchstart",
        (e) => {
            toriiElement.classList.add("torii-scaling")
        }, { passive: true }
    )
}

function addHoverListener(toriiElement, ...attachedElements) {
    toriiElement.addEventListener(
        "mouseenter",
        (e) => {
            toriiElement.classList.add("torii-hover")

            for (const attachedElement of attachedElements) {
                attachedElement.classList.add("torii-hover")
            }
        }
    )

    toriiElement.addEventListener(
        "mouseleave",
        (e) => {
            toriiElement.classList.remove("torii-hover")

            for (const attachedElement of attachedElements) {
                attachedElement.classList.remove("torii-hover")
            }
        }
    )

    toriiElement.addEventListener(
        "touchstart",
        (e) => {
            toriiElement.classList.add("torii-hover")

            for (const attachedElement of attachedElements) {
                attachedElement.classList.add("torii-hover")
            }
        }, { passive: true }
    )
}

function removeHoverClass(toriiElement, ...attachedElements) {
    toriiElement.classList.remove("torii-hover")

    for (const attachedElement of attachedElements) {
        attachedElement.classList.remove("torii-hover")
    }
}

function formatCredits(credits) {
    if (credits === null) return "N/A"
    return credits.toFixed(0)
}

async function editImage(targetElement) {
    if (credits === null) {
        showError("Please log in with the extension from the popup. Go to your browser's extension menu.", targetElement)
    }

    let toriiData = toriiTargets.get(targetElement)

    try {
        isEditing = true

        if (!toriiData) {
            if (targetElement.nodeName.toLowerCase() == "img" || targetElement.nodeName.toLowerCase() == "canvas") {
                createTorii(targetElement, false)
                toriiData = toriiTargets.get(targetElement)
            } else {
                isEditing = false
                return
            }
        }

        let originalSrc
        let inpaintedSrc
        let textObjects

        if (!toriiData.original) {
            const targetUrl = await getTargetUrl(targetElement)

            let src = null

            try {
                if (targetUrl) {
                    const response = await fetch(targetUrl, {
                        headers: {
                            "Referer": window.location.href,
                            "User-Agent": window.navigator.userAgent
                        }
                    })

                    if (response && response.ok) {
                        const responseBlob = await response.blob()
                        src = await blobToImage(responseBlob)
                    }
                }
            } catch (error) {
                src = null
            }

            if (src === null) {
                const response = await chrome.runtime.sendMessage({ type: "edit", url: targetUrl })

                if (response.success) {
                    src = response.content.src
                } else {
                    isEditing = false
                    showError("Failed to edit image.", targetElement, false)
                    return
                }
            }

            originalSrc = src
            inpaintedSrc = src
            textObjects = []
        } else {
            const storageURLs = `${toriiData.original},${toriiData.inpainted},${toriiData.text}`
            const response = await chrome.runtime.sendMessage({ type: "storage", storageURLs: storageURLs })

            toriiData.toriiEditIcon?.classList?.remove?.("torii-rotating")

            if (!response.success) {
                isEditing = false
                showError(response.content.error, targetElement, false)
                return
            }

            originalSrc = response.content[toriiData.original]
            inpaintedSrc = response.content[toriiData.inpainted]
            textObjects = JSON.parse(response.content[toriiData.text])
        }

        const originalImage = new Image()
        originalImage.id = "original-image"
        originalImage.crossOrigin = "anonymous"
        originalImage.src = originalSrc

        const inpaintedImage = new Image()
        inpaintedImage.id = "inpainted-image"
        inpaintedImage.crossOrigin = "anonymous"
        if (toriiData.inpaintedImage) {
            inpaintedImage.src = toriiData.inpaintedImage
        } else {
            inpaintedImage.src = inpaintedSrc
        }

        await Promise.all([originalImage, inpaintedImage].map((image) => new Promise((resolve) => {
            if (image.complete && image.naturalWidth !== 0) {
                resolve()
            } else {
                image.onload = () => resolve()
                image.onerror = () => resolve()
            }
        })))

        toriiData.textObjects = structuredClone(toriiData.textObjectsTemp)

        if (toriiData.textObjects === null) {
            toriiData.textObjects = textObjects
            toriiData.textObjectsTemp = textObjects
        }

        const editScreen = document.createElement("div")
        editScreen.id = "torii-edit-screen"

        await Promise.all([
            document.fonts.load("24px WildWords"),
            document.fonts.load("24px NotoSans"),
            document.fonts.load("24px KomikaJam"),
            document.fonts.load("24px Bangers"),
            document.fonts.load("24px Edo"),
            document.fonts.load("24px RIDIBatang"),
            document.fonts.load("24px Bushidoo"),
            document.fonts.load("24px Hayah"),
            document.fonts.load("24px Itim"),
            fetch(chrome.runtime.getURL("html/edit.html"))
                .then(response => response.text())
                .then(html => editScreen.innerHTML = html)
        ])

        toriiDOM.appendChild(editScreen)

        const workingCanvas = toriiDOM.getElementById("working-canvas")
        const workingContext = workingCanvas.getContext("2d")

        const hiddenCanvas = toriiDOM.getElementById("hidden-canvas")
        const hiddenContext = hiddenCanvas.getContext("2d")

        const maskCanvas = toriiDOM.getElementById("mask-canvas")
        const maskContext = maskCanvas.getContext("2d")

        const canvasWrapper = toriiDOM.getElementById("canvas-wrapper")
        const canvasContainer = toriiDOM.getElementById("canvas-container")

        const width = originalImage.naturalWidth
        const height = originalImage.naturalHeight

        workingCanvas.width = width
        workingCanvas.height = height
        hiddenCanvas.width = width
        hiddenCanvas.height = height
        maskCanvas.width = width
        maskCanvas.height = height

        hiddenContext.drawImage(inpaintedImage, 0, 0, workingCanvas.width, workingCanvas.height)
        workingContext.drawImage(hiddenCanvas, 0, 0, workingCanvas.width, workingCanvas.height)

        function setZoom(value) {
            workingCanvas.style.width = `${workingCanvas.width * (Number(value) + 50) / 50}px`
            workingCanvas.style.height = `${workingCanvas.height * (Number(value) + 50) / 50}px`
        }

        canvasWrapper.addEventListener("wheel", (e) => {
            e.preventDefault()

            if (e.ctrlKey) {
                const zoomValue = Math.min(100, Math.max(-40, Number(zoomSlider.value) + 3 * (e.deltaY < 0 ? 1 : -1)))
                zoomSlider.value = zoomValue
                setZoom(zoomValue)
            } else {
                if (e.shiftKey) {
                    canvasContainer.scrollLeft += e.deltaY * 0.4
                } else {
                    canvasContainer.scrollTop += e.deltaY * 0.4
                }
            }
        })

        let isZooming = false
        let isTouching = false
        let startX = 0
        let startY = 0

        canvasWrapper.addEventListener("touchstart", (e) => {
            if (flipped) return

            isTouching = true
            startX = e.touches[0].clientX
            startY = e.touches[0].clientY
        })

        canvasWrapper.addEventListener("touchmove", (e) => {
            if (!isTouching || isDragging || isZooming || flipped) return

            let deltaX = e.touches[0].clientX - startX
            let deltaY = e.touches[0].clientY - startY

            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                canvasContainer.scrollLeft -= deltaX
                canvasContainer.scrollTop -= deltaY

                startX = e.touches[0].clientX
                startY = e.touches[0].clientY
            }
        })

        canvasWrapper.addEventListener("touchend", (e) => {
            isTouching = false
        })

        const SCROLL_THRESHOLD = 10
        const TOUCH_DELAY = 50

        const MAX_UNDO_STATES = 15
        let undoStack = []

        let drawTouchTimeout = null
        let drawTouchStartPos = null
        let isDrawing = false
        let isInpainting = false
        let prevPoint = null

        let textTouchTimeout = null
        let textTouchStartPos = null
        let textDragActive = false

        let activeText = null

        let isDragging = false
        let dragStartX = 0
        let dragStartY = 0

        let isRotating = false
        let rotationStartAngle = 0
        let rotationStartMouseAngle = 0

        let flipped = false

        const eraseModeBtn = toriiDOM.getElementById("erase-mode")
        const addModeBtn = toriiDOM.getElementById("add-mode")
        const inpaintModeBtn = toriiDOM.getElementById("inpaint-mode")
        const paintModeBtn = toriiDOM.getElementById("paint-mode")
        const undoEditBtn = toriiDOM.getElementById("undo-edit")
        const acceptEditBtn = toriiDOM.getElementById("accept-edit")
        const cancelEditBtn = toriiDOM.getElementById("cancel-edit")
        const removeTextBtn = toriiDOM.getElementById("remove-text")
        const flipImageBtn = toriiDOM.getElementById("flip-image")
        const copyTextBtn = toriiDOM.getElementById("copy-text")
        const zoomSlider = toriiDOM.getElementById("zoom-slider")
        const zoomBtn = toriiDOM.getElementById("zoom")

        disable(undoEditBtn)

        zoomSlider.addEventListener("input", (e) => {
            setZoom(zoomSlider.value)
        })

        zoomBtn.addEventListener("focus", () => {
            zoomSlider.parentElement.classList.replace("hidden", "block")
            isZooming = true
        })

        zoomBtn.addEventListener("blur", () => {
            zoomSlider.parentElement.classList.replace("block", "hidden")
            isZooming = false
        })

        const hiddenInput = document.createElement("textarea")
        hiddenInput.id = "torii-hidden-input"
        hiddenInput.style.position = "fixed"
        hiddenInput.style.width = "100%"
        hiddenInput.style.height = "100%"
        hiddenInput.style.fontSize = "20px"
        hiddenInput.style.top = 0
        hiddenInput.style.left = 0
        hiddenInput.style.opacity = 0
        document.body.appendChild(hiddenInput)

        const eraseSettings = toriiDOM.getElementById("erase-settings")
        const canvasCursor = toriiDOM.getElementById("canvas-cursor")

        let eraseBrushSize = 90
        const eraseBrushSizeValue = toriiDOM.getElementById("erase-brush-size-value")
        const eraseBrushSizeInput = toriiDOM.getElementById("erase-brush-size")

        eraseBrushSizeInput.addEventListener("input", () => {
            eraseBrushSize = eraseBrushSizeInput.value
            eraseBrushSizeValue.innerHTML = eraseBrushSize + "px"
        })

        const inpaintSettings = toriiDOM.getElementById("inpaint-settings")

        let inpaintBrushSize = 90
        const inpaintBrushSizeValue = toriiDOM.getElementById("inpaint-brush-size-value")
        const inpaintBrushSizeInput = toriiDOM.getElementById("inpaint-brush-size")

        inpaintBrushSizeInput.addEventListener("input", () => {
            inpaintBrushSize = inpaintBrushSizeInput.value
            inpaintBrushSizeValue.innerHTML = inpaintBrushSize + "px"
        })

        const paintSettings = toriiDOM.getElementById("paint-settings")
        const paintColor = toriiDOM.getElementById("paint-color")

        let paintBrushSize = 90
        const paintBrushSizeValue = toriiDOM.getElementById("paint-brush-size-value")
        const paintBrushSizeInput = toriiDOM.getElementById("paint-brush-size")

        paintBrushSizeInput.addEventListener("input", () => {
            paintBrushSize = paintBrushSizeInput.value
            paintBrushSizeValue.innerHTML = paintBrushSize + "px"
        })

        const addSettings = toriiDOM.getElementById("add-settings")
        const addFontSelect = toriiDOM.getElementById("add-font-select")
        const addFontSize = toriiDOM.getElementById("add-font-size")
        const addFontSizeValue = toriiDOM.getElementById("add-font-size-value")
        const addTextColor = toriiDOM.getElementById("add-text-color")
        const addStrokeColor = toriiDOM.getElementById("add-stroke-color")
        const addStrokeSize = toriiDOM.getElementById("add-stroke-size")
        const addStrokeSizeValue = toriiDOM.getElementById("add-stroke-size-value")
        const addFontBackground = toriiDOM.getElementById("add-font-bg")
        const addFontBorder = toriiDOM.getElementById("add-font-border")
        const addBackgroundColor = toriiDOM.getElementById("add-bg-color")
        const addBorderRadius = toriiDOM.getElementById("add-border-radius")
        const addBorderRadiusValue = toriiDOM.getElementById("add-border-radius-value")
        const addBorderPadding = toriiDOM.getElementById("add-border-padding")
        const addBorderPaddingValue = toriiDOM.getElementById("add-border-padding-value")

        let textAlignment = "center"
        const addAlignLeft = toriiDOM.getElementById("add-align-left")
        const addAlignCenter = toriiDOM.getElementById("add-align-center")
        const addAlignRight = toriiDOM.getElementById("add-align-right")

        let imageMode = "add"

        const toggleSettingsBtn = toriiDOM.getElementById("toggle-settings")
        const settings = toriiDOM.getElementById("settings")

        function toggleSettings(open = null) {
            if (open === null && settings._isOpen) {
                open = !settings._isOpen
            } else if (open === null) {
                open = true
            }

            settings._isOpen = open
            settings.style.width = getComputedStyle(settings).width
            settings.style.height = getComputedStyle(settings).height

            const isSM = window.matchMedia("(max-width: 640px)").matches

            if (!open) {
                requestAnimationFrame(() => {
                    settings.style.height = "2rem"
                    settings.style.width = "3.5rem"
                    settings.style.paddingBottom = "0"
                    settings.style.paddingRight = "0"
                    settings.style.paddingLeft = "0"
                })
            } else {
                if (imageMode == "erase") {
                    requestAnimationFrame(() => {
                        if (isSM) {
                            settings.style.height = "13rem"
                            settings.style.width = "15rem"
                        } else {
                            settings.style.height = "15rem"
                            settings.style.width = "20rem"
                        }
                    })
                } else if (imageMode == "inpaint") {
                    requestAnimationFrame(() => {
                        if (isSM) {
                            settings.style.height = "13rem"
                            settings.style.width = "15rem"
                        } else {
                            settings.style.height = "15rem"
                            settings.style.width = "20rem"
                        }
                    })
                } else if (imageMode == "paint") {
                    requestAnimationFrame(() => {
                        if (isSM) {
                            settings.style.height = "16rem"
                            settings.style.width = "15rem"
                        } else {
                            settings.style.height = "18rem"
                            settings.style.width = "20rem"
                        }
                    })
                } else {
                    requestAnimationFrame(() => {
                        if (isSM) {
                            settings.style.height = "25rem"
                            settings.style.width = "20rem"
                        } else {
                            settings.style.height = "28rem"
                            settings.style.width = "23rem"
                        }
                    })
                }

                if (isSM) {
                    settings.style.paddingBottom = "1rem"
                    settings.style.paddingRight = "1rem"
                    settings.style.paddingLeft = "1rem"
                } else {
                    settings.style.paddingBottom = "2rem"
                    settings.style.paddingRight = "2rem"
                    settings.style.paddingLeft = "2rem"
                }
            }

            if (open) {
                toggleSettingsBtn.classList.add("after:content-['Hide_settings']")
                toggleSettingsBtn.classList.remove("after:content-['Show_settings']")
                toggleSettingsBtn.querySelector("svg").classList.add("!rotate-[40deg]")
                toggleSettingsBtn.querySelector("svg").classList.add("!fill-blue-400")
            } else {
                toggleSettingsBtn.classList.remove("after:content-['Hide_settings']")
                toggleSettingsBtn.classList.add("after:content-['Show_settings']")
                toggleSettingsBtn.querySelector("svg").classList.remove("!fill-blue-400")
                toggleSettingsBtn.querySelector("svg").classList.remove("!rotate-[40deg]")
            }

            if (imageMode == "erase") {
                addModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                inpaintModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                paintModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                eraseModeBtn.classList.add("bg-blue-200", "!shadow-sm")

                unhide(eraseSettings)
                hide(addSettings, inpaintSettings, paintSettings, removeTextBtn, copyTextBtn)
            } else if (imageMode == "add") {
                eraseModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                inpaintModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                paintModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                addModeBtn.classList.add("bg-blue-200", "!shadow-sm")

                unhide(addSettings, removeTextBtn, copyTextBtn)
                hide(eraseSettings, inpaintSettings, paintSettings)
                if (toriiData.textObjects.length == 0) {
                    disable(removeTextBtn, copyTextBtn)
                }
            } else if (imageMode == "inpaint") {
                eraseModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                addModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                paintModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                inpaintModeBtn.classList.add("bg-blue-200", "!shadow-sm")

                unhide(inpaintSettings)
                hide(eraseSettings, addSettings, paintSettings, removeTextBtn, copyTextBtn)
            } else if (imageMode == "paint") {
                eraseModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                addModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                inpaintModeBtn.classList.remove("bg-blue-200", "!shadow-sm")
                paintModeBtn.classList.add("bg-blue-200", "!shadow-sm")

                unhide(paintSettings)
                hide(eraseSettings, addSettings, inpaintSettings, removeTextBtn, copyTextBtn)
            }
        }

        toggleSettingsBtn.addEventListener("pointerup", () => {
            toggleSettings()
        })

        addModeBtn.addEventListener("pointerup", () => {
            imageMode = "add"
            prepareAddMode()
            toggleSettings(true)
        })

        eraseModeBtn.addEventListener("pointerup", () => {
            imageMode = "erase"
            prepareDrawMode()
            toggleSettings(true)
        })

        paintModeBtn.addEventListener("pointerup", () => {
            imageMode = "paint"
            prepareDrawMode()
            toggleSettings(true)
        })

        inpaintModeBtn.addEventListener("pointerup", () => {
            imageMode = "inpaint"
            prepareDrawMode()
            toggleSettings(true)
        })

        acceptEditBtn.addEventListener("pointerup", () => {
            redrawCanvas(false)

            toriiData.textObjectsTemp = structuredClone(toriiData.textObjects)

            const dataURL = workingCanvas.toDataURL()
            toriiData.inpaintedImage = hiddenCanvas.toDataURL()

            if (targetElement.nodeName.toLowerCase() == "img") {
                targetElement.src = dataURL
                if (targetElement.srcset) {
                    targetElement.srcset = dataURL
                }
                hashElement(targetElement).then((hash) => {
                    toriiData.toriiHash = hash
                })
            } else if (targetElement.nodeName.toLowerCase() == "canvas") {
                const newImg = document.createElement("img")
                const context = targetElement.getContext("2d")

                newImg.onload = () => {
                    context.drawImage(newImg, 0, 0, targetElement.width, targetElement.height)

                    hashElement(targetElement).then((hash) => {
                        toriiData.toriiHash = hash
                    })
                }

                newImg.src = dataURL
            }

            click(cancelEditBtn)
        })

        cancelEditBtn.addEventListener("pointerup", () => {
            originalImage.remove()
            inpaintedImage.remove()
            editScreen.remove()
            hiddenInput.remove()
            isEditing = false
        })

        let messageTimeout = null
        const canvasMessage = {
            show: false,
            x: null,
            y: null,
            text: null,
        }

        function displayMessage(x, y, text) {
            canvasMessage.show = true
            canvasMessage.x = x
            canvasMessage.y = y
            canvasMessage.text = text

            if (messageTimeout) clearTimeout(messageTimeout)

            messageTimeout = setTimeout(() => {
                canvasMessage.show = false
                redrawCanvas(true)
            }, 2000)

            redrawCanvas(true)
        }

        function getCopyButtonPosition(rectX, textY, width, height, buttonRadius, canvasWidth, canvasHeight, zoom = 1, offset = 0) {
            const r = buttonRadius / zoom
            const margin = 10 / zoom

            const rightX = rectX + width + r + margin
            if (rightX + r <= canvasWidth) {
                return { x: rightX, y: textY + offset + r / 2 }
            }

            const leftX = rectX - r - margin
            if (leftX - r >= 0) {
                return { x: leftX, y: textY + offset + r / 2 }
            }

            const topY = textY - r - margin
            if (topY - r >= 0) {
                return { x: rectX + offset + r / 2, y: topY }
            }

            const bottomY = textY + height + r + margin
            if (bottomY + r <= canvasHeight) {
                return { x: rectX + offset + r / 2, y: bottomY }
            }

            return {
                x: Math.max(r, Math.min(canvasWidth - r, rectX + offset + r / 2)),
                y: Math.max(r, Math.min(canvasHeight - r, textY + offset + r / 2)),
            }
        }

        function drawRoundedRect(ctx, x, y, width, height, radius) {
            if (width < 2 * radius) radius = width / 2;
            if (height < 2 * radius) radius = height / 2;
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.arcTo(x + width, y, x + width, y + height, radius);
            ctx.arcTo(x + width, y + height, x, y + height, radius);
            ctx.arcTo(x, y + height, x, y, radius);
            ctx.arcTo(x, y, x + width, y, radius);
            ctx.closePath();
            ctx.fill();
        }

        function strokeRoundedRect(ctx, x, y, width, height, radius) {
            if (width < 2 * radius) radius = width / 2;
            if (height < 2 * radius) radius = height / 2;
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.arcTo(x + width, y, x + width, y + height, radius);
            ctx.arcTo(x + width, y + height, x, y + height, radius);
            ctx.arcTo(x, y + height, x, y, radius);
            ctx.arcTo(x, y, x + width, y, radius);
            ctx.closePath();
            ctx.stroke();
        }

        function redrawCanvas(textOutline = false, texts = true) {
            if (flipped) {
                workingContext.drawImage(originalImage, 0, 0, workingCanvas.width, workingCanvas.height)
                return
            }

            if (!isDrawing || imageMode === "inpaint") {
                workingContext.clearRect(0, 0, workingCanvas.width, workingCanvas.height)
                workingContext.drawImage(hiddenCanvas, 0, 0, workingCanvas.width, workingCanvas.height)
            }

            workingContext.globalCompositeOperation = "destination-atop"
            workingContext.drawImage(originalImage, 0, 0, workingCanvas.width, workingCanvas.height)
            workingContext.globalCompositeOperation = "source-over"

            if (imageMode === "inpaint") {
                workingContext.globalAlpha = 0.5
                workingContext.drawImage(maskCanvas, 0, 0, workingCanvas.width, workingCanvas.height)
                workingContext.globalAlpha = 1
            }

            if (!isDrawing && texts) {
                let selectionCoords = null

                toriiData.textObjects.forEach((textObject, index) => {
                    const textAlign = textObject.textAlign || "center"
                    workingContext.textAlign = textAlign

                    const lineHeight = parseInt(textObject.font) * getLineHeight(textObject.font)
                    const padding = parseInt(textObject.borderPadding || 0);

                    let width = getTextWidth(textObject) + 10 + padding * 2 + parseInt(textObject.lineWidth)
                    let height = lineHeight * (textObject.text.split("\n").length)

                    let textX = textObject.x
                    let rectX = textX - width / 2
                    if (textAlign === "left") {
                        textX -= width / 2
                        rectX -= parseInt(textObject.lineWidth) / 2
                    } else if (textAlign === "right") {
                        textX += width / 2
                        rectX += parseInt(textObject.lineWidth) / 2
                    }

                    let textY = textObject.y - height / 2 + parseInt(textObject.font) / 4

                    workingContext.save()
                    const angle = textObject.rotation || 0
                    workingContext.translate(textObject.x, textObject.y)
                    workingContext.rotate(angle)
                    workingContext.translate(-textObject.x, -textObject.y)

                    if (textObject.addFontBackground) {
                        workingContext.fillStyle = textObject.addBackgroundColor
                        const radius = textObject.borderRadius || 0
                        const rectWidth = width
                        const rectHeight = height + parseInt(textObject.lineWidth) + (padding * 2) + 10 - parseInt(textObject.font) / 3
                        const rectY = textY - parseInt(textObject.lineWidth) / 2 - padding - 5
                        if (radius > 0) {
                            drawRoundedRect(workingContext, rectX, rectY, rectWidth, rectHeight, parseInt(radius))
                        } else {
                            workingContext.fillRect(rectX, rectY, rectWidth, rectHeight)
                        }
                    }

                    if (textObject.addFontBorder) {
                        workingContext.strokeStyle = "#000000"
                        const lineWidth = 2
                        workingContext.lineWidth = lineWidth
                        const radius = textObject.borderRadius || 0
                        const rectWidth = width + lineWidth
                        const rectHeight = height + lineWidth + parseInt(textObject.lineWidth) + (padding * 2) + 10 - parseInt(textObject.font) / 3
                        const rectXWithBorder = rectX - lineWidth / 2
                        const rectYWithBorder = textY - lineWidth / 2 - parseInt(textObject.lineWidth) / 2 - padding - 5
                        if (radius > 0) {
                            strokeRoundedRect(workingContext, rectXWithBorder, rectYWithBorder, rectWidth, rectHeight, parseInt(radius))
                        } else {
                            workingContext.strokeRect(rectXWithBorder, rectYWithBorder, rectWidth, rectHeight)
                        }
                    }

                    workingContext.font = textObject.font
                    workingContext.fillStyle = textObject.fillColor
                    workingContext.strokeStyle = textObject.strokeColor
                    workingContext.lineWidth = textObject.lineWidth
                    workingContext.lineJoin = "round"
                    workingContext.textBaseline = "top"
                    workingContext.direction = isRTL(textObject.text) ? "rtl" : "ltr"

                    let currentIndex = null
                    let caretPos = null

                    if (index === activeText && imageMode === "add" && textOutline && caretVisible) {
                        currentIndex = 0
                    }

                    const lines = textObject.text.split("\n")
                    lines.forEach((line, i) => {
                        const isLastLine = i === lines.length - 1

                        if (currentIndex !== null && caretPos === null) {
                            const isAtNewline = !isLastLine && hiddenInput.selectionStart === currentIndex + line.length + 1

                            if (currentIndex + line.length + 1 >= hiddenInput.selectionStart) {
                                if (isAtNewline) {
                                    caretPos = { x: rectX, y: textY + ((i + 1) * lineHeight) - lineHeight / 8 }

                                    const nextLine = i + 1 < lines.length ? lines[i + 1] : ""
                                    const nextLineWidth = workingContext.measureText(nextLine).width

                                    if (textAlign === "center") {
                                        caretPos.x += (width - nextLineWidth) / 2
                                    } else if (textAlign === "right") {
                                        caretPos.x += width - nextLineWidth
                                    }
                                } else {
                                    caretPos = { x: rectX, y: textY + (i * lineHeight) - lineHeight / 8 }

                                    const textWidth = workingContext.measureText(line.slice(0, hiddenInput.selectionStart - currentIndex)).width
                                    const textAfterWidth = workingContext.measureText(line.slice(hiddenInput.selectionStart - currentIndex)).width

                                    if (textAlign === "center") {
                                        caretPos.x += (width + textWidth - textAfterWidth) / 2
                                    } else if (textAlign === "right") {
                                        caretPos.x += width - textAfterWidth
                                    } else if (textAlign === "left") {
                                        caretPos.x += textWidth
                                    }
                                }
                            } else {
                                currentIndex += line.length + 1
                            }
                        }

                        const lineY = textY + (i * lineHeight)
                        if (textObject.lineWidth > 0) {
                            workingContext.strokeText(line, textX, lineY)
                        }
                        workingContext.fillText(line, textX, lineY)
                    })

                    if (imageMode === "add" && textOutline) {
                        workingContext.strokeStyle = "#fb923c"
                        workingContext.lineWidth = 1

                        if (index === activeText) {
                            workingContext.strokeStyle = "#60a5fa"
                            workingContext.lineWidth = 2

                            selectionCoords = { rectX, textY, width, height }
                        }

                        // border
                        workingContext.setLineDash([5, 3])
                        workingContext.strokeRect(rectX, textY - parseInt(textObject.lineWidth) / 2 - 5 - padding, width, height + parseInt(textObject.lineWidth) + 10 + padding * 2 - parseInt(textObject.font) / 3)
                        workingContext.setLineDash([])

                        // rotation handle
                        if (index === activeText) {
                            const cx = textObject.x
                            const cy = textObject.y
                            const angle = textObject.rotation || 0

                            const rectY = textY - parseInt(textObject.lineWidth) / 2 - padding;

                            const localX = rectX - cx;
                            const localY = rectY - cy;

                            const rotatedX = localX * Math.cos(angle) - localY * Math.sin(angle)
                            const rotatedY = localX * Math.sin(angle) + localY * Math.cos(angle)

                            textObject.handle = { x: cx + rotatedX, y: cy + rotatedY }

                            workingContext.beginPath()
                            workingContext.arc(rectX, rectY, 8, 0, 2 * Math.PI)
                            workingContext.fillStyle = "#60a5fa"
                            workingContext.fill()
                        }
                    }

                    if (caretPos !== null) {
                        workingContext.fillStyle = "#fb923c"
                        workingContext.fillRect(caretPos.x, caretPos.y, 2, lineHeight)
                    }

                    workingContext.restore()
                })

                if (selectionCoords) {
                    const zoomLevel = Math.sqrt((Number(zoomSlider.value) + 50) / 50)
                    const buttonRadius = 18 / zoomLevel
                    const copyButtons = { original: null, translated: null }

                    if (toriiData.textObjects[activeText].originalText) {
                        const { x: buttonX1, y: buttonY1 } = getCopyButtonPosition(
                            selectionCoords.rectX, selectionCoords.textY, selectionCoords.width, selectionCoords.height, buttonRadius, workingCanvas.width, workingCanvas.height, zoomLevel
                        )

                        workingContext.beginPath()
                        workingContext.arc(buttonX1, buttonY1, buttonRadius, 0, 2 * Math.PI)
                        workingContext.fillStyle = "#ffffff"
                        workingContext.fill()
                        workingContext.strokeStyle = "#60a5fa"
                        workingContext.lineWidth = 2
                        workingContext.setLineDash([5, 3])
                        workingContext.stroke()
                        workingContext.setLineDash([])
                        workingContext.drawImage(copyOriginal, buttonX1 - buttonRadius / 2, buttonY1 - buttonRadius / 2, buttonRadius, buttonRadius)

                        copyButtons.original = { x: buttonX1, y: buttonY1, r: buttonRadius }
                    }

                    if (toriiData.textObjects[activeText].text) {
                        const offset = toriiData.textObjects[activeText].originalText ? buttonRadius * 2.4 : 0
                        const { x: buttonX2, y: buttonY2 } = getCopyButtonPosition(
                            selectionCoords.rectX, selectionCoords.textY, selectionCoords.width, selectionCoords.height, buttonRadius, workingCanvas.width, workingCanvas.height, zoomLevel, offset
                        )

                        workingContext.beginPath()
                        workingContext.arc(buttonX2, buttonY2, buttonRadius, 0, 2 * Math.PI)
                        workingContext.fillStyle = "#ffffff"
                        workingContext.fill()
                        workingContext.strokeStyle = "#60a5fa"
                        workingContext.lineWidth = 2
                        workingContext.setLineDash([5, 3])
                        workingContext.stroke()
                        workingContext.setLineDash([])
                        workingContext.drawImage(copyTranslated, buttonX2 - buttonRadius / 2, buttonY2 - buttonRadius / 2, buttonRadius, buttonRadius)

                        copyButtons.translated = { x: buttonX2, y: buttonY2, r: buttonRadius }
                    }

                    if (copyButtons.original || copyButtons.translated) {
                        toriiData.textObjects[activeText].copyButtons = copyButtons
                    }
                }

                if (canvasMessage.show) {
                    const padding = 6
                    const fontSize = 14
                    workingContext.font = `${fontSize}px sans-serif`
                    workingContext.textBaseline = "top"
                    const textWidth = workingContext.measureText(canvasMessage.text).width

                    const labelX = canvasMessage.x - textWidth / 2
                    const labelY = canvasMessage.y

                    workingContext.fillStyle = "black"
                    workingContext.fillRect(
                        labelX - padding,
                        labelY - padding,
                        textWidth + padding * 2,
                        fontSize + padding * 2
                    )

                    workingContext.fillStyle = "white"
                    workingContext.textAlign = "center"
                    workingContext.fillText(canvasMessage.text, canvasMessage.x, labelY)
                }
            }
        }

        function selectText(textObject, x, y) {
            addFontSize.value = parseInt(textObject.font)
            addFontSizeValue.innerText = `${addFontSize.value}px`
            addTextColor.value = textObject.fillColor
            addStrokeSize.value = textObject.lineWidth
            addStrokeSizeValue.innerText = `${addStrokeSize.value}px`
            addStrokeColor.value = textObject.strokeColor
            addFontBackground.checked = textObject.addFontBackground
            addFontBorder.checked = textObject.addFontBorder
            addBackgroundColor.value = textObject.addBackgroundColor
            addBorderRadius.value = textObject.borderRadius || 0
            addBorderRadiusValue.innerText = `${addBorderRadius.value}px`
            addBorderPadding.value = textObject.borderPadding || 0
            addBorderPaddingValue.innerText = `${addBorderPadding.value}px`
            hiddenInput.value = textObject.text

            if (textObject.textAlign === "center") {
                click(addAlignCenter)
            } else if (textObject.textAlign === "right") {
                click(addAlignRight)
            } else if (textObject.textAlign === "left") {
                click(addAlignLeft)
            } else {
                click(addAlignCenter)
            }

            const fontName = textObject.font.split(" ").slice(1).join(" ").replace(/["']/g, "")
            for (let i = 0; i < addFontSelect.options.length; i++) {
                if (addFontSelect.options[i].value === fontName) {
                    addFontSelect.selectedIndex = i
                    break
                }
            }

            setCursorPosition(textObject, x, y)
        }

        function setCursorPosition(textObject, x, y) {
            if (!x || !y) {
                hiddenInput.focus()
                hiddenInput.setSelectionRange(hiddenInput.value.length, hiddenInput.value.length)
                startCaretBlinking()
                redrawCanvas(true)
                return
            }

            // Transform click coordinates to account for text rotation
            const rotation = textObject.rotation || 0
            let transformedX = x
            let transformedY = y

            if (rotation !== 0) {
                // Translate click point relative to text center
                const localX = x - textObject.x
                const localY = y - textObject.y

                // Rotate the click point by the negative rotation angle
                const cos = Math.cos(-rotation)
                const sin = Math.sin(-rotation)
                const rotatedX = localX * cos - localY * sin
                const rotatedY = localX * sin + localY * cos

                // Transform back to world coordinates
                transformedX = rotatedX + textObject.x
                transformedY = rotatedY + textObject.y
            }

            const lineHeight = parseInt(textObject.font) * getLineHeight(textObject.font)
            const textAlign = textObject.textAlign || "center"
            const width = getTextWidth(textObject) + 10 + parseInt(textObject.lineWidth)
            const lines = textObject.text.split("\n")

            let textY = textObject.y - (lineHeight * lines.length) / 2 + parseInt(textObject.font) / 4
            let textX = textObject.x

            let rectX = textX - width / 2
            if (textAlign === "left") {
                textX -= width / 2
                rectX -= parseInt(textObject.lineWidth) / 2
            } else if (textAlign === "right") {
                textX += width / 2
                rectX += parseInt(textObject.lineWidth) / 2
            }

            // Use transformed coordinates for line and character detection
            const lineIndex = Math.floor((transformedY - textY) / lineHeight)
            if (lineIndex >= 0 && lineIndex < lines.length) {
                const line = lines[lineIndex]

                let effectiveTextX
                if (textAlign === "left") {
                    effectiveTextX = textX
                } else if (textAlign === "right") {
                    effectiveTextX = textX - workingContext.measureText(line).width
                } else {
                    effectiveTextX = textX - workingContext.measureText(line).width / 2
                }

                let charIndex = 0
                let minDistance = Infinity
                for (let i = 0; i <= line.length; i++) {
                    const subText = line.substring(0, i)
                    const charX = effectiveTextX + workingContext.measureText(subText).width
                    const distance = Math.abs(transformedX - charX)

                    if (distance < minDistance) {
                        minDistance = distance
                        charIndex = i
                    }
                }

                let fullPosition = charIndex
                for (let i = 0; i < lineIndex; i++) {
                    fullPosition += lines[i].length + 1
                }

                hiddenInput.focus()
                hiddenInput.setSelectionRange(fullPosition, fullPosition)
                startCaretBlinking()
                redrawCanvas(true)
            }
        }

        function applyTextSettings() {
            const size = addFontSize.value
            const font = addFontSelect.value
            workingContext.font = `${size}px ${font}`
            workingContext.fillStyle = addTextColor.value
            workingContext.strokeStyle = addStrokeColor.value
            workingContext.lineWidth = addStrokeSize.value
            workingContext.textAlign = textAlignment
            workingCanvas.textBaseline = "middle"
        }

        function getLineHeight(font) {
            const fontName = font.split(" ")[1]

            switch (fontName) {
                case "WildWords": return 1.2
                case "NotoSans": return 1.4
                case "KomikaJam": return 1.3
                case "Bangers": return 1.1
                case "Edo": return 1.1
                case "RIDIBatang": return 1.1
                case "Bushidoo": return 1.1
                case "Hayah": return 1.1
                case "Itim": return 1.1
            }
        }

        function getTextWidth(textObject) {
            workingContext.font = textObject.font
            const lines = textObject.text.split("\n")
            let maxWidth = 0

            lines.forEach(line => {
                const metrics = workingContext.measureText(line)
                maxWidth = Math.max(maxWidth, metrics.width)
            })

            return maxWidth
        }

        function isPointInRotatedTextObject(x, y, textObject) {
            const padding = parseInt(textObject.borderPadding || 0);
            const lineHeight = parseInt(textObject.font) * getLineHeight(textObject.font)
            const width = getTextWidth(textObject) + 10 + (padding * 2) + parseInt(textObject.lineWidth)
            const height = lineHeight * (textObject.text.split("\n").length)

            const textAlign = textObject.textAlign || "center"
            let rectX = textObject.x - width / 2
            if (textAlign === "left") {
                rectX = textObject.x - width / 2 - parseInt(textObject.lineWidth) / 2
            } else if (textAlign === "right") {
                rectX = textObject.x - width / 2 + parseInt(textObject.lineWidth) / 2
            }

            const rectY = textObject.y - height / 2 + parseInt(textObject.font) / 4 - parseInt(textObject.lineWidth) / 2 - padding - 5

            const rotation = textObject.rotation || 0
            if (rotation === 0) {
                return x >= rectX &&
                    x <= rectX + width &&
                    y >= rectY &&
                    y <= rectY + height + parseInt(textObject.lineWidth) + 10 + (padding * 2) - parseInt(textObject.font) / 3
            }

            const localX = x - textObject.x
            const localY = y - textObject.y

            const cos = Math.cos(-rotation)
            const sin = Math.sin(-rotation)
            const rotatedX = localX * cos - localY * sin
            const rotatedY = localX * sin + localY * cos

            const transformedX = rotatedX + textObject.x
            const transformedY = rotatedY + textObject.y

            return transformedX >= rectX &&
                transformedX <= rectX + width &&
                transformedY >= rectY &&
                transformedY <= rectY + height + parseInt(textObject.lineWidth) + 10 + (padding * 2) - parseInt(textObject.font) / 3
        }

        function textModeClick(e) {
            const touch = e?.touches?.[0]

            const clientX = touch ? touch.clientX : e.clientX
            const clientY = touch ? touch.clientY : e.clientY

            const rect = workingCanvas.getBoundingClientRect()
            const ratio = workingCanvas.width / workingCanvas.clientWidth
            const x = (clientX - rect.left) * ratio
            const y = (clientY - rect.top) * ratio

            const active = toriiData.textObjects[activeText]
            if (active && active.copyButtons) {
                if (active.copyButtons.original) {
                    const dx = x - active.copyButtons.original.x
                    const dy = y - active.copyButtons.original.y
                    const distance = Math.sqrt(dx * dx + dy * dy)

                    if (distance <= active.copyButtons.original.r) {
                        navigator.clipboard.writeText(active.originalText).then(() => {
                            displayMessage(active.copyButtons.original.x, active.copyButtons.original.y + active.copyButtons.original.r + 15, "Copied original text!")
                        })

                        return
                    }
                }

                if (active.copyButtons.translated) {
                    const dx = x - active.copyButtons.translated.x
                    const dy = y - active.copyButtons.translated.y
                    const distance = Math.sqrt(dx * dx + dy * dy)

                    if (distance <= active.copyButtons.translated.r) {
                        navigator.clipboard.writeText(active.text.replace(/\n/g, " ")).then(() => {
                            displayMessage(active.copyButtons.translated.x, active.copyButtons.translated.y + active.copyButtons.translated.r + 15, "Copied translated text!")
                        })

                        return
                    }
                }
            }

            let clickedOnText = false
            let isActionTaken = false

            toriiData.textObjects.forEach((textObject, index) => {
                if (textObject.handle) {
                    const dx = x - textObject.handle.x
                    const dy = y - textObject.handle.y
                    const distance = Math.sqrt(dx * dx + dy * dy)

                    if (distance <= 8) {
                        if (!isActionTaken) {
                            saveUndoState()
                            isActionTaken = true
                        }

                        activeText = index
                        isRotating = true

                        rotationStartAngle = textObject.rotation || 0

                        const mouseAngle = Math.atan2(y - textObject.y, x - textObject.x)
                        rotationStartMouseAngle = mouseAngle

                        return
                    }
                }

                if (isPointInRotatedTextObject(x, y, textObject)) {
                    if (!isActionTaken) {
                        saveUndoState()
                        isActionTaken = true
                    }

                    clickedOnText = true
                    activeText = index
                    selectText(textObject, x, y)

                    isDragging = true
                    textDragActive = true
                    dragStartX = x - textObject.x
                    dragStartY = y - textObject.y
                }
            })

            enable(removeTextBtn, copyTextBtn)

            if (!clickedOnText && !isRotating) {
                if (!isActionTaken) {
                    saveUndoState()
                    isActionTaken = true
                }

                applyTextSettings()
                activeText = toriiData.textObjects.length

                const newText = {
                    text: "",
                    x: x,
                    y: y,
                    font: `${addFontSize.value}px ${addFontSelect.value}`,
                    fillColor: addTextColor.value,
                    strokeColor: addStrokeColor.value,
                    lineWidth: addStrokeSize.value,
                    textAlign: textAlignment,
                    addFontBackground: addFontBackground.checked,
                    addFontBorder: addFontBorder.checked,
                    addBackgroundColor: addBackgroundColor.value,
                    borderRadius: addBorderRadius.value,
                    borderPadding: addBorderPadding.value,
                    rotation: 0
                }

                toriiData.textObjects.push(newText)
                selectText(newText, x, y)

                hiddenInput.value = newText.text
                hiddenInput.focus()
            }
        }

        function handleTouchStart(e) {
            if (imageMode === "add" || imageMode === "translate" || flipped) return

            clearTimeout(drawTouchTimeout)

            const touch = e.touches[0]
            drawTouchStartPos = {
                x: touch.clientX,
                y: touch.clientY
            }

            drawTouchTimeout = setTimeout(() => {
                if (!drawTouchStartPos) return

                isDrawing = true

                const rect = workingCanvas.getBoundingClientRect()
                const offsetX = touch.clientX - rect.left
                const offsetY = touch.clientY - rect.top

                const simulatedEvent = {
                    offsetX: offsetX,
                    offsetY: offsetY,
                    clientX: touch.clientX,
                    clientY: touch.clientY
                }

                draw(simulatedEvent)
                showCursor(simulatedEvent)
            }, TOUCH_DELAY)
        }

        function handleTouchMove(e) {
            if (imageMode === "add" || imageMode === "translate" || flipped) return

            const touch = e.touches[0]

            if (!isDrawing && drawTouchStartPos) {
                const deltaX = Math.abs(touch.clientX - drawTouchStartPos.x)
                const deltaY = Math.abs(touch.clientY - drawTouchStartPos.y)

                if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
                    clearTimeout(drawTouchTimeout)
                    drawTouchStartPos = null
                    return
                }
            }

            if (isDrawing) {
                e.preventDefault()

                const rect = workingCanvas.getBoundingClientRect()
                const offsetX = touch.clientX - rect.left
                const offsetY = touch.clientY - rect.top

                const simulatedEvent = {
                    offsetX: offsetX,
                    offsetY: offsetY,
                    clientX: touch.clientX,
                    clientY: touch.clientY
                }

                draw(simulatedEvent)
                showCursor(simulatedEvent)
            }
        }

        function handleTouchEnd() {
            clearTimeout(drawTouchTimeout)
            if (isDrawing) {
                stopDrawing()
            }
            drawTouchStartPos = null
            hideCursor()
        }

        function handleTextModeTouchStart(e) {
            if (imageMode !== "add" || flipped) return

            clearTimeout(textTouchTimeout)

            const touch = e.touches[0]

            textTouchStartPos = {
                x: touch.clientX,
                y: touch.clientY
            }

            textTouchTimeout = setTimeout(() => {
                if (!textTouchStartPos) return

                const active = toriiData.textObjects[activeText]
                if (active) {
                    const handleSize = 10
                    const width = getTextWidth(active) + 10 + parseInt(active.lineWidth)
                    const lineHeight = parseInt(active.font) * getLineHeight(active.font)
                    const height = lineHeight * active.text.split("\n").length
                    let textY = active.y - height / 2 + parseInt(active.font) / 4
                    let rectX = active.x - width / 2

                    const handleX = rectX + width / 2 - handleSize / 2
                    const handleY = textY - parseInt(active.lineWidth) / 2 - 5 - 20

                    const rect = workingCanvas.getBoundingClientRect()
                    const ratio = workingCanvas.width / workingCanvas.clientWidth
                    const x = (touch.clientX - rect.left) * ratio
                    const y = (touch.clientY - rect.top) * ratio

                    if (x >= handleX && x <= handleX + handleSize && y >= handleY && y <= handleY + handleSize) {
                        isRotating = true
                        rotationStartAngle = active.rotation || 0
                        const dx = x - active.x
                        const dy = y - active.y
                        rotationStartMouseAngle = Math.atan2(dy, dx)
                        return
                    }
                }

                textModeClick(e)
            }, TOUCH_DELAY)
        }

        function handleTextModeTouchMove(e) {
            if (isRotating && activeText !== null) {
                const touch = e.touches[0]
                const rect = workingCanvas.getBoundingClientRect()
                const ratio = workingCanvas.width / workingCanvas.clientWidth
                const x = (touch.clientX - rect.left) * ratio
                const y = (touch.clientY - rect.top) * ratio

                const dx = x - toriiData.textObjects[activeText].x
                const dy = y - toriiData.textObjects[activeText].y
                const newMouseAngle = Math.atan2(dy, dx)
                const angleDifference = newMouseAngle - rotationStartMouseAngle
                toriiData.textObjects[activeText].rotation = rotationStartAngle + angleDifference

                redrawCanvas(true)
                return
            }

            if (imageMode !== "add" || flipped) return

            const touch = e.touches[0]

            if (!textDragActive && textTouchStartPos) {
                const deltaX = Math.abs(touch.clientX - textTouchStartPos.x)
                const deltaY = Math.abs(touch.clientY - textTouchStartPos.y)

                if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) {
                    clearTimeout(textTouchTimeout)
                    textTouchStartPos = null
                    return
                }
            }

            if (textDragActive && activeText !== null) {
                e.preventDefault()

                const rect = workingCanvas.getBoundingClientRect()
                const ratio = workingCanvas.width / workingCanvas.clientWidth
                const x = (touch.clientX - rect.left) * ratio
                const y = (touch.clientY - rect.top) * ratio

                toriiData.textObjects[activeText].x = x - dragStartX
                toriiData.textObjects[activeText].y = y - dragStartY

                redrawCanvas(true)
            }
        }

        function handleTextModeTouchEnd() {
            isRotating = false
            clearTimeout(textTouchTimeout)
            textTouchStartPos = null
            textDragActive = false
        }

        function draw(e) {
            if (imageMode === "add" || imageMode === "translate" || flipped) return

            showCursor(e)
            if (!isDrawing) return

            const ratio = workingCanvas.width / workingCanvas.clientWidth
            const x = e.offsetX * ratio
            const y = e.offsetY * ratio

            if (imageMode === "erase") {
                workingContext.globalCompositeOperation = "destination-out"
                hiddenContext.globalCompositeOperation = "destination-out"
            }

            if (imageMode !== "inpaint") {
                workingContext.beginPath()
                hiddenContext.beginPath()
            } else {
                maskContext.beginPath()
            }

            let brushSize = eraseBrushSize
            if (imageMode === "paint") brushSize = paintBrushSize
            if (imageMode === "inpaint") brushSize = inpaintBrushSize

            if (prevPoint) {
                if (imageMode !== "inpaint") {
                    workingContext.moveTo(prevPoint.x, prevPoint.y)
                    workingContext.lineTo(x, y)
                    workingContext.lineWidth = brushSize * ratio
                    workingContext.stroke()

                    hiddenContext.moveTo(prevPoint.x, prevPoint.y)
                    hiddenContext.lineTo(x, y)
                    hiddenContext.lineWidth = brushSize * ratio
                    hiddenContext.stroke()
                } else {
                    maskContext.strokeStyle = "#3b82f6"
                    maskContext.moveTo(prevPoint.x, prevPoint.y)
                    maskContext.lineTo(x, y)
                    maskContext.lineWidth = brushSize * ratio
                    maskContext.stroke()
                }

                if (imageMode === "paint") {
                    workingContext.strokeStyle = paintColor.value
                    hiddenContext.strokeStyle = paintColor.value
                }
            }

            if (imageMode === "erase") {
                const radiusSq = (brushSize * ratio / 2) ** 2
                toriiData.textObjects = toriiData.textObjects.filter(obj => {
                    const dx = obj.x - x
                    const dy = obj.y - y
                    return (dx * dx + dy * dy) > radiusSq
                })
            }

            if (imageMode === "paint") {
                workingContext.fillStyle = paintColor.value
                hiddenContext.fillStyle = paintColor.value
            }

            if (imageMode !== "inpaint") {
                workingContext.arc(x, y, brushSize * ratio / 2, 0, Math.PI * 2)
                workingContext.fill()

                hiddenContext.arc(x, y, brushSize * ratio / 2, 0, Math.PI * 2)
                hiddenContext.fill()
            } else {
                maskContext.fillStyle = "#3b82f6"
                maskContext.arc(x, y, brushSize * ratio / 2, 0, Math.PI * 2)
                maskContext.fill()
            }

            prevPoint = { x, y }

            workingContext.globalCompositeOperation = "source-over"
            hiddenContext.globalCompositeOperation = "source-over"

            redrawCanvas(true, imageMode !== "paint" && imageMode !== "inpaint")
        }


        function startDrawing(e) {
            if (imageMode === "add" || imageMode === "translate" || flipped) return
            if (e.pointerType === "touch") return
            if (imageMode == "inpaint" && isInpainting) return

            saveUndoState()

            isDrawing = true
            draw(e)
        }

        function stopDrawing(e) {
            if (imageMode === "add" || imageMode === "translate" || flipped) return

            if (imageMode == "inpaint") {
                const boundingBox = getMaskBoundingBox(maskCanvas)
                if (boundingBox !== null && !isInpainting) {
                    redrawCanvas(true, false)
                    isInpainting = true

                    extractCroppedImageAndMask(boundingBox).then(async data => {
                        await inpaintImage(data)
                        isInpainting = false
                    }).catch(error => {
                        sendError(error, "stopDrawing")
                        showGeneralError("Failed to inpaint image.")
                        maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
                        redrawCanvas(true, false)
                        isInpainting = false
                    })
                } else {
                    maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
                }
            }

            isDrawing = false
            prevPoint = null
        }

        async function inpaintImage(data) {
            const [imageBlob, maskBlob, boundingBox] = data

            const imageBuffer = await imageBlob.arrayBuffer()
            const maskBuffer = await maskBlob.arrayBuffer()

            const imageArray = Array.from(new Uint8Array(imageBuffer))
            const maskArray = Array.from(new Uint8Array(maskBuffer))

            const response = await chrome.runtime.sendMessage({
                type: "inpaint",
                image: imageArray,
                mask: maskArray
            })

            if (!response.success) {
                showGeneralError("Failed to inpaint image.")
                maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
                isInpainting = false
                redrawCanvas(true, false)

                return
            }

            const { x, y, width, height } = boundingBox

            const inpaintedImage = new Image()
            inpaintedImage.crossOrigin = "anonymous"
            inpaintedImage.src = response.content.inpaintedImageSrc

            return new Promise((resolve, reject) => {
                inpaintedImage.onload = () => {
                    if (isInpainting) {
                        workingContext.drawImage(inpaintedImage, x, y, width, height)
                        hiddenContext.drawImage(inpaintedImage, x, y, width, height)
                    }

                    return resolve()
                }

                inpaintedImage.onerror = () => {
                    return reject()
                }
            })
        }

        function extractCroppedImageAndMask(bbox, padding = 20) {
            return new Promise((resolve, reject) => {
                const { width, height } = workingCanvas

                const x = Math.max(0, bbox.x - padding)
                const y = Math.max(0, bbox.y - padding)
                const maxX = Math.min(width - 1, bbox.x + bbox.width - 1 + padding)
                const maxY = Math.min(height - 1, bbox.y + bbox.height - 1 + padding)
                const paddedWidth = maxX - x + 1
                const paddedHeight = maxY - y + 1

                const paddedBoundingBox = { x, y, width: paddedWidth, height: paddedHeight }

                const maskData = maskContext.getImageData(x, y, paddedWidth, paddedHeight)

                maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height)

                const imageData = hiddenContext.getImageData(x, y, paddedWidth, paddedHeight)

                const tmpImageCanvas = document.createElement("canvas")
                tmpImageCanvas.width = paddedWidth
                tmpImageCanvas.height = paddedHeight
                const tempImageContext = tmpImageCanvas.getContext("2d")
                tempImageContext.putImageData(imageData, 0, 0)

                tempImageContext.globalCompositeOperation = "destination-atop"
                tempImageContext.drawImage(originalImage, x, y, paddedWidth, paddedHeight, 0, 0, paddedWidth, paddedHeight)
                tempImageContext.globalCompositeOperation = "source-over"

                const tmpMaskCanvas = document.createElement("canvas")
                tmpMaskCanvas.width = paddedWidth
                tmpMaskCanvas.height = paddedHeight
                tmpMaskCanvas.getContext("2d").putImageData(maskData, 0, 0)

                tmpImageCanvas.toBlob(imageBlob => {
                    tmpMaskCanvas.toBlob(maskBlob => {
                        tmpMaskCanvas.remove()
                        tmpImageCanvas.remove()
                        resolve([imageBlob, maskBlob, paddedBoundingBox])
                    })
                }, "image/png")
            })
        }

        function getMaskBoundingBox(maskCanvas) {
            const ctx = maskCanvas.getContext("2d")
            const { width, height } = maskCanvas
            const imageData = ctx.getImageData(0, 0, width, height)
            const data = imageData.data

            let minX = width, minY = height, maxX = 0, maxY = 0
            let found = false

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const index = (y * width + x) * 4
                    const alpha = data[index + 3]
                    if (alpha > 0) {
                        found = true
                        if (x < minX) minX = x
                        if (x > maxX) maxX = x
                        if (y < minY) minY = y
                        if (y > maxY) maxY = y
                    }
                }
            }

            if (!found) return null

            return {
                x: minX,
                y: minY,
                width: maxX - minX + 1,
                height: maxY - minY + 1
            }
        }

        function showCursor(e) {
            if (imageMode === "add" || imageMode === "translate" || flipped) return
            if (e?.pointerType === "touch") return

            let brushSize = eraseBrushSize
            if (imageMode === "inpaint") brushSize = inpaintBrushSize
            if (imageMode === "paint") brushSize = paintBrushSize

            canvasCursor.style.left = `${e.offsetX + workingCanvas.offsetLeft - canvasContainer.scrollLeft + 4 - brushSize / 2}px`
            canvasCursor.style.top = `${e.offsetY + workingCanvas.offsetTop - canvasContainer.scrollTop + 4 - brushSize / 2}px`
            canvasCursor.style.width = `${brushSize}px`
            canvasCursor.style.height = `${brushSize}px`
            canvasCursor.style.opacity = 1
        }

        function hideCursor() {
            canvasCursor.style.opacity = 0
            if (imageMode === "add" || imageMode === "translate" || flipped) return
            stopDrawing()
        }

        function handleTextModePointerDown(e) {
            if (imageMode !== "add" || flipped) return
            if (e?.pointerType === "touch") return

            e.preventDefault()
            e.stopPropagation()

            textModeClick(e)
        }

        function handleTextModePointerMove(e) {
            if (activeText === null || flipped) return

            const rect = workingCanvas.getBoundingClientRect()
            const ratio = workingCanvas.width / workingCanvas.clientWidth
            const x = (e.clientX - rect.left) * ratio
            const y = (e.clientY - rect.top) * ratio

            const textObj = toriiData.textObjects[activeText]

            if (isRotating) {
                const currentMouseAngle = Math.atan2(y - textObj.y, x - textObj.x)
                const rotationDelta = currentMouseAngle - rotationStartMouseAngle
                textObj.rotation = rotationStartAngle + rotationDelta

                redrawCanvas(true)
                workingCanvas.style.cursor = "grab"
                return
            }

            if (!isDragging) return

            textObj.x = x - dragStartX
            textObj.y = y - dragStartY

            redrawCanvas(true)

            workingCanvas.style.cursor = "move"
        }

        function handleTextModePointerUp(e) {
            isRotating = false
            isDragging = false
            workingCanvas.style.cursor = "text"
        }

        let caretVisible = true
        let caretBlinkInterval

        function startCaretBlinking() {
            if (caretBlinkInterval) clearInterval(caretBlinkInterval)

            caretVisible = true

            caretBlinkInterval = setInterval(() => {
                caretVisible = !caretVisible
                redrawCanvas(true)
            }, 530)
        }

        function stopCaretBlinking() {
            if (caretBlinkInterval) {
                clearInterval(caretBlinkInterval)
                caretBlinkInterval = null
            }
            caretVisible = false
            redrawCanvas(true)
        }

        hiddenInput.addEventListener("input", (e) => {
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].text = hiddenInput.value
                startCaretBlinking()
                redrawCanvas(true)
            }
        })

        globalKeydownCallbacks.set(targetElement, (e) => {
            try {
                if (isEditing) {
                    if (e.key === "Delete" && (e.shiftKey || e.ctrlKey || e.altKey)) {
                        e.preventDefault()
                        e.stopPropagation()
                        click(removeTextBtn)
                    }

                    if ((e.ctrlKey || e.metaKey) && e.key === "z") {
                        undoLastAction()
                    }

                    if ((e.ctrlKey || e.metaKey) && e.key === "x") {
                        click(flipImageBtn)
                    }
                }

                if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                    requestAnimationFrame(() => {
                        startCaretBlinking()
                        redrawCanvas(true)
                    })
                }
            } catch (error) {
                console.error(error)
            }
        })

        hiddenInput.addEventListener("focus", () => {
            saveUndoState()
            startCaretBlinking()
        })

        hiddenInput.addEventListener("blur", () => {
            stopCaretBlinking()
        })

        addFontSize.addEventListener("input", () => {
            saveUndoState()
            addFontSizeValue.innerHTML = addFontSize.value + "px"
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].font = `${addFontSize.value}px ${addFontSelect.value}`
                toriiData.textObjects[activeText].lineWidth = addStrokeSize.value
                redrawCanvas(true)
            }
        })

        addFontSelect.addEventListener("change", () => {
            saveUndoState()
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].font = `${addFontSize.value}px ${addFontSelect.value}`
                redrawCanvas(true)
            }
        })

        addTextColor.addEventListener("input", () => {
            saveUndoState()
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].fillColor = addTextColor.value
                redrawCanvas(true)
            }
        })

        addStrokeSize.addEventListener("input", () => {
            saveUndoState()
            addStrokeSizeValue.innerHTML = addStrokeSize.value + "px"
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].font = `${addFontSize.value}px ${addFontSelect.value}`
                toriiData.textObjects[activeText].lineWidth = addStrokeSize.value
                redrawCanvas(true)
            }
        })

        addStrokeColor.addEventListener("input", () => {
            saveUndoState()
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].strokeColor = addStrokeColor.value
                redrawCanvas(true)
            }
        })

        addFontBackground.addEventListener("change", () => {
            saveUndoState()
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].addFontBackground = addFontBackground.checked
                redrawCanvas(true)
            }
        })

        addFontBorder.addEventListener("change", () => {
            saveUndoState()
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].addFontBorder = addFontBorder.checked
                redrawCanvas(true)
            }
        })

        addBackgroundColor.addEventListener("input", () => {
            saveUndoState()
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].addBackgroundColor = addBackgroundColor.value
                redrawCanvas(true)
            }
        })

        addBorderRadius.addEventListener("input", () => {
            saveUndoState()
            addBorderRadiusValue.innerText = `${addBorderRadius.value}px`
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].borderRadius = addBorderRadius.value
                redrawCanvas(true)
            }
        })

        addBorderPadding.addEventListener("input", () => {
            saveUndoState()
            addBorderPaddingValue.innerText = `${addBorderPadding.value}px`
            applyTextSettings()
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].borderPadding = addBorderPadding.value
                redrawCanvas(true)
            }
        })

        removeTextBtn.addEventListener("pointerup", () => {
            if (activeText !== null && activeText < toriiData.textObjects.length) {
                saveUndoState()
                toriiData.textObjects.splice(activeText, 1)

                if (toriiData.textObjects.length === 0) {
                    redrawCanvas(true)
                    activeText = null
                    disable(removeTextBtn, copyTextBtn)
                } else {
                    activeText = Math.min(activeText, toriiData.textObjects.length - 1)
                    redrawCanvas(true)
                }
            }
        })

        flipImageBtn.addEventListener("pointerup", () => {
            flipped = !flipped
            redrawCanvas(true)

            if (flipped) {
                hide(settings, removeTextBtn, copyTextBtn, undoEditBtn, acceptEditBtn, cancelEditBtn)
                hideCursor()
            } else {
                unhide(settings, removeTextBtn, copyTextBtn, undoEditBtn, acceptEditBtn, cancelEditBtn)
            }
        })

        copyTextBtn.addEventListener("pointerup", () => {
            let originalTexts = "Original texts:\n"
            let translatedTexts = "Translated texts:\n"

            let idx = 1

            toriiData.textObjects.forEach((textObject) => {
                originalTexts += `${idx}. "${textObject.originalText || ""}"\n`
                translatedTexts += `${idx}. "${textObject.text.replace(/\n/g, " ")}"\n`
                idx++
            })

            const text = originalTexts + "\n\n" + translatedTexts
            const blob = new Blob([text], { type: "text/plain" })

            const tempLink = document.createElement("a")
            tempLink.href = URL.createObjectURL(blob)
            tempLink.download = "torii_texts_" + toriiData.originalURL.substring(toriiData.originalURL.lastIndexOf("/") + 1).split("?")[0].split(".")[0] + ".txt"
            tempLink.click()
            tempLink.remove()
        })

        addAlignLeft.addEventListener("pointerup", () => {
            saveUndoState()
            textAlignment = "left"
            applyTextSettings()

            addAlignLeft.classList.add("bg-blue-200")
            addAlignCenter.classList.remove("bg-blue-200")
            addAlignRight.classList.remove("bg-blue-200")

            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].textAlign = textAlignment
                redrawCanvas(true)
            }
        })

        addAlignCenter.addEventListener("pointerup", () => {
            saveUndoState()
            textAlignment = "center"
            applyTextSettings()

            addAlignLeft.classList.remove("bg-blue-200")
            addAlignCenter.classList.add("bg-blue-200")
            addAlignRight.classList.remove("bg-blue-200")

            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].textAlign = textAlignment
                redrawCanvas(true)
            }
        })

        addAlignRight.addEventListener("pointerup", () => {
            saveUndoState()
            textAlignment = "right"
            applyTextSettings()

            addAlignLeft.classList.remove("bg-blue-200")
            addAlignCenter.classList.remove("bg-blue-200")
            addAlignRight.classList.add("bg-blue-200")

            if (activeText !== null && activeText < toriiData.textObjects.length) {
                toriiData.textObjects[activeText].textAlign = textAlignment
                redrawCanvas(true)
            }
        })

        function undoLastAction() {
            if (undoStack.length === 0) {
                return
            }

            const lastState = undoStack.pop()

            hiddenContext.putImageData(lastState.imageData, 0, 0)

            toriiData.textObjects = structuredClone(lastState.textObjects)

            redrawCanvas(true, imageMode !== "paint" && imageMode !== "inpaint")

            if (undoStack.length === 0) {
                disable(undoEditBtn)
            }
        }

        undoEditBtn.addEventListener("click", undoLastAction)

        function saveUndoState() {
            const snapshot = {
                imageData: hiddenContext.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height),
                textObjects: structuredClone(toriiData.textObjects)
            }

            undoStack.push(snapshot)

            if (undoStack.length > MAX_UNDO_STATES) {
                undoStack.shift()
            }

            enable(undoEditBtn)
        }

        function prepareDrawMode() {
            workingCanvas.onpointerdown = startDrawing
            workingCanvas.onpointermove = draw
            workingCanvas.onpointerup = stopDrawing
            workingCanvas.ondrag = draw
            workingCanvas.onpointerleave = hideCursor
            workingCanvas.onpointerenter = showCursor

            workingCanvas.addEventListener("touchstart", handleTouchStart, { passive: true })
            workingCanvas.addEventListener("touchmove", handleTouchMove, { passive: false })
            workingCanvas.addEventListener("touchend", handleTouchEnd, { passive: true })
            workingCanvas.addEventListener("touchcancel", handleTouchEnd, { passive: true })

            workingCanvas.removeEventListener("touchstart", handleTextModeTouchStart)
            workingCanvas.removeEventListener("touchmove", handleTextModeTouchMove)
            workingCanvas.removeEventListener("touchend", handleTextModeTouchEnd)
            workingCanvas.removeEventListener("touchcancel", handleTextModeTouchEnd)

            canvasCursor.style.display = "block"
            workingCanvas.style.cursor = "crosshair"

            redrawCanvas(true, imageMode !== "paint" && imageMode !== "inpaint")
        }

        function prepareAddMode() {
            workingCanvas.onpointerdown = handleTextModePointerDown
            workingCanvas.onpointermove = handleTextModePointerMove
            workingCanvas.onpointerup = handleTextModePointerUp
            workingCanvas.ondrag = null
            workingCanvas.onpointerleave = null
            workingCanvas.onpointerenter = null

            workingCanvas.removeEventListener("touchstart", handleTouchStart)
            workingCanvas.removeEventListener("touchmove", handleTouchMove)
            workingCanvas.removeEventListener("touchend", handleTouchEnd)
            workingCanvas.removeEventListener("touchcancel", handleTouchEnd)

            workingCanvas.addEventListener("touchstart", handleTextModeTouchStart, { passive: true })
            workingCanvas.addEventListener("touchmove", handleTextModeTouchMove, { passive: false })
            workingCanvas.addEventListener("touchend", handleTextModeTouchEnd, { passive: true })
            workingCanvas.addEventListener("touchcancel", handleTextModeTouchEnd, { passive: true })

            canvasCursor.style.display = "none"
            workingCanvas.style.cursor = "text"
            hideCursor()

            if (toriiData.textObjects.length > 0) {
                if (activeText === null) activeText = 0

                enable(removeTextBtn, copyTextBtn)
                selectText(toriiData.textObjects[activeText])
            }

            redrawCanvas(true)
        }

        click(addModeBtn)
        setTimeout(() => {
            toggleSettings(true)
        }, 500)
    } catch (error) {
        isEditing = false
        sendError(error, "editImage")

        showError("Failed to edit image.", null, false)

        try {
            toriiDOM.getElementById("torii-edit-screen")?.remove?.()
            toriiDOM.getElementById("original-image")?.remove?.()
            toriiDOM.getElementById("inpainted-image")?.remove?.()
            document.body.getElementById("torii-hidden-input")?.remove?.()
        } catch (error) { }
    }
}

function downloadImages(targetElement) {
    if (toriiTargets.size === 1) {
        try {
            const a = document.createElement("a")
            const originalURL = toriiTargets.get(targetElement).originalURL
            getTargetUrl(targetElement).then((translatedUrl) => {
                let filename = `image.jpg`

                if (originalURL && !originalURL.startsWith("data") && !originalURL.startsWith("blob")) {
                    filename = originalURL.substring(originalURL.lastIndexOf("/") + 1).split("?")[0]
                    const filenameStrings = filename.split(".")
                    const ext = filenameStrings.length > 1 ? filenameStrings[filenameStrings.length - 1] : null

                    if (!filename && ext) {
                        filename = `image.${ext}`
                    } else if (!filename || !ext) {
                        filename = `image.jpg`
                    }
                } else if (originalURL && originalURL.startsWith("data")) {
                    const ext = originalURL.split(",")[0].split("/")[1].split(";")[0]
                    filename = `image.${ext}`
                }

                a.download = filename
                a.href = translatedUrl
                a.click()
                a.remove()
            }).catch((error) => {
                showError("Failed to download image.", targetElement)

                sendError(error, "downloadImages single")
            })
        } catch (error) {
            showError("Failed to download image.", targetElement)

            sendError(error, "downloadImages single")
        }
    } else {
        try {
            const jszip = new JSZip()

            let count = 1
            let filenames = []
            let promises = []
            for (const [toriiTarget, toriiData] of toriiTargets) {
                if (!toriiData.active) continue

                promises.push(getTargetUrl(toriiTarget).then((translatedUrl) => {
                    const originalURL = toriiData.originalURL
                    let filename = `image${count}.jpg`

                    if (originalURL && !originalURL.startsWith("data") && !originalURL.startsWith("blob")) {
                        filename = originalURL.substring(originalURL.lastIndexOf("/") + 1).split("?")[0]
                        const filenameStrings = filename.split(".")
                        const ext = filenameStrings.length > 1 ? filenameStrings[filenameStrings.length - 1] : null

                        if ((filenames.includes(filename) || !filename) && ext) {
                            filename = `image${count}.${ext}`
                        } else if (!filename || !ext) {
                            filename = `image${count}.jpg`
                        }
                    } else if (originalURL && originalURL.startsWith("data")) {
                        const ext = originalURL.split(",")[0].split("/")[1].split(";")[0]
                        filename = `image${count}.${ext}`
                    }

                    count += 1
                    filenames.push(filename)

                    jszip.file(filename, translatedUrl.split(",")[1], { base64: true })
                }).catch((error) => {
                    showError("Failed to download image.", targetElement)

                    sendError(error, "downloadImages")
                }))
            }

            Promise.all(promises).then(() => {
                jszip.generateAsync({ type: "blob" }).then((content) => {
                    const a = document.createElement("a")
                    a.download = "translated_images.zip"
                    a.href = URL.createObjectURL(content)
                    a.click()
                    a.remove()
                }).catch((error) => {
                    showError("Failed to download images.", targetElement)

                    sendError(error, "downloadImages")
                })
            }).catch((error) => {
                showError("Failed to download images.", targetElement)

                sendError(error, "downloadImages")
            })
        } catch (error) {
            showError("Failed to download images.", targetElement)

            sendError(error, "downloadImages")
        }
    }
}

async function toriiClick(targetElement) {
    try {
        const toriiData = toriiTargets.get(targetElement)

        if (toriiData) {
            const toriiIcon = toriiData.toriiIcon

            if (credits !== null) {
                if (toriiData.toriiState == "translated") {
                    if (targetElement.nodeName.toLowerCase() == "img") {
                        targetElement.src = toriiTargets.get(targetElement).originalURL
                        if (targetElement.srcset) {
                            targetElement.srcset = toriiTargets.get(targetElement).originalURL
                        }
                        hashElement(targetElement).then((hash) => {
                            toriiData.toriiHash = hash
                        })
                    } else if (targetElement.nodeName.toLowerCase() == "canvas") {
                        const newImg = document.createElement("img")
                        const context = targetElement.getContext("2d")

                        newImg.onload = () => {
                            context.drawImage(newImg, 0, 0, targetElement.width, targetElement.height)

                            hashElement(targetElement).then((hash) => {
                                toriiData.toriiHash = hash
                            })
                        }

                        newImg.src = toriiTargets.get(targetElement).originalURL
                    }

                    toriiData.toriiState = "original"
                    toriiData.toriiDownload.style.display = "none"
                    toriiData.toriiEdit.style.display = "none"

                    toriiIcon.classList.remove("torii-pulsing")
                    toriiIcon.classList.add("torii-scaling")
                } else if (toriiData.toriiState == "original" || toriiData.toriiState == "error") {
                    if (toriiData.toriiState == "error") {
                        clearError(targetElement)
                    }

                    removeExtraSources(targetElement)

                    toriiIcon.classList.add("torii-loading")
                    toriiIcon.classList.remove("torii-scaling")

                    let targetUrl = null

                    try {
                        targetUrl = await getTargetUrl(targetElement)
                    } catch (error) {
                        toriiIcon.classList.remove("torii-loading")
                        toriiIcon.classList.add("torii-scaling")

                        if (error == "Auto and screenshot are not supported at the same time.") {
                            turnOffAuto()
                            takeScreenshot = false

                            return
                        }

                        const fromScreenshot = error?.message?.includes?.("screenshot") || error?.includes?.("screenshot")

                        showError(fromScreenshot ? "Failed to take a screenshot." : "Failed to process image.", targetElement)

                        sendError(error?.message ? error : { message: error, stack: "none" }, "toriiClick from: " + window.location.href)

                        return
                    }

                    const actionType = toriiData.toriiState == "screenshoting" ? "screenshot_normal" : "normal_click"
                    toriiData.toriiState = "awaiting"
                    let arrayBuffer = null

                    try {
                        if (targetUrl) {
                            const response = await fetch(targetUrl, {
                                headers: {
                                    "Referer": window.location.href,
                                    "User-Agent": window.navigator.userAgent
                                }
                            })

                            if (response && response.ok) {
                                const responseBlob = await response.blob()
                                const buffer = await responseBlob.arrayBuffer()
                                arrayBuffer = Array.from(new Uint8Array(buffer))
                            }
                        }
                    } catch (error) {
                        arrayBuffer = null
                    }

                    executePromise(() => translateImage(targetUrl, targetElement, actionType, arrayBuffer))
                } else if (toriiData.toriiState == "translating" || toriiData.toriiState == "awaiting" || toriiData.toriiState == "screenshoting") {
                    showError("Translation in progress. Timeout is 100 seconds.", targetElement, false)
                }
            } else {
                showError("Please log in with the extension from the popup. Go to your browser's extension menu.", targetElement)
            }
        }
    } catch (error) {
        showError("Failed to process image.", targetElement)

        sendError(error, "toriiClick from: " + window.location.href)
    }
}
async function contextMenuClick(targetElement) {
    try {
        if (targetElement.classList.contains("torii-translated") || targetElement.classList.contains("torii-translating")) {
            return
        }

        targetElement.classList.add("torii-translating")

        if (credits !== null) {
            if (!targetElement.isEqualNode(contextMenuTargetElement)) {
                contextMenuTargetElement = targetElement
                removeExtraSources(targetElement)
                const isScreenshot = takeScreenshot
                const actionType = isScreenshot ? "screenshot_menu" : "normal_menu"

                let targetUrl = null
                try {
                    targetUrl = await getTargetUrl(targetElement)
                } catch (error) {
                    showError(isScreenshot ? "Failed to take a screenshot." : "Failed to process image.", targetElement)

                    sendError(error?.message ? error : { message: error, stack: "none" }, "contextMenuClick from: " + window.location.href)

                    contextMenuTargetElement = null

                    return
                }

                let arrayBuffer = null

                try {
                    if (targetUrl) {
                        const response = await fetch(targetUrl, {
                            headers: {
                                "Referer": window.location.href,
                                "User-Agent": window.navigator.userAgent
                            }
                        })

                        if (response && response.ok) {
                            const responseBlob = await response.blob()
                            const buffer = await responseBlob.arrayBuffer()
                            arrayBuffer = Array.from(new Uint8Array(buffer))
                        }
                    }
                } catch (error) {
                    arrayBuffer = null
                }

                await contextMenuTranslateImage(targetUrl, targetElement, actionType, arrayBuffer)
            } else {
                showError("Translation in progress. Timeout is 100 seconds.", targetElement, false)
            }
        } else {
            showError("Please log in with the extension from the popup. Go to your browser's extension menu.", targetElement)
        }
    } catch (error) {
        showError("Failed to process image.", targetElement)

        sendError(error, "toriiClick from: " + window.location.href)
    }
}

async function executePromise(promise) {
    try {
        while (enabled && credits !== null && (credits > 0 || !auto) && !autoError) {
            if (executingPromises.size >= 5) {
                await Promise.race(executingPromises)
            } else {
                executingPromises.add(promise())
                break
            }
        }

        if (credits === 0 || autoError) {
            executingPromises.clear()

            for (const [targetElement, toriiData] of toriiTargets) {
                if (!toriiData.active) continue

                try {
                    if (toriiData.toriiState == "awaiting" || toriiData.toriiState == "screenshoting") {
                        toriiData.toriiState = "original"

                        toriiData.toriiIcon.classList.remove("torii-loading")
                        toriiData.toriiIcon.classList.add("torii-scaling")
                    }
                } catch (error) {
                    sendError(error, "executePromise zero credits from: " + window.location.href)
                }
            }
        }
    } catch (error) {
        sendError(error, "executePromise from: " + window.location.href)
    }
}

async function blobToImage(blob) {
    return new Promise((resolve, reject) => {
        if (!blob) {
            resolve(null)
            return
        }

        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
    })
}

function getTargetUrl(targetElement) {
    if (takeScreenshot && !auto) return screenshot(targetElement)
    if (takeScreenshot && auto) {
        return new Promise((resolve, reject) => {
            reject("Auto and screenshot are not supported at the same time.")
        })
    }

    return new Promise((resolve, reject) => {
        if (targetElement.nodeName.toLowerCase() == "img") {
            let url = targetElement.src

            if (url === null || url === "" || url === undefined) {
                url = targetElement.currentSrc
            }

            if (url.startsWith("blob:")) {
                const ImageFromBlob = getImageFromBlob(targetElement)

                if (ImageFromBlob) {
                    return resolve(ImageFromBlob)
                } else {
                    return reject("Failed to get image from blob.")
                }
            }

            if (url === null || url === "" || url === undefined) {
                const correctImage = getCorrectImage(targetElement)

                if (correctImage) {
                    return resolve(correctImage)
                } else {
                    return reject("Failed to get correct image.")
                }
            }

            return resolve(url)
        } else if (targetElement.nodeName.toLowerCase() == "canvas") {
            try {
                const dataURL = targetElement.toDataURL()

                return resolve(dataURL)
            } catch (error) {
                return reject("Failed to get canvas data URL.")
            }
        }

        return reject("Failed to get target URL.")
    })
}

function getImageFromBlob(targetElement) {
    try {
        const canvas = document.createElement("canvas")
        canvas.width = targetElement.naturalWidth
        canvas.height = targetElement.naturalHeight

        const ctx = canvas.getContext("2d")
        ctx.drawImage(targetElement, 0, 0, canvas.width, canvas.height)

        return canvas.toDataURL()
    } catch (error) {
        sendError(error, "getImageFromBlob from: " + window.location.href)

        return null
    }
}

function getCorrectImage(targetElement) {
    try {
        const elements = document.elementsFromPoint(cursorPos.x, cursorPos.y)

        for (const element of elements) {
            if (
                element.nodeName.toLowerCase() == "img" &&
                element.src &&
                element.clientWidth == targetElement.clientWidth &&
                element.clientHeight == targetElement.clientHeight &&
                !targetElement.isEqualNode(element)
            ) {
                return element.src
            }
        }
    } catch (error) {
        sendError(error, "getCorrectImage from: " + window.location.href)

        return null
    }
}

function translateImage(url, targetElement, actionType, buffer) {
    const translationPromise = new Promise((resolve, reject) => {
        try {
            const toriiData = toriiTargets.get(targetElement)

            if (toriiData) {
                const toriiIcon = toriiData.toriiIcon

                toriiData.toriiState = "translating"

                let targetUrl = url
                if (targetUrl.startsWith("data") && buffer) {
                    targetUrl = null
                }

                chrome.runtime.sendMessage({ type: "translate", url: targetUrl, site: window.location.href, actionType: actionType, buffer: buffer }).then((response) => {
                    if (response.success) {
                        toriiData.originalURL = url
                        toriiData.original = response.content.original
                        toriiData.inpainted = response.content.inpainted
                        toriiData.text = response.content.text
                        toriiData.inpaintedImage = null
                        toriiData.textObjects = null
                        toriiData.textObjectsTemp = null

                        if (targetElement.nodeName.toLowerCase() == "img") {
                            targetElement.src = response.content.translated
                            if (targetElement.srcset) {
                                targetElement.srcset = response.content.translated
                            }
                            hashElement(targetElement).then((hash) => {
                                toriiData.toriiHash = hash
                            })
                        } else if (targetElement.nodeName.toLowerCase() == "canvas") {
                            const newImg = document.createElement("img")
                            const context = targetElement.getContext("2d")

                            newImg.onload = () => {
                                context.drawImage(newImg, 0, 0, targetElement.width, targetElement.height)

                                hashElement(targetElement).then((hash) => {
                                    toriiData.toriiHash = hash
                                })
                            }

                            newImg.src = response.content.translated
                        }

                        targetElement.style.opacity = "1"

                        if (toriiData.toriiNotification.style.display == "flex") {
                            toriiData.toriiNotification.style.display = "none"
                        }

                        toriiData.toriiState = "translated"
                        toriiData.toriiDownload.style.display = "flex"
                        toriiData.toriiEdit.style.display = "flex"

                        toriiIcon.classList.add("torii-pulsing")
                    } else {
                        showError(response.content.error, targetElement)

                        toriiIcon.classList.add("torii-scaling")
                    }

                    toriiIcon.classList.remove("torii-loading")

                    executingPromises.delete(translationPromise)

                    resolve()
                }).catch((error) => {
                    showError("Failed to process image.", targetElement)

                    sendError(error, "translate from: " + window.location.href)

                    toriiIcon.classList.remove("torii-loading")

                    executingPromises.delete(translationPromise)

                    resolve()
                })
            }
        } catch (error) {
            showError("Failed to process image.", targetElement)

            sendError(error, "translateImage from: " + window.location.href)

            resolve()
        }
    })

    return translationPromise
}

function contextMenuTranslateImage(url, targetElement, actionType, buffer) {
    const translationPromise = new Promise((resolve, reject) => {
        try {
            const removeSpinner = addSpinnerToImage(targetElement)

            let targetUrl = url
            if (targetUrl.startsWith("data") && buffer) {
                targetUrl = null
            }

            chrome.runtime.sendMessage({ type: "translate", url: targetUrl, site: window.location.href, actionType: actionType, buffer: buffer }).then((response) => {
                toriiTargets.set(targetElement, {
                    active: false,
                    originalURL: url,
                    inpainted: response.content.inpainted,
                    original: response.content.original,
                    text: response.content.text,
                    inpaintedImage: null,
                    textObjects: null,
                    textObjectsTemp: null
                })

                targetElement.classList.remove("torii-translating")
                if (response.success) {
                    targetElement.classList.add("torii-translated")

                    if (targetElement.nodeName.toLowerCase() == "img") {
                        targetElement.src = response.content.translated
                        if (targetElement.srcset) {
                            targetElement.srcset = response.content.translated
                        }
                        hashElement(targetElement).then((hash) => {
                            toriiData.toriiHash = hash
                        })
                    } else if (targetElement.nodeName.toLowerCase() == "canvas") {
                        const newImg = document.createElement("img")
                        const context = targetElement.getContext("2d")

                        newImg.onload = () => {
                            context.drawImage(newImg, 0, 0, targetElement.width, targetElement.height)

                            hashElement(targetElement).then((hash) => {
                                toriiData.toriiHash = hash
                            })
                        }

                        newImg.src = response.content.translated
                    }

                    targetElement.style.opacity = "1"
                } else {
                    showError(response.content.error, targetElement)
                }

                executingPromises.delete(translationPromise)

                contextMenuTargetElement = null

                removeSpinner()

                resolve()
            }).catch((error) => {
                showError("Failed to process image.", targetElement)

                sendError(error, "contextMenu translate from: " + window.location.href)

                executingPromises.delete(translationPromise)

                contextMenuTargetElement = null

                removeSpinner()

                resolve()
            })
        } catch (error) {
            showError("Failed to process image.", targetElement)

            sendError(error, "contextMenuTranslateImage from: " + window.location.href)

            executingPromises.delete(translationPromise)

            contextMenuTargetElement = null

            removeSpinner()

            resolve()
        }
    })

    return translationPromise
}

function addSpinnerToImage(imgElement) {
    const parentStyle = getComputedStyle(imgElement.parentNode)
    if (parentStyle.position === "static") {
        imgElement.parentNode.style.position = "relative"
    }

    const rect = imgElement.getBoundingClientRect()
    const parentRect = imgElement.parentNode.getBoundingClientRect()

    const toriiOverlay = document.createElement("div")
    toriiOverlay.style.top = `${rect.top - parentRect.top}px`
    toriiOverlay.style.left = `${rect.left - parentRect.left}px`
    toriiOverlay.style.width = `${rect.width}px`
    toriiOverlay.style.height = `${rect.height}px`
    toriiOverlay.style.position = "absolute"
    toriiOverlay.style.display = "flex"
    toriiOverlay.style.justifyContent = "center"
    toriiOverlay.style.alignItems = "center"
    toriiOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)"
    toriiOverlay.style.zIndex = "9999"

    const toriiSpinnerIcon = document.createElement("img")
    toriiSpinnerIcon.src = chrome.runtime.getURL("images/torii.png")
    toriiSpinnerIcon.style.width = "60px"
    toriiSpinnerIcon.style.height = "60px"

    toriiSpinnerIcon.animate(
        [
            { transform: "rotate(0deg)" },
            { transform: "rotate(-360deg)" }
        ],
        {
            duration: 1000,
            easing: "ease-in-out",
            iterations: Infinity
        }
    )

    toriiOverlay.appendChild(toriiSpinnerIcon)
    imgElement.parentNode.appendChild(toriiOverlay)

    function updateOverlay() {
        const newRect = imgElement.getBoundingClientRect()
        const newParentRect = imgElement.parentNode.getBoundingClientRect()
        toriiOverlay.style.top = `${newRect.top - newParentRect.top}px`
        toriiOverlay.style.left = `${newRect.left - newParentRect.left}px`
        toriiOverlay.style.width = `${newRect.width}px`
        toriiOverlay.style.height = `${newRect.height}px`
    }

    const resizeObserver = new ResizeObserver(updateOverlay)
    resizeObserver.observe(imgElement)

    return function removeSpinner() {
        resizeObserver.disconnect()
        toriiOverlay.remove()
    }
}

// Some img elements are a part of a bigger picture element
// with many source elements as backup. Remove them to use only the current one.
function removeExtraSources(targetElement) {
    try {
        if (targetElement.parentNode && targetElement.parentNode.nodeName.toLowerCase() == "picture") {
            const sources = targetElement.parentNode.getElementsByTagName("source")

            for (let i = 0; i < sources.length; i++) {
                targetElement.parentNode.removeChild(sources[i])
            }
        }
    } catch (error) {
        sendError(error, "removeExtraSources from: " + window.location.href)
    }
}

function removeToriiFromTarget(targetElement, force = false) {
    const toriiData = toriiTargets.get(targetElement)

    if (toriiData) {
        const torii = toriiData.torii
        const toriiObserver = toriiData.toriiObserver
        const toriiState = toriiData.toriiState

        if (toriiState == "original" || force) {
            torii?.remove?.()

            toriiObserver?.unobserve?.()

            toriiTargets.delete(targetElement)
        }
    }
}

function turnOffAuto() {
    auto = false

    for (const [targetElement, toriiData] of toriiTargets) {
        if (!toriiData.active) continue

        try {
            const targetToriiAutoIcon = toriiData.toriiAutoIcon

            targetToriiAutoIcon.classList.remove("torii-rotating")
        } catch (error) {
            sendError(error, "show error remove auto")
        }
    }
}

function showError(errorMsg, targetElement, shouldChangeState = true) {
    try {
        if (errorMsg.includes("Failed to process image.")) {

            if (hasContextMenu) {
                errorMsg = "Failed to process image. Press <span style='background-color: gray; color: white; border-radius: 5px; padding: 2px 5px'>Alt + Shift + D</span> or right-click on the image and use Screenshot or Screen Crop. You can also download it and translate it locally&nbsp<a style='background-color: #EF9E82; text-shadow: 0 1.5px 1.5px rgba(0, 0, 0, .25); color: white; border-radius: 5px; text-decoration: none; padding: 3px 6px' href='https://toriitranslate.com/translate' target='_blank'>here</a>"
            } else {
                errorMsg = "Failed to process image. Use a different website or you can download it and translate it locally&nbsp<a style='background-color: #EF9E82; text-shadow: 0 1.5px 1.5px rgba(0, 0, 0, .25); color: white; border-radius: 5px; text-decoration: none; padding: 3px 6px' href='https://toriitranslate.com/translate' target='_blank'>here</a>"
            }
        } else if (errorMsg.includes("Out of credits.")) {
            errorMsg = "Out of credits. Upgrade&nbsp<a style='background-color: #EF9E82; text-shadow: 0 1.5px 1.5px rgba(0, 0, 0, .25); color: white; border-radius: 5px; text-decoration: none; padding: 3px 6px' href='https://toriitranslate.com/pricing' target='_blank'>here</a>"
        } else if (errorMsg.includes("Failed to take a screenshot.")) {
            errorMsg = "Failed to take a screenshot. Use a different website or you can download it and translate it locally&nbsp<a style='background-color: #EF9E82; text-shadow: 0 1.5px 1.5px rgba(0, 0, 0, .25); color: white; border-radius: 5px; text-decoration: none; padding: 3px 6px' href='https://toriitranslate.com/translate' target='_blank'>here</a>"
        }

        if (auto) {
            autoError = true

            turnOffAuto()
        }

        const errorMsgElement = document.createElement("p")
        errorMsgElement.innerHTML = errorMsg

        const toriiData = toriiTargets.get(targetElement)

        if (toriiData) {
            const toriiNotification = toriiData.toriiNotification

            if (toriiNotification.hasChildNodes()) {
                const pElements = toriiNotification.getElementsByTagName("p")
                for (const pElement of pElements) {
                    pElement.remove()
                }
            }

            toriiNotification.appendChild(errorMsgElement)

            toriiNotification.style.display = "flex"
            toriiNotification.style.maxWidth = `${Math.max(targetElement.clientWidth, 300)}px`
            toriiNotification.style.maxHeight = "fit-content"
            toriiNotification.addEventListener("pointerup", () => {
                clearError(targetElement, shouldChangeState)
            })

            if (shouldChangeState) {
                toriiData.toriiState = "error"
                toriiData.toriiIcon.classList.remove("torii-loading")
            }
        } else {
            const toriiNotification = document.createElement("div")
            toriiNotification.classList.add("torii-notification")

            const toriiNotificationClose = document.createElement("div")
            toriiNotificationClose.classList.add("torii-notification-close")
            toriiNotificationClose.innerText = "✖"

            toriiNotification.appendChild(toriiNotificationClose)
            toriiNotification.appendChild(errorMsgElement)
            toriiNotification.style.display = "flex"
            toriiNotification.style.position = "absolute"
            toriiNotification.style.maxWidth = `${Math.max(targetElement?.clientWidth || 0, 300)}px`
            toriiNotification.style.maxHeight = "fit-content"
            toriiNotification.addEventListener("pointerup", (e) => {
                toriiNotification.remove()
            })

            if (targetElement) {
                const rect = targetElement.getBoundingClientRect()
                placeTorii(toriiNotification, rect, 200)
            } else {
                let left = contextMenuPos?.x || cursorPos?.x || 50
                let right = contextMenuPos?.y || cursorPos?.y || 50

                left += window.scrollX
                right += window.scrollY

                toriiNotification.style.left = `${left}px`
                toriiNotification.style.top = `${right}px`
            }

            toriiDOM.appendChild(toriiNotification)
        }
    } catch (error) {
        sendError(error, "showError from: " + window.location.href)
    }
}

function showGeneralError(message) {
    const existingNotification = document.getElementById("general-error-toast")
    if (existingNotification) {
        existingNotification.remove()
    }

    const errorNotification = document.createElement("div")
    errorNotification.id = "general-error-toast"

    errorNotification.classList.add(
        "fixed", "bottom-4", "right-4",
        "bg-red-500", "text-white", "px-4", "py-2", "rounded-lg", "shadow-lg",
        "transform", "translate-y-10", "opacity-0",
        "transition-transform", "transition-opacity", "duration-500", "ease-in-out",
        "z-[2147483647]"
    )

    errorNotification.innerText = message
    toriiDOM.appendChild(errorNotification)

    requestAnimationFrame(() => {
        errorNotification.classList.remove("translate-y-10", "opacity-0")
        errorNotification.classList.add("translate-y-0", "opacity-100")
    })

    setTimeout(() => {
        errorNotification.classList.add("translate-y-20", "opacity-0")

        setTimeout(() => {
            errorNotification.remove()
        }, 500)
    }, 5000)
}

function clearError(targetElement, shouldChangeState = true) {
    const toriiData = toriiTargets.get(targetElement)

    if (toriiData) {
        const toriiNotification = toriiData.toriiNotification
        const pElements = toriiNotification.getElementsByTagName("p")
        for (const pElement of pElements) {
            pElement.remove()
        }
        toriiNotification.style.display = "none"

        if (shouldChangeState) {
            toriiData.toriiState = "original"
        }
    }
}

async function hashElement(el) {
    if (el instanceof HTMLCanvasElement) {
        const ctx = el.getContext('2d');
        if (!ctx) return null;

        try {
            const imageData = ctx.getImageData(0, 0, el.width, el.height);
            const buffer = imageData.data.buffer;
            return await hashData(buffer);
        } catch (e) {
            console.warn('Could not access canvas data — possibly tainted:', e);
            return null;
        }

    } else if (el instanceof HTMLImageElement) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(el.src);
            return await hashData(data);
        } catch (e) {
            console.warn('Could not hash image src:', e);
            return null;
        }

    } else {
        console.warn('Unsupported element type:', el);
        return null;
    }
}

async function hashData(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function isMobile() {
    const userAgentDataMobile = navigator?.userAgentData?.mobile

    if (userAgentDataMobile === undefined) {
        return navigator.userAgent.toLowerCase().includes("mobile")
    }

    return userAgentDataMobile
}

function isRTL(text) {
    const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u08A0-\u08FF\u07C0-\u07FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return rtlRegex.test(text);
}

function throttle(func, limit) {
    let inThrottle
    return (...args) => {
        if (!inThrottle) {
            func(...args)
            inThrottle = setTimeout(() => inThrottle = false, limit)
        }
    }
}

function disable(...btns) {
    for (const btn of btns) {
        btn.classList.add("pointer-events-none")
        btn.classList.add("!bg-neutral-200")
    }
}

function enable(...btns) {
    for (const btn of btns) {
        btn.classList.remove("pointer-events-none")
        btn.classList.remove("!bg-neutral-200")
    }
}

function hide(...elements) {
    for (const element of elements) {
        element.classList.add("!hidden")
        element.classList.add("hidden")
    }
}

function unhide(...elements) {
    for (const element of elements) {
        element.classList.remove("!hidden")
        element.classList.remove("hidden")
    }
}

function click(el) {
    const options = {
        bubbles: true,
        cancelable: true
    }

    const pointerUp = new PointerEvent("pointerup", options);
    el.dispatchEvent(pointerUp);
}


// OBERVATION FUNCTIONALITY

let rafId = null
let observedNodes = new Map()
let props = ["left", "top", "height"]
let rectChanged = (a, b) => props.some((prop) => a[prop] !== b[prop])

function runObserver() {
    const changedStates = []
    observedNodes.forEach((state, node) => {
        let newRect = node.getBoundingClientRect()
        if (rectChanged(newRect, state.rect)) {
            state.rect = newRect
            changedStates.push(state)
        }
    })

    changedStates.forEach((state) => {
        state.callbacks.forEach((cb) => cb(state.rect))
    })

    rafId = window.requestAnimationFrame(runObserver)
}

function observeRect(node, cb) {
    return {
        observe() {
            let wasEmpty = observedNodes.size === 0
            if (observedNodes.has(node)) {
                observedNodes.get(node).callbacks.push(cb)
            } else {
                observedNodes.set(node, {
                    rect: node.getBoundingClientRect(),
                    hasRectChanged: false,
                    callbacks: [cb],
                })
            }
            if (wasEmpty) runObserver()
        },
        unobserve() {
            let state = observedNodes.get(node)
            if (state) {
                const index = state.callbacks.indexOf(cb)
                if (index >= 0) state.callbacks.splice(index, 1)
                if (!state.callbacks.length) observedNodes.delete(node)
                if (!observedNodes.size) cancelAnimationFrame(rafId)
            }
        },
    }
}
