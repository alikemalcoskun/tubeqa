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

Generate 2-3 questions that viewers might ask about this content. Return only a JSON array of question strings.`;

      console.log("Question generation starting")
      const response = await this.session.prompt(prompt);
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
   * Parse the AI response into an array of questions
   * @param {string} response - Raw AI response
   * @returns {string[]} Array of questions
   */
  parseQuestions(response) {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed
          .filter(q => typeof q === 'string' && q.trim().length > 0)
          .map(q => this.cleanQuestionString(q)) // Clean quotes and extra characters
          .slice(0, 3); // Return up to 3 questions
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
