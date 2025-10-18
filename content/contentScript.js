/*
 * Main Content Script for YouTube AI Q&A Assistant
 * Orchestrates the caption parsing, AI question generation, and UI overlay
 */

class YouTubeAIAssistant {
  constructor() {
    this.promptClient = null;
    this.summarizerClient = null;
    this.subtitleParser = null;
    this.uiOverlay = null;
    this.updateInterval = null;
    this.isInitialized = false;
    this.isRunning = false;
    this.lastTriggerTime = 0; // Last video time when we triggered questions
    this.videoElement = null;
    this.questionGenerationInterval = 30; // How often to generate questions
    this.transcriptBufferAhead = 30; // Buffer transcript 30 seconds ahead of current time
    this.summaryBuffer = 150; // Buffer summary 2.5 minutes ahead and behind of current time
  }

  /**
   * Initialize the assistant
   */
  async initialize() {
    try {
      console.log('Initializing YouTube AI Q&A Assistant...');

      // Create component instances
      this.promptClient = new PromptClient();
      this.summarizerClient = new SummarizerClient();
      this.subtitleParser = new SubtitleParser();
      this.uiOverlay = new UIOverlay();

      // Initialize AI client first
      const aiInitialized = await this.promptClient.initialize();
      if (!aiInitialized) {
        console.error('Failed to initialize AI client');
        this.uiOverlay.showError('AI not available. Please ensure Chrome Built-in AI features are enabled.');
        return false;
      }

      // Initialize summarizer client
      const summarizerInitialized = await this.summarizerClient.initialize();
      if (!summarizerInitialized) {
        console.warn('Summarizer API not available - will generate questions without video summary');
      }

      // Initialize subtitle parser
      const subtitlesInitialized = await this.subtitleParser.initialize();
      if (!subtitlesInitialized) {
        console.warn('No captions available for this video');
        this.uiOverlay.showError('No captions available for this video');
        return false;
      }

      // Initialize UI overlay
      const uiInitialized = await this.uiOverlay.initialize((question, index) => {
        this.handleQuestionClick(question, index);
      });

      if (!uiInitialized) {
        console.error('Failed to initialize UI overlay');
        return false;
      }

      this.isInitialized = true;
      console.log('YouTube AI Assistant initialized successfully');

      // Start the question generation loop
      this.startQuestionLoop();

      return true;
    } catch (error) {
      console.error('Failed to initialize YouTube AI Assistant:', error);
      return false;
    }
  }

  /**
   * Start the video-time based question generation
   */
  startQuestionLoop() {
    if (this.isRunning) {
      console.warn('Question loop already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting question generation (every ${this.questionGenerationInterval} seconds of video time)`);

    // Find video element
    this.videoElement = document.querySelector('video');
    if (!this.videoElement) {
      console.warn('No video element found');
      return;
    }

    // Initial update (only if AI is enabled)
    if (this.uiOverlay.isAIEnabled()) {
      this.updateQuestions();
    }

    // Listen for video time updates
    this.videoElement.addEventListener('timeupdate', this.handleVideoTimeUpdate.bind(this));

    // Set up AI toggle callback
    this.setupAIToggleCallback();
  }

  /**
   * Handle video time updates to trigger questions at the questionGenerationInterval intervals
   */
  handleVideoTimeUpdate() {
    if (!this.isRunning || !this.videoElement || this.videoElement.paused) {
      return;
    }

    // Check if AI is enabled before generating questions
    if (!this.uiOverlay.isAIEnabled()) {
      return;
    }

    const currentTime = Math.floor(this.videoElement.currentTime);

    // Trigger every 60 seconds of video time
    if (currentTime > 0 && currentTime % this.questionGenerationInterval === 0 && currentTime !== this.lastTriggerTime) {
      console.log(`Video reached ${currentTime}s - generating questions`);
      this.lastTriggerTime = currentTime;
      this.updateQuestions();
    }
  }


  /**
   * Set up AI toggle callback to handle enable/disable
   */
  setupAIToggleCallback() {
    window.aiToggleCallback = (enabled) => {
      if (enabled) {
        console.log('AI Questions enabled - resuming generation');
        // If enabling and video is playing, generate questions immediately
        if (this.videoElement && !this.videoElement.paused && this.isRunning) {
          this.updateQuestions();
        }
      } else {
        console.log('AI Questions disabled - stopping generation');
        // Hide any current questions
        this.uiOverlay.hide();
      }
    };
  }

  /**
   * Stop the question generation loop
   */
  stopQuestionLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.videoElement) {
      this.videoElement.removeEventListener('timeupdate', this.handleVideoTimeUpdate.bind(this));
    }

    this.isRunning = false;
    this.lastTriggerTime = 0;
    console.log('Stopped question generation loop');
  }

