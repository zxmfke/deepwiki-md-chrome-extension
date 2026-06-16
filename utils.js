// Shared utility functions for the extension

// Debug flag to control verbose logging (set to false in production)
const DEBUG_MODE = false;

/**
 * Sanitizes a string to be used as a filename
 * @param {string} value - The value to sanitize
 * @param {string} fallback - The fallback value if sanitization results in empty string
 * @returns {string} The sanitized filename
 */
function sanitizeName(value, fallback = 'page') {
  if (!value || typeof value !== 'string') return fallback;
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || fallback;
}

/**
 * Validates that the URL is a valid DeepWiki documentation page
 * @param {string} url - The URL to validate
 * @returns {boolean} True if the URL is valid, false otherwise
 */
function isValidDeepWikiUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const urlObj = new URL(url);

    // Allow test pages (file:// or localhost)
    if (urlObj.protocol === 'file:' ||
      urlObj.hostname === 'localhost' ||
      urlObj.hostname === '127.0.0.1') {
      // Check if it's a test page
      if (url.includes('test-page.html') || url.includes('test/')) {
        return true;
      }
    }

    // Strict hostname check to prevent matching malicious domains
    // Strict hostname check to prevent matching malicious domains
    // Only allow deepwiki.com, *.deepwiki.com, or app.devin.ai
    const hostname = urlObj.hostname.toLowerCase();
    const isDeepWiki = hostname === 'deepwiki.com' || hostname.endsWith('.deepwiki.com');
    const isDevin = hostname === 'app.devin.ai';

    if (!isDeepWiki && !isDevin) {
      return false;
    }

    const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);
    // Require at least 2 path segments: /org/project
    return pathSegments.length >= 2;
  } catch (error) {
    return false;
  }
}
