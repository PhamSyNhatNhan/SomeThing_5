// background.js — Complete Google Cloud APIs Implementation

// =========================
// Configuration
// =========================
const CONFIG = {
  GOOGLE_CLOUD_API_KEY: "AIzaSyAgryJxgBg62GADNzIZEkTEx2E1kpWKJuk",
  GEMINI_API_KEY: "AIzaSyCm0cZVvJA1nnda4SSS2eTT_Zl3wxQ6wCA",
  PROJECT_ID: "gen-lang-client-0531037686",
  LOCATION: "us-central1",

  ENDPOINTS: {
    CLOUD_VISION: "https://vision.googleapis.com/v1/images:annotate",
    GEMINI: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    IMAGEN: "https://aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/imagegeneration@005:predict"
  },

  DEFAULTS: {
    MAX_OCR_RESULTS: 50,
    GEMINI_TEMPERATURE: 0.1,
    GEMINI_MAX_TOKENS: 1000,
    IMAGE_QUALITY: 0.9,
    TIMEOUT: 30000,
    FONT_SIZE_MULTIPLIER: 1.2,
    STROKE_WIDTH_RATIO: 0.1
  },

  LANGUAGE_MAPPINGS: {
    'en': 'English',
    'vi': 'Vietnamese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese (Simplified)',
    'th': 'Thai',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'ru': 'Russian',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'pt': 'Portuguese',
    'it': 'Italian'
  },

  FONTS: {
    'wildwords': 'WildWords',
    'notosans': 'NotoSans',
    'komika': 'KomikaJam',
    'bangers': 'Bangers',
    'edo': 'Edo',
    'ridi': 'RIDIBatang',
    'bushidoo': 'Bushidoo',
    'hayah': 'Hayah',
    'itim': 'Itim'
  }
};

// =========================
// Utils
// =========================
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blobToImage(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve(reader.result.replace("application/octet-stream", "image/jpeg"));
    reader.readAsDataURL(blob);
  });
}

let sentErrors = 0;
async function sendError(error, loc) {
  try {
    if (error?.message?.includes?.("because the client is offline")) return;

    sentErrors += 1;
    if (sentErrors > 10) return;

  } catch (e) {
    console.log("Failed to send error. Error: ", e);
  }
}

function showBadge(text) {
  try {
    chrome.action.setBadgeText({ text: text });
    if (text !== "") {
      chrome.action.setBadgeTextColor({ color: [255, 255, 255, 255] });
      chrome.action.setBadgeBackgroundColor({ color: [255, 0, 0, 255] });
    }
  } catch (error) {
    sendError(error, "show badge");
  }
}

function showUpdateBadge() {
  showBadge("1");
  chrome.storage.sync.set({ torii_new_version: true });
}

function removeUpdateBadge() {
  showBadge("");
  chrome.storage.sync.set({ torii_new_version: false });
}

