// content.js
// 이 파일은 YouTube 페이지에서 직접 작동하는 스크립트입니다.
// 확장 프로그램 버튼이 클릭되면 background.js로부터 메시지를 받습니다.

// background.js로부터 메시지를 수신하는 리스너입니다.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "startSummary") {
    handleExtensionButtonClick();
    // 비동기 응답을 위해 true를 반환합니다.
    return true; 
  }
});

/**
 * 확장 프로그램 버튼 클릭 시 호출되는 메인 핸들러 함수입니다.
 * '더보기' 버튼을 클릭하고, 스크립트 패널을 기다립니다.
 */
function handleExtensionButtonClick() {
  showNotification("⏳ 스크립트 로딩 중...", "info");

  // '더보기' 버튼이 존재하는지 확인하고 클릭합니다.
  const showMoreClicked = clickButton('#expand.ytd-text-inline-expander', '더보기');
  
  if (showMoreClicked) {
    // '더보기' 버튼이 클릭된 경우, DOM 변경을 감지하기 위한 MutationObserver를 설정합니다.
    const observer = new MutationObserver((mutations, obs) => {
      // '스크립트 표시' 버튼이 나타나면 클릭합니다.
      const transcriptClicked = clickButton('.yt-spec-button-shape-next[aria-label="스크립트 표시"]', '스크립트 표시');
      if (transcriptClicked) {
        // 버튼을 찾았으면 관찰을 중단하고 요약 프로세스를 시작합니다.
        obs.disconnect();
        startSummaryAfterDelay();
      }
    });

    const descriptionContainer = document.querySelector('#description-inner');
    if (descriptionContainer) {
      observer.observe(descriptionContainer, {
        childList: true,
        subtree: true
      });
    }
  } else {
    // '더보기' 버튼이 없는 경우, 바로 요약 프로세스를 시작합니다.
    startSummaryAfterDelay();
  }
}

/**
 * 주어진 CSS 선택자를 사용하여 버튼을 찾아 클릭하는 헬퍼 함수입니다.
 * @param {string} selector - 클릭할 버튼의 CSS 선택자.
 * @param {string} buttonName - 콘솔 로그에 표시할 버튼의 이름.
 * @returns {boolean} - 버튼을 찾아서 클릭했는지 여부.
 */
function clickButton(selector, buttonName) {
  const button = document.querySelector(selector);
  if (button) {
    button.click();
    console.log(`YouTube "${buttonName}" 버튼이 클릭되었습니다!`);
    return true;
  }
  return false;
}

/**
 * 요약 프로세스를 3초 지연 후 시작하는 함수입니다.
 */
function startSummaryAfterDelay() {
  setTimeout(() => {
    startSummaryProcess();
  }, 3000); // 3초 지연
}

/**
 * 스크립트를 추출하고 요약 프로세스를 시작하는 함수입니다.
 */
function startSummaryProcess() {
  // 기존 패널이 있으면 제거합니다.
  const existingPanel = document.querySelector('.youtube-summary-panel');
  if (existingPanel) {
    existingPanel.remove();
  }

  showNotification("⏳ 스크립트 요약 중...", "info");
    
  let scriptText = '';
  const scriptContainer = document.querySelector('#segments-container');

  if (scriptContainer) {
    const segments = scriptContainer.querySelectorAll('.segment-text');
    segments.forEach(segment => {
      scriptText += segment.textContent.trim() + ' ';
    });
    
    // 스크립트 텍스트가 있으면 API 키를 확인하고 Gemini API를 호출합니다.
    if (scriptText) {
      getApiKeyAndSummarize(scriptText);
    } else {
      showNotification("⚠️ 스크립트가 비어 있습니다.", "warning");
    }
  } else {
    showNotification("⚠️ 스크립트를 찾을 수 없습니다. 동영상 페이지인지 확인해주세요.", "warning");
  }
}

/**
 * API 키를 확인하고 스크립트를 요약하는 함수입니다.
 * @param {string} text - 요약할 전체 스크립트 텍스트.
 */