  /**
   * Update questions by fetching transcript and generating AI questions
   */
  async updateQuestions() {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Get buffered transcript chunk to account for AI generation delay
      // Include past content + future buffer so questions are still relevant when ready
      const currentTime = this.videoElement.currentTime;
      const transcript = await this.subtitleParser.getTranscriptChunk(
        currentTime,
        currentTime + this.transcriptBufferAhead,
      );
      console.log('Transcript:', transcript);

      if (!transcript || transcript.trim().length === 0) {
        console.warn('No transcript available');
        // Hide for now
        // this.uiOverlay.showError('No transcript available');
        return;
      }

      console.log('Got transcript chunk:', transcript.substring(0, 100) + '...');

      // Get video summary for current time (5-minute window)
      let videoSummary = '';
      if (this.summarizerClient && this.summarizerClient.initialized && this.videoElement) {
        const summaryStartTime = currentTime - this.summaryBuffer;
        const summaryEndTime = currentTime + this.summaryBuffer;
        const text = await this.subtitleParser.getTranscriptChunk(
          summaryStartTime,
          summaryEndTime,
        );
        videoSummary = await this.summarizerClient.getSummaryForTime(text, summaryStartTime, summaryEndTime);
        console.log('Got video summary:', videoSummary.substring(0, 100) + (videoSummary.length > 100 ? '...' : ''));
      }

      // Generate questions using AI (with video summary context)
      const questions = await this.promptClient.generateQuestions(transcript, videoSummary);

      console.log('Generated questions:', questions);

      // Store questions with timing information
      const questionData = questions.map(q => ({
        text: q,
        startTime: currentTime,
        endTime: currentTime + this.transcriptBufferAhead
      }));

      // Update the UI with questions and timing
      this.uiOverlay.updateQuestions(questionData, currentTime);

    } catch (error) {
      console.error('Failed to update questions:', error);
      this.uiOverlay.showError('Failed to generate questions');
    }
  }

  /**
   * Handle question click events
   * @param {string} question - The clicked question
   * @param {number} index - Question index
   * @param {number} startTime - Start time of the question's context
   * @param {number} endTime - End time of the question's context
   */
  async handleQuestionClick(question, index, startTime, endTime) {
    console.log(`Question clicked: "${question}" (index: ${index}), Time range: ${startTime}-${endTime}`);

    if (!this.isInitialized || !this.promptClient || !this.uiOverlay) {
      console.warn('Cannot handle question click - not initialized');
      return;
    }

    try {
      // Show chatbox with loading state
      this.uiOverlay.showChatbox(question);

      // Get video summary for the question's time range
      let videoSummary = '';
      if (this.summarizerClient && this.summarizerClient.initialized) {
        // Use the question's time range to get relevant context
        const summaryStartTime = startTime - this.summaryBuffer;
        const summaryEndTime = endTime + this.summaryBuffer;
        const text = await this.subtitleParser.getTranscriptChunk(
          summaryStartTime,
          summaryEndTime,
        );
        videoSummary = await this.summarizerClient.getSummaryForTime(text, summaryStartTime, summaryEndTime);
        console.log('Got video summary for time range:', videoSummary.substring(0, 100) + (videoSummary.length > 100 ? '...' : ''));
      }

      // Get transcript for the question's specific time range
      const transcriptContext = await this.subtitleParser.getTranscriptChunk(startTime, endTime);
      console.log('Got transcript context:', transcriptContext.substring(0, 100) + (transcriptContext.length > 100 ? '...' : ''));

      // Generate answer with streaming
      console.log('Starting answer generation with streaming...');
      let fullAnswer = '';
      await this.promptClient.generateAnswer(
        question,
        videoSummary,
        (chunk) => {
          // Update UI with each streamed chunk
          fullAnswer += chunk;
          this.uiOverlay.updateChatboxContent(fullAnswer);
        }
      );

      // Mark streaming as complete
      this.uiOverlay.finishStreaming();
      console.log('Answer generation complete');

    } catch (error) {
      console.error('Failed to generate answer:', error);
      this.uiOverlay.updateChatboxContent('Sorry, I encountered an error generating the answer.');
      this.uiOverlay.finishStreaming();
    }
  }

  /**
   * Handle video navigation (when user seeks or changes video)
   */
  handleVideoNavigation() {
    if (!this.isInitialized) return;

    console.log('Video navigation detected, refreshing...');

    // Reset video-time tracking for new video
    this.lastTriggerTime = 0;

    // Clear summarizer cache for new video
    if (this.summarizerClient) {
      this.summarizerClient.clearCache();
    }

    // Refresh subtitle parser for new video
    this.subtitleParser.refreshTracks();

    // Restart question loop for new video
    this.stopQuestionLoop();
    this.startQuestionLoop();
  }

  /**
   * Check if we're on a YouTube watch page
   * @returns {boolean} True if on a watch page
   */
  static isYouTubeWatchPage() {
    return window.location.pathname === '/watch' &&
           window.location.search.includes('v=');
  }

  /**
   * Clean up resources
   */
  destroy() {
    console.log('Cleaning up YouTube AI Assistant...');

    this.stopQuestionLoop();

    if (this.promptClient) {
      this.promptClient.destroy();
    }

    if (this.summarizerClient) {
      this.summarizerClient.destroy();
    }

    if (this.uiOverlay) {
      this.uiOverlay.destroy();
    }

    this.isInitialized = false;
    this.isRunning = false;
  }
}

