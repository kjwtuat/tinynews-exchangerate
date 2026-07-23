// tinynews Exchange Rate - Main Client Logic

let currentData = null;
let currentUtterance = null;
let activePlayingCardId = null;

const dateSelect = document.getElementById('dateSelect');
const ratesGrid = document.getElementById('ratesGrid');
const speakableTitleText = document.getElementById('speakableTitleText');
const scriptCardsContainer = document.getElementById('scriptCardsContainer');
const fullPlayBtn = document.getElementById('fullPlayBtn');
const playBtnText = document.getElementById('playBtnText');
const playIcon = document.getElementById('playIcon');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  setupTTSControls();
  await loadAvailableDates();
});

// Load available dates from public/data/index.json
async function loadAvailableDates() {
  try {
    const res = await fetch('./data/index.json');
    if (!res.ok) throw new Error('index.json 로드 실패');
    const dates = await res.json();

    if (!dates || dates.length === 0) {
      dateSelect.innerHTML = '<option value="">데이터 없음</option>';
      return;
    }

    dateSelect.innerHTML = dates
      .map(d => `<option value="${d}">${d}</option>`)
      .join('');

    // Load latest date
    loadReport(dates[0]);

    dateSelect.addEventListener('change', (e) => {
      stopSpeech();
      loadReport(e.target.value);
    });
  } catch (err) {
    console.error('날짜 목록 로드 중 오류:', err);
    dateSelect.innerHTML = '<option value="">리포트 없음</option>';
    speakableTitleText.textContent = '저장된 환율 리포트가 없습니다. 먼저 fetch 스크립트를 실행해 주세요.';
  }
}

// Load specific date report
async function loadReport(dateStr) {
  try {
    // Clear & skeleton
    ratesGrid.innerHTML = `
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    `;
    scriptCardsContainer.innerHTML = `
      <div class="skeleton-card large"></div>
      <div class="skeleton-card large"></div>
    `;
    speakableTitleText.textContent = '리포트 불러오는 중...';

    const res = await fetch(`./data/${dateStr}.json`);
    if (!res.ok) throw new Error(`${dateStr}.json 로드 실패`);
    currentData = await res.json();

    renderReport(currentData);
  } catch (err) {
    console.error('리포트 상세 로드 중 오류:', err);
    speakableTitleText.textContent = '리포트 데이터를 불러오지 못했습니다.';
  }
}

// Render report contents
function renderReport(data) {
  // 1. Speakable Title
  speakableTitleText.textContent = data.speakableTitle || '오늘의 환율 브리핑입니다.';

  // 2. Ticker Rates Grid
  if (data.rates && Array.isArray(data.rates)) {
    ratesGrid.innerHTML = data.rates.map(rate => {
      let changeClass = 'flat';
      let changeSign = '';
      if (rate.change === '상승' || (rate.changeText && rate.changeText.includes('+'))) {
        changeClass = 'up';
        changeSign = '▲ ';
      } else if (rate.change === '하락' || (rate.changeText && rate.changeText.includes('-'))) {
        changeClass = 'down';
        changeSign = '▼ ';
      }

      return `
        <div class="rate-card">
          <div class="rate-header">
            <div class="currency-info">
              <div class="currency-symbol">${rate.symbol || '$'}</div>
              <span class="currency-name">${rate.name || rate.code}</span>
            </div>
            <span class="change-badge ${changeClass}">${changeSign}${rate.changeText || rate.change}</span>
          </div>
          <div class="rate-value">
            ${rate.value} <span class="rate-unit">원</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Script Cards
  if (data.script && Array.isArray(data.script)) {
    scriptCardsContainer.innerHTML = data.script.map(item => `
      <div class="script-card" id="script-card-${item.id}">
        <div class="script-card-header">
          <span class="script-tag">PART ${item.id}</span>
          <button class="play-btn section-play-btn" data-id="${item.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>이 단락 듣기</span>
          </button>
        </div>
        <h3 class="script-speakable-title">${item.speakableTitle}</h3>
        <p class="script-content">${item.detailedSummary}</p>
      </div>
    `).join('');

    // Attach section play listeners
    document.querySelectorAll('.section-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
        toggleSectionSpeech(id);
      });
    });
  }
}

// TTS Speech Control (Web Speech API)
function setupTTSControls() {
  fullPlayBtn.addEventListener('click', () => {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      stopSpeech();
    } else {
      playFullSpeech();
    }
  });
}

function playFullSpeech() {
  if (!currentData || !('speechSynthesis' in window)) {
    alert('이 브라우저에서는 음성 합성(TTS)이 지원되지 않습니다.');
    return;
  }

  stopSpeech();

  const textToRead = [
    currentData.speakableTitle,
    ...currentData.script.map(s => `${s.speakableTitle}. ${s.detailedSummary}`)
  ].join(' ');

  speakText(textToRead, () => {
    updatePlayBtnState(false);
    clearCardHighlights();
  });

  updatePlayBtnState(true);
}

function toggleSectionSpeech(id) {
  if ('speechSynthesis' in window && window.speechSynthesis.speaking && activePlayingCardId === id) {
    stopSpeech();
    return;
  }

  stopSpeech();

  const item = currentData.script.find(s => s.id === id);
  if (!item) return;

  const cardElem = document.getElementById(`script-card-${id}`);
  if (cardElem) cardElem.classList.add('active-speech');
  activePlayingCardId = id;

  const textToRead = `${item.speakableTitle}. ${item.detailedSummary}`;
  speakText(textToRead, () => {
    if (cardElem) cardElem.classList.remove('active-speech');
    activePlayingCardId = null;
  });
}

function speakText(text, onEndCallback) {
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.lang = 'ko-KR';
  currentUtterance.rate = 1.0;
  currentUtterance.pitch = 1.0;

  currentUtterance.onend = () => {
    if (onEndCallback) onEndCallback();
  };

  currentUtterance.onerror = (e) => {
    console.error('TTS 오류:', e);
    stopSpeech();
  };

  window.speechSynthesis.speak(currentUtterance);
}

function stopSpeech() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  updatePlayBtnState(false);
  clearCardHighlights();
  activePlayingCardId = null;
}

function updatePlayBtnState(isPlaying) {
  if (isPlaying) {
    fullPlayBtn.classList.add('playing');
    playBtnText.textContent = '음성 재생 정지';
    playIcon.innerHTML = '<rect x="6" y="6" width="12" height="12"></rect>';
  } else {
    fullPlayBtn.classList.remove('playing');
    playBtnText.textContent = '전체 대본 음성 듣기';
    playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
  }
}

function clearCardHighlights() {
  document.querySelectorAll('.script-card').forEach(card => {
    card.classList.remove('active-speech');
  });
}