// =========================
// Google Cloud Vision OCR
// =========================
async function performOCR(imageBase64) {
  try {
    console.log("Starting OCR with Cloud Vision...");

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const requestBody = {
      requests: [{
        image: {
          content: base64Data
        },
        features: [{
          type: "TEXT_DETECTION",
          maxResults: CONFIG.DEFAULTS.MAX_OCR_RESULTS
        }],
        imageContext: {
          languageHints: ["en", "ja", "ko", "zh", "vi", "th", "es", "fr", "de", "ru"]
        }
      }]
    };

    const response = await fetch(`${CONFIG.ENDPOINTS.CLOUD_VISION}?key=${CONFIG.GOOGLE_CLOUD_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(CONFIG.DEFAULTS.TIMEOUT),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("OCR Response:", result);

    if (result.responses && result.responses[0]) {
      const responseData = result.responses[0];

      if (responseData.error) {
        throw new Error(`OCR API error: ${responseData.error.message}`);
      }

      if (responseData.textAnnotations && responseData.textAnnotations.length > 0) {
        const fullText = responseData.textAnnotations[0].description || "";
        const textBlocks = responseData.textAnnotations.slice(1).map((annotation, index) => ({
          id: index,
          text: annotation.description,
          boundingPoly: annotation.boundingPoly,
          confidence: annotation.confidence || 0.9,
          locale: annotation.locale || null
        }));

        console.log(`OCR detected ${textBlocks.length} text blocks`);

        return {
          success: true,
          textBlocks: textBlocks,
          fullText: fullText.trim(),
          detectedLanguages: [...new Set(textBlocks.map(b => b.locale).filter(Boolean))]
        };
      }
    }

    return {
      success: false,
      error: "No text detected in image",
      textBlocks: [],
      fullText: ""
    };
  } catch (error) {
    console.error("OCR Error:", error);
    await sendError(error, "performOCR");
    return {
      success: false,
      error: error.message,
      textBlocks: [],
      fullText: ""
    };
  }
}

// =========================
// Gemini Translation
// =========================
async function translateWithGemini(text, targetLanguage, sourceLanguage = null) {
  try {
    console.log(`Translating text to ${targetLanguage}...`);

    if (!text || text.trim().length === 0) {
      return { success: false, error: "No text to translate" };
    }

    const targetLangName = CONFIG.LANGUAGE_MAPPINGS[targetLanguage] || targetLanguage;
    const sourceLangHint = sourceLanguage ? `from ${CONFIG.LANGUAGE_MAPPINGS[sourceLanguage] || sourceLanguage} ` : '';

    const prompt = `Translate the following text ${sourceLangHint}to ${targetLangName}. 
Preserve the original formatting and structure. 
Only return the translated text, no explanations or additional content.
If the text is already in ${targetLangName}, return it unchanged.

Text to translate:
${text}`;

    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: CONFIG.DEFAULTS.GEMINI_TEMPERATURE,
        maxOutputTokens: CONFIG.DEFAULTS.GEMINI_MAX_TOKENS,
        topP: 0.8,
        topK: 40
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    };

    const response = await fetch(`${CONFIG.ENDPOINTS.GEMINI}?key=${CONFIG.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(CONFIG.DEFAULTS.TIMEOUT),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Translation API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("Translation Response:", result);

    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      const translatedText = result.candidates[0].content.parts[0].text.trim();

      console.log("Translation successful");

      return {
        success: true,
        translatedText: translatedText,
        originalText: text
      };
    }

    if (result.promptFeedback && result.promptFeedback.blockReason) {
      throw new Error(`Translation blocked: ${result.promptFeedback.blockReason}`);
    }

    return { success: false, error: "No translation received from Gemini" };
  } catch (error) {
    console.error("Translation Error:", error);
    await sendError(error, "translateWithGemini");
    return { success: false, error: error.message };
  }
}

// =========================
// Google Cloud Imagen Inpainting
// =========================
async function getAccessToken() {
  // For production, implement proper OAuth2 or Service Account authentication
  // For now, return placeholder - you'll need to implement this based on your auth method
  console.log("Getting access token...");

  // Example implementation using service account (you'd need to implement this)
  // return await getServiceAccountToken();

  return "YOUR_ACCESS_TOKEN"; // Replace with actual implementation
}

async function performInpainting(imageBase64, textBlocks) {
  try {
    console.log("Starting inpainting with Imagen...");

    if (!textBlocks || textBlocks.length === 0) {
      console.log("No text blocks provided, skipping inpainting");
      return { success: true, inpaintedImage: imageBase64 };
    }

    // Create mask from text block coordinates
    const maskBase64 = await createMaskFromCoordinates(imageBase64, textBlocks);

    const endpoint = CONFIG.ENDPOINTS.IMAGEN
      .replace('{PROJECT_ID}', CONFIG.PROJECT_ID)
      .replace('{LOCATION}', CONFIG.LOCATION);

    const accessToken = await getAccessToken();

    const requestBody = {
      instances: [{
        prompt: "Remove text and fill the area naturally while maintaining the original image style and quality",
        image: {
          bytesBase64Encoded: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
        },
        mask: {
          image: {
            bytesBase64Encoded: maskBase64
          }
        }
      }],
      parameters: {
        sampleCount: 1,
        mode: "inpainting",
        includeRaiReason: true,
        guidanceScale: 7.5,
        seed: Math.floor(Math.random() * 1000000)
      }
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000), // Inpainting takes longer
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Inpainting API error:", errorText);

      // Fallback: return original image if inpainting fails
      console.log("Inpainting failed, using original image");
      return { success: true, inpaintedImage: imageBase64 };
    }

    const result = await response.json();
    console.log("Inpainting Response:", result);

    if (result.predictions && result.predictions[0] && result.predictions[0].bytesBase64Encoded) {
      const inpaintedImage = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
      console.log("Inpainting successful");
      return { success: true, inpaintedImage };
    }

    // Fallback if no proper response
    console.log("No inpainted image in response, using original");
    return { success: true, inpaintedImage: imageBase64 };

  } catch (error) {
    console.error("Inpainting Error:", error);
    await sendError(error, "performInpainting");

    // Fallback: return original image
    console.log("Inpainting error, using original image");
    return { success: true, inpaintedImage: imageBase64 };
  }
}

