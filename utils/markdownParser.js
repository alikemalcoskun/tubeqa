/**
 * Lightweight Markdown Parser for LLM Answers
 * Parses bold text, italic text, and lists
 */

class MarkdownParser {
  /**
   * Parse markdown text and convert to HTML (bold, italic, and lists)
   * @param {string} markdown - The markdown text to parse
   * @returns {string} HTML string
   */
  static parse(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // Parse bold text first (before italic, since ** contains *)
    html = this.parseBold(html);

    // Parse lists (before italic to avoid * at start of line being parsed as italic)
    html = this.parseLists(html);

    // Parse italic text last
    html = this.parseItalic(html);

    return html;
  }

  /**
   * Parse bold text (**text** or __text__)
   * @param {string} text - Text to parse
   * @returns {string} Parsed text
   */
  static parseBold(text) {
    // Parse **bold** syntax
    text = text.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    
    // Parse __bold__ syntax
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    
    return text;
  }

  /**
   * Parse italic text (*text* or _text_)
   * @param {string} text - Text to parse
   * @returns {string} Parsed text
   */
  static parseItalic(text) {
    // Parse *italic* syntax (but not at the start of a line followed by space, which is a list)
    // Use negative lookbehind and lookahead to avoid matching list markers
    text = text.replace(/(?<!^|\n)\*([^\*\n]+)\*/g, '<em>$1</em>');
    
    // Parse _italic_ syntax
    text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    
    return text;
  }

  /**
   * Parse lists (* item or - item)
   * @param {string} text - Text to parse
   * @returns {string} Parsed text
   */
  static parseLists(text) {
    // Split text into lines
    const lines = text.split('\n');
    const result = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check if line is a list item (starts with * or -)
      const listMatch = trimmedLine.match(/^[\*\-]\s+(.+)$/);
      
      if (listMatch) {
        if (!inList) {
          // Start a new list
          result.push('<ul>');
          inList = true;
        }
        // Add list item
        result.push(`<li>${listMatch[1]}</li>`);
      } else {
        if (inList) {
          // Close the list
          result.push('</ul>');
          inList = false;
        }
        // Add regular line
        result.push(line);
      }
    }
    
    // Close list if still open at the end
    if (inList) {
      result.push('</ul>');
    }
    
    return result.join('\n');
  }
}

// Export for use in other modules
window.MarkdownParser = MarkdownParser;

