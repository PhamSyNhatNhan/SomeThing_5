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
                            <p>2. Dán API Key vào ô "Gemini API Key"</p>
                        </div>
                    </body>
                    </html>
                `)
            });
        }
    }

    async handleContextMenuClick(info, tab) {
        if (info.menuItemId === 'translateImageGemini' && info.srcUrl) {
            this.translateImageFromUrl(info.srcUrl, tab);
        } else if (info.menuItemId === 'toggleAutoTranslate') {
            this.toggleAutoTranslate(tab);
        }
    }

    async handleTabUpdate(tabId, tab) {
        if (tab.url.startsWith('http')) {
            // Inject content script if not already present
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

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'testGeminiApiKey':
                    const isValid = await this.testGeminiApiKey(message.apiKey);
                    sendResponse({ isValid });
                    break;
                case 'testVisionApiKey':
                    // We don't need to test Vision API here, it's handled in content.js
                    // But we can add a placeholder for future use
                    sendResponse({ isValid: true });
                    break;
                case 'translateTextWithGemini':
                    const translatedText = await this.translateTextWithGemini(
                        message.text,
                        message.targetLanguage
                    );
                    sendResponse({ translatedText });
                    break;
                case 'translateImageFromUrl':
                    const result = await this.translateImageFromUrl(message.srcUrl, sender.tab);
                    sendResponse(result);
                    break;
                case 'getSettings':
                    const settings = await this.getSettings();
                    sendResponse(settings);
                    break;
                case 'saveSettings':
                    await this.saveSettings(message.settings);
                    sendResponse({ success: true });
                    break;
                case 'toggleAutoTranslate':
                    this.toggleAutoTranslate(sender.tab);
                    sendResponse({ success: true });
                    break;
                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Error in background script:', error);
            sendResponse({ error: error.message });
        }
    }

    async testGeminiApiKey(apiKey) {
        const endpoint = `${this.geminiEndpoint}?key=${apiKey}`;
        const testPrompt = {
            contents: [{
                parts: [{
                    text: 'test'
                }]
            }]
        };
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(testPrompt),
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async translateTextWithGemini(text, targetLang) {
        const settings = await this.getSettings();
        if (!settings.geminiApiKey) {
            throw new Error('Gemini API key is not set.');
        }

        const endpoint = `${this.geminiEndpoint}?key=${settings.geminiApiKey}`;
        const prompt = `Translate the following text into ${targetLang} while maintaining original formatting and line breaks, if any. If the text is already in ${targetLang}, return the original text.: ${text}`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            const translatedText = data.candidates[0]?.content?.parts[0]?.text;
            return translatedText;
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            throw error;
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

    async toggleAutoTranslate(tab) {
        const settings = await this.getSettings();
        const newSetting = !settings.autoTranslate;
        await this.saveSettings({ ...settings, autoTranslate: newSetting });

        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: 'toggleAutoTranslate',
                enabled: newSetting
            });
        } catch (error) {
            console.error('Error toggling auto-translate in content script:', error);
        }
    }
}

// Initialize background service
new GeminiBackgroundService();