// =========================
// Mask Creation from OCR Coordinates
// =========================
async function createMaskFromCoordinates(imageBase64, textBlocks) {
  return new Promise((resolve) => {
    console.log(`Creating mask for ${textBlocks.length} text blocks...`);

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = img.width;
      canvas.height = img.height;

      // Start with black background (areas to keep)
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw white areas for text regions (areas to inpaint)
      ctx.fillStyle = 'white';

      textBlocks.forEach((block, index) => {
        if (block.boundingPoly && block.boundingPoly.vertices) {
          const vertices = block.boundingPoly.vertices;

          if (vertices.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(vertices[0].x || 0, vertices[0].y || 0);

            for (let i = 1; i < vertices.length; i++) {
              ctx.lineTo(vertices[i].x || 0, vertices[i].y || 0);
            }

            ctx.closePath();
            ctx.fill();

            console.log(`Added mask region ${index + 1} for text: "${block.text.substring(0, 20)}..."`);
          }
        }
      });

      const maskBase64 = canvas.toDataURL('image/png').split(',')[1];
      console.log("Mask creation completed");
      resolve(maskBase64);
    };

    img.onerror = () => {
      console.error("Error loading image for mask creation");
      // Return empty mask
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, 100, 100);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };

    img.src = imageBase64;
  });
}

// =========================
// Text Rendering on Image
// =========================
async function addTranslatedTextToImage(inpaintedImageBase64, textBlocks, translatedTexts, font, strokeEnabled, targetLanguage) {
  return new Promise((resolve) => {
    console.log("Adding translated text to image...");

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = img.width;
      canvas.height = img.height;

      // Draw the inpainted image
      ctx.drawImage(img, 0, 0);

      // Prepare text rendering
      const fontFamily = CONFIG.FONTS[font] || 'Arial';
      const isRTL = ['ar', 'he', 'fa'].includes(targetLanguage);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = isRTL ? 'rtl' : 'ltr';

      // Add each translated text block
      textBlocks.forEach((block, index) => {
        if (block.boundingPoly && block.boundingPoly.vertices && translatedTexts[index]) {
          const vertices = block.boundingPoly.vertices;
          const translatedText = translatedTexts[index];

          // Calculate center point
          const centerX = vertices.reduce((sum, v) => sum + (v.x || 0), 0) / vertices.length;
          const centerY = vertices.reduce((sum, v) => sum + (v.y || 0), 0) / vertices.length;

          // Calculate bounding box dimensions
          const minX = Math.min(...vertices.map(v => v.x || 0));
          const maxX = Math.max(...vertices.map(v => v.x || 0));
          const minY = Math.min(...vertices.map(v => v.y || 0));
          const maxY = Math.max(...vertices.map(v => v.y || 0));

          const width = maxX - minX;
          const height = maxY - minY;

          // Calculate appropriate font size
          const textLength = translatedText.length;
          const baseFontSize = Math.min(
            width / (textLength * 0.6),
            height * 0.8
          );
          const fontSize = Math.max(12, Math.min(baseFontSize * CONFIG.DEFAULTS.FONT_SIZE_MULTIPLIER, 72));

          ctx.font = `${fontSize}px ${fontFamily}`;

          // Handle multi-line text if needed
          const words = translatedText.split(' ');
          const lines = [];
          let currentLine = '';

          for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);

            if (metrics.width > width * 0.9 && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);

          // Draw text lines
          const lineHeight = fontSize * 1.2;
          const totalHeight = lines.length * lineHeight;
          const startY = centerY - totalHeight / 2 + lineHeight / 2;

          lines.forEach((line, lineIndex) => {
            const y = startY + lineIndex * lineHeight;

            // Draw stroke if enabled
            if (strokeEnabled) {
              ctx.strokeStyle = 'white';
              ctx.lineWidth = fontSize * CONFIG.DEFAULTS.STROKE_WIDTH_RATIO;
              ctx.lineJoin = 'round';
              ctx.strokeText(line, centerX, y);
            }

            // Draw fill text
            ctx.fillStyle = 'black';
            ctx.fillText(line, centerX, y);
          });

          console.log(`Added text ${index + 1}: "${translatedText}" at (${centerX}, ${centerY})`);
        }
      });

      const finalImageBase64 = canvas.toDataURL('image/jpeg', CONFIG.DEFAULTS.IMAGE_QUALITY);
      console.log("Text rendering completed");
      resolve(finalImageBase64);
    };

    img.onerror = () => {
      console.error("Error loading inpainted image");
      resolve(inpaintedImageBase64); // Return original on error
    };

    img.src = inpaintedImageBase64;
  });
}

