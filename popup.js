class PopupManager {
    constructor() {
        this.initializeElements();
        this.loadSettings();
        this.attachEventListeners();
        this.uploadedImage = null;
        this.preventAutoClose();
        this.restoreState(); // Khôi phục trạng thái nếu có
    }

    preventAutoClose() {
        // Ngăn popup tự động đóng khi click bên ngoài
        document.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Ngăn popup đóng khi nhấn Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // Thêm notice về việc popup không tự động đóng
        this.showPinNotice();
    }

    showPinNotice() {
        const notice = document.querySelector('.pin-notice');
        if (notice) {
            setTimeout(() => {
                notice.style.opacity = '0';
                setTimeout(() => notice.remove(), 300);
            }, 3000);
        }
    }

    initializeElements() {
        this.geminiApiKey = document.getElementById('geminiApiKey');
        this.apiStatus = document.getElementById('apiStatus');
        this.testApiBtn = document.getElementById('testApiBtn');
        this.apiSection = document.getElementById('apiSection');
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
                autoTranslate: false,
                showOriginal: false,
                sourceLanguage: 'auto',
                targetLanguage: 'vi'
            });

            this.geminiApiKey.value = settings.geminiApiKey;
            this.autoTranslateToggle.checked = settings.autoTranslate;
            this.showOriginalToggle.checked = settings.showOriginal;
            this.sourceLanguageSelect.value = settings.sourceLanguage;
            this.targetLanguageSelect.value = settings.targetLanguage;

            this.validateApiKey();
        } catch (error) {
            this.showStatus('Lỗi tải cấu hình: ' + error.message, 'error');
        }
    }

    attachEventListeners() {
        // API Key validation
        this.geminiApiKey.addEventListener('input', () => {
            this.validateApiKey();
            this.saveSettings();
        });

        // API Key testing
        this.testApiBtn.addEventListener('click', () => {
            this.testApiKey();
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

        // Translate uploaded image
        this.translateUploadBtn.addEventListener('click', () => {
            this.translateUploadedImage();
        });

        // Drag and drop support
        const uploadArea = document.querySelector('.upload-area');

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
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
    }

    validateApiKey() {
        const apiKey = this.geminiApiKey.value.trim();

        if (!apiKey) {
            this.updateApiStatus('Chưa có API key', 'invalid');
            this.testApiBtn.disabled = true;
            return false;
        }

        // Validate Gemini API key format (starts with AIza)
        if (!apiKey.startsWith('AIza')) {
            this.updateApiStatus('API key không đúng định dạng Gemini', 'invalid');
            this.testApiBtn.disabled = true;
            return false;
        }

        if (apiKey.length < 35) {
            this.updateApiStatus('API key quá ngắn', 'invalid');
            this.testApiBtn.disabled = true;
            return false;
        }

        this.updateApiStatus('API key hợp lệ - Nhấn Test để kiểm tra', 'valid');
        this.testApiBtn.disabled = false;
        return true;
    }

    updateApiStatus(message, status) {
        this.apiStatus.textContent = message;
        this.apiStatus.className = `api-status ${status}`;
        this.apiSection.className = status === 'valid' ? 'api-section' : 'api-section invalid';
    }

    async testApiKey() {
        const apiKey = this.geminiApiKey.value.trim();
        if (!apiKey) return;

        this.testApiBtn.disabled = true;
        this.testApiBtn.textContent = 'Đang kiểm tra...';
        this.updateApiStatus('Đang kiểm tra kết nối với Gemini...', 'testing');

        try {
            // Test với một request đơn giản đến Gemini API
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: "Say hello"
                        }]
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.candidates && data.candidates.length > 0) {
                    this.updateApiStatus('✅ API key hoạt động tốt!', 'valid');
                    this.showStatus('API key Gemini đã được xác thực thành công!', 'success');
                } else {
                    throw new Error('Phản hồi không hợp lệ từ Gemini');
                }
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `HTTP ${response.status}`);
            }

        } catch (error) {
            console.error('API test error:', error);
            this.updateApiStatus('❌ API key không hoạt động: ' + error.message, 'invalid');
            this.showStatus('Lỗi API: ' + error.message, 'error');
        } finally {
            this.testApiBtn.disabled = false;
            this.testApiBtn.textContent = 'Test API Key';
        }
    }

    async saveSettings() {
        const settings = {
            geminiApiKey: this.geminiApiKey.value.trim(),
            autoTranslate: this.autoTranslateToggle.checked,
            showOriginal: this.showOriginalToggle.checked,
            sourceLanguage: this.sourceLanguageSelect.value,
            targetLanguage: this.targetLanguageSelect.value
        };

        try {
            await chrome.storage.sync.set(settings);
        } catch (error) {
            this.showStatus('Lỗi lưu cấu hình: ' + error.message, 'error');
        }
    }

    async toggleAutoTranslate() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await chrome.tabs.sendMessage(tab.id, {
                action: 'toggleAutoTranslate',
                enabled: this.autoTranslateToggle.checked
            });
        } catch (error) {
            this.showStatus('Lỗi bật/tắt tự động dịch: ' + error.message, 'error');
        }
    }

    handleImageUpload(file) {
        if (!file || !file.type.startsWith('image/')) {
            this.showStatus('Vui lòng chọn file ảnh hợp lệ', 'error');
            return;
        }

        // Kiểm tra kích thước file (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showStatus('File ảnh quá lớn. Vui lòng chọn ảnh dưới 10MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.uploadedImage = e.target.result;
            this.displayPreview(this.uploadedImage);
            this.translateUploadBtn.disabled = false;
            this.showStatus('Ảnh đã được tải lên thành công', 'success');
        };
        reader.onerror = () => {
            this.showStatus('Lỗi đọc file ảnh', 'error');
        };
        reader.readAsDataURL(file);
    }

    displayPreview(imageSrc) {
        this.previewContainer.innerHTML = `
            <img src="${imageSrc}" alt="Preview" class="preview-image">
        `;
    }

    async translateUploadedImage() {
        if (!this.uploadedImage) {
            this.showStatus('Không có ảnh để dịch', 'error');
            return;
        }

        const apiKey = this.geminiApiKey.value.trim();
        if (!apiKey || !this.validateApiKey()) {
            this.showStatus('Vui lòng nhập API key Gemini hợp lệ', 'error');
            return;
        }

        this.translateUploadBtn.disabled = true;
        this.translateUploadBtn.textContent = 'Đang dịch với Gemini AI...';
        this.showStatus('🤖 Gemini đang phân tích và dịch ảnh...', 'info');

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            const result = await chrome.tabs.sendMessage(tab.id, {
                action: 'translateUploadedImageWithGemini',
                imageData: this.uploadedImage,
                sourceLanguage: this.sourceLanguageSelect.value,
                targetLanguage: this.targetLanguageSelect.value,
                apiKey: apiKey
            });

            if (result.success) {
                this.showStatus(`✨ Thành công! Gemini đã tìm thấy ${result.textCount || 0} đoạn văn bản`, 'success');

                if (result.translatedImageUrl) {
                    this.displayTranslatedResult(result.translatedImageUrl, result.translations);
                }
            } else {
                this.showStatus('❌ ' + (result.error || 'Dịch thất bại'), 'error');
            }
        } catch (error) {
            console.error('Translation error:', error);
            this.showStatus('❌ Lỗi dịch ảnh: ' + error.message, 'error');
        } finally {
            this.translateUploadBtn.disabled = false;
            this.translateUploadBtn.textContent = 'Dịch ảnh đã tải';
        }
    }

    displayTranslatedResult(imageUrl, translations) {
        // Tạo cửa sổ mới để hiển thị kết quả
        const newWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');

        let translationsHtml = '';
        if (translations && translations.length > 0) {
            translationsHtml = `
                <div class="translations-list">
                    <h3>📝 Các văn bản đã dịch:</h3>
                    ${translations.map((t, i) => `
                        <div class="translation-item">
                            <div class="original"><strong>Gốc:</strong> ${t.original}</div>
                            <div class="translated"><strong>Dịch:</strong> ${t.translated}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        newWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Kết quả dịch từ Gemini AI</title>
                <meta charset="utf-8">
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        font-family: Arial, sans-serif;
                        background-color: #f5f5f5;
                    }
                    .container {
                        max-width: 800px;
                        margin: 0 auto;
                        background: white;
                        padding: 20px;
                        border-radius: 12px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                        color: #2c3e50;
                        border-bottom: 2px solid #3498db;
                        padding-bottom: 10px;
                    }
                    .image-container {
                        text-align: center;
                        margin: 20px 0;
                    }
                    .result-image {
                        max-width: 100%;
                        height: auto;
                        border: 2px solid #ddd;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .translations-list {
                        margin-top: 30px;
                        padding: 15px;
                        background-color: #f8f9fa;
                        border-radius: 8px;
                        border: 1px solid #e9ecef;
                    }
                    .translation-item {
                        margin: 15px 0;
                        padding: 12px;
                        background: white;
                        border-radius: 6px;
                        border-left: 4px solid #4CAF50;
                    }
                    .original {
                        color: #666;
                        margin-bottom: 8px;
                        font-size: 14px;
                    }
                    .translated {
                        color: #2c3e50;
                        font-size: 16px;
                        font-weight: 500;
                    }
                    .download-section {
                        text-align: center;
                        margin-top: 30px;
                        padding-top: 20px;
                        border-top: 1px solid #eee;
                    }
                    .download-btn {
                        display: inline-block;
                        padding: 12px 24px;
                        background: linear-gradient(135deg, #4CAF50, #45a049);
                        color: white;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: bold;
                        margin: 10px;
                        transition: transform 0.2s;
                    }
                    .download-btn:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
                    }
                    .footer {
                        text-align: center;
                        margin-top: 30px;
                        padding-top: 20px;
                        border-top: 1px solid #eee;
                        color: #666;
                        font-size: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🤖 Kết quả dịch từ Gemini 2.0 Flash</h1>
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
        `);
    }

    showStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
        this.status.style.display = 'block';

        // Auto-hide sau 5 giây trừ info messages
        if (type !== 'info') {
            setTimeout(() => {
                if (this.status.style.display !== 'none') {
                    this.status.style.display = 'none';
                }
            }, 5000);
        }
    }
}

// Initialize popup khi DOM loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});