/**
 * AI Summarizer Client for YouTube AI Q&A Assistant
 * Uses Chrome's built-in Summarizer API to generate video summaries
 */

class SummarizerClient {
  constructor() {
    this.summarizer = null;
    this.initialized = false;
    this.currentSummary = null;
    this.currentSummaryTimeRange = { start: -1, end: -1 }; // Time range of current summary in seconds
    this.summaryType = 'key-points';
    this.summaryFormat = 'plain-text';
    this.summaryLength = 'long';
  }

  /**
   * Initialize the Summarizer API
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      // Check if Summarizer API is available
      const availability = await Summarizer.availability();
      console.log('Summarizer API availability:', availability);
      
      if (availability === 'no') {
        console.warn('Summarizer API not available');
        return false;
      }

      // Create summarizer instance
      const options = {
        sharedContext: 'This is a YouTube video transcript',
        type: this.summaryType,
        format: this.summaryFormat,
        length: this.summaryLength,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            console.log(`Summarizer download progress: ${e.loaded * 100}%`);
          });
        }
      };

      this.summarizer = await Summarizer.create(options);
      this.initialized = true;
      console.log('Summarizer initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Summarizer:', error);
      return false;
    }
  }

  /**
   * Get summary for a given transcript and time window
   * @param {string} transcriptText - Transcript text to summarize
   * @param {number} windowStart - Start time of the window in seconds
   * @param {number} windowEnd - End time of the window in seconds
   * @returns {Promise<string>} Video summary for the time window
   */
  async getSummaryForTime(transcriptText, windowStart, windowEnd) {
    if (!this.initialized || !this.summarizer) {
      console.warn('Summarizer not initialized');
      return '';
    }

    // Check if current summary covers this time range
    const halfWindow = (windowEnd - windowStart)/2;
    if (this.currentSummary && 
        halfWindow <= this.currentSummaryTimeRange.end) {
      console.log(`Using cached summary for window ${windowStart}-${windowEnd}s`);
      return this.currentSummary;
    }

    // Need to generate new summary
    console.log(`Generating new summary for window ${windowStart}-${windowEnd}s`);
    
    try {
      if (!transcriptText || transcriptText.trim().length === 0) {
        console.warn('No transcript available for summary generation');
        return '';
      }

      console.log(`Summarizing transcript (${transcriptText.length} chars)`);

      // Generate summary
      const summary = await this.summarizer.summarize(transcriptText);
      
      console.log('Generated summary:', summary);

      // Cache the summary and its time range
      this.currentSummary = summary;
      this.currentSummaryTimeRange = {
        start: windowStart,
        end: windowEnd
      };

      return summary;
    } catch (error) {
      console.error('Failed to generate summary:', error);
      return '';
    }
  }

  /**
   * Clear cached summary (useful when video changes or seeking)
   */
  clearCache() {
    this.currentSummary = null;
    this.currentSummaryTimeRange = { start: -1, end: -1 };
    console.log('Summary cache cleared');
  }

  /**
   * Check if a given time is within the current summary window
   * @param {number} time - Time in seconds
   * @returns {boolean} True if time is covered by current summary
   */
  isTimeInCurrentWindow(time) {
    return this.currentSummary !== null &&
           time >= this.currentSummaryTimeRange.start &&
           time <= this.currentSummaryTimeRange.end;
  }

  /**
   * Destroy the summarizer and clean up resources
   */
  async destroy() {
    if (this.summarizer) {
      try {
        // Note: Summarizer API might not have a destroy method
        // but we'll try to clean up if it does
        if (typeof this.summarizer.destroy === 'function') {
          await this.summarizer.destroy();
        }
      } catch (error) {
        console.warn('Error destroying summarizer:', error);
      }
      this.summarizer = null;
    }
    this.clearCache();
    this.initialized = false;
  }
}

// Export for use in other modules
window.SummarizerClient = SummarizerClient;