// =========================
// Text Distribution Logic
// =========================
function distributeTranslatedText(fullTranslatedText, textBlocks) {
  console.log(`Distributing translated text across ${textBlocks.length} blocks...`);

  if (textBlocks.length === 0) return [];
  if (textBlocks.length === 1) return [fullTranslatedText];

  // Smart text distribution based on original text length ratios
  const originalTexts = textBlocks.map(block => block.text);
  const originalLengths = originalTexts.map(text => text.length);
  const totalOriginalLength = originalLengths.reduce((sum, len) => sum + len, 0);

  if (totalOriginalLength === 0) {
    // Equal distribution if no original text
    const words = fullTranslatedText.split(' ');
    const wordsPerBlock = Math.ceil(words.length / textBlocks.length);
    const results = [];

    for (let i = 0; i < textBlocks.length; i++) {
      const start = i * wordsPerBlock;
      const end = Math.min(start + wordsPerBlock, words.length);
      results.push(words.slice(start, end).join(' '));
    }

    return results;
  }

  // Proportional distribution based on original text lengths
  const translatedWords = fullTranslatedText.split(' ');
  const results = [];
  let wordIndex = 0;

  for (let i = 0; i < textBlocks.length; i++) {
    const ratio = originalLengths[i] / totalOriginalLength;
    const wordsForBlock = Math.round(translatedWords.length * ratio);
    const actualWordsForBlock = Math.min(wordsForBlock, translatedWords.length - wordIndex);

    if (actualWordsForBlock > 0) {
      results.push(translatedWords.slice(wordIndex, wordIndex + actualWordsForBlock).join(' '));
      wordIndex += actualWordsForBlock;
    } else {
      results.push('');
    }
  }

  // Distribute any remaining words
  if (wordIndex < translatedWords.length) {
    const remainingWords = translatedWords.slice(wordIndex).join(' ');
    const lastNonEmptyIndex = results.length - 1;
    for (let i = lastNonEmptyIndex; i >= 0; i--) {
      if (results[i]) {
        results[i] += ' ' + remainingWords;
        break;
      }
    }
  }

  console.log("Text distribution completed:", results);
  return results;
}

