/**
 * AI Translator Client for YouTube AI Q&A Assistant
 * Uses Chrome's built-in Translator API to translate subtitles to English
 */

class TranslatorClient {
  constructor() {
    this.translators = new Map(); // Cache translators by source language
    this.initialized = false;
  }

  /**
   * Check if the Translator API is available
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      // Check if Translator API is available in the browser
      if (!('Translator' in self)) {
        console.warn('Translator API not available in this browser');
        return false;
      }

      console.log('Translator API is available');
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize Translator:', error);
      return false;
    }
  }

  /**
   * Check if a language pair is supported for translation
   * @param {string} sourceLanguage - Source language code (e.g., 'es', 'fr')
   * @param {string} targetLanguage - Target language code (e.g., 'en')
   * @returns {Promise<string>} Availability status: 'available', 'downloadable', 'no'
   */
  async checkLanguagePairSupport(sourceLanguage, targetLanguage = 'en') {
    if (!this.initialized) {
      console.warn('Translator not initialized');
      return 'no';
    }

    try {
      const availability = await Translator.availability({
        sourceLanguage,
        targetLanguage,
      });

      console.log(`Language pair ${sourceLanguage} -> ${targetLanguage} availability:`, availability);
      return availability;
    } catch (error) {
      console.error('Failed to check language pair support:', error);
      return 'no';
    }
  }

  /**
   * Create a translator for a specific language pair
   * @param {string} sourceLanguage - Source language code (e.g., 'es', 'fr')
   * @param {string} targetLanguage - Target language code (default: 'en')
   * @param {Function} onProgress - Optional callback for download progress
   * @returns {Promise<Object|null>} Translator instance or null
   */
  async createTranslator(sourceLanguage, targetLanguage = 'en', onProgress = null) {
    if (!this.initialized) {
      console.warn('Translator not initialized');
      return null;
    }

    try {
      // Check if we already have a translator for this language pair
      const cacheKey = `${sourceLanguage}-${targetLanguage}`;
      if (this.translators.has(cacheKey)) {
        console.log(`Using cached translator for ${cacheKey}`);
        return this.translators.get(cacheKey);
      }

      // Check if language pair is supported
      const availability = await this.checkLanguagePairSupport(sourceLanguage, targetLanguage);
      if (availability === 'no') {
        console.warn(`Translation from ${sourceLanguage} to ${targetLanguage} is not supported`);
        return null;
      }

      console.log(`Creating translator for ${sourceLanguage} -> ${targetLanguage}`);

      // Create translator with download progress monitoring
      const translatorOptions = {
        sourceLanguage,
        targetLanguage,
      };

      // Add monitor for download progress if callback provided
      if (onProgress) {
        translatorOptions.monitor = (m) => {
          m.addEventListener('downloadprogress', (e) => {
            const progress = Math.round(e.loaded * 100);
            console.log(`Translator download progress: ${progress}%`);
            onProgress(progress);
          });
        };
      } else {
        // Default progress logging
        translatorOptions.monitor = (m) => {
          m.addEventListener('downloadprogress', (e) => {
            console.log(`Translator download progress: ${Math.round(e.loaded * 100)}%`);
          });
        };
      }

      const translator = await Translator.create(translatorOptions);

      // Cache the translator for reuse
      this.translators.set(cacheKey, translator);
      console.log(`Translator created and cached for ${cacheKey}`);

      return translator;
    } catch (error) {
      console.error(`Failed to create translator for ${sourceLanguage} -> ${targetLanguage}:`, error);
      return null;
    }
  }

  /**
   * Translate text from source language to target language
   * @param {string} text - Text to translate
   * @param {string} sourceLanguage - Source language code (e.g., 'es', 'fr')
   * @param {string} targetLanguage - Target language code (default: 'en')
   * @returns {Promise<string>} Translated text or empty string if failed
   */
  async translate(text, sourceLanguage, targetLanguage = 'en') {
    if (!this.initialized) {
      console.warn('Translator not initialized');
      return '';
    }

    if (!text || text.trim().length === 0) {
      return '';
    }

    try {
      // Get or create translator
      const translator = await this.createTranslator(sourceLanguage, targetLanguage);
      if (!translator) {
        console.warn('Could not create translator');
        return '';
      }

      console.log(`Translating text (${text.length} chars) from ${sourceLanguage} to ${targetLanguage}`);
      const translatedText = await translator.translate(text);
      console.log(`Translation complete (${translatedText.length} chars)`);

      return translatedText;
    } catch (error) {
      console.error('Translation failed:', error);
      return '';
    }
  }

  /**
   * Detect if text needs translation (checks if it's already in English)
   * This is a simple heuristic - you may want to use Language Detector API for more accuracy
   * @param {string} languageCode - Language code from subtitles
   * @returns {boolean} True if translation to English is needed
   */
  needsTranslation(languageCode) {
    // English variants that don't need translation
    const englishCodes = ['en', 'en-US', 'en-GB', 'en-CA', 'en-AU', 'en-NZ'];
    return !englishCodes.some(code => languageCode.startsWith(code));
  }

  /**
   * Clear cached translators (forces re-download of language models)
   */
  clearTranslators() {
    this.translators.clear();
    console.log('Translator cache cleared');
  }

  /**
   * Get translator statistics for debugging
   * @returns {Object} Translator statistics
   */
  getStats() {
    return {
      translators: {
        count: this.translators.size,
        languages: Array.from(this.translators.keys())
      }
    };
  }

  /**
   * Destroy all translators and clean up resources
   */
  async destroy() {
    // Clear all translators
    this.translators.clear();
    
    this.initialized = false;
    console.log('Translator client destroyed');
  }
}

// Export for use in other modules
window.TranslatorClient = TranslatorClient;

