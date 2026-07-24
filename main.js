import './style.css';

const dateListEl = document.getElementById('date-list');
const currentDateTitle = document.getElementById('current-date-title');
const newsContainer = document.getElementById('news-container');

async function init() {
  try {
    // 1. 저장된 날짜 목록(index.json) 불러오기
    const res = await fetch(`${import.meta.env.BASE_URL}data/index.json`);
    if (!res.ok) throw new Error('데이터를 불러올 수 없습니다.');
    const dates = await res.json();
    
    if (dates.length === 0) {
      currentDateTitle.textContent = "저장된 환율 리포트가 없습니다.";
      return;
    }

    // 2. 사이드바에 날짜 탭 렌더링
    renderDateList(dates);
    
    // 3. 가장 최신 날짜의 뉴스 자동 로드
    loadReportForDate(dates[0]);

  } catch (err) {
    console.error(err);
    currentDateTitle.textContent = "환율 데이터를 준비 중입니다.";
  }
}

function renderDateList(dates) {
  dateListEl.innerHTML = '';
  
  dates.forEach((date, index) => {
    const btn = document.createElement('div');
    btn.className = `date-item ${index === 0 ? 'active' : ''}`;
    
    // 날짜 포맷팅 (YYYY-MM-DD -> YYYY. MM. DD.)
    const [year, month, day] = date.split('-');
    btn.textContent = `${year}. ${month}. ${day}.`;
    
    btn.addEventListener('click', () => {
      // 메뉴 액티브 상태 전환
      document.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      
      loadReportForDate(date);
    });
    
    dateListEl.appendChild(btn);
  });
}

async function loadReportForDate(dateString) {
  try {
    const [year, month, day] = dateString.split('-');
    currentDateTitle.textContent = `${year}년 ${month}월 ${day}일 환율 동향`;
    newsContainer.innerHTML = '<p style="color: var(--text-tertiary);">환율 리포트를 불러오는 중입니다...</p>';
    
    // 특정 날짜의 JSON 데이터 패치
    const res = await fetch(`${import.meta.env.BASE_URL}data/${dateString}.json`);
    if (!res.ok) throw new Error('리포트를 찾을 수 없습니다.');
    const reportData = await res.json();
    
    newsContainer.innerHTML = '';
    
    // 1. 전체 요약 (speakableTitle)
    if (reportData.speakableTitle) {
      const summaryEl = document.createElement('article');
      summaryEl.className = 'news-item';
      
      const summaryTitle = document.createElement('h3');
      summaryTitle.className = 'news-title';
      summaryTitle.textContent = "오늘의 핵심 요약";
      
      const summaryText = document.createElement('p');
      summaryText.className = 'news-snippet';
      summaryText.textContent = reportData.speakableTitle;
      
      summaryEl.appendChild(summaryTitle);
      summaryEl.appendChild(summaryText);
      newsContainer.appendChild(summaryEl);
    }

    // 2. 주요 통화 매매기준율 (rates)
    if (reportData.rates && reportData.rates.length > 0) {
      const ratesEl = document.createElement('article');
      ratesEl.className = 'news-item';
      
      const ratesTitle = document.createElement('h3');
      ratesTitle.className = 'news-title';
      ratesTitle.textContent = "주요 통화 환율";
      ratesEl.appendChild(ratesTitle);

      const ratesList = document.createElement('ul');
      ratesList.style.listStyleType = 'none';
      ratesList.style.paddingLeft = '0';
      ratesList.style.marginTop = '0.5rem';

      reportData.rates.forEach(rate => {
        const li = document.createElement('li');
        li.style.marginBottom = '0.4rem';
        li.style.fontSize = '1.05rem';
        li.style.color = 'var(--text-secondary)';
        
        let changeText = rate.changeText || rate.change;
        let changeSign = '';
        if (rate.change === '상승' || (changeText && changeText.includes('+'))) {
          changeSign = '▲ ';
          changeText = `<span style="color: #ff4444;">${changeSign}${changeText}</span>`;
        } else if (rate.change === '하락' || (changeText && changeText.includes('-'))) {
          changeSign = '▼ ';
          changeText = `<span style="color: #4444ff;">${changeSign}${changeText}</span>`;
        } else {
          changeText = `<span>${changeText}</span>`;
        }

        li.innerHTML = `<strong>${rate.name || rate.code}</strong> (${rate.symbol || '$'}): ${rate.value} 원 &nbsp; ${changeText}`;
        ratesList.appendChild(li);
      });

      ratesEl.appendChild(ratesList);
      newsContainer.appendChild(ratesEl);
    }
    
    // 3. AI 상세 스크립트 파트 (script)
    if (reportData.script && reportData.script.length > 0) {
      reportData.script.forEach(item => {
        const articleEl = document.createElement('article');
        articleEl.className = 'news-item';
        
        const publisherEl = document.createElement('div');
        publisherEl.className = 'news-publisher';
        publisherEl.textContent = `PART ${item.id}`;
        
        const titleEl = document.createElement('h3');
        titleEl.className = 'news-title';
        titleEl.textContent = item.speakableTitle || item.originalTitle;
        
        articleEl.appendChild(publisherEl);
        articleEl.appendChild(titleEl);
        
        if (item.detailedSummary) {
          const snippetEl = document.createElement('p');
          snippetEl.className = 'news-snippet';
          snippetEl.textContent = item.detailedSummary; 
          articleEl.appendChild(snippetEl);
        }
        
        newsContainer.appendChild(articleEl);
      });
    }
    
    // 모바일 환경 등에서 다른 날짜 클릭 시 부드럽게 상단으로 스크롤 이동
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
  } catch (err) {
    console.error(err);
    newsContainer.innerHTML = '<p style="color: #ff4444;">데이터를 불러오는 중 오류가 발생했습니다.</p>';
  }
}

// 앱 시작
init();
