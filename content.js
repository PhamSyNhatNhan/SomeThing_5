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
        // Using Google Translate API (you'll need to set up your own API key)
        // For demo purposes, we'll use a mock translation
        return texts.map(text => this.mockTranslate(text, sourceLang, targetLang));
    }

    mockTranslate(text, sourceLang, targetLang) {
        // This is a mock translation - in real implementation, use Google Translate API
        const translations = {
            'Hello': 'Xin chào',
            '你好': 'Xin chào',
            'こんにちは': 'Xin chào',
            '안녕하세요': 'Xin chào'
        };

        return translations[text] || `[${targetLang}] ${text}`;
    }

    createTextOverlay(img, translatedData) {
        const overlay = document.createElement('div');
        overlay.className = 'image-translator-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '1000';
        overlay.style.display = 'none';

        // Create text elements for each translated text
        translatedData.forEach(item => {
            const textElement = document.createElement('div');
            textElement.className = 'translated-text';
            textElement.textContent = item.translatedText;

            // Calculate position and size based on bounding box
            const imgRect = img.getBoundingClientRect();
            const scaleX = imgRect.width / (img.naturalWidth || img.width);
            const scaleY = imgRect.height / (img.naturalHeight || img.height);

            textElement.style.position = 'absolute';
            textElement.style.left = (item.bbox.x0 * scaleX) + 'px';
            textElement.style.top = (item.bbox.y0 * scaleY) + 'px';
            textElement.style.width = ((item.bbox.x1 - item.bbox.x0) * scaleX) + 'px';
            textElement.style.height = ((item.bbox.y1 - item.bbox.y0) * scaleY) + 'px';

            // Style the text overlay
            textElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            textElement.style.color = 'white';
            textElement.style.fontSize = Math.max(12, (item.bbox.y1 - item.bbox.y0) * scaleY * 0.8) + 'px';
            textElement.style.padding = '2px';
            textElement.style.borderRadius = '2px';
            textElement.style.display = 'flex';
            textElement.style.alignItems = 'center';
            textElement.style.justifyContent = 'center';
            textElement.style.textAlign = 'center';
            textElement.style.wordWrap = 'break-word';
            textElement.style.overflow = 'hidden';

            // Handle vertical text (for Chinese/Japanese)
            if (this.isVerticalText(item)) {
                textElement.style.writingMode = 'vertical-rl';
                textElement.style.textOrientation = 'upright';
            }

            overlay.appendChild(textElement);
        });

        // Position overlay relative to image
        this.positionOverlay(img, overlay);
        this.overlayElements.set(img, overlay);

        document.body.appendChild(overlay);
    }

    isVerticalText(textItem) {
        const bbox = textItem.bbox;
        const width = bbox.x1 - bbox.x0;
        const height = bbox.y1 - bbox.y0;

        // Consider text vertical if height is significantly larger than width
        return height > width * 1.5;
    }

    positionOverlay(img, overlay) {
        const updatePosition = () => {
            const rect = img.getBoundingClientRect();
            overlay.style.left = rect.left + window.scrollX + 'px';
            overlay.style.top = rect.top + window.scrollY + 'px';
            overlay.style.width = rect.width + 'px';
            overlay.style.height = rect.height + 'px';
        };

        updatePosition();

        // Update position on scroll/resize
        const updateHandler = () => updatePosition();
        window.addEventListener('scroll', updateHandler);
        window.addEventListener('resize', updateHandler);

        // Store cleanup function
        overlay._cleanup = () => {
            window.removeEventListener('scroll', updateHandler);
            window.removeEventListener('resize', updateHandler);
        };
    }

    showOverlay(img) {
        const overlay = this.overlayElements.get(img);
        if (overlay) {
            overlay.style.display = 'block';
        }
    }

    hideOverlay(img) {
        const overlay = this.overlayElements.get(img);
        if (overlay && !this.settings.showOriginal) {
            overlay.style.display = 'none';
        }
    }

    clearAllOverlays() {
        this.overlayElements.forEach((overlay, img) => {
            if (overlay._cleanup) {
                overlay._cleanup();
            }
            overlay.remove();
        });
        this.overlayElements.clear();
        this.processedImages = new WeakSet();
    }

    async translateUploadedImage(imageData, sourceLanguage, targetLanguage) {
        try {
            // Check if using Gemini for direct image processing
            const settings = await chrome.storage.sync.get(['translationService', 'apiKey']);

            if (settings.translationService === 'gemini' && settings.apiKey) {
                return await this.translateImageWithGemini(imageData, sourceLanguage, targetLanguage, settings.apiKey);
            } else {
                return await this.translateImageWithOCR(imageData, sourceLanguage, targetLanguage);
            }

        } catch (error) {
            console.error('Error translating uploaded image:', error);
            return { success: false, error: error.message };
        }
    }

    async translateImageWithGemini(imageData, sourceLanguage, targetLanguage, apiKey) {
        try {
            // Use Gemini's direct image analysis capability
            const response = await chrome.runtime.sendMessage({
                action: 'translateImageDirectly',
                imageData: imageData,
                sourceLang: sourceLanguage,
                targetLang: targetLanguage,
                apiKey: apiKey
            });

            if (!response.success) {
                throw new Error(response.error);
            }

            const geminiResult = response.result;

            if (!geminiResult.texts || geminiResult.texts.length === 0) {
                return { success: false, error: 'No text found in image' };
            }

            // Create image element from data URL
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageData;
            });

            // Convert Gemini results to format compatible with existing overlay system
            const translatedData = geminiResult.texts.map((textInfo, index) => ({
                text: textInfo.original,
                translatedText: textInfo.translated,
                confidence: textInfo.confidence === 'high' ? 90 : textInfo.confidence === 'medium' ? 70 : 50,
                bbox: {
                    // Since Gemini doesn't provide exact coordinates, we'll estimate positions
                    x0: (index * 100) % (img.width - 100),
                    y0: Math.floor(index / 5) * 50,
                    x1: ((index * 100) % (img.width - 100)) + 100,
                    y1: (Math.floor(index / 5) * 50) + 30
                },
                baseline: { x0: 0, x1: 100, y0: 25, y1: 25 },
                isVertical: textInfo.orientation === 'vertical'
            }));

            // Create translated image with overlays
            const translatedImageData = await this.createTranslatedImageFromGemini(img, translatedData);

            return {
                success: true,
                translatedImageData: translatedImageData,
                originalTextCount: translatedData.length,
                method: 'gemini-direct'
            };

        } catch (error) {
            console.error('Gemini translation error:', error);
            // Fallback to OCR method
            return await this.translateImageWithOCR(imageData, sourceLanguage, targetLanguage);
        }
    }

    async translateImageWithOCR(imageData, sourceLanguage, targetLanguage) {
        try {
            // Create image element from data URL
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageData;
            });

            // Extract text from uploaded image using Cloud Vision
            const textData = await this.extractTextFromUploadedImage(imageData);

            if (textData.length === 0) {
                return { success: false, error: 'No text found in image' };
            }

            // Translate extracted text
            const translatedData = await this.translateTextData(textData.map(item => ({
                ...item,
                text: item.text
            })));

            // Create new image with translated text overlay
            const translatedImageData = await this.createTranslatedImage(img, translatedData);

            return {
                success: true,
                translatedImageData: translatedImageData,
                originalTextCount: textData.length,
                method: 'ocr-vision'
            };

        } catch (error) {
            console.error('OCR translation error:', error);
            return { success: false, error: error.message };
        }
    }

    async createTranslatedImageFromGemini(originalImg, translatedData) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = originalImg.naturalWidth || originalImg.width;
        canvas.height = originalImg.naturalHeight || originalImg.height;

        // Draw original image
        ctx.drawImage(originalImg, 0, 0);

        // Draw text overlays in a grid pattern since we don't have exact coordinates
        const gridCols = Math.ceil(Math.sqrt(translatedData.length));
        const gridRows = Math.ceil(translatedData.length / gridCols);
        const cellWidth = canvas.width / gridCols;
        const cellHeight = canvas.height / gridRows;

        translatedData.forEach((item, index) => {
            const row = Math.floor(index / gridCols);
            const col = index % gridCols;

            const x = col * cellWidth + 10;
            const y = row * cellHeight + 30;

            // Create a background box for better readability
            const textWidth = ctx.measureText(item.translatedText).width;
            const boxHeight = 25;
            const boxWidth = Math.min(textWidth + 20, cellWidth - 20);

            // Draw background box
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(x - 10, y - 20, boxWidth, boxHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 10, y - 20, boxWidth, boxHeight);

            // Set font and draw text
            ctx.font = '14px Arial, sans-serif';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';

            // Handle vertical text
            if (item.isVertical) {
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(-Math.PI / 2);
                ctx.fillText(item.translatedText, -textWidth/2, 0);
                ctx.restore();
            } else {
                // Word wrap for long text
                const words = item.translatedText.split(' ');
                const maxWidth = boxWidth - 10;
                let line = '';
                let lineY = y - 5;

                for (const word of words) {
                    const testLine = line + word + ' ';
                    const metrics = ctx.measureText(testLine);

                    if (metrics.width > maxWidth && line !== '') {
                        ctx.fillText(line, x - 5, lineY);
                        line = word + ' ';
                        lineY += 16;
                    } else {
                        line = testLine;
                    }
                }
                ctx.fillText(line, x - 5, lineY);
            }

            // Add confidence indicator
            const confidenceColor = item.confidence > 80 ? '#4CAF50' :
                                   item.confidence > 60 ? '#FF9800' : '#F44336';
            ctx.fillStyle = confidenceColor;
            ctx.beginPath();
            ctx.arc(x + boxWidth - 15, y - 15, 3, 0, 2 * Math.PI);
            ctx.fill();
        });

        return canvas.toDataURL('image/png');
    }

    async createTranslatedImage(originalImg, translatedData) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = originalImg.naturalWidth || originalImg.width;
        canvas.height = originalImg.naturalHeight || originalImg.height;

        // Draw original image
        ctx.drawImage(originalImg, 0, 0);

        // Draw translated text overlays
        translatedData.forEach(item => {
            const bbox = item.bbox;

            // Clear original text area
            ctx.fillStyle = this.getBackgroundColor(ctx, bbox);
            ctx.fillRect(bbox.x0, bbox.y0, bbox.x1 - bbox.x0, bbox.y1 - bbox.y0);

            // Calculate font size based on bounding box
            const fontSize = Math.max(12, (bbox.y1 - bbox.y0) * 0.8);

            // Set font properties
            ctx.font = `${fontSize}px Arial, sans-serif`;
            ctx.fillStyle = this.getTextColor(ctx, bbox);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Handle text wrapping and vertical text
            if (this.isVerticalText(item)) {
                this.drawVerticalText(ctx, item.translatedText, bbox);
            } else {
                this.drawHorizontalText(ctx, item.translatedText, bbox);
            }
        });

        return canvas.toDataURL('image/png');
    }

    getBackgroundColor(ctx, bbox) {
        // Sample colors around the text area to determine background
        const imageData = ctx.getImageData(bbox.x0, bbox.y0, bbox.x1 - bbox.x0, bbox.y1 - bbox.y0);
        const pixels = imageData.data;

        let r = 0, g = 0, b = 0, count = 0;

        // Sample every 4th pixel for performance
        for (let i = 0; i < pixels.length; i += 16) {
            r += pixels[i];
            g += pixels[i + 1];
            b += pixels[i + 2];
            count++;
        }

        if (count === 0) return 'white';

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        return `rgb(${r}, ${g}, ${b})`;
    }

    getTextColor(ctx, bbox) {
        // Determine if background is light or dark to choose contrasting text color
        const imageData = ctx.getImageData(bbox.x0, bbox.y0, bbox.x1 - bbox.x0, bbox.y1 - bbox.y0);
        const pixels = imageData.data;

        let brightness = 0, count = 0;

        for (let i = 0; i < pixels.length; i += 16) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            brightness += (r * 0.299 + g * 0.587 + b * 0.114);
            count++;
        }

        if (count === 0) return 'black';

        brightness = brightness / count;
        return brightness > 128 ? 'black' : 'white';
    }

    drawHorizontalText(ctx, text, bbox) {
        const maxWidth = bbox.x1 - bbox.x0;
        const centerX = bbox.x0 + maxWidth / 2;
        const centerY = bbox.y0 + (bbox.y1 - bbox.y0) / 2;

        // Check if text fits in one line
        const metrics = ctx.measureText(text);

        if (metrics.width <= maxWidth) {
            ctx.fillText(text, centerX, centerY);
        } else {
            // Word wrap
            const words = text.split(' ');
            const lines = [];
            let currentLine = '';

            for (const word of words) {
                const testLine = currentLine ? currentLine + ' ' + word : word;
                const testMetrics = ctx.measureText(testLine);

                if (testMetrics.width > maxWidth && currentLine) {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine) {
                lines.push(currentLine);
            }

            // Draw lines
            const lineHeight = (bbox.y1 - bbox.y0) / lines.length;
            lines.forEach((line, index) => {
                const y = bbox.y0 + lineHeight * (index + 0.5);
                ctx.fillText(line, centerX, y);
            });
        }
    }

    drawVerticalText(ctx, text, bbox) {
        const centerX = bbox.x0 + (bbox.x1 - bbox.x0) / 2;
        const maxHeight = bbox.y1 - bbox.y0;
        const charHeight = maxHeight / text.length;

        // Draw each character vertically
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const y = bbox.y0 + charHeight * (i + 0.5);
            ctx.fillText(char, centerX, y);
        }
    }
}

// Initialize the image translator
const imageTranslator = new ImageTranslator();

// Handle page visibility changes to pause/resume processing
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        imageTranslator.stopImageObserver();
    } else if (imageTranslator.isEnabled) {
        imageTranslator.startImageObserver();
    }
});