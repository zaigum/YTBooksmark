import { getActiveTabURL } from "./utils.js";

// Constants for better maintainability
const SELECTORS = {
  bookmarks: "bookmarks",
  container: "container"
};

const CLASSES = {
  bookmarkTitle: "bookmark-title",
  bookmarkControls: "bookmark-controls", 
  bookmark: "bookmark",
  row: "row",
  title: "title"
};

const MESSAGE_TYPES = {
  PLAY: "PLAY",
  DELETE: "DELETE"
};

/**
 * Creates and adds a new bookmark element to the bookmarks container
 * @param {HTMLElement} bookmarksContainer - The container to add bookmark to
 * @param {Object} bookmark - Bookmark object with time and desc properties
 */
const addNewBookmark = (bookmarksContainer, bookmark) => {
  if (!bookmark || typeof bookmark.time === 'undefined' || !bookmark.desc) {
    console.error('Invalid bookmark data:', bookmark);
    return;
  }

  // Create bookmark elements
  const bookmarkElement = document.createElement("div");
  const titleElement = document.createElement("div");
  const controlsElement = document.createElement("div");

  // Set up title element
  titleElement.textContent = bookmark.desc;
  titleElement.className = CLASSES.bookmarkTitle;
  titleElement.title = bookmark.desc; // Tooltip for long descriptions

  // Set up controls element
  controlsElement.className = CLASSES.bookmarkControls;
  
  // Add control buttons
  createControlButton("play", "Play bookmark", onPlay, controlsElement);
  createControlButton("delete", "Delete bookmark", onDelete, controlsElement);

  // Set up main bookmark element
  bookmarkElement.id = `bookmark-${bookmark.time}`;
  bookmarkElement.className = CLASSES.bookmark;
  bookmarkElement.setAttribute("timestamp", bookmark.time);
  bookmarkElement.setAttribute("data-description", bookmark.desc);

  // Assemble the bookmark
  bookmarkElement.appendChild(titleElement);
  bookmarkElement.appendChild(controlsElement);
  bookmarksContainer.appendChild(bookmarkElement);
};

/**
 * Creates a control button with icon and event listener
 * @param {string} action - The action type (play/delete)
 * @param {string} title - Tooltip text
 * @param {Function} eventListener - Click handler function
 * @param {HTMLElement} parentElement - Parent element to append to
 */
const createControlButton = (action, title, eventListener, parentElement) => {
  const button = document.createElement("img");
  
  button.src = `assets/${action}.png`;
  button.title = title;
  button.alt = `${action} button`;
  button.className = `control-button ${action}-button`;
  button.addEventListener("click", eventListener);
  
  parentElement.appendChild(button);
};

/**
 * Renders all bookmarks in the UI
 * @param {Array} currentBookmarks - Array of bookmark objects
 */
const viewBookmarks = (currentBookmarks = []) => {
  const bookmarksElement = document.getElementById(SELECTORS.bookmarks);
  
  if (!bookmarksElement) {
    console.error('Bookmarks container not found');
    return;
  }

  // Clear existing bookmarks
  bookmarksElement.innerHTML = "";

  if (!Array.isArray(currentBookmarks) || currentBookmarks.length === 0) {
    bookmarksElement.innerHTML = `<i class="${CLASSES.row}">No bookmarks to show</i>`;
    return;
  }

  // Add each bookmark
  currentBookmarks.forEach(bookmark => {
    addNewBookmark(bookmarksElement, bookmark);
  });
};

/**
 * Handles play button click - seeks to bookmark timestamp
 * @param {Event} event - Click event
 */
const onPlay = async (event) => {
  try {
    const timestamp = getTimestampFromEvent(event);
    if (!timestamp) return;

    const activeTab = await getActiveTabURL();
    if (!activeTab?.id) {
      console.error('No active tab found');
      return;
    }

    await chrome.tabs.sendMessage(activeTab.id, {
      type: MESSAGE_TYPES.PLAY,
      value: timestamp,
    });
  } catch (error) {
    console.error('Error playing bookmark:', error);
  }
};

