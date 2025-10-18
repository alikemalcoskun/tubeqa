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

      // Create assistant session
      this.session = await LanguageModel.create({
        systemPrompt: `You are a helpful assistant that generates engaging questions about YouTube video content.
        Generate 2-3 thoughtful questions that viewers might ask about the current video segment.
        Questions should be specific, engaging, and help viewers explore the content deeper.
        Format your response as a JSON array of strings.`
      });

      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize AI session:', error);
      return false;
    }
  }

  /**
   * Generate questions based on transcript text
   * @param {string} transcriptText - The transcript text to analyze
   * @param {string} videoSummary - The summary of the video
   * @returns {Promise<string[]>} Array of generated questions
   */
  async generateQuestions(transcriptText, videoSummary = "") {
    if (!this.initialized || !this.session) {
      console.warn('AI session not initialized');
      return [];
    }

    try {
      const context = `Video summary: "${videoSummary}"`;
      const prompt = `${context}
Based on this video transcript segment: "${transcriptText}"

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
      console.log("Question generation starting")
      const response = await this.session.prompt(prompt, { responseConstraint: questionJsonSchema });
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
   * @param {Function} onChunk - Callback for each streamed chunk
   * @returns {Promise<string>} Complete answer
   */
  async generateAnswer(question, videoSummary, onChunk) {
    if (!this.initialized || !this.session) {
      console.warn('AI session not initialized');
      return '';
    }

    try {
      // Create a smart prompt that uses summary for video-specific questions
      // and general knowledge for general questions
      const prompt = `You are answering a question about a YouTube video.

${videoSummary ? `Video Context: ${videoSummary}` : 'No video context available.'}

Question: "${question}"

Instructions:
- If the question is specific to the video content and you have the video context, answer based on that context.
- If the question is more general or you don't have enough video context, use your general knowledge.
- Be concise but thorough.
- If you're using video context, start with phrases like "Based on the video..." or "According to the content..."
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