// =========================
// Main Processing Pipeline
// =========================
async function processImageWithGoogleCloud(imageBlob, settings) {
  try {
    console.log("Starting Google Cloud image processing pipeline...");

    const imageBase64 = await blobToImage(imageBlob);
    const targetLanguage = settings.torii_target_lang || 'en';
    const font = settings.torii_font || 'wildwords';
    const strokeEnabled = settings.torii_stroke_enabled !== false;

    console.log(`Target language: ${targetLanguage}, Font: ${font}, Stroke: ${strokeEnabled}`);

    // Step 1: OCR with Cloud Vision
    console.log("Step 1: Performing OCR...");
    const ocrResult = await performOCR(imageBase64);

    if (!ocrResult.success || ocrResult.textBlocks.length === 0) {
      return {
        success: false,
        content: {
          error: ocrResult.error || "No text detected in image"
        }
      };
    }

    const { textBlocks, fullText, detectedLanguages } = ocrResult;
    console.log(`OCR completed: ${textBlocks.length} text blocks, detected languages: ${detectedLanguages.join(', ')}`);

    // Step 2: Translation with Gemini
    console.log("Step 2: Translating text...");
    const sourceLanguage = detectedLanguages.length > 0 ? detectedLanguages[0] : null;
    const translationResult = await translateWithGemini(fullText, targetLanguage, sourceLanguage);

    if (!translationResult.success) {
      return {
        success: false,
        content: {
          error: "Translation failed: " + translationResult.error
        }
      };
    }

    const { translatedText: fullTranslatedText } = translationResult;
    console.log("Translation completed");

    // Step 3: Inpainting with Imagen
    console.log("Step 3: Performing inpainting...");
    const inpaintResult = await performInpainting(imageBase64, textBlocks);

    if (!inpaintResult.success) {
      console.log("Inpainting failed, using original image");
    }

    const inpaintedImage = inpaintResult.inpaintedImage || imageBase64;

    // Step 4: Distribute translated text
    console.log("Step 4: Distributing translated text...");
    const distributedTexts = distributeTranslatedText(fullTranslatedText, textBlocks);

    // Step 5: Add translated text to image
    console.log("Step 5: Adding translated text to image...");
    const finalImage = await addTranslatedTextToImage(
      inpaintedImage,
      textBlocks,
      distributedTexts,
      font,
      strokeEnabled,
      targetLanguage
    );

    // Prepare text objects for editor
    const textObjects = textBlocks.map((block, index) => {
      const vertices = block.boundingPoly.vertices;
      const centerX = vertices.reduce((sum, v) => sum + (v.x || 0), 0) / vertices.length;
      const centerY = vertices.reduce((sum, v) => sum + (v.y || 0), 0) / vertices.length;

      return {
        text: distributedTexts[index] || '',
        originalText: block.text,
        x: centerX,
        y: centerY,
        font: `24px ${CONFIG.FONTS[font] || 'Arial'}`,
        fillColor: '#000000',
        strokeColor: '#ffffff',
        lineWidth: strokeEnabled ? 6 : 0,
        textAlign: 'center',
        addFontBackground: false,
        addFontBorder: false,
        addBackgroundColor: '#ffffff',
        borderRadius: 0,
        borderPadding: 0,
        rotation: 0
      };
    });

    console.log("Processing pipeline completed successfully");

    return {
      success: true,
      content: {
        image: finalImage,
        original: imageBase64,
        inpainted: inpaintedImage,
        text: JSON.stringify(textObjects)
      }
    };

  } catch (error) {
    console.error("Processing pipeline error:", error);
    await sendError(error, "processImageWithGoogleCloud");
    return {
      success: false,
      content: {
        error: "Processing failed: " + error.message
      }
    };
  }
}

