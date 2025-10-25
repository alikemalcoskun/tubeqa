/**
 * Frame Client for YouTube AI Assistant
 * Handles video frame capture operations for multimodal AI processing
 */

class FrameClient {
  constructor() {
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Capture current frame from video element as a Blob
   * @param {HTMLVideoElement} videoElement - The video element to capture from
   * @returns {Promise<Blob|null>} Video frame as image blob, or null if capture fails
   */
  async captureVideoFrame(videoElement) {
    try {
      if (!videoElement || videoElement.readyState < 2) {
        console.warn('Video element not ready for capture');
        return null;
      }

      // Create canvas if not exists
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: false, alpha: false });
      }

      // Set canvas dimensions
      this.canvas.width = videoElement.videoWidth;
      this.canvas.height = videoElement.videoHeight;

      // Draw video frame to canvas
      this.ctx.drawImage(videoElement, 0, 0);

      // Convert canvas to blob
      return new Promise((resolve) => {
        this.canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.8);
      });
    } catch (error) {
      console.error('Failed to capture video frame:', error);
      return null;
    }
  }
}

// Export for use in other modules
window.FrameClient = FrameClient;

