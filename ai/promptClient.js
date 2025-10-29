/**
 * AI Prompt Client for YouTube AI Q&A Assistant
 * Uses Chrome's built-in AI API (Gemini Nano) to generate questions and answers
 */

class PromptClient {
  constructor() {
    this.session = null;
    this.initialized = false;
  }

  /**
   * Initialize the AI assistant session
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      // Check if AI API is available
      const available = await LanguageModel.availability();
      console.log('AI API available:', available);
      if (!available) {
        console.warn('Chrome AI API not available');
        return false;
      }

      // Create assistant session with multimodal capabilities
      this.session = await LanguageModel.create({
        systemPrompt: `You are a helpful assistant that generates engaging questions about YouTube video content.
        Generate 2-3 thoughtful questions that viewers might ask about the current video segment.
        Questions should be specific, engaging, and help viewers explore the content deeper.
        Format your response as a JSON array of strings.`,
        expectedInputs: [
          {
            type: "text",
            languages: ["en"]
          },
          {
            type: "image"
          }
        ],
        expectedOutputs: [
          {
            type: "text",
            languages: ["en"]
          }
        ],
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            console.log(`Language Model download progress: ${e.loaded * 100}%`);
          });
        }
      });

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize AI session:', error);
      return false;
    }
  }

  /**
   * Generate questions based on transcript text and video frame
   * @param {string} transcriptText - The transcript text to analyze
   * @param {string} videoSummary - The summary of the video
   * @param {Blob|File|null} videoFrame - Current video frame image (optional)
   * @returns {Promise<string[]>} Array of generated questions
   */
  async generateQuestions(transcriptText, videoSummary = "", videoFrame = null) {
    if (!this.initialized || !this.session) {
      console.warn('AI session not initialized');
      return [];
    }

    try {
      // Prepare the prompt with multimodal content
      const context = `Video summary: "${videoSummary}"`;
      const textPrompt = `${context}
Based on this video transcript segment: "${transcriptText}"

${videoFrame ? 'Analyze the provided video frame image along with the transcript.' : ''}
Generate 3 questions that viewers might ask about this content. Return only a JSON array of question strings.`;

      // Question JSON schema
      const questionJsonSchema = {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      };

      console.log("Question generation starting");
      
      // If we have a video frame, append it to the session first
      if (videoFrame) {
        console.log("Appending video frame to session");
        await this.session.append([
          {
            role: 'user',
            content: [
              {
                type: 'text',
                value: 'Here is the current video frame for context:'
              },
              {
                type: 'image',
                value: videoFrame
              }
            ]
          }
        ]);
      }

      const response = await this.session.prompt(textPrompt, { responseConstraint: questionJsonSchema });
      console.log("Question generation response:", response);
      const questions = this.parseQuestions(response);
      console.log("Question generation parsed questions:", questions);

      return questions;
    } catch (error) {
      console.error('Failed to generate questions:', error);
      return [];
    }
  }

  /**
   * Generate answer for a specific question with streaming support
   * @param {string} question - The question to answer
   * @param {string} videoSummary - Summary of the video for context
   * @param {Blob|File|null} videoFrame - Current video frame image (optional)
   * @param {Function} onChunk - Callback for each streamed chunk
   * @returns {Promise<string>} Complete answer
   */
  async generateAnswer(question, videoSummary, videoFrame, onChunk) {
    if (!this.initialized || !this.session) {
      console.warn('AI session not initialized');
      return '';
    }

    try {
      // If we have a video frame, append it to the session first
      if (videoFrame) {
        console.log("Appending video frame to answer session");
        await this.session.append([
          {
            role: 'user',
            content: [
              {
                type: 'text',
                value: 'Here is the current video frame for visual context:'
              },
              {
                type: 'image',
                value: videoFrame
              }
            ]
          }
        ]);
      }

      // Create a smart prompt that uses summary for video-specific questions
      // and general knowledge for general questions
      const prompt = `You are answering a question about a YouTube video.

${videoSummary ? `Video Context: ${videoSummary}` : 'No video context available.'}
${videoFrame ? 'Visual Context: Video frame provided above.' : ''}

Question: "${question}"

Instructions:
- If the question is specific to the video content and you have the video context, answer based on that context.
- If you have visual context from the video frame, incorporate what you see in the image.
- If the question is more general or you don't have enough video context, use your general knowledge.
- Be concise but thorough.
- If you're using video context, start with phrases like "Based on the video..." or "According to the content..."
- If you're using visual context, mention what you observe in the frame.
- If you're using general knowledge, start with phrases like "In general..." or "Generally speaking..."

Answer:`;

      console.log('Generating answer for question:', question);
      
      let fullAnswer = '';
      
      // Use prompt with streaming
      const stream = await this.session.promptStreaming(prompt);
      
      for await (const chunk of stream) {
        fullAnswer = chunk; // Chrome AI returns full text so far, not deltas
        if (onChunk) {
          onChunk(chunk);
        }
      }

      console.log('Answer generation complete');
      return fullAnswer;
    } catch (error) {
      console.error('Failed to generate answer:', error);
      return 'Sorry, I encountered an error generating the answer.';
    }
  }