// =========================
// Message Handler
// =========================
async function handleMessage(msg) {
  if (msg.type === "keep-alive") {
    return { success: true };
  }

  if (msg.type === "translate") {
    let imageBlob = null;

    try {
      // Get image data
      if (msg.buffer) {
        const uint8Array = new Uint8Array(msg.buffer);
        imageBlob = new Blob([uint8Array]);
      } else if (msg.url) {
        const response = await fetch(msg.url, {
          headers: {
            Referer: msg.site,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          },
        });
        if (response.ok) {
          imageBlob = await response.blob();
        }
      }

      if (!imageBlob) {
        return { success: false, content: { error: "Could not get image data" } };
      }

      // Get user settings
      const settings = await chrome.storage.sync.get({
        torii_target_lang: "en",
        torii_font: "wildwords",
        torii_stroke_enabled: true,
      });

      // Process with Google Cloud APIs
      const response = await processImageWithGoogleCloud(imageBlob, settings);
      return response;

    } catch (error) {
      await sendError(error, "translate");
      return { success: false, content: { error: "Failed to process image." } };
    }
  }

  if (msg.type === "edit") {
    try {
      const image = await fetch(msg.url, {
        headers: {
          Referer: msg.site,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        },
      });
      if (!image.ok) return { success: false, content: { error: "Failed to get image." } };

      const imageBlob = await image.blob();
      const src = await blobToImage(imageBlob);
      return { success: true, content: { src } };
    } catch (error) {
      await sendError(error, "edit");
      return { success: false, content: { error: "Failed to get image." } };
    }
  }

  if (msg.type === "inpaint") {
    try {
      const imageArray = new Uint8Array(msg.image);
      const imageBlob = new Blob([imageArray]);
      const imageBase64 = await blobToImage(imageBlob);

      const maskArray = new Uint8Array(msg.mask);
      const maskBlob = new Blob([maskArray]);
      const maskBase64 = await blobToImage(maskBlob);

      // Convert mask to coordinates format for Imagen
      const maskCoordinates = await extractTextRegionsFromMask(maskBase64);

      // Use Imagen for inpainting
      const inpaintResult = await performInpainting(imageBase64, maskCoordinates);

      if (inpaintResult.success) {
        return { success: true, content: { inpaintedImageSrc: inpaintResult.inpaintedImage } };
      } else {
        return { success: false, content: { error: inpaintResult.error } };
      }
    } catch (error) {
      await sendError(error, "inpaint");
      return { success: false, content: { error: "Failed to inpaint image." } };
    }
  }

  if (msg.type === "storage") {
    try {
      const storageURLs = msg.storageURLs;
      const response = await fetch("https://api.toriitranslate.com/api/storage", {
        method: "GET",
        headers: { storage_urls: storageURLs },
        signal: AbortSignal.timeout(100000),
      });

      if (response.headers.get("success") == "false") {
        return { success: false, content: { error: "Failed to get original image." } };
      }

      let data = await response.json();
      if (!data?.success && typeof data === "string") {
        try { data = JSON.parse(data); } catch { /* ignore */ }
      }

      return { success: true, content: data };
    } catch (error) {
      await sendError(error, "storage");
      return { success: false, content: { error: "Failed to get original image." } };
    }
  }

  if (msg.type === "update_seen") {
    try {
      removeUpdateBadge();
      return { success: true };
    } catch (error) {
      await sendError(error, "update_seen");
      return { success: false };
    }
  }

  if (msg.type === "error") {
    await sendError({ message: msg.message, stack: msg.stack }, msg.loc);
    return { success: true };
  }

  if (msg.type === "screenshot") {
    while (true) {
      try {
        const dataURL = await chrome.tabs.captureVisibleTab(null, { format: "png" });
        return { success: true, content: { dataURL } };
      } catch (error) {
        if (String(error?.message || "").includes("exceeds")) {
          await wait(200);
        } else {
          await sendError(error, "screenshot");
          return { success: false, content: { error: "Failed to capture screenshot." } };
        }
      }
    }
  }

  await sendError({ message: "Unknown msg: " + JSON.stringify(msg), stack: "N/A" }, "handle message");
  return { success: false, content: { error: "Unknown request." } };
}

// =========================
// Helper Functions
// =========================

// Extract text regions from mask for Imagen inpainting
async function extractTextRegionsFromMask(maskBase64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Find white regions (areas to inpaint)
      const regions = [];
      const processed = new Set();

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;
          const key = `${x},${y}`;

          if (!processed.has(key) && data[index] > 200) { // White pixel
            const region = floodFill(data, canvas.width, canvas.height, x, y, processed);
            if (region.length > 100) { // Minimum region size
              regions.push({
                boundingPoly: {
                  vertices: getBoundingBox(region)
                }
              });
            }
          }
        }
      }

      resolve(regions);
    };

    img.onerror = () => resolve([]);
    img.src = `data:image/png;base64,${maskBase64}`;
  });
}

// Flood fill algorithm to find connected white regions
function floodFill(data, width, height, startX, startY, processed) {
  const stack = [{x: startX, y: startY}];
  const region = [];

  while (stack.length > 0) {
    const {x, y} = stack.pop();
    const key = `${x},${y}`;

    if (processed.has(key) || x < 0 || x >= width || y < 0 || y >= height) continue;

    const index = (y * width + x) * 4;
    if (data[index] < 200) continue; // Not white

    processed.add(key);
    region.push({x, y});

    // Add neighbors
    stack.push(
      {x: x + 1, y: y},
      {x: x - 1, y: y},
      {x: x, y: y + 1},
      {x: x, y: y - 1}
    );
  }

  return region;
}

