const titleEl = document.getElementById('title');
const authorEl = document.getElementById('author');
const artworkEl = document.getElementById('artwork');
const progressFill = document.getElementById('progressFill');
const playPauseBtn = document.getElementById('playPauseBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

let isPlaying = false;

// Receive state from main window via Electron IPC
if (window.electronAPI) {
  window.electronAPI.onPlayerStateUpdate((state) => {
    if (state.title) titleEl.innerText = state.title;
    if (state.author) authorEl.innerText = state.author;
    if (state.artwork) artworkEl.src = state.artwork;
    
    if (typeof state.isPlaying === 'boolean') {
      isPlaying = state.isPlaying;
      playPauseBtn.innerHTML = isPlaying 
        ? '<i class="ph-fill ph-pause"></i>' 
        : '<i class="ph-fill ph-play"></i>';
    }
    
    if (typeof state.progressPct === 'number') {
      progressFill.style.width = `${state.progressPct}%`;
    }
  });
}

// Send commands back to main window
playPauseBtn.addEventListener('click', () => {
  if (window.electronAPI) window.electronAPI.sendCommand('togglePlay');
});

prevBtn.addEventListener('click', () => {
  if (window.electronAPI) window.electronAPI.sendCommand('playPrev');
});

nextBtn.addEventListener('click', () => {
  if (window.electronAPI) window.electronAPI.sendCommand('playNext');
});
