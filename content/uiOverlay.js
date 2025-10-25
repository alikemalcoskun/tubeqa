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
    
    // Question history with timestamps
    this.questionHistory = []; // Array of {questions: [{text, startTime, endTime}], timestamp}
    this.currentQuestionGroupIndex = -1; // Current group being displayed (-1 means latest)
    
    // Conversation history for chatbox
    this.conversationHistory = []; // Array of {role: 'user'|'assistant', content: string}
    this.conversationContext = null; // Store context (startTime, endTime) for the conversation
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
        this.updateQuestions(this.pendingQuestions.questions, this.pendingQuestions.timestamp);
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
   * @param {Array<{text: string, startTime: number, endTime: number}>} questions - Array of question objects with timing
   * @param {number} timestamp - Video timestamp when questions were generated
   */
  updateQuestions(questions, timestamp) {
    // If user is hovering, queue the update instead of applying immediately
    if (this.isHovering) {
      console.log('User is hovering - queueing questions update');
      this.pendingQuestions = {questions, timestamp};
      return;
    }

    // Add to question history
    if (questions && questions.length > 0) {
      this.questionHistory.push({
        questions: questions,
        timestamp: timestamp
      });
      this.currentQuestionGroupIndex = this.questionHistory.length - 1;
    }

    this.renderCurrentQuestions();
  }

  /**
   * Render the current question group with navigation
   */
  renderCurrentQuestions() {
    const questionsList = document.getElementById('yt-ai-questions-list');
    if (!questionsList) return;

    // Clear existing questions
    questionsList.innerHTML = '';

    // Check if we have questions
    if (this.questionHistory.length === 0 || this.currentQuestionGroupIndex < 0) {
      const noQuestions = document.createElement('div');
      noQuestions.className = 'yt-ai-no-questions';
      noQuestions.textContent = 'Analyzing video...';
      questionsList.appendChild(noQuestions);
      return;
    }

    const currentGroup = this.questionHistory[this.currentQuestionGroupIndex];
    const questions = currentGroup.questions;

    // Create navigation container
    if (this.questionHistory.length > 1) {
      const navContainer = document.createElement('div');
      navContainer.className = 'yt-ai-nav-container';

      // Backward button
      const backButton = document.createElement('button');
      backButton.className = 'yt-ai-nav-button';
      // TODO: Add custom icon for the back button
      backButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>';
      backButton.title = 'Previous questions';
      backButton.disabled = this.currentQuestionGroupIndex === 0;
      backButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.navigateBackward();
      });

      // Forward button
      const forwardButton = document.createElement('button');
      forwardButton.className = 'yt-ai-nav-button';
      // TODO: Add custom icon for the forward button
      forwardButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
      forwardButton.title = 'Next questions';
      forwardButton.disabled = this.currentQuestionGroupIndex === this.questionHistory.length - 1;
      forwardButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.navigateForward();
      });

      navContainer.appendChild(backButton);
      navContainer.appendChild(forwardButton);
      questionsList.appendChild(navContainer);
    }

    // Show only first 3 questions
    const questionsToShow = questions.slice(0, 3);

    // Create question elements
    questionsToShow.forEach((questionObj, index) => {
      const questionElement = document.createElement('button');
      questionElement.className = 'yt-ai-question';
      questionElement.textContent = questionObj.text;
      questionElement.setAttribute('data-question-index', index);
      questionElement.setAttribute('data-start-time', questionObj.startTime);
      questionElement.setAttribute('data-end-time', questionObj.endTime);

      // Add click handler
      questionElement.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleQuestionClick(questionObj.text, index, questionObj.startTime, questionObj.endTime);
      });

      questionsList.appendChild(questionElement);
    });

    // Add user query input field at the end
    this.addUserQueryField(questionsList);
  }

  /**
   * Add user query input field to the questions list
   * @param {HTMLElement} questionsList - The questions list container
   */
  addUserQueryField(questionsList) {
    // Create user query container
    const userQueryContainer = document.createElement('div');
    userQueryContainer.className = 'yt-ai-user-query-container';

    // Create input field
    const userQueryInput = document.createElement('input');
    userQueryInput.type = 'text';
    userQueryInput.className = 'yt-ai-user-query-input';
    userQueryInput.placeholder = 'Ask your own question...';
    userQueryInput.id = 'yt-ai-user-query-input';

    // Create submit button
    const submitButton = document.createElement('button');
    submitButton.className = 'yt-ai-user-query-submit';
    // TODO: Add custom icon for the submit button
    submitButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg>';
    submitButton.title = 'Submit question';

    // Handle submit
    const handleSubmit = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const question = userQueryInput.value.trim();
      if (!question) return;

      // Get current video time for context
      const video = document.querySelector('video');
      const currentTime = video ? video.currentTime : 0;
      
      // Use a time range around current time (similar to generated questions)
      const startTime = Math.max(0, currentTime - 15); // 15 seconds before
      const endTime = currentTime + 15; // 15 seconds after
      
      // Clear input
      userQueryInput.value = '';
      
      // Handle the user's question with same logic as clicking a question
      this.handleQuestionClick(question, -1, startTime, endTime);
    };

    // Add click handler to submit button
    submitButton.addEventListener('click', handleSubmit);

    // Add Enter key handler to input field
    userQueryInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSubmit(e);
      }
    });

    // Prevent YouTube keyboard shortcuts from triggering while typing
    userQueryInput.addEventListener('keydown', (e) => {
      // Stop propagation to prevent YouTube shortcuts from firing
      e.stopPropagation();
    });

    userQueryInput.addEventListener('keyup', (e) => {
      // Stop propagation to prevent YouTube shortcuts from firing
      e.stopPropagation();
    });

    // Assemble the container
    userQueryContainer.appendChild(userQueryInput);
    userQueryContainer.appendChild(submitButton);
    
    // Add to questions list
    questionsList.appendChild(userQueryContainer);
  }

  /**
   * Navigate to previous question group
   */
  navigateBackward() {
    if (this.currentQuestionGroupIndex > 0) {
      this.currentQuestionGroupIndex--;
      this.renderCurrentQuestions();
    }
  }

  /**
   * Navigate to next question group
   */
  navigateForward() {
    if (this.currentQuestionGroupIndex < this.questionHistory.length - 1) {
      this.currentQuestionGroupIndex++;
      this.renderCurrentQuestions();
    }
  }

  /**
   * Handle question click events
   * @param {string} question - The clicked question
   * @param {number} index - Question index
   * @param {number} startTime - Start time of the question's context
   * @param {number} endTime - End time of the question's context
   */
  handleQuestionClick(question, index, startTime, endTime) {
    console.log('Question clicked:', question, 'Time range:', startTime, '-', endTime);

    // Show chatbox with conversation interface
    this.showChatbox(question, startTime, endTime);

    // Pass timing information to the click handler
    if (this.onQuestionClick) {
      this.onQuestionClick(question, index, startTime, endTime);
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

    // Don't hide if chatbox is open
    if (this.isChatboxVisible) {
      return;
    }

    // Don't hide if answer is currently streaming/generating
    if (this.isStreaming) {
      return;
    }

    // Don't hide if user is currently typing in any input field
    const activeElement = document.activeElement;
    const isTypingInQuestions = activeElement && activeElement.id === 'yt-ai-user-query-input';
    const isTypingInChatbox = activeElement && activeElement.id === 'ytai-followup-input';
    
    if (isTypingInQuestions || isTypingInChatbox) {
      return;
    }

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
   * Show chatbox with conversation interface
   * @param {string} question - The initial question
   * @param {number} startTime - Start time for context
   * @param {number} endTime - End time for context
   */
  showChatbox(question, startTime, endTime) {
    // Hide questions when showing chatbox
    if (this.questionsContainer) {
      const questionsList = this.questionsContainer.querySelector('.yt-ai-questions-list');
      if (questionsList) {
        questionsList.style.display = 'none';
      }
    }

    // Remove existing chatbox if any
    this.destroyChatbox();

    // Initialize conversation with the first question
    this.conversationHistory = [{role: 'user', content: question}];
    this.conversationContext = {startTime, endTime};

    // Create chatbox wrapper (overall container)
    this.chatbox = document.createElement('div');
    this.chatbox.className = 'ytai-answer-wrapper';

    // Create close button fixed at the top
    const closeButton = document.createElement('button');
    closeButton.className = 'ytai-answer-close';
    closeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-arrow-back"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 11l-4 4l4 4m-4 -4h11a4 4 0 0 0 0 -8h-1" /></svg>';
    closeButton.title = 'Back';
    closeButton.addEventListener('click', () => this.closeChatbox());

    // Create scrollable content container
    const scrollableContent = document.createElement('div');
    scrollableContent.className = 'ytai-answer-container';

    // Create question block
    const questionBlock = document.createElement('div');
    questionBlock.className = 'ytai-answer-question';
    questionBlock.textContent = question;

    // Create answer block with loading indicator
    this.chatboxContent = document.createElement('div');
    this.chatboxContent.className = 'ytai-answer-block';
    
    const loadingDots = document.createElement('div');
    loadingDots.className = 'ytai-answer-loading';
    loadingDots.innerHTML = '<span></span><span></span><span></span>';
    this.chatboxContent.appendChild(loadingDots);

    // Assemble scrollable content - question and answer blocks
    scrollableContent.appendChild(questionBlock);
    scrollableContent.appendChild(this.chatboxContent);
    
    // Store reference to scrollable content for later use
    this.scrollableContent = scrollableContent;
    
    // Prevent scroll events from propagating to YouTube when hovering over scrollable content
    scrollableContent.addEventListener('wheel', (e) => {
      const elem = scrollableContent;
      const hasScroll = elem.scrollHeight > elem.clientHeight;
      
      if (hasScroll) {
        const isAtTop = elem.scrollTop === 0;
        const isAtBottom = elem.scrollTop + elem.clientHeight >= elem.scrollHeight - 1;
        const scrollingUp = e.deltaY < 0;
        const scrollingDown = e.deltaY > 0;
        
        if ((scrollingDown && !isAtBottom) || (scrollingUp && !isAtTop)) {
          e.stopPropagation();
          e.preventDefault();
          elem.scrollTop += e.deltaY;
        }
      } else {
        e.stopPropagation();
      }
    }, { passive: false });

    // Create input container fixed at the bottom
    const inputContainer = document.createElement('div');
    inputContainer.className = 'yt-ai-user-query-container';

    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.className = 'yt-ai-user-query-input';
    userInput.placeholder = 'Ask a follow-up question...';
    userInput.id = 'ytai-followup-input';

    const sendButton = document.createElement('button');
    sendButton.className = 'yt-ai-user-query-submit';
    sendButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2z"/></svg>';
    sendButton.title = 'Send message';

    // Handle sending follow-up questions
    const handleSendMessage = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const message = userInput.value.trim();
      if (!message || this.isStreaming) return;

      userInput.value = '';
      
      // Update question block with new question
      questionBlock.textContent = message;
      
      // Reset answer block with loading
      this.chatboxContent.innerHTML = '';
      const loadingDots = document.createElement('div');
      loadingDots.className = 'ytai-answer-loading';
      loadingDots.innerHTML = '<span></span><span></span><span></span>';
      this.chatboxContent.appendChild(loadingDots);
      
      // Add to conversation history
      this.conversationHistory.push({role: 'user', content: message});
      
      // Trigger follow-up answer generation
      if (this.onFollowUpQuestion) {
        this.onFollowUpQuestion(message, this.conversationContext.startTime, this.conversationContext.endTime);
      }
    };

    sendButton.addEventListener('click', handleSendMessage);
    
    userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSendMessage(e);
      }
    });

    // Prevent YouTube keyboard shortcuts while typing
    userInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });

    userInput.addEventListener('keyup', (e) => {
      e.stopPropagation();
    });

    inputContainer.appendChild(userInput);
    inputContainer.appendChild(sendButton);

    // Assemble chatbox
    this.chatbox.appendChild(closeButton);
    this.chatbox.appendChild(scrollableContent);
    this.chatbox.appendChild(inputContainer);

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

    // Auto-scroll scrollable content to bottom if needed
    if (this.scrollableContent && this.scrollableContent.scrollHeight > this.scrollableContent.clientHeight) {
      this.scrollableContent.scrollTop = this.scrollableContent.scrollHeight;
    }
  }

  /**
   * Mark streaming as complete and save to conversation history
   * @param {string} fullAnswer - The complete answer text
   */
  finishStreaming(fullAnswer) {
    this.isStreaming = false;
    
    // Save the assistant's response to conversation history
    if (fullAnswer) {
      this.conversationHistory.push({role: 'assistant', content: fullAnswer});
    }
  }

  /**
   * Close chatbox and show questions again
   */
  closeChatbox() {
    if (!this.chatbox) return;

    // Remove chatbox
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

    // Clear conversation state
    this.chatbox = null;
    this.chatboxContent = null;
    this.isChatboxVisible = false;
    this.conversationHistory = [];
    this.conversationContext = null;
    
    console.log('Chatbox closed - showing questions');
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
    this.conversationHistory = [];
    this.conversationContext = null;
  }

  /**
   * Set handler for follow-up questions
   * @param {Function} handler - Handler function for follow-up questions
   */
  setFollowUpQuestionHandler(handler) {
    this.onFollowUpQuestion = handler;
  }

  /**
   * Get conversation history
   * @returns {Array} Conversation history
   */
  getConversationHistory() {
    return this.conversationHistory;
  }
}

// Export for use in other modules
window.UIOverlay = UIOverlay;
