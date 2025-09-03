class ImageTranslator {
    constructor() {
        this.isEnabled = false;
        this.processedImages = new WeakSet();
        this.overlayElements = new Map();
        this.settings = {
            autoTranslate: false,
            showOriginal: false,
            sourceLanguage: 'auto',
            targetLanguage: 'vi',
            visionApiKey: '', // Key for Google Cloud Vision API
        };
        this.loadSettings();
        this.setupEventListeners();
    }

    async loadSettings() {
        try {
            this.settings = await chrome.storage.sync.get({
                autoTranslate: false,
                showOriginal: false,
                sourceLanguage: 'auto',
                targetLanguage: 'vi',
                visionApiKey: ''
            });
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    setupEventListeners() {
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async response
        });

        // Observer for dynamically loaded images
        if (this.settings.autoTranslate) {
            this.startImageObserver();
        }

        // Handle click events on images for manual translation
        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG' && e.ctrlKey) {
                e.preventDefault();
                this.translateImage(e.target);
            }
        });

        // Handle hover events to show translation overlay
        document.addEventListener('mouseover', (e) => {
            if (e.target.tagName === 'IMG' && this.overlayElements.has(e.target)) {
                this.showOverlay(e.target);
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.tagName === 'IMG' && this.overlayElements.has(e.target)) {
                this.hideOverlay(e.target);
            }
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'toggleAutoTranslate':
                    this.toggleAutoTranslate(message.enabled);
                    sendResponse({ success: true });
                    break;

                case 'translateUploadedImage':
                    const result = await this.translateUploadedImage(
                        message.imageData,
                        message.sourceLanguage,
                        message.targetLanguage
                    );
                    sendResponse(result);
                    break;
                case 'settingsChanged':
                    this.settings = message.settings;
                    this.toggleAutoTranslate(this.settings.autoTranslate);
                    break;
                case 'ping':
                    sendResponse({ status: 'pong' });
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        }
    }

    toggleAutoTranslate(enabled) {
        this.isEnabled = enabled;
        if (enabled) {
            this.startImageObserver();
            this.scanExistingImages();
        } else {
            this.stopImageObserver();
            this.clearAllOverlays();
        }
    }

    startImageObserver() {
        this.imageObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const images = node.tagName === 'IMG' ? [node] : node.querySelectorAll('img');
                        images.forEach(img => this.processImageForTranslation(img));
                    }
                });
            });
        });

        this.imageObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    stopImageObserver() {
        if (this.imageObserver) {
            this.imageObserver.disconnect();
        }
    }

    scanExistingImages() {
        const images = document.querySelectorAll('img');
        images.forEach(img => this.processImageForTranslation(img));
    }

    async processImageForTranslation(img) {
        if (this.processedImages.has(img) || !this.isImageSuitableForTranslation(img)) {
            return;
        }

        this.processedImages.add(img);

        try {
            await this.translateImage(img);
        } catch (error) {
            console.error('Error processing image:', error);
        }
    }

    isImageSuitableForTranslation(img) {
        // Check if image is large enough and likely to contain text
        return img.width > 50 && img.height > 20 && img.complete;
    }

    async translateImage(img) {
        try {
            // Extract text from image using Google Cloud Vision
            const textData = await this.extractTextFromImage(img);

            if (textData.length === 0) {
                return; // No text found
            }

            // Translate the extracted text
            const translatedData = await this.translateTextData(textData);

            // Create overlay with translated text
            this.createTextOverlay(img, translatedData);

        } catch (error) {
            console.error('Error translating image:', error);
        }
    }

    async _extractTextWithVision(base64Image) {
        if (!this.settings.visionApiKey) {
            throw new Error('Google Cloud Vision API key is not set.');
        }

        const requestBody = {
            requests: [{
                image: {
                    content: base64Image,
                },
                features: [{
                    type: 'TEXT_DETECTION',
                }, ],
            }, ],
        };

        const response = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${this.settings.visionApiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
                `Google Cloud Vision API error: ${errorData.error?.message || response.statusText}`
            );
        }

        const data = await response.json();
        const annotations = data.responses[0]?.textAnnotations;
        if (!annotations || annotations.length <= 1) {
            return []; // No text found, or only full text block
        }
        // First annotation is the full text, subsequent are individual words/symbols.
        // We use words for better bounding boxes.
        return annotations.slice(1).map(item => {
            const vertices = item.boundingPoly.vertices;
            const xCoords = vertices.map(v => v.x || 0);
            const yCoords = vertices.map(v => v.y || 0);
            return {
                text: item.description,
                confidence: item.confidence || 0.9, // Vision API doesn't give word-level confidence
                bbox: {
                    x0: Math.min(...xCoords),
                    y0: Math.min(...yCoords),
                    x1: Math.max(...xCoords),
                    y1: Math.max(...yCoords),
                }
            };
        });
    }

    async extractTextFromImage(img) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        ctx.drawImage(img, 0, 0);
        // Get base64 representation, removing the data URL prefix
        const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
        return this._extractTextWithVision(base64Image);
    }

    async extractTextFromUploadedImage(imageData) {
        const base64Image = imageData.split(',')[1];
        return this._extractTextWithVision(base64Image);
    }

    async translateTextData(textData) {
        const textsToTranslate = textData.map(item => item.text);
        const translatedTexts = await this.translateTexts(
            textsToTranslate,
            this.settings.sourceLanguage,
            this.settings.targetLanguage
        );
        return textData.map((item, index) => ({
            ...item,
            translatedText: translatedTexts[index] || item.text
        }));
    }

    async translateTexts(texts, sourceLang, targetLang) {
        // Gửi yêu cầu dịch đến background.js
        const result = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'translateTextWithGemini',
                text: texts.join('\n'), // Gộp tất cả văn bản để gửi đi
                targetLanguage: targetLang
            }, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                if (response.error) {
                    return reject(new Error(response.error));
                }
                resolve(response.translatedText.split('\n')); // Chia văn bản đã dịch thành các dòng
            });
        });
        return result;
    }

    createTextOverlay(img, translatedData) {
        // Existing logic...
    }

    showOverlay(img) {
        // Existing logic...
    }

    hideOverlay(img) {
        // Existing logic...
    }

    clearAllOverlays() {
        // Existing logic...
    }

    // New handler for uploaded images from sidepanel
    async translateUploadedImage(imageData, sourceLanguage, targetLanguage) {
        const textData = await this.extractTextFromUploadedImage(imageData);

        if (textData.length === 0) {
            return []; // No text found
        }

        const translatedTexts = await this.translateTexts(
            textData.map(item => item.text),
            sourceLanguage,
            targetLanguage
        );

        return textData.map((item, index) => ({
            bbox: item.bbox,
            translatedText: translatedTexts[index] || item.text
        }));
    }

    // Helper functions for drawing overlays (already exist in your code)
    createTextOverlay(img, translatedData) {
        // ...
    }

    showOverlay(img) {
        // ...
    }

    hideOverlay(img) {
        // ...
    }

    clearAllOverlays() {
        // ...
    }

    createCanvasOverlay(img, translatedData) {
        // ...
    }

    drawText(ctx, text, bbox, isVertical) {
        // ...
    }

    drawVerticalText(ctx, text, bbox) {
        // ...
    }
}

// Initialize the image translator
const imageTranslator = new ImageTranslator();

// Handle page visibility changes to pause/resume processing
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Pause processing if page is not active
        imageTranslator.stopImageObserver();
    } else {
        // Resume processing when page becomes active again
        if (imageTranslator.settings.autoTranslate) {
            imageTranslator.startImageObserver();
            imageTranslator.scanExistingImages();
        }
    }
});