import { getActiveTabURL } from "./utils.js";

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

const addNewBookmark = (bookmarksContainer, bookmark) => {
  if (!bookmark || typeof bookmark.time === 'undefined' || !bookmark.desc) {
    console.error('Invalid bookmark data:', bookmark);
    return;
  }

  const bookmarkElement = document.createElement("div");
  const titleElement = document.createElement("div");
  const controlsElement = document.createElement("div");

  titleElement.textContent = bookmark.desc;
  titleElement.className = CLASSES.bookmarkTitle;
  titleElement.title = bookmark.desc;

  controlsElement.className = CLASSES.bookmarkControls;
  
  createControlButton("play", "Play bookmark", onPlay, controlsElement);
  createControlButton("delete", "Delete bookmark", onDelete, controlsElement);

  bookmarkElement.id = `bookmark-${bookmark.time}`;
  bookmarkElement.className = CLASSES.bookmark;
  bookmarkElement.setAttribute("timestamp", bookmark.time);
  bookmarkElement.setAttribute("data-description", bookmark.desc);

  bookmarkElement.appendChild(titleElement);
  bookmarkElement.appendChild(controlsElement);
  bookmarksContainer.appendChild(bookmarkElement);
};

const createControlButton = (action, title, eventListener, parentElement) => {
  const button = document.createElement("img");
  
  button.src = `assets/${action}.png`;
  button.title = title;
  button.alt = `${action} button`;
  button.className = `control-button ${action}-button`;
  button.addEventListener("click", eventListener);
  
  parentElement.appendChild(button);
};

const viewBookmarks = (currentBookmarks = []) => {
  const bookmarksElement = document.getElementById(SELECTORS.bookmarks);
  
  if (!bookmarksElement) {
    console.error('Bookmarks container not found');
    return;
  }

  bookmarksElement.innerHTML = "";

  if (!Array.isArray(currentBookmarks) || currentBookmarks.length === 0) {
    bookmarksElement.innerHTML = `<i class="${CLASSES.row}">No bookmarks to show</i>`;
    return;
  }

  currentBookmarks.forEach(bookmark => {
    addNewBookmark(bookmarksElement, bookmark);
  });
};

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

const onDelete = async (event) => {
  try {
    const timestamp = getTimestampFromEvent(event);
    if (!timestamp) return;

    const bookmarkElement = document.getElementById(`bookmark-${timestamp}`);
    if (!bookmarkElement) {
      console.error('Bookmark element not found');
      return;
    }

    bookmarkElement.remove();

    const activeTab = await getActiveTabURL();
    if (activeTab?.id) {
      await chrome.tabs.sendMessage(activeTab.id, {
        type: MESSAGE_TYPES.DELETE,
        value: timestamp,
      });
    }

    setTimeout(() => {
      refreshBookmarks();
    }, 100);
    
  } catch (error) {
    console.error('Error deleting bookmark:', error);
  }
};

const getTimestampFromEvent = (event) => {
  const bookmarkElement = event.target.closest(`.${CLASSES.bookmark}`);
  if (!bookmarkElement) {
    console.error('Could not find bookmark element');
    return null;
  }
  return bookmarkElement.getAttribute("timestamp");
};

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

const isYouTubeVideoPage = (url) => {
  return url && url.includes("youtube.com/watch") && extractVideoId(url);
};

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

document.addEventListener("DOMContentLoaded", initializeExtension);

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