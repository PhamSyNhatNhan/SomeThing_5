class OptionsManager {
    constructor() {
        this.form = document.getElementById('settingsForm');
        this.statusMessage = document.getElementById('statusMessage');
        this.serviceInfo = document.getElementById('serviceInfo');

        this.initializeOptions();
        this.setupEventListeners();
        this.loadSettings();
    }

    initializeOptions() {
        this.defaultSettings = {
            autoTranslate: false,
            showOriginal: false,
            sourceLanguage: 'auto',
            targetLanguage: 'vi',
            translationService: 'libre',
            apiKey: '',
            visionApiKey: '',
            maxImageSize: 1000,
            enableContextMenu: true,
            enableDebugMode: false
        };

        this.serviceInfoData = {
            google: {
                name: 'Google Translate',
                description: 'High-quality translations with support for many languages.',
                apiInfo: 'Requires Google Cloud Translation API key.',
                setupUrl: 'https://cloud.google.com/translate/docs/setup',
                pricing: 'Pay per character translated.'
            },
            microsoft: {
                name: 'Microsoft Translator',
                description: 'Professional translation service by Microsoft.',
                apiInfo: 'Requires Azure Cognitive Services key.',
                setupUrl: 'https://docs.microsoft.com/en-us/azure/cognitive-services/translator/',
                pricing: 'Free tier available, then pay per character.'
            },
            libre: {
                name: 'LibreTranslate',
                description: 'Free and open-source translation service.',
                apiInfo: 'No API key required. Uses public LibreTranslate instance.',
                setupUrl: 'https://libretranslate.de/',
                pricing: 'Completely free to use.'
            },
            mock: {
                name: 'Demo Mode',
                description: 'For testing purposes only. Provides mock translations.',
                apiInfo: 'No setup required. Shows placeholder translations.',
                setupUrl: '',
                pricing: 'Free (demo only).'
            }
        };
    }

    setupEventListeners() {
        // Form submission
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        // Translation service change
        document.getElementById('translationService').addEventListener('change', (e) => {
            this.updateServiceInfo(e.target.value);
            this.toggleApiKeyField(e.target.value);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 's') {
                e.preventDefault();
                this.saveSettings();
            }
        });
    }

    async loadSettings() {
        try {
            const settings = await chrome.storage.sync.get(this.defaultSettings);

            // Populate form fields
            Object.keys(settings).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    if (element.type === 'checkbox') {
                        element.checked = settings[key];
                    } else {
                        element.value = settings[key];
                    }
                }
            });

            // Update service-specific UI
            this.updateServiceInfo(settings.translationService);
            this.toggleApiKeyField(settings.translationService);

        } catch (error) {
            this.showStatus('Error loading settings: ' + error.message, 'error');
        }
    }

    async saveSettings() {
        try {
            const formData = new FormData(this.form);
            const settings = {};

            // Convert form data to settings object
            for (const [key, value] of formData.entries()) {
                const element = document.getElementById(key);
                if (element) {
                    if (element.type === 'checkbox') {
                        settings[key] = element.checked;
                    } else if (element.type === 'range') {
                        settings[key] = parseInt(value);
                    } else {
                        settings[key] = value;
                    }
                }
            }

            // Handle unchecked checkboxes (not included in FormData)
            Object.keys(this.defaultSettings).forEach(key => {
                const element = document.getElementById(key);
                if (element && element.type === 'checkbox' && !formData.has(key)) {
                    settings[key] = false;
                }
            });

            await chrome.storage.sync.set(settings);
            this.showStatus('Settings saved successfully!', 'success');

            // Notify background script
            chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });

        } catch (error) {
            this.showStatus('Error saving settings: ' + error.message, 'error');
        }
    }

    updateServiceInfo(service) {
        const info = this.serviceInfoData[service];
        if (!info) return;

        this.serviceInfo.innerHTML = `
            <h4>${info.name}</h4>
            <p><strong>Description:</strong> ${info.description}</p>
            <p><strong>Setup:</strong> ${info.apiInfo}</p>
            <p><strong>Pricing:</strong> ${info.pricing}</p>
            ${info.setupUrl ? `<p><a href="${info.setupUrl}" target="_blank">📖 Setup Instructions</a></p>` : ''}
        `;
    }

    toggleApiKeyField(service) {
        const apiKeyGroup = document.querySelector('.api-key-group');
        const apiKeyField = document.getElementById('apiKey');

        if (service === 'libre' || service === 'mock') {
            apiKeyGroup.style.opacity = '0.5';
            apiKeyField.disabled = true;
            apiKeyField.required = false;
        } else {
            apiKeyGroup.style.opacity = '1';
            apiKeyField.disabled = false;
            apiKeyField.required = true;

            // Update placeholder based on service
            if (service === 'gemini') {
                apiKeyField.placeholder = 'Enter your Google AI Studio API key';
            } else if (service === 'google') {
                apiKeyField.placeholder = 'Enter your Google Cloud Translation API key';
            } else if (service === 'microsoft') {
                apiKeyField.placeholder = 'Enter your Azure Cognitive Services key';
            }
        }
    }

    async resetToDefaults() {
        if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
            try {
                await chrome.storage.sync.set(this.defaultSettings);
                await this.loadSettings();
                this.showStatus('Settings reset to defaults!', 'success');
            } catch (error) {
                this.showStatus('Error resetting settings: ' + error.message, 'error');
            }
        }
    }

    async testTranslation() {
        const testButton = document.querySelector('.btn-success');
        const originalText = testButton.textContent;

        testButton.textContent = '🔄 Testing...';
        testButton.disabled = true;

        try {
            const settings = await chrome.storage.sync.get(this.defaultSettings);
            const testText = 'Hello, world!';

            // Send test translation request to background script
            const response = await chrome.runtime.sendMessage({
                action: 'translateText',
                text: testText,
                sourceLang: 'en',
                targetLang: settings.targetLanguage
            });

            if (response.success) {
                this.showStatus(
                    `✅ Translation test successful! "${testText}" → "${response.translatedText}"`,
                    'success'
                );
            } else {
                this.showStatus('❌ Translation test failed: ' + response.error, 'error');
            }

        } catch (error) {
            this.showStatus('❌ Translation test error: ' + error.message, 'error');
        } finally {
            testButton.textContent = originalText;
            testButton.disabled = false;
        }
    }

    showStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message ${type}`;
        this.statusMessage.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.statusMessage.style.display = 'none';
        }, 5000);
    }
}

// Global functions for HTML onclick handlers
function toggleApiKeyVisibility() {
    const apiKeyField = document.getElementById('apiKey');
    const toggleButton = document.querySelector('.api-key-toggle');

    if (apiKeyField.type === 'password') {
        apiKeyField.type = 'text';
        toggleButton.textContent = '🙈';
    } else {
        apiKeyField.type = 'password';
        toggleButton.textContent = '👁️';
    }
}

function toggleAdvancedSettings() {
    const advancedSettings = document.getElementById('advancedSettings');
    const toggleButton = document.querySelector('.advanced-toggle');

    if (advancedSettings.classList.contains('show')) {
        advancedSettings.classList.remove('show');
        toggleButton.innerHTML = 'Show Advanced Options ▼';
    } else {
        advancedSettings.classList.add('show');
        toggleButton.innerHTML = 'Hide Advanced Options ▲';
    }
}

function resetToDefaults() {
    optionsManager.resetToDefaults();
}

function testTranslation() {
    optionsManager.testTranslation();
}

// Initialize options manager when DOM is loaded
let optionsManager;
document.addEventListener('DOMContentLoaded', () => {
    optionsManager = new OptionsManager();
});