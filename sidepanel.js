class SidePanelManager {
    constructor() {
        this.initializeElements();
        this.loadSettings();
        this.attachEventListeners();
        this.uploadedImage = null;
        this.setupPersistentState();
    }

    setupPersistentState() {
        // Side panel sẽ không bị đóng như popup
        // Lưu state khi có thay đổi
        window.addEventListener('beforeunload', () => {
            this.saveCurrentState();
        });

        // Khôi phục state khi load
        this.restoreState();
    }

    initializeElements() {
        this.geminiApiKey = document.getElementById('geminiApiKey');
        this.visionApiKey = document.getElementById('visionApiKey'); // Thêm Vision API Key
        this.apiStatus = document.getElementById('apiStatus'); // Trạng thái Gemini
        this.visionApiStatus = document.getElementById('visionApiStatus'); // Trạng thái Vision
        this.testApiBtn = document.getElementById('testApiBtn'); // Nút test Gemini
        this.testVisionApiBtn = document.getElementById('testVisionApiBtn'); // Nút test Vision
        this.apiSection = document.getElementById('apiSection');
        this.visionApiSection = document.getElementById('visionApiSection');
        this.autoTranslateToggle = document.getElementById('autoTranslate');
        this.showOriginalToggle = document.getElementById('showOriginal');
        this.sourceLanguageSelect = document.getElementById('sourceLanguage');
        this.targetLanguageSelect = document.getElementById('targetLanguage');
        this.imageUpload = document.getElementById('imageUpload');
        this.previewContainer = document.getElementById('previewContainer');
        this.translateUploadBtn = document.getElementById('translateUploadBtn');
        this.status = document.getElementById('status');
    }

    async loadSettings() {
        try {
            const settings = await chrome.storage.sync.get({
                geminiApiKey: '',
                visionApiKey: '', // Thêm Vision API Key
                autoTranslate: false,
                showOriginal: false,
                sourceLanguage: 'auto',
                targetLanguage: 'vi'
            });

            this.geminiApiKey.value = settings.geminiApiKey;
            this.visionApiKey.value = settings.visionApiKey; // Tải Vision API Key
            this.autoTranslateToggle.checked = settings.autoTranslate;
            this.showOriginalToggle.checked = settings.showOriginal;
            this.sourceLanguageSelect.value = settings.sourceLanguage;
            this.targetLanguageSelect.value = settings.targetLanguage;

            this.validateApiKeys();
        } catch (error) {
            this.showStatus('Lỗi tải cấu hình: ' + error.message, 'error');
        }
    }

    attachEventListeners() {
        // API Key validation for Gemini
        this.geminiApiKey.addEventListener('input', () => {
            this.validateApiKeys();
            this.saveSettings();
        });

        // API Key validation for Vision
        this.visionApiKey.addEventListener('input', () => {
            this.validateApiKeys();
            this.saveSettings();
        });

        // Test API button for Gemini
        this.testApiBtn.addEventListener('click', () => {
            this.testApiKey();
        });

        // Test API button for Vision
        this.testVisionApiBtn.addEventListener('click', () => {
            this.testVisionApiKey();
        });

        // Settings changes
        this.autoTranslateToggle.addEventListener('change', () => {
            this.saveSettings();
            this.toggleAutoTranslate();
        });

        this.showOriginalToggle.addEventListener('change', () => {
            this.saveSettings();
        });

        this.sourceLanguageSelect.addEventListener('change', () => {
            this.saveSettings();
        });

        this.targetLanguageSelect.addEventListener('change', () => {
            this.saveSettings();
        });

        // Image upload
        this.imageUpload.addEventListener('change', (e) => {
            this.handleImageUpload(e.target.files[0]);
        });
        this.translateUploadBtn.addEventListener('click', () => {
            this.translateUploadedImage();
        });

        // Drag and drop
        const uploadArea = document.querySelector('.upload-area');
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!uploadArea.contains(e.relatedTarget)) {
                uploadArea.classList.remove('dragover');
            }
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.handleImageUpload(file);
            } else {
                this.showStatus('Vui lòng chọn file ảnh hợp lệ', 'error');
            }
        });

        // Keyboard shortcuts cho side panel
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.autoTranslateToggle.click();
            }
            if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                this.imageUpload.click();
            }
        });
    }

    // Add this to your class
    async translateUploadedImage() {
        if (!this.uploadedImage) {
            this.showStatus('Vui lòng chọn một file ảnh.', 'error');
            return;
        }

        this.showStatus('Đang phân tích và dịch ảnh...', 'info');
        this.translateUploadBtn.disabled = true;

        try {
            const imageDataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(this.uploadedImage);
            });

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                this.showStatus('Không thể tìm thấy tab đang hoạt động để gửi yêu cầu.', 'error');
                return;
            }

            const translatedData = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'translateUploadedImage',
                    imageData: imageDataUrl,
                    sourceLanguage: this.sourceLanguageSelect.value,
                    targetLanguage: this.targetLanguageSelect.value
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    if (response.error) {
                        return reject(new Error(response.error));
                    }
                    resolve(response);
                });
            });

            if (translatedData.length > 0) {
                this.showStatus('Dịch thành công!', 'success');
                this.showTranslatedImage(imageDataUrl, translatedData);
            } else {
                this.showStatus('Không tìm thấy văn bản trong ảnh.', 'info');
                this.showOriginalImage(imageDataUrl);
            }

        } catch (error) {
            this.showStatus('Lỗi khi dịch ảnh: ' + error.message, 'error');
        } finally {
            this.translateUploadBtn.disabled = false;
        }
    }

    // Add this to your class
    showTranslatedImage(imageDataUrl, translatedData) {
        this.previewContainer.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'translated-image-wrapper';
        wrapper.style.position = 'relative';

        const img = new Image();
        img.src = imageDataUrl;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        wrapper.appendChild(img);
        this.previewContainer.appendChild(wrapper);

        // Chờ ảnh load để tính toán tỷ lệ
        img.onload = () => {
            const naturalWidth = img.naturalWidth;
            const naturalHeight = img.naturalHeight;
            const displayWidth = img.offsetWidth;
            const displayHeight = img.offsetHeight;

            const scaleX = displayWidth / naturalWidth;
            const scaleY = displayHeight / naturalHeight;

            translatedData.forEach(item => {
                const bbox = item.bbox;
                const translatedText = item.translatedText;

                const overlayText = document.createElement('div');
                overlayText.className = 'translated-text-overlay';
                overlayText.style.position = 'absolute';
                overlayText.style.left = `${bbox.x0 * scaleX}px`;
                overlayText.style.top = `${bbox.y0 * scaleY}px`;
                overlayText.style.width = `${(bbox.x1 - bbox.x0) * scaleX}px`;
                overlayText.style.height = `${(bbox.y1 - bbox.y0) * scaleY}px`;
                overlayText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                overlayText.style.color = 'white';
                overlayText.style.fontSize = '12px';
                overlayText.style.padding = '2px';
                overlayText.style.textAlign = 'center';
                overlayText.style.display = 'flex';
                overlayText.style.alignItems = 'center';
                overlayText.style.justifyContent = 'center';
                overlayText.style.boxSizing = 'border-box';
                overlayText.textContent = translatedText;
                overlayText.style.wordWrap = 'break-word';
                overlayText.style.overflow = 'hidden';

                wrapper.appendChild(overlayText);
            });
        };
    }

    // Existing functions (handleImageUpload, validateApiKeys, etc.)
    handleImageUpload(file) {
        this.uploadedImage = file;
        this.translateUploadBtn.disabled = false;
        this.showStatus(`Đã chọn ảnh: ${file.name}`, 'info');

        const reader = new FileReader();
        reader.onload = (e) => {
            this.previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100%; height: auto; display: block;">`;
        };
        reader.readAsDataURL(file);
    }

    showOriginalImage(imageDataUrl) {
        this.previewContainer.innerHTML = `<img src="${imageDataUrl}" alt="Original Image" style="max-width: 100%; height: auto; display: block;">`;
    }

    showStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
        this.status.style.display = 'block';

        if (type !== 'info') {
            setTimeout(() => {
                if (this.status.style.display !== 'none') {
                    this.status.style.display = 'none';
                }
            }, 5000);
        }
    }

    async testApiKey() {
        const apiKey = this.geminiApiKey.value.trim();
        if (!apiKey) {
            this.apiStatus.textContent = 'Vui lòng nhập API Key';
            this.apiStatus.className = 'api-status invalid';
            return;
        }
        this.apiStatus.textContent = 'Đang kiểm tra...';
        this.apiStatus.className = 'api-status testing';

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'testGeminiApiKey',
                apiKey: apiKey
            });
            if (response.isValid) {
                this.apiStatus.textContent = 'Gemini API Key hợp lệ!';
                this.apiStatus.className = 'api-status valid';
            } else {
                this.apiStatus.textContent = 'Gemini API Key không hợp lệ.';
                this.apiStatus.className = 'api-status invalid';
            }
        } catch (error) {
            this.apiStatus.textContent = `Lỗi: ${error.message}`;
            this.apiStatus.className = 'api-status invalid';
        }
    }

    async testVisionApiKey() {
        const apiKey = this.visionApiKey.value.trim();
        if (!apiKey) {
            this.visionApiStatus.textContent = 'Vui lòng nhập API Key';
            this.visionApiStatus.className = 'api-status invalid';
            return;
        }
        this.visionApiStatus.textContent = 'Đang kiểm tra...';
        this.visionApiStatus.className = 'api-status testing';
        try {
            // Test with a small dummy image
            const testImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
            const response = await fetch(
                `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', },
                    body: JSON.stringify({ requests: [{ image: { content: testImage }, features: [{ type: 'TEXT_DETECTION' }] }] }),
                }
            );
            if (response.ok) {
                this.visionApiStatus.textContent = 'Vision API Key hợp lệ!';
                this.visionApiStatus.className = 'api-status valid';
            } else {
                const errorData = await response.json();
                this.visionApiStatus.textContent = `Vision API Key không hợp lệ. Lỗi: ${errorData.error.message}`;
                this.visionApiStatus.className = 'api-status invalid';
            }
        } catch (error) {
            this.visionApiStatus.textContent = `Lỗi: ${error.message}`;
            this.visionApiStatus.className = 'api-status invalid';
        }
    }

    saveSettings() {
        const settings = {
            geminiApiKey: this.geminiApiKey.value.trim(),
            visionApiKey: this.visionApiKey.value.trim(),
            autoTranslate: this.autoTranslateToggle.checked,
            showOriginal: this.showOriginalToggle.checked,
            sourceLanguage: this.sourceLanguageSelect.value,
            targetLanguage: this.targetLanguageSelect.value
        };
        chrome.storage.sync.set(settings, () => {
            this.showStatus('Đã lưu cài đặt.', 'success');
            // Gửi message đến background để thông báo thay đổi settings
            chrome.runtime.sendMessage({
                action: 'saveSettings',
                settings: settings
            });
        });
    }

    toggleAutoTranslate() {
        const enabled = this.autoTranslateToggle.checked;
        chrome.runtime.sendMessage({ action: 'toggleAutoTranslate', enabled: enabled });
    }

    saveCurrentState() {
        const currentState = {
            uploadedImage: this.uploadedImage ? this.uploadedImage.name : null,
            previewHtml: this.previewContainer.innerHTML
        };
        sessionStorage.setItem('sidePanelState', JSON.stringify(currentState));
    }

    restoreState() {
        const savedState = sessionStorage.getItem('sidePanelState');
        if (savedState) {
            const state = JSON.parse(savedState);
            this.previewContainer.innerHTML = state.previewHtml;
            // Note: Cannot restore the File object directly, need to re-handle
            // For now, just restore the preview HTML
            this.uploadedImage = null; // Reset uploaded image
            this.translateUploadBtn.disabled = !this.previewContainer.innerHTML.includes('img');
        }
    }
}

// Initialize side panel manager
document.addEventListener('DOMContentLoaded', () => {
    new SidePanelManager();
});