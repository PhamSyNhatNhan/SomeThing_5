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

    async saveSettings() {
        const settings = {
            geminiApiKey: this.geminiApiKey.value,
            visionApiKey: this.visionApiKey.value, // Lưu Vision API Key
            autoTranslate: this.autoTranslateToggle.checked,
            showOriginal: this.showOriginalToggle.checked,
            sourceLanguage: this.sourceLanguageSelect.value,
            targetLanguage: this.targetLanguageSelect.value
        };

        try {
            await chrome.storage.sync.set(settings);
            this.showStatus('Cài đặt đã được lưu!', 'success');
        } catch (error) {
            this.showStatus('Lỗi khi lưu cài đặt: ' + error.message, 'error');
        }
    }

    validateApiKeys() {
        const geminiKey = this.geminiApiKey.value.trim();
        const visionKey = this.visionApiKey.value.trim();

        // Validate Gemini Key
        if (!geminiKey) {
            this.updateApiStatus('apiStatus', 'Chưa có API key', 'invalid');
            this.testApiBtn.disabled = true;
        } else if (!geminiKey.startsWith('AIza')) {
            this.updateApiStatus('apiStatus', 'API key không đúng định dạng Gemini', 'invalid');
            this.testApiBtn.disabled = true;
        } else if (geminiKey.length < 35) {
            this.updateApiStatus('apiStatus', 'API key quá ngắn', 'invalid');
            this.testApiBtn.disabled = true;
        } else {
            this.updateApiStatus('apiStatus', 'API key hợp lệ', 'valid');
            this.testApiBtn.disabled = false;
        }

        // Validate Vision Key
        if (!visionKey) {
            this.updateApiStatus('visionApiStatus', 'Chưa có Vision API key', 'info');
            this.testVisionApiBtn.disabled = true;
        } else if (!visionKey.startsWith('AIza')) {
            this.updateApiStatus('visionApiStatus', 'API key không đúng định dạng Vision', 'invalid');
            this.testVisionApiBtn.disabled = true;
        } else if (visionKey.length < 35) {
            this.updateApiStatus('visionApiStatus', 'API key quá ngắn', 'invalid');
            this.testVisionApiBtn.disabled = true;
        } else {
            this.updateApiStatus('visionApiStatus', 'API key hợp lệ', 'valid');
            this.testVisionApiBtn.disabled = false;
        }
    }

    updateApiStatus(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = `api-status ${type}`;
    }

    // Đổi tên hàm cũ để phù hợp
    async testApiKey() {
        const apiKey = this.geminiApiKey.value.trim();
        if (!apiKey) return;

        this.updateApiStatus('apiStatus', 'Đang kiểm tra...', 'testing');
        this.testApiBtn.disabled = true;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: 'Test message' }] }] })
            });

            if (response.ok) {
                this.updateApiStatus('apiStatus', 'API key hợp lệ!', 'valid');
            } else {
                const errorData = await response.json();
                this.updateApiStatus('apiStatus', `Lỗi: ${errorData.error.message}`, 'invalid');
            }
        } catch (error) {
            this.updateApiStatus('apiStatus', `Lỗi kết nối: ${error.message}`, 'invalid');
        } finally {
            this.testApiBtn.disabled = false;
        }
    }

    async testVisionApiKey() {
        const apiKey = this.visionApiKey.value.trim();
        if (!apiKey) return;

        this.updateApiStatus('visionApiStatus', 'Đang kiểm tra...', 'testing');
        this.testVisionApiBtn.disabled = true;

        try {
            const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requests: [{
                        image: { content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwAB/q9A9LIAAAAASUVORK5CYII=' }, // Dummy 1x1 image
                        features: [{ type: 'TEXT_DETECTION' }]
                    }]
                })
            });

            if (response.ok) {
                this.updateApiStatus('visionApiStatus', 'API key hợp lệ!', 'valid');
            } else {
                const errorData = await response.json();
                this.updateApiStatus('visionApiStatus', `Lỗi: ${errorData.error.message}`, 'invalid');
            }
        } catch (error) {
            this.updateApiStatus('visionApiStatus', `Lỗi kết nối: ${error.message}`, 'invalid');
        } finally {
            this.testVisionApiBtn.disabled = false;
        }
    }

    handleImageUpload(file) {
        if (!file || !file.type.startsWith('image/')) {
            this.showStatus('Vui lòng chọn file ảnh hợp lệ', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            this.previewContainer.innerHTML = '';
            this.previewContainer.appendChild(img);
            this.uploadedImage = e.target.result;
            this.translateUploadBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    async translateUploadedImage() {
        if (!this.uploadedImage) {
            this.showStatus('Vui lòng tải ảnh lên trước.', 'error');
            return;
        }

        const settings = await chrome.storage.sync.get(['visionApiKey', 'targetLanguage']);
        const visionApiKey = settings.visionApiKey;
        const targetLanguage = settings.targetLanguage;

        if (!visionApiKey) {
            this.showStatus('Vui lòng nhập Vision API Key để dịch ảnh.', 'error');
            return;
        }

        this.showStatus('Đang xử lý ảnh, vui lòng chờ...', 'info');
        this.translateUploadBtn.disabled = true;

        try {
            const result = await chrome.runtime.sendMessage({
                action: 'translateUploadedImage',
                imageData: this.uploadedImage,
                visionApiKey: visionApiKey,
                targetLanguage: targetLanguage
            });

            if (result.error) {
                throw new Error(result.error);
            }

            this.showStatus('Dịch ảnh thành công!', 'success');
            // Open new window to display result
            const newWindow = window.open('', '_blank');
            newWindow.document.write(this.generateResultHtml(this.uploadedImage, result.translations));
            newWindow.document.close();

        } catch (error) {
            this.showStatus('Đã xảy ra lỗi khi dịch ảnh: ' + error.message, 'error');
        } finally {
            this.translateUploadBtn.disabled = false;
        }
    }

    generateResultHtml(imageUrl, translations) {
        const translationsHtml = translations.map(t => `
            <div class="translation-item">
                <div class="original-text">Gốc: ${t.original}</div>
                <div class="translated-text">Dịch: ${t.translated}</div>
            </div>
        `).join('');

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Kết quả dịch ảnh</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
                    .container { background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1); padding: 30px; }
                    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #4CAF50; padding-bottom: 10px; }
                    .image-container { text-align: center; margin-bottom: 20px; }
                    .result-image { max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #ddd; }
                    .translation-item { border-bottom: 1px solid #eee; padding: 10px 0; }
                    .translation-item:last-child { border-bottom: none; }
                    .original-text { font-weight: bold; color: #555; }
                    .translated-text { color: #1a1a1a; margin-top: 5px; }
                    .footer { text-align: center; margin-top: 30px; font-size: 0.9em; color: #999; }
                    .download-btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; transition: background-color 0.3s; }
                    .download-btn:hover { background-color: #0056b3; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>Kết quả dịch ảnh</h2>
                        <p>Ảnh đã được phân tích và dịch bằng AI</p>
                    </div>
                    <div class="image-container">
                        <img src="${imageUrl}" alt="Translated Image" class="result-image">
                    </div>
                    ${translationsHtml}
                    <div class="download-section">
                        <a href="${imageUrl}" download="gemini_translated_image.png" class="download-btn">
                            📥 Tải ảnh đã dịch
                        </a>
                    </div>
                    <div class="footer">
                        <p>Được dịch bởi Google Gemini 2.0 Flash - Image Translator Extension</p>
                    </div>
                </div>
            </body>
            </html>
        `;
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

    downloadResults() {
        const translations = Array.from(document.querySelectorAll('.translation-item')).map(item => {
            const original = item.querySelector('div:first-child').textContent.replace('Gốc: ', '');
            const translated = item.querySelector('div:nth-child(2)').textContent.replace('Dịch: ', '');
            return { original, translated };
        });

        const dataStr = JSON.stringify(translations, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `gemini_translations_${new Date().toISOString().slice(0,10)}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }
}

// Initialize side panel manager
document.addEventListener('DOMContentLoaded', () => {
    new SidePanelManager();
});