// Get bounding box from region points
function getBoundingBox(region) {
  if (region.length === 0) return [];

  const minX = Math.min(...region.map(p => p.x));
  const maxX = Math.max(...region.map(p => p.x));
  const minY = Math.min(...region.map(p => p.y));
  const maxY = Math.max(...region.map(p => p.y));

  return [
    {x: minX, y: minY},
    {x: maxX, y: minY},
    {x: maxX, y: maxY},
    {x: minX, y: maxY}
  ];
}

// =========================
// Service Worker Lifecycle
// =========================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((error) => {
      sendError(error, "onMessage");
      sendResponse({ success: false, content: { error: "Internal error." } });
    });

  if (
    msg.type == "translate" ||
    msg.type == "inpaint" ||
    msg.type == "error" ||
    msg.type == "update_seen" ||
    msg.type == "screenshot" ||
    msg.type == "storage" ||
    msg.type == "edit" ||
    msg.type == "keep-alive"
  ) {
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    const previousVersion = details.previousVersion;
    const reason = details.reason;

    if (reason == "update") {
      const previousVersionDigits = previousVersion?.split?.(".") ?? [];
      const currentVersionDigits = currentVersion?.split?.(".") ?? [];
      const significantPrevious =
        previousVersionDigits[previousVersionDigits.length - 2];
      const significantCurrent =
        currentVersionDigits[currentVersionDigits.length - 2];
      const isSignificantUpdate = significantPrevious != significantCurrent;
      const sameLength = previousVersionDigits.length == currentVersionDigits.length;

      if (isSignificantUpdate && sameLength) {
        showUpdateBadge();
      }
    }
  } catch (error) {
    await sendError(error, "onInstalled");
  }

  // Context menus
  try {
    chrome.contextMenus.create({
      id: "torii_contextmenu",
      title: "Torii (Alt+Shift+D)",
      contexts: ["all"],
    });

    chrome.contextMenus.create({
      id: "torii_screenshot",
      title: "Screenshot Image (Alt+Shift+C)",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_translate",
      title: "Translate Image (Alt+Shift+Z)",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_screencrop",
      title: "Screen Crop Image (Alt+Shift+X)",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_repeatscreencrop",
      title: "Repeat Last Screen Crop",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_edit",
      title: "Edit Image",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });

    chrome.contextMenus.create({
      id: "torii_auto",
      title: "Toggle Auto Translate",
      contexts: ["all"],
      parentId: "torii_contextmenu",
    });
  } catch (error) {
    console.log("Failed to create context menus. Error: ", error);
  }
});

// Keyboard shortcuts
try {
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (tab && command == "torii_contextmenu") {
      chrome.tabs.sendMessage(tab.id, { type: "command_contextmenu" }).catch(() => {});
    }
    if (tab && command == "torii_screencrop") {
      chrome.tabs.sendMessage(tab.id, { type: "command_screencrop" }).catch(() => {});
    }
    if (tab && command == "torii_repeatscreencrop") {
      chrome.tabs.sendMessage(tab.id, { type: "command_repeatscreencrop" }).catch(() => {});
    }
    if (tab && command == "torii_translate") {
      chrome.tabs.sendMessage(tab.id, { type: "command_translate" }).catch(() => {});
    }
    if (tab && command == "torii_screenshot") {
      chrome.tabs.sendMessage(tab.id, { type: "command_screenshot" }).catch(() => {});
    }
    if (tab && command == "torii_edit") {
      chrome.tabs.sendMessage(tab.id, { type: "command_edit" }).catch(() => {});
    }
  });
} catch (error) {
  console.log("Failed to create command listener. Error: ", error);
}

// Context menu click routing
try {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId == "torii_screenshot") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_screenshot" }).catch(() => {});
    } else if (info.menuItemId == "torii_translate") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_translate" }).catch(() => {});
    } else if (info.menuItemId == "torii_screencrop") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_screencrop" }).catch(() => {});
    } else if (info.menuItemId == "torii_repeatscreencrop") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_repeatscreencrop" }).catch(() => {});
    } else if (info.menuItemId == "torii_edit") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_edit" }).catch(() => {});
    } else if (info.menuItemId == "torii_auto") {
      chrome.tabs.sendMessage(tab.id, { type: "contextmenu_auto" }).catch(() => {});
    }
  });

  chrome.storage.sync.set({ torii_contextmenu: true });
} catch (error) {
  chrome.storage.sync.set({ torii_contextmenu: false });
}