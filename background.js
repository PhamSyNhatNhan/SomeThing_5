// Background script cho Chrome extension - Chỉ hỗ trợ Gemini 2.0
class GeminiBackgroundService {
    constructor() {
        this.geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
        this.setupEventListeners();
        this.initializeSettings();
    }

    setupEventListeners() {
        // Handle extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });

        // Handle messages từ content scripts và popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open cho async response
        });

        // Handle context menu clicks
        chrome.contextMenus.onClicked.addListener((info, tab) => {
            this.handleContextMenuClick(info, tab);
        });

        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.handleTabUpdate(tabId, tab);
            }
        });
    }

    async initializeSettings() {
        try {
            const defaultSettings = {
                geminiApiKey: '',
                autoTranslate: false,
                showOriginal: false,
                sourceLanguage: 'auto',
                targetLanguage: 'vi'
            };

            const existingSettings = await chrome.storage.sync.get(Object.keys(defaultSettings));
            const settingsToSet = {};

            Object.keys(defaultSettings).forEach(key => {
                if (existingSettings[key] === undefined) {
                    settingsToSet[key] = defaultSettings[key];
                }
            });

            if (Object.keys(settingsToSet).length > 0) {
                await chrome.storage.sync.set(settingsToSet);
            }

            await this.createContextMenus();

        } catch (error) {
            console.error('Error initializing settings:', error);
        }
    }

    async createContextMenus() {
        try {
            await chrome.contextMenus.removeAll();

            chrome.contextMenus.create({
                id: 'translateImageGemini',
                title: 'Dịch ảnh với Gemini AI',
                contexts: ['image'],
                visible: true
            });

            chrome.contextMenus.create({
                id: 'toggleAutoTranslate',
                title: 'Bật/tắt tự động dịch ảnh',
                contexts: ['page'],
                visible: true
            });

            chrome.contextMenus.create({
                id: 'separator1',
                type: 'separator',
                contexts: ['image', 'page']
            });

            chrome.contextMenus.create({
                id: 'openExtensionPopup',
                title: 'Mở Image Translator',
                contexts: ['page'],
                visible: true
            });

        } catch (error) {
            console.error('Error creating context menus:', error);
        }
    }

    handleInstallation(details) {
        if (details.reason === 'install') {
            // Tạo tab welcome với hướng dẫn setup Gemini API
            chrome.tabs.create({
                url: 'data:text/html;charset=utf-8,' + encodeURIComponent(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Image Translator - Chào mừng!</title>
                        <style>
                            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                            .header { text-align: center; color: #2c3e50; }
                            .step { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; }
                            .api-link { color: #3498db; text-decoration: none; font-weight: bold; }
                            .api-link:hover { text-decoration: underline; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>🎉 Chào mừng đến với Image Translator!</h1>
                            <p>Extension dịch ảnh bằng Google Gemini 2.0 Flash</p>
                        </div>
                        
                        <div class="step">
                            <h3>Bước 1: Lấy API Key từ Google AI Studio</h3>
                            <p>1. Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" class="api-link">Google AI Studio</a></p>
                            <p>2. Đăng nhập với tài khoản Google</p>
                            <p>3. Nhấn "Create API Key" và sao chép key</p>
                        </div>
                        
                        <div class="step">
                            <h3>Bước 2: Cấu hình Extension</h3>
                            <p>1. Nhấn vào icon Extension trên thanh công cụ</p>
                            <p>2. Dán API Key vào ô "Cấu hình API Key"</p>
                            <p>3. Nhấn "Test API Key" để kiểm tra</p>
                        </div>
                        
                        <div class="step">
                            <h3>Bước 3: Sử dụng</h3>
                            <p>• Bật "Tự động dịch ảnh" để dịch tất cả ảnh trên trang</p>
                            <p>• Hoặc tải ảnh lên trong popup để dịch riêng lẻ</p>
                            <p>• Chuột phải vào ảnh → "Dịch ảnh với Gemini AI"</p>
                        </div>
                    </body>
                    </html>
                `)
            });
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'translateWithGemini':
                    const result = await this.translateWithGemini(message.text, message.sourceLang, message.targetLang, message.apiKey);
                    sendResponse({ success: true, translatedText: result });
                    break;

                case 'translateImageDirectly':
                    const imageResult = await this.translateImageWithGemini(
                        message.imageData,
                        message.sourceLang,
                        message.targetLang,
                        message.apiKey
                    );
                    sendResponse(imageResult);
                    break;

                case 'testGeminiConnection':
                    const testResult = await this.testGeminiConnection(message.apiKey);
                    sendResponse(testResult);
                    break;

                case 'getSettings':
                    const settings = await this.getSettings();
                    sendResponse({ success: true, settings });
                    break;

                case 'saveSettings':
                    await this.saveSettings(message.settings);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action: ' + message.action });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async translateWithGemini(text, sourceLang, targetLang, apiKey) {
        if (!apiKey) {
            throw new Error('Không có API key');
        }

        const prompt = this.createTranslationPrompt(text, sourceLang, targetLang);

        try {
            const response = await fetch(`${this.geminiEndpoint}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 1000,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Gemini không trả về kết quả hợp lệ');
            }

            return data.candidates[0].content.parts[0].text.trim();

        } catch (error) {
            console.error('Gemini translation error:', error);
            throw error;
        }
    }

    async translateImageWithGemini(imageData, sourceLang, targetLang, apiKey) {
        if (!apiKey) {
            return { success: false, error: 'Không có API key' };
        }

        try {
            // Chuyển đổi data URL thành base64
            const base64Data = imageData.split(',')[1];

            const prompt = this.createImageTranslationPrompt(sourceLang, targetLang);

            const response = await fetch(`${this.geminiEndpoint}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                text: prompt
                            },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: base64Data
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 2000,
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Gemini không trả về kết quả hợp lệ');
            }

            const result = data.candidates[0].content.parts[0].text;

            // Parse JSON response từ Gemini
            try {
                const parsedResult = JSON.parse(result);
                return {
                    success: true,
                    result: parsedResult
                };
            } catch (parseError) {
                // Nếu không parse được JSON, trả về text thô
                return {
                    success: true,
                    result: {
                        texts: [{
                            original: "Văn bản được tìm thấy",
                            translated: result,
                            confidence: "medium",
                            orientation: "horizontal"
                        }]
                    }
                };
            }

        } catch (error) {
            console.error('Gemini image translation error:', error);
            return { success: false, error: error.message };
        }
    }

    createTranslationPrompt(text, sourceLang, targetLang) {
        const sourceLanguageName = this.getLanguageName(sourceLang);
        const targetLanguageName = this.getLanguageName(targetLang);

        return `Dịch văn bản sau từ ${sourceLanguageName} sang ${targetLanguageName}. Chỉ trả về bản dịch, không giải thích:

"${text}"`;
    }

    createImageTranslationPrompt(sourceLang, targetLang) {
        const sourceLanguageName = this.getLanguageName(sourceLang);
        const targetLanguageName = this.getLanguageName(targetLang);

        return `Phân tích hình ảnh này và tìm tất cả văn bản trong ảnh. Dịch tất cả văn bản từ ${sourceLanguageName} sang ${targetLanguageName}.

Trả về kết quả theo định dạng JSON chính xác như sau:
{
  "texts": [
    {
      "original": "văn bản gốc tìm thấy",
      "translated": "bản dịch tiếng ${targetLanguageName}",
      "confidence": "high/medium/low",
      "orientation": "horizontal/vertical"
    }
  ]
}

Lưu ý:
- Nếu không tìm thấy văn bản nào, trả về {"texts": []}
- Dịch chính xác và tự nhiên
- Xác định độ tin cậy: high (rất rõ ràng), medium (khá rõ), low (mờ/khó đọc)
- Xác định hướng: horizontal (ngang), vertical (dọc)`;
    }

    getLanguageName(langCode) {
        const langNames = {
            'auto': 'tự động nhận diện',
            'vi': 'tiếng Việt',
            'en': 'tiếng Anh',
            'zh': 'tiếng Trung',
            'ja': 'tiếng Nhật',
            'ko': 'tiếng Hàn',
            'th': 'tiếng Thái',
            'es': 'tiếng Tây Ban Nha',
            'fr': 'tiếng Pháp',
            'de': 'tiếng Đức'
        };
        return langNames[langCode] || langCode;
    }

    async testGeminiConnection(apiKey) {
        try {
            const result = await this.translateWithGemini('Hello', 'en', 'vi', apiKey);
            return {
                success: true,
                message: 'API key hoạt động tốt!',
                testTranslation: result
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async handleContextMenuClick(info, tab) {
        try {
            switch (info.menuItemId) {
                case 'translateImageGemini':
                    await this.translateImageFromContext(info, tab);
                    break;

                case 'toggleAutoTranslate':
                    await this.toggleAutoTranslateFromContext(tab);
                    break;

                case 'openSidePanel':
                    // Mở side panel
                    await chrome.sidePanel.open({ windowId: tab.windowId });
                    break;
            }
        } catch (error) {
            console.error('Error handling context menu click:', error);
        }
    }

    async translateImageFromContext(info, tab) {
        if (!info.srcUrl) return;

        const settings = await this.getSettings();
        if (!settings.geminiApiKey) {
            // Hiển thị notification yêu cầu setup API key
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon48.png',
                title: 'Image Translator',
                message: 'Vui lòng cấu hình Gemini API key trước khi sử dụng!'
            });
            return;
        }

        await chrome.tabs.sendMessage(tab.id, {
            action: 'translateSpecificImage',
            imageUrl: info.srcUrl,
            apiKey: settings.geminiApiKey,
            sourceLang: settings.sourceLanguage,
            targetLang: settings.targetLanguage
        });
    }

    async toggleAutoTranslateFromContext(tab) {
        const settings = await this.getSettings();
        const newState = !settings.autoTranslate;

        await this.saveSettings({ ...settings, autoTranslate: newState });

        chrome.contextMenus.update('toggleAutoTranslate', {
            title: newState ? 'Tắt tự động dịch ảnh' : 'Bật tự động dịch ảnh'
        });

        await chrome.tabs.sendMessage(tab.id, {
            action: 'toggleAutoTranslate',
            enabled: newState
        });
    }

    async handleTabUpdate(tabId, tab) {
        const settings = await this.getSettings();
        if (settings.autoTranslate && settings.geminiApiKey && tab.url && !tab.url.startsWith('chrome://')) {
            try {
                await chrome.tabs.sendMessage(tabId, { action: 'ping' });
            } catch {
                // Content script chưa được inject
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                });

                // Inject CSS
                await chrome.scripting.insertCSS({
                    target: { tabId },
                    files: ['content.css']
                });
            }
        }
    }

    async getSettings() {
        return await chrome.storage.sync.get({
            geminiApiKey: '',
            autoTranslate: false,
            showOriginal: false,
            sourceLanguage: 'auto',
            targetLanguage: 'vi'
        });
    }

    async saveSettings(settings) {
        await chrome.storage.sync.set(settings);

        // Notify tất cả tabs về settings change
        const tabs = await chrome.tabs.query({});
        const settingsMessage = {
            action: 'settingsChanged',
            settings: settings
        };

        for (const tab of tabs) {
            if (!tab.url || tab.url.startsWith('chrome://')) continue;
            try {
                await chrome.tabs.sendMessage(tab.id, settingsMessage);
            } catch {
                // Tab không có content script
            }
        }
    }
}

// Initialize background service
new GeminiBackgroundService();