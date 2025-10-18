/**
 * UI Overlay for YouTube AI Q&A Assistant
 * Creates and manages the overlay UI above the video playback bar
 */

class UIOverlay {
  constructor() {
    this.overlay = null;
    this.questionsContainer = null;
    this.isVisible = false;
    this.hideTimeout = null;
    this.onQuestionClick = null;
    this.toggleButton = null;
    this.aiEnabled = true; // AI questions enabled by default
    this.isHovering = false; // Track if user is hovering over questions
    this.pendingQuestions = null; // Store questions generated while hovering
    this.STORAGE_KEY = 'youtube-ai-assistant-enabled'; // LocalStorage key
    this.chatbox = null; // Chatbox for displaying answers
    this.chatboxContent = null; // Content area of chatbox
    this.isChatboxVisible = false; // Track chatbox visibility
    this.isStreaming = false; // Track if answer is streaming
  }

  /**
   * Initialize the overlay UI
   * @param {Function} questionClickHandler - Handler for when questions are clicked
   */
  async initialize(questionClickHandler = null) {
    this.onQuestionClick = questionClickHandler;

    try {
      // Load saved toggle state from storage
      this.loadToggleState();

      // Wait for YouTube player to be ready
      await this.waitForPlayer();

      // Create the overlay
      this.createOverlay();

      // Set up event listeners for player controls visibility
      this.setupPlayerControlsWatcher();

      // Set up hover detection for questions
      this.setupHoverDetection();

      // Create and inject toggle button into player controls
      this.createToggleButton();

      // Initially hide the overlay if AI is disabled
      if (!this.aiEnabled) {
        this.hide();
      } else {
        this.hide(); // Start hidden, will show on hover
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize UI overlay:', error);
      return false;
    }
  }

  /**
   * Wait for the YouTube player to be fully loaded
   * @returns {Promise<void>}
   */
  async waitForPlayer() {
    return new Promise((resolve, reject) => {
      const maxAttempts = 50; // 5 seconds max wait
      let attempts = 0;

      const checkPlayer = () => {
        attempts++;

        const playerContainer = document.querySelector('#player-container') ||
                               document.querySelector('#player') ||
                               document.querySelector('.html5-video-player');

        if (playerContainer || attempts >= maxAttempts) {
          resolve();
        } else {
          setTimeout(checkPlayer, 100);
        }
      };

      checkPlayer();
    });
  }

  /**
   * Load toggle state from localStorage
   */
  loadToggleState() {
    try {
      const savedState = localStorage.getItem(this.STORAGE_KEY);
      if (savedState !== null) {
        this.aiEnabled = savedState === 'true';
        console.log(`Loaded AI toggle state: ${this.aiEnabled ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.warn('Failed to load toggle state from storage:', error);
    }
  }

  /**
   * Save toggle state to localStorage
   */
  saveToggleState() {
    try {
      localStorage.setItem(this.STORAGE_KEY, this.aiEnabled.toString());
      console.log(`Saved AI toggle state: ${this.aiEnabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.warn('Failed to save toggle state to storage:', error);
    }
  }

  /**
   * Set up hover detection for the questions container
   */
  setupHoverDetection() {
    if (!this.overlay) return;

    // Detect when user hovers over questions
    this.overlay.addEventListener('mouseenter', () => {
      this.isHovering = true;
      console.log('User hovering over questions - pausing UI updates');
    });

    // Apply pending updates when user stops hovering
    this.overlay.addEventListener('mouseleave', () => {
      this.isHovering = false;
      console.log('User stopped hovering - applying pending updates');
      
      if (this.pendingQuestions) {
        this.updateQuestions(this.pendingQuestions);
        this.pendingQuestions = null;
      }
    });
  }

  /**
   * Create the overlay UI elements
   */
  createOverlay() {
    // Remove any existing overlays (in case of leftover from previous instances)
    const existingOverlays = document.querySelectorAll('#youtube-ai-assistant-overlay');
    existingOverlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });

    // Create main overlay container
    this.overlay = document.createElement('div');
    this.overlay.id = 'youtube-ai-assistant-overlay';
    this.overlay.className = 'yt-ai-overlay';

    // Create questions container
    this.questionsContainer = document.createElement('div');
    this.questionsContainer.className = 'yt-ai-questions';

    // Create questions list (no header)
    const questionsList = document.createElement('div');
    questionsList.className = 'yt-ai-questions-list';
    questionsList.id = 'yt-ai-questions-list';

    // Assemble the overlay
    this.questionsContainer.appendChild(questionsList);
    this.overlay.appendChild(this.questionsContainer);

    // Insert overlay into the DOM
    this.insertOverlayIntoDOM();
  }

  /**
   * Insert the overlay into the correct position in the YouTube DOM
   */
  insertOverlayIntoDOM() {
    try {
      // Find player container
      const playerContainer =
        document.querySelector('.html5-video-player') ||
        document.querySelector('#movie_player') ||
        document.querySelector('#player-container') ||
        document.querySelector('#player');
  
      if (!playerContainer) {
        console.warn('Player container not found, appending overlay to body.');
        document.body.appendChild(this.overlay);
        return;
      }
  
      // Find control bar (updated for new YouTube structure)
      const controls =
        playerContainer.querySelector('.ytp-chrome-bottom') ||
        playerContainer.querySelector('.html5-video-controls');
  
      if (!controls) {
        console.warn('Control bar not found, appending to player container.');
        playerContainer.appendChild(this.overlay);
        return;
      }
  
      // Insert overlay before the control bar (works with both old and new structures)
      if (controls.parentNode) {
        controls.parentNode.insertBefore(this.overlay, controls);
        console.log('Overlay inserted before control bar');
      } else {
        playerContainer.appendChild(this.overlay);
        console.log('Overlay appended to player container');
      }
  
      // Ensure overlay has proper positioning context
      if (playerContainer.style.position === '' || playerContainer.style.position === 'static') {
        playerContainer.style.position = 'relative';
      }
    } catch (err) {
      console.error('Failed to initialize UI overlay:', err);
      document.body.appendChild(this.overlay);
    }
  }
  

  /**
   * Set up watchers for player controls visibility
   */
  setupPlayerControlsWatcher() {
    // Watch for mouse movement to show/hide overlay
    let mouseMoveTimeout;

    const handleMouseMove = () => {
      this.show();
      clearTimeout(mouseMoveTimeout);
      mouseMoveTimeout = setTimeout(() => {
        // Only hide if video is playing (not paused)
        if (!this.isVideoPaused()) {
          this.hide();
        }
      }, 3000);
    };

    // Listen for mouse events on the player
    const player = document.querySelector('#movie_player') ||
                   document.querySelector('.html5-video-player');

    if (player) {
      player.addEventListener('mousemove', handleMouseMove);
      player.addEventListener('mouseenter', handleMouseMove);
      player.addEventListener('mouseleave', () => {
        if (!this.isVideoPaused()) {
          this.hide();
        }
      });
    }

    // Also watch for video play/pause events
    const video = document.querySelector('video');
    if (video) {
      video.addEventListener('play', () => {
        // Hide overlay when video starts playing
        setTimeout(() => this.hide(), 1000);
      });

      video.addEventListener('pause', () => {
        // Show overlay when video is paused
        this.show();
      });
    }
  }

  /**
   * Check if the video is currently paused
   * @returns {boolean} True if video is paused
   */
  isVideoPaused() {
    const video = document.querySelector('video');
    return video ? video.paused : false;
  }

  /**
   * Update the overlay with new questions
   * @param {string[]} questions - Array of question strings
   */
  updateQuestions(questions) {
    // If user is hovering, queue the update instead of applying immediately
    if (this.isHovering) {
      console.log('User is hovering - queueing questions update');
      this.pendingQuestions = questions;
      return;
    }

    const questionsList = document.getElementById('yt-ai-questions-list');
    if (!questionsList) return;

    // Clear existing questions
    questionsList.innerHTML = '';

    if (questions.length === 0) {
      const noQuestions = document.createElement('div');
      noQuestions.className = 'yt-ai-no-questions';
      noQuestions.textContent = 'Analyzing video...';
      questionsList.appendChild(noQuestions);
      return;
    }

    // Create question elements
    questions.forEach((question, index) => {
      const questionElement = document.createElement('button');
      questionElement.className = 'yt-ai-question';
      questionElement.textContent = question;
      questionElement.setAttribute('data-question-index', index);

      // Add click handler
      questionElement.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleQuestionClick(question, index);
      });

      questionsList.appendChild(questionElement);
    });
  }