  /**
   * Generate answer with conversation history (for follow-up questions)
   * @param {string} question - The follow-up question
   * @param {Array} conversationHistory - Array of {role, content} objects
   * @param {string} videoSummary - Summary of the video content
   * @param {Blob} videoFrame - Current video frame as image blob
   * @param {Function} onChunk - Callback for streaming chunks
   * @returns {Promise<string>} Generated answer
   */
  async generateAnswerWithHistory(question, conversationHistory, videoSummary, videoFrame, onChunk) {
    if (!this.initialized || !this.session) {
      console.error('Prompt API not initialized');
      return '';
    }

    try {
      // Build conversation context
      let conversationContext = 'Previous conversation:\n';
      for (const message of conversationHistory) {
        conversationContext += `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}\n\n`;
      }

      // Build the prompt with conversation history
      const prompt = `You are a helpful AI assistant answering questions about a YouTube video.

${conversationContext}

Video Context: ${videoSummary}

Based on the video context and our previous conversation, please answer the following question:

${question}

Provide a clear, helpful, and conversational answer that takes into account our previous discussion.`;

      console.log('Generating follow-up answer with conversation history...');
      
      let fullAnswer = '';
      
      // Use prompt with streaming (with image if available)
      let stream;
      if (videoFrame) {
        stream = await this.session.promptStreaming(prompt, {
          image: videoFrame
        });
      } else {
        stream = await this.session.promptStreaming(prompt);
      }
      
      for await (const chunk of stream) {
        fullAnswer = chunk;
        if (onChunk) {
          onChunk(chunk);
        }
      }

      console.log('Follow-up answer generation complete');
      return fullAnswer;
    } catch (error) {
      console.error('Failed to generate follow-up answer:', error);
      return 'Sorry, I encountered an error generating the answer.';
    }
  }

  /**
   * Parse the AI response into an array of questions
   * @param {string} response - Raw AI response
   * @returns {string[]} Array of questions
   */
  parseQuestions(response) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed.questions)) {
        return parsed.questions.map(q => this.cleanQuestionString(q)); // Clean quotes and extra characters
      }
    } catch (e) {
      // If JSON parsing fails, try to extract questions from text
      console.warn('Failed to parse AI response as JSON, falling back to text extraction');
    }

    // Fallback: extract questions from text
    const lines = response.split('\n').filter(line => line.trim().length > 0);
    const questions = lines
      .filter(line => line.includes('?') || /^\d+\./.test(line))
      .map(line => this.cleanQuestionString(line.replace(/^\d+\.\s*/, '').trim()))
      .filter(q => q.length > 0);

    return questions.slice(0, 3); // Return up to 3 questions
  }

  /**
   * Clean up quotes and extra characters from question strings
   * @param {string} question - Raw question string
   * @returns {string} Cleaned question
   */
  cleanQuestionString(question) {
    return question
      .trim()
      .replace(/^["']/, '') // Remove leading quotes
      .replace(/["'],?$/, '') // Remove trailing quotes and commas
      .replace(/\\"/g, '"') // Unescape quotes
      .replace(/\\'/g, "'") // Unescape single quotes
      .trim();
  }

  /**
   * Destroy the AI session and clean up resources
   */
  async destroy() {
    if (this.session) {
      try {
        await this.session.destroy();
      } catch (error) {
        console.warn('Error destroying AI session:', error);
      }
      this.session = null;
    }
    this.initialized = false;
  }
}

// Export for use in other modules
window.PromptClient = PromptClient;
