import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const parser = new Parser();
const RSS_URL = encodeURI('https://news.google.com/rss/search?q=원달러 환율&hl=ko&gl=KR&ceid=KR:ko');
const dataDir = path.join(process.cwd(), 'public', 'data');
const MAX_DAYS = 7;
const MAX_NEWS_ITEMS = 8;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getExchangeRateData() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    const rates = data.rates;
    
    const krw = rates.KRW || 1380;
    const jpy = rates.JPY ? (krw / rates.JPY) * 100 : 890;
    const eur = rates.EUR ? krw / rates.EUR : 1500;
    const cny = rates.CNY ? krw / rates.CNY : 190;
    const gbp = rates.GBP ? krw / rates.GBP : 1780;

    return {
      USD: { name: '미국 달러', symbol: '$', rate: krw.toFixed(2) },
      JPY: { name: '일본 엔 (100엔)', symbol: '¥', rate: jpy.toFixed(2) },
      EUR: { name: '유로', symbol: '€', rate: eur.toFixed(2) },
      CNY: { name: '중국 위안', symbol: '¥', rate: cny.toFixed(2) },
      GBP: { name: '영국 파운드', symbol: '£', rate: gbp.toFixed(2) }
    };
  } catch (err) {
    console.error('실시간 환율 수집 실패, 기본값 사용:', err);
    return {
      USD: { name: '미국 달러', symbol: '$', rate: '1385.00' },
      JPY: { name: '일본 엔 (100엔)', symbol: '¥', rate: '890.50' },
      EUR: { name: '유로', symbol: '€', rate: '1505.20' },
      CNY: { name: '중국 위안', symbol: '¥', rate: '191.30' },
      GBP: { name: '영국 파운드', symbol: '£', rate: '1785.40' }
    };
  }
}

async function processExchangeRateWithGemini(newsItems, exchangeRates, dateString) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY가 .env 파일에 설정되어 있지 않습니다.");
  }

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const prompt = `
당신은 전문 외환/금융 분석가이자 친절한 아나운서입니다.
오늘 날짜: ${dateString}

제공된 실시간 주요 통화 환율 수치 데이터 및 관련 최신 뉴스 기사를 바탕으로, 시각장애인이나 운전자가 음성(TTS)으로 듣기 편한 고품질 구어체 환율 브리핑 데이터를 작성해주세요.
도입부 인사말("안녕하세요", "AI 브리퍼입니다")은 대본에 절대로 작성하지 마시고, 바로 본론으로 시작하세요.

[입력 데이터 1 (실시간 환율 수치)]
${JSON.stringify(exchangeRates, null, 2)}

[입력 데이터 2 (최신 환율 뉴스 기사)]
${JSON.stringify(newsItems, null, 2)}

[출력 JSON 구조 상세 요청]
반드시 다음 객체 형태의 JSON으로 반환하세요. 오직 JSON만 출력하고 마크다운 문법은 포함하지 마세요.

{
  "date": "${dateString}",
  "speakableTitle": "오늘의 핵심 환율 동향을 짧게 아우르는 대표 한 줄 타이틀 (예: 오늘 원/달러 환율은 1,385원선에서 거래되며 미 금리 동결 영향으로 소폭 상승했습니다.)",
  "rates": [
    {
      "code": "USD",
      "name": "미국 달러",
      "symbol": "$",
      "value": "1,385.00",
      "change": "상승" | "하락" | "보합",
      "changeText": "+3.5원"
    },
    ... (JPY 100엔, EUR, CNY, GBP 포함 5개 통화 필수)
  ],
  "script": [
    {
      "id": 1,
      "originalTitle": "오늘의 환율 시장 총평",
      "speakableTitle": "오늘의 외환 시장 총평입니다.",
      "detailedSummary": "오늘 원달러 환율의 흐름과 주요 수치를 아나운서 톤 구어체로 명확하게 설명하는 3~4문장 대본"
    },
    {
      "id": 2,
      "originalTitle": "주요 통화별 동향 분석",
      "speakableTitle": "이어서 달러, 엔화, 유로화 등 주요 통화별 세부 동향입니다.",
      "detailedSummary": "달러화, 엔화(100엔 당), 유로화 등 입력 데이터 수치를 자연스럽게 읊어주며 최근 흐름을 설명하는 대본"
    },
    {
      "id": 3,
      "originalTitle": "환율 영향 주요 이슈",
      "speakableTitle": "환율 변동에 영향을 준 주요 경제 뉴스입니다.",
      "detailedSummary": "입력 데이터 2의 뉴스 기사를 종합하여 환율 상승/하락 원인이 된 경제 변수를 분석해 주는 대본"
    },
    {
      "id": 4,
      "originalTitle": "오늘의 외환 팁",
      "speakableTitle": "마지막으로 해외 여행객과 환전 수요자를 위한 팁입니다.",
      "detailedSummary": "환율 변동 상황에 따른 환전 타이밍이나 외화 투자 유의사항을 조언해 주는 친절한 대본"
    }
  ]
}
`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsedData = JSON.parse(responseText);
    return parsedData;
  } catch (error) {
    console.error("Gemini API 처리 중 오류 발생:", error);
    throw error;
  }
}

async function fetchAndSaveExchangeRate() {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const today = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(today.getTime() + kstOffset);
    const dateString = kstDate.toISOString().split('T')[0];

    console.log(`[${dateString}] 실시간 환율 정보 수집 시작...`);
    const exchangeRates = await getExchangeRateData();

    console.log(`Google 뉴스 RSS 수집 중...`);
    const feed = await parser.parseURL(RSS_URL);
    const newsItems = feed.items.slice(0, MAX_NEWS_ITEMS).map(item => {
      const titleParts = item.title.split(' - ');
      const publisher = titleParts.length > 1 ? titleParts.pop() : '';
      return {
        title: titleParts.join(' - '),
        publisher: publisher,
        snippet: item.contentSnippet || ''
      };
    });

    console.log(`Gemini API로 AI 외환 브리핑 대본 생성 중...`);
    const resultData = await processExchangeRateWithGemini(newsItems, exchangeRates, dateString);

    const filePath = path.join(dataDir, `${dateString}.json`);
    fs.writeFileSync(filePath, JSON.stringify(resultData, null, 2), 'utf-8');
    console.log(`성공적으로 저장됨: ${dateString}.json`);

    // 7일 지난 파일 자동 cleanup
    const files = fs.readdirSync(dataDir);
    const availableDates = [];
    const cutoffDate = new Date(kstDate.getTime() - (MAX_DAYS * 24 * 60 * 60 * 1000));
    const cutoffDateString = cutoffDate.toISOString().split('T')[0];

    files.forEach(file => {
      if (file === 'index.json' || !file.endsWith('.json')) return;

      const fileDateStr = file.replace('.json', '');
      if (fileDateStr < cutoffDateString) {
        fs.unlinkSync(path.join(dataDir, file));
        console.log(`오래된 환율 데이터 삭제: ${file}`);
      } else {
        availableDates.push(fileDateStr);
      }
    });

    availableDates.sort((a, b) => b.localeCompare(a));
    fs.writeFileSync(
      path.join(dataDir, 'index.json'), 
      JSON.stringify(availableDates, null, 2), 
      'utf-8'
    );
    console.log('index.json 목록 갱신 완료.');

  } catch (error) {
    console.error('환율 데이터 수집 및 가공 실패:', error);
    process.exit(1);
  }
}

fetchAndSaveExchangeRate();