  /**
   * Handle question click events
   * @param {string} question - The clicked question
   * @param {number} index - Question index
   */
  handleQuestionClick(question, index) {
    console.log('Question clicked:', question);

    // STUB FOR PHASE 2: This will be implemented in the next phase
    if (this.onQuestionClick) {
      this.onQuestionClick(question, index);
    } else {
      // For now, just show an alert
      alert(`Question clicked: "${question}"\n\nAnswer generation will be available in Phase 2.`);
    }
  }

  /**
   * Show the overlay
   */
  show() {
    if (!this.overlay) return;

    // Don't show if AI is disabled
    if (!this.aiEnabled) {
      return;
    }

    this.overlay.classList.add('visible');
    this.isVisible = true;

    // Clear any pending hide timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  /**
   * Hide the overlay
   */
  hide() {
    if (!this.overlay) return;

    this.overlay.classList.remove('visible');
    this.isVisible = false;
  }

  /**
   * Toggle overlay visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show an error state
   * @param {string} message - Error message to display
   */
  showError(message) {
    const questionsList = document.getElementById('yt-ai-questions-list');
    if (!questionsList) return;

    questionsList.innerHTML = '';

    const errorElement = document.createElement('div');
    errorElement.className = 'yt-ai-error';
    errorElement.textContent = message;

    questionsList.appendChild(errorElement);
  }

  /**
   * Remove the overlay from DOM
   */
  destroy() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    if (this.toggleButton && this.toggleButton.parentNode) {
      this.toggleButton.parentNode.removeChild(this.toggleButton);
    }

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    // Destroy chatbox
    this.destroyChatbox();

    this.overlay = null;
    this.questionsContainer = null;
    this.toggleButton = null;
  }

