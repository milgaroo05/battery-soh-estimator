// 🧪 산업용 정밀 모델 (파라미터: NREL/Sandia 연구 논문 기반 근사치)
const BATTERY_MODELS = {
    "lead": { 
        name: "납축전지 (Lead-Acid)", 
        cal_coeff: 0.0035, // 캘린더 노화가 꽤 있음 (황산화)
        cyc_coeff: 0.0006, // 사이클 수명이 짧음 (보통 300~500회)
        dod_stress: 2.3,   // 깊게 쓸수록 수명 급감 (매우 민감)
        rate_stress: 0.2,  // 고출력 시 효율 저하 큼
        ea: 35000          // 온도 민감도
    },
    "nmc": { 
        name: "리튬이온 (NMC)", 
        cal_coeff: 0.0025, // 일반적 수준
        cyc_coeff: 0.0003, // 사이클 수명 양호 (800~1000회)
        dod_stress: 1.8,   // DOD 영향 있음
        rate_stress: 0.15, // 급속 충전 영향 있음
        ea: 24000
    },
    "lfp": { 
        name: "인산철 (LFP)", 
        cal_coeff: 0.0008, // 캘린더 노화 매우 적음
        cyc_coeff: 0.00012,// 사이클 수명 매우 김 (2000회+)
        dod_stress: 1.2,   // 깊게 써도 잘 버팀
        rate_stress: 0.05, // 튼튼함
        ea: 18000
    }
};

const R_CONST = 8.314;

function updateVal(id, val) {
    document.getElementById(id).innerText = val;
}

function calculateProfessionalSOH() {
    // 1. 입력값 가져오기
    const memo = document.getElementById('memo').value || "미입력";
    const typeKey = document.getElementById('batteryType').value;
    const designCap = parseFloat(document.getElementById('designCap').value);
    
    const ageMonths = parseFloat(document.getElementById('ageMonths').value);
    const cycles = parseFloat(document.getElementById('cycles').value);
    const tempC = parseFloat(document.getElementById('tempInput').value);
    
    // 고급 설정
    const dodPercent = parseFloat(document.getElementById('dodRange').value);
    const cRate = parseFloat(document.getElementById('cRateRange').value);

    // 유효성 검사
    if (isNaN(designCap) || isNaN(ageMonths) || isNaN(cycles) || isNaN(tempC)) {
        alert("기본 정보(용량, 기간, 횟수, 온도)를 모두 입력해주세요.");
        return;
    }

    // 2. 정밀 노화 계산 (Physics-based)
    const model = BATTERY_MODELS[typeKey];
    const tempK = tempC + 273.15;
    const refTempK = 298.15; // 25도 기준

    // [A] 온도 스트레스 (아레니우스 식)
    const tempStress = Math.exp((model.ea / R_CONST) * (1/refTempK - 1/tempK));

    // [B] 캘린더 노화 (시간)
    // t^0.5 법칙 적용: 초기에 빠르고 갈수록 느려짐
    const calLoss = model.cal_coeff * Math.sqrt(ageMonths) * tempStress * 100;

    // [C] 사이클 노화 (사용)
    // DOD Stress: 깊게 쓸수록 데미지 가중 (지수함수)
    const dodRatio = dodPercent / 100;
    const dodFactor = Math.pow(dodRatio, model.dod_stress);
    
    // C-Rate Stress: 급속 충전 가중치
    const rateFactor = 1 + (cRate * model.rate_stress);

    const cycLoss = model.cyc_coeff * cycles * dodFactor * rateFactor * tempStress * 100;

    // [D] 합산
    const totalLoss = calLoss + cycLoss;
    let currentSoh = 100 - totalLoss;
    if (currentSoh < 0) currentSoh = 0;
    const currentCap = designCap * (currentSoh / 100);

    // 3. UI 업데이트
    const resultBox = document.getElementById('resultBox');
    resultBox.classList.remove('hidden');

    // SOH 및 상태 메시지
    const finalSohEl = document.getElementById('finalSoh');
    const msgEl = document.getElementById('healthMessage');
    
    finalSohEl.innerText = currentSoh.toFixed(1) + "%";
    
    let statusIcon = "🟢";
    let statusTxt = "상태 양호";
    
    if (currentSoh >= 80) {
        finalSohEl.style.color = "#4caf50";
        msgEl.style.color = "#4caf50";
    } else if (currentSoh >= 60) {
        finalSohEl.style.color = "#ff9800";
        msgEl.style.color = "#ff9800";
        statusIcon = "🟡";
        statusTxt = "점검 요망 (성능 저하)";
    } else {
        finalSohEl.style.color = "#f44336";
        msgEl.style.color = "#f44336";
        statusIcon = "🔴";
        statusTxt = "교체 권장 (수명 종료)";
    }
    msgEl.innerText = `${statusIcon} ${statusTxt}`;

    document.getElementById('currentCap').innerText = currentCap.toFixed(1);

    // 차트 업데이트 (비율 계산)
    updateBar('calBar', 'calVal', calLoss);
    updateBar('cycBar', 'cycVal', cycLoss);

    // 원인 분석 텍스트
    let reason = "정상적인 자연 노화";
    if (cycLoss > calLoss * 1.5) reason = "잦은 충방전 및 과다 사용";
    if (dodPercent > 90 && typeKey === 'lead') reason = "심방전(과방전)에 의한 손상";
    if (tempC > 35) reason = "고온 환경에 의한 열화 가속";
    if (cRate > 1.0) reason = "급속 충전에 의한 스트레스";

    document.getElementById('agingReason').innerText = reason;

    // 4. 리포트 텍스트 생성
    const reportText = `[배터리 정밀 진단서]
📅 일시: ${new Date().toLocaleDateString()}
📌 관리명: ${memo}
🔋 배터리: ${model.name} (${designCap}Ah)

📊 진단 결과: ${currentSoh.toFixed(1)}% (${statusTxt})
- 현재 용량: ${currentCap.toFixed(1)} Ah
- 사용 이력: ${ageMonths}개월 / ${cycles}회
- 운용 환경: DOD ${dodPercent}%, 온도 ${tempC}℃

🔍 상세 분석
- 세월 노화(캘린더): -${calLoss.toFixed(1)}%
- 사용 노화(사이클): -${cycLoss.toFixed(1)}%
- 주요 원인: ${reason}

※ 본 리포트는 NREL 모델 기반 추정치입니다.`;

    document.getElementById('copyText').value = reportText;
    
    // 스크롤 이동
    resultBox.scrollIntoView({ behavior: 'smooth' });
}

function updateBar(barId, txtId, val) {
    // 그래프 최대치를 40% 정도로 잡아서 시각화
    let width = (val / 40) * 100;
    if (width > 100) width = 100;
    document.getElementById(barId).style.width = width + "%";
    document.getElementById(txtId).innerText = "-" + val.toFixed(1) + "%";
}

function copyReport() {
    const copyText = document.getElementById("copyText");
    copyText.style.display = 'block';
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    
    try {
        navigator.clipboard.writeText(copyText.value).then(() => {
            alert("리포트가 복사되었습니다! 카톡창에 붙여넣기 하세요.");
        });
    } catch (err) {
        document.execCommand('copy');
        alert("리포트 복사 완료!");
    }
    copyText.style.display = 'none';
}

function resetForm() {
    location.reload();
}