// Global instance
let assistant = null;

/**
 * Initialize the assistant when the page loads
 */
async function initializeAssistant() {
  // Only run on YouTube watch pages
  if (!YouTubeAIAssistant.isYouTubeWatchPage()) {
    console.log('Not on YouTube watch page, skipping initialization');
    return;
  }

  // Clean up any existing instance
  if (assistant) {
    assistant.destroy();
  }

  // Create new instance
  assistant = new YouTubeAIAssistant();

  // Initialize
  const success = await assistant.initialize();
  if (!success) {
    console.error('Failed to initialize YouTube AI Assistant');
  }
}

/**
 * Handle page navigation (YouTube uses SPA navigation)
 */
function handleNavigation() {
  // YouTube uses history API for navigation
  let currentUrl = window.location.href;

  const checkUrlChange = () => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;

      // If we're on a new watch page, reinitialize
      if (YouTubeAIAssistant.isYouTubeWatchPage()) {
        console.log('YouTube navigation detected, reinitializing...');
        initializeAssistant();
      }
    }
  };

  // Listen for navigation events
  window.addEventListener('popstate', checkUrlChange);

  // YouTube also uses custom navigation events
  // Listen for YouTube's internal navigation
  const observeNavigation = () => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Check if the video player changed
          const player = document.querySelector('#movie_player');
          if (player && window.location.href !== currentUrl) {
            checkUrlChange();
            break;
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  observeNavigation();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAssistant);
} else {
  initializeAssistant();
}

// Handle SPA navigation
handleNavigation();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (assistant) {
    assistant.destroy();
  }
});

// Export for debugging (can be accessed via console)
window.YouTubeAIAssistant = YouTubeAIAssistant;
window.assistant = assistant;