  /**
   * Create and inject toggle button into YouTube player controls
   */
  createToggleButton() {
    try {
      // Remove any existing toggle buttons (in case of leftover from previous instances)
      const existingButtons = document.querySelectorAll('.ytp-ai-toggle');
      existingButtons.forEach(btn => {
        if (btn.parentNode) {
          btn.parentNode.removeChild(btn);
        }
      });

      // Create toggle button
      this.toggleButton = document.createElement('button');
      this.toggleButton.className = 'ytp-button ytp-ai-toggle';
      this.toggleButton.title = 'Toggle AI Questions';
      // Set initial state based on loaded preference
      this.toggleButton.setAttribute('aria-pressed', this.aiEnabled.toString());
      // TODO: Add custom icon for the toggle button
      this.toggleButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles-icon lucide-sparkles"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/></svg>
      `;

      // Add click handler
      this.toggleButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleAI();
      });

      // Inject into player controls
      this.injectToggleButton();

    } catch (error) {
      console.warn('Failed to create toggle button:', error);
    }
  }

  /**
   * Inject toggle button into YouTube player controls
   */
  injectToggleButton() {
    if (!this.toggleButton) return;

    // Try to find the right place in player controls
    const injectButton = () => {
      try {
        // Look for the right control bar section (updated for new YouTube structure)
        // Try new structure first (.ytp-right-controls-right), then fall back to old structure
        let controlBar = document.querySelector('.ytp-right-controls-right');
        
        if (!controlBar) {
          // Fall back to old structure
          controlBar = document.querySelector('.ytp-right-controls') ||
                       document.querySelector('.ytp-chrome-controls');
        }

        if (controlBar) {
          // Insert before the fullscreen button or at the end
          const fullscreenBtn = controlBar.querySelector('.ytp-fullscreen-button') ||
                               controlBar.querySelector('.ytp-button:last-child');

          if (fullscreenBtn) {
            controlBar.insertBefore(this.toggleButton, fullscreenBtn);
          } else {
            controlBar.appendChild(this.toggleButton);
          }

          console.log('Injected AI toggle button into player controls');
          return true;
        }
      } catch (error) {
        console.warn('Failed to inject toggle button:', error);
      }
      return false;
    };

    // Try immediately
    if (!injectButton()) {
      // Retry after a short delay in case DOM isn't ready
      setTimeout(() => {
        if (!injectButton()) {
          console.warn('Could not inject toggle button into player controls');
        }
      }, 1000);
    }
  }

  /**
   * Toggle AI questions on/off
   */
  toggleAI() {
    this.aiEnabled = !this.aiEnabled;

    // Update aria-pressed state for the red underline
    this.toggleButton.setAttribute('aria-pressed', this.aiEnabled.toString());

    // Save the state to localStorage
    this.saveToggleState();

    console.log(`AI Questions ${this.aiEnabled ? 'enabled' : 'disabled'}`);

    // If disabling AI, hide current questions and clear any pending updates
    if (!this.aiEnabled) {
      this.hide();
      this.pendingQuestions = null; // Clear any pending updates
    }

    // Notify the main script about the toggle
    if (window.aiToggleCallback) {
      window.aiToggleCallback(this.aiEnabled);
    }
  }

  /**
   * Check if AI is enabled
   * @returns {boolean} True if AI questions are enabled
   */
  isAIEnabled() {
    return this.aiEnabled;
  }

  /**
   * Get the current visibility state
   * @returns {boolean} True if overlay is visible
   */
  getIsVisible() {
    return this.isVisible;
  }

  /**
   * Reposition the overlay (useful if YouTube layout changes)
   */
  reposition() {
    if (!this.overlay) return;

    // Remove from current position
    if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    // Re-insert at new position
    this.insertOverlayIntoDOM();
  }

  /**
   * Show answer block below questions with a question
   * @param {string} question - The question being answered
   */
  showChatbox(question) {
    // Hide questions when showing answer
    if (this.questionsContainer) {
      const questionsList = this.questionsContainer.querySelector('.yt-ai-questions-list');
      if (questionsList) {
        questionsList.style.display = 'none';
      }
    }

    // Remove existing answer container if any
    this.destroyChatbox();

    // Create answer container
    this.chatbox = document.createElement('div');
    this.chatbox.className = 'ytai-answer-container';

    // Create question block with close button
    const questionBlock = document.createElement('div');
    questionBlock.className = 'ytai-answer-question';
    questionBlock.textContent = question;
    
    const closeButton = document.createElement('button');
    closeButton.className = 'ytai-answer-close';
    closeButton.innerHTML = '&times;';
    closeButton.title = 'Close';
    closeButton.addEventListener('click', () => this.closeChatbox());
    questionBlock.appendChild(closeButton);

    // Create answer block with loading indicator
    this.chatboxContent = document.createElement('div');
    this.chatboxContent.className = 'ytai-answer-block';
    
    const loadingDots = document.createElement('div');
    loadingDots.className = 'ytai-answer-loading';
    loadingDots.innerHTML = '<span></span><span></span><span></span>';
    this.chatboxContent.appendChild(loadingDots);

    // Assemble answer container
    this.chatbox.appendChild(questionBlock);
    this.chatbox.appendChild(this.chatboxContent);

    // Add to questions container
    if (this.questionsContainer) {
      this.questionsContainer.appendChild(this.chatbox);
    }

    this.isChatboxVisible = true;
    this.isStreaming = true;
  }

  /**
   * Update answer content with streaming text (full accumulated text)
   * @param {string} text - The full accumulated text to display
   */
  updateChatboxContent(text) {
    if (!this.chatbox || !this.chatboxContent) {
      // Continue streaming in background but don't update UI
      return;
    }

    // Only update if visible
    if (!this.isChatboxVisible) {
      return;
    }

    // Remove loading indicator if it exists
    const loadingDots = this.chatboxContent.querySelector('.ytai-answer-loading');
    if (loadingDots) {
      loadingDots.remove();
    }

    // Chrome Prompt API returns full accumulated text in each chunk, not deltas
    // So we just set the text directly
    this.chatboxContent.textContent = text;

    // Auto-scroll to bottom if needed
    if (this.chatboxContent.scrollHeight > this.chatboxContent.clientHeight) {
      this.chatboxContent.scrollTop = this.chatboxContent.scrollHeight;
    }
  }

  /**
   * Mark streaming as complete
   */
  finishStreaming() {
    this.isStreaming = false;
  }

  /**
   * Close answer and show questions again
   */
  closeChatbox() {
    if (!this.chatbox) return;

    // Remove answer container
    if (this.chatbox.parentNode) {
      this.chatbox.parentNode.removeChild(this.chatbox);
    }

    // Show questions again
    if (this.questionsContainer) {
      const questionsList = this.questionsContainer.querySelector('.yt-ai-questions-list');
      if (questionsList) {
        questionsList.style.display = 'flex';
      }
    }

    this.chatbox = null;
    this.chatboxContent = null;
    this.isChatboxVisible = false;
    console.log('Answer closed - showing questions');
  }

  /**
   * Destroy chatbox completely
   */
  destroyChatbox() {
    if (this.chatbox && this.chatbox.parentNode) {
      this.chatbox.parentNode.removeChild(this.chatbox);
    }
    this.chatbox = null;
    this.chatboxContent = null;
    this.isChatboxVisible = false;
    this.isStreaming = false;
  }
}

// Export for use in other modules
window.UIOverlay = UIOverlay;