/**
 * Handles delete button click - removes bookmark
 * @param {Event} event - Click event
 */
const onDelete = async (event) => {
  try {
    const timestamp = getTimestampFromEvent(event);
    if (!timestamp) return;

    const bookmarkElement = document.getElementById(`bookmark-${timestamp}`);
    if (!bookmarkElement) {
      console.error('Bookmark element not found');
      return;
    }

    // Remove from DOM
    bookmarkElement.remove();

    // Send delete message to content script
    const activeTab = await getActiveTabURL();
    if (activeTab?.id) {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: MESSAGE_TYPES.DELETE,
        value: timestamp,
      });
    }

    // Refresh bookmarks display after deletion
    setTimeout(() => {
      refreshBookmarks();
    }, 100);
    
  } catch (error) {
    console.error('Error deleting bookmark:', error);
  }
};

/**
 * Extracts timestamp from event target
 * @param {Event} event - Click event
 * @returns {string|null} - Timestamp or null if not found
 */
const getTimestampFromEvent = (event) => {
  const bookmarkElement = event.target.closest(`.${CLASSES.bookmark}`);
  if (!bookmarkElement) {
    console.error('Could not find bookmark element');
    return null;
  }
  return bookmarkElement.getAttribute("timestamp");
};

/**
 * Refreshes the bookmarks display by fetching from storage
 */
const refreshBookmarks = async () => {
  try {
    const activeTab = await getActiveTabURL();
    const videoId = extractVideoId(activeTab.url);
    
    if (!videoId) return;

    chrome.storage.sync.get([videoId], (data) => {
      const bookmarks = data[videoId] ? JSON.parse(data[videoId]) : [];
      viewBookmarks(bookmarks);
    });
  } catch (error) {
    console.error('Error refreshing bookmarks:', error);
  }
};

/**
 * Extracts video ID from YouTube URL
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null if not found
 */
const extractVideoId = (url) => {
  if (!url) return null;
  
  try {
    const urlParams = new URLSearchParams(url.split("?")[1]);
    return urlParams.get("v");
  } catch (error) {
    console.error('Error extracting video ID:', error);
    return null;
  }
};

/**
 * Checks if the current page is a valid YouTube video page
 * @param {string} url - Page URL
 * @returns {boolean} - True if valid YouTube video page
 */
const isYouTubeVideoPage = (url) => {
  return url && url.includes("youtube.com/watch") && extractVideoId(url);
};

/**
 * Shows error message when not on a YouTube video page
 */
const showNotYouTubeMessage = () => {
  const container = document.getElementsByClassName(SELECTORS.container)[0];
  if (container) {
    container.innerHTML = `
      <div class="${CLASSES.title}">
        This extension only works on YouTube video pages.
        <br>
        <small>Navigate to a YouTube video to use bookmarks.</small>
      </div>
    `;
  }
};

/**
 * Initializes the extension when DOM is loaded
 */
const initializeExtension = async () => {
  try {
    const activeTab = await getActiveTabURL();
    
    if (!activeTab?.url) {
      console.error('Could not get active tab URL');
      showNotYouTubeMessage();
      return;
    }

    if (!isYouTubeVideoPage(activeTab.url)) {
      showNotYouTubeMessage();
      return;
    }

    const videoId = extractVideoId(activeTab.url);
    if (!videoId) {
      console.error('Could not extract video ID');
      showNotYouTubeMessage();
      return;
    }

    // Load and display bookmarks for current video
    chrome.storage.sync.get([videoId], (data) => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        return;
      }
      
      const currentVideoBookmarks = data[videoId] 
        ? JSON.parse(data[videoId]) 
        : [];
      
      viewBookmarks(currentVideoBookmarks);
    });

  } catch (error) {
    console.error('Error initializing extension:', error);
    showNotYouTubeMessage();
  }
};

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initializeExtension);

// Export functions for testing (optional)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    addNewBookmark,
    viewBookmarks,
    onPlay,
    onDelete,
    extractVideoId,
    isYouTubeVideoPage
  };
}