function getApiKeyAndSummarize(text) {
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    const apiKey = result.geminiApiKey;
    if (apiKey) {
      summarizeScript(text, apiKey);
    } else {
      const newKey = prompt("Gemini API 키를 입력해주세요. (한 번만 입력하면 됩니다.)");
      if (newKey) {
        chrome.storage.local.set({ geminiApiKey: newKey }, () => {
          console.log("API 키가 저장되었습니다.");
          summarizeScript(text, newKey);
        });
      } else {
        showNotification("❌ API 키가 필요합니다. 확장 프로그램을 다시 실행해 주세요.", "error");
      }
    }
  });
}

/**
 * Gemini API를 사용하여 스크립트를 요약하는 비동기 함수입니다.
 * @param {string} text - 요약할 전체 스크립트 텍스트.
 * @param {string} apiKey - Gemini API 키.
 */
async function summarizeScript(text, apiKey) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const payload = {
    "contents": [
      {
        "parts": [
          {
            "text": `다음 동영상 자막을 3~10개의 주요 항목으로 한국어로 요약해 줘. 중요한 내용별로 두세 문장씩 단락을 나누어 작성해 주고 '*' 또는 '**' 표시는 삭제해 줘.\n\n${text}`
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const summary = data.candidates[0].content.parts[0].text;

    showSidePanel(summary);
    showNotification("✅ 스크립트 요약 완료!", "success");

  } catch (error) {
    console.error('Gemini API 오류:', error);
    showNotification(`❌ 요약 실패: ${error.message}`, "error");
  }
}

/**
 * 사용자에게 알림 메시지를 표시하는 함수입니다.
 * @param {string} message - 표시할 알림 메시지.
 * @param {string} type - 'success', 'error', 'info', 'warning' 중 하나의 알림 유형.
 */
function showNotification(message, type) {
  const existingNotification = document.querySelector('.youtube-script-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = 'youtube-script-notification';
  notification.textContent = message;

  let backgroundColor;
  switch (type) {
    case "success":
      backgroundColor = '#4CAF50';
      break;
    case "error":
      backgroundColor = '#F44336';
      break;
    case "info":
      backgroundColor = '#2196F3';
      break;
    default:
      backgroundColor = '#FFC107'; // 'warning' 또는 다른 유형
  }
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px;
    color: white;
    font-size: 16px;
    border-radius: 5px;
    z-index: 99999;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    opacity: 0;
    transition: opacity 0.5s ease-in-out;
    background-color: ${backgroundColor};
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = 1;
  }, 10);

  setTimeout(() => {
    notification.style.opacity = 0;
    notification.addEventListener('transitionend', () => {
      notification.remove();
    });
  }, 3000);
}

// content.js
// ... (기존 코드)

/**
 * Creates a side panel to display the summarized text.
 * @param {string} summaryText - The text to be displayed in the summary panel.
 */
function showSidePanel(summaryText) {
  const existingPanel = document.querySelector('.youtube-summary-panel');
  if (existingPanel) {
    existingPanel.remove();
  }

  const panel = document.createElement('div');
  panel.className = 'youtube-summary-panel';
  panel.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100%;
    background-color: #f9f9f9;
    border-left: 1px solid #ddd;
    z-index: 9999;
    overflow-y: scroll;
    padding: 20px;
    box-shadow: -2px 0 10px rgba(0,0,0,0.1);
    font-family: sans-serif;
    line-height: 1.6;
    font-size: 16px;
  `;

  // Create the HTML structure safely
  const header = document.createElement('h2');
  header.textContent = '📄 스크립트 요약';

  const content = document.createElement('div');
  
  // Replace <br/> tags with newline characters for a secure approach
  const formattedText = summaryText.replace(/<br\s*\/?>/g, '\n');

  // Create a <p> element to hold the formatted text
  const p = document.createElement('p');
  
  // Use textContent for security, and then process newlines
  p.textContent = formattedText;
  
  // Apply CSS to honor the newlines
  p.style.whiteSpace = 'pre-wrap';
  p.style.marginBottom = '20px';

  content.appendChild(p);

  const closeButton = document.createElement('button');
  closeButton.textContent = 'X';
  closeButton.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: #ccc;
    border: none;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    cursor: pointer;
    font-weight: bold;
  `;

  panel.appendChild(header);
  panel.appendChild(content);
  panel.appendChild(closeButton);

  document.body.appendChild(panel);

  // Add a click event listener to the 'X' button to close the panel
  closeButton.addEventListener('click', () => {
    panel.remove();
  });
}