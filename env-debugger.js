// env-debugger.js
// 환경변수 로딩 문제 진단 및 해결

const fs = require("fs");
const path = require("path");

console.log("🔍 환경변수 로딩 문제 진단");
console.log("=".repeat(60));

// 1. 현재 작업 디렉토리 확인
console.log("📁 1단계: 작업 디렉토리 확인");
console.log("-".repeat(40));
console.log(`현재 작업 디렉토리: ${process.cwd()}`);
console.log(`스크립트 위치: ${__dirname}`);
console.log(`스크립트 파일: ${__filename}`);

// 2. .env 파일 위치 찾기
console.log("\n📄 2단계: .env 파일 위치 확인");
console.log("-".repeat(40));

const possibleEnvPaths = [
  path.join(process.cwd(), ".env"),
  path.join(__dirname, ".env"),
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", "..", ".env")
];

let envFound = false;
let envPath = null;

possibleEnvPaths.forEach((filePath, index) => {
  const exists = fs.existsSync(filePath);
  console.log(`${index + 1}. ${filePath} - ${exists ? "✅ 존재함" : "❌ 없음"}`);

  if (exists && !envFound) {
    envFound = true;
    envPath = filePath;
  }
});

if (!envFound) {
  console.log("\n❌ .env 파일을 찾을 수 없습니다!");
  console.log("🔧 해결방법:");
  console.log("1. .env 파일이 현재 디렉토리에 있는지 확인");
  console.log("2. 파일명이 정확히 '.env'인지 확인 (.env.example이 아닌)");
  process.exit(1);
}

console.log(`\n✅ .env 파일 발견: ${envPath}`);

// 3. .env 파일 내용 확인 (보안상 마스킹)
console.log("\n🔑 3단계: .env 파일 내용 확인");
console.log("-".repeat(40));

try {
  const envContent = fs.readFileSync(envPath, "utf8");
  const lines = envContent.split("\n").filter((line) => line.trim() && !line.startsWith("#"));

  console.log(`📄 총 ${lines.length}개 환경변수 정의됨:`);

  const importantVars = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "NOTION_TOKEN", "NOTION_PARENT_PAGE_ID", "SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USERNAME"];

  importantVars.forEach((varName) => {
    const line = lines.find((l) => l.startsWith(`${varName}=`));
    if (line) {
      const value = line.split("=")[1];
      console.log(`   ✅ ${varName}=${value ? value.substring(0, 10) + "..." : "EMPTY"}`);
    } else {
      console.log(`   ❌ ${varName}=NOT_FOUND`);
    }
  });
} catch (error) {
  console.log(`❌ .env 파일 읽기 실패: ${error.message}`);
}

// 4. 수동으로 dotenv 로드 테스트
console.log("\n⚡ 4단계: 수동 dotenv 로드 테스트");
console.log("-".repeat(40));

try {
  // 먼저 기존 환경변수 상태 확인
  console.log("로드 전 상태:");
  console.log(`   SLACK_BOT_TOKEN: ${process.env.SLACK_BOT_TOKEN ? "✅ 있음" : "❌ 없음"}`);

  // dotenv 수동 로드
  require("dotenv").config({ path: envPath });

  console.log("로드 후 상태:");
  console.log(`   SLACK_BOT_TOKEN: ${process.env.SLACK_BOT_TOKEN ? "✅ 있음" : "❌ 없음"}`);

  if (process.env.SLACK_BOT_TOKEN) {
    console.log(`   토큰 길이: ${process.env.SLACK_BOT_TOKEN.length}자`);
    console.log(`   토큰 시작: ${process.env.SLACK_BOT_TOKEN.substring(0, 10)}...`);
  }
} catch (error) {
  console.log(`❌ dotenv 로드 실패: ${error.message}`);
}

// 5. 해결된 환경변수로 Slack 테스트
console.log("\n🧪 5단계: 환경변수 로드 후 Slack 테스트");
console.log("-".repeat(40));

if (process.env.SLACK_BOT_TOKEN) {
  try {
    const { WebClient } = require("@slack/web-api");
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

    console.log("🔄 Slack API 테스트 중...");
    slack.auth
      .test()
      .then((response) => {
        console.log("✅ Slack 연결 성공!");
        console.log(`   봇: ${response.user}`);
        console.log(`   팀: ${response.team}`);

        console.log("\n🎉 문제 해결됨!");
        console.log("🔧 bulk-slack-analyzer.js에서 다음과 같이 수정하세요:");
        console.log(`require('dotenv').config({ path: '${envPath}' });`);
      })
      .catch((error) => {
        console.log("❌ Slack 연결 여전히 실패");
        console.log(`   오류: ${error.message}`);
      });
  } catch (error) {
    console.log(`❌ Slack 테스트 실패: ${error.message}`);
  }
} else {
  console.log("❌ 여전히 SLACK_BOT_TOKEN이 로드되지 않음");
}

// 6. 권장 해결책
console.log("\n🎯 6단계: 권장 해결책");
console.log("-".repeat(40));

if (envFound) {
  console.log("✅ .env 파일이 발견되었습니다.");
  console.log("🔧 bulk-slack-analyzer.js 수정방법:");
  console.log("1. 파일 맨 위에 다음을 추가:");
  console.log(`   require('dotenv').config({ path: '${envPath}' });`);
  console.log("");
  console.log("2. 또는 절대 경로로 실행:");
  console.log(`   cd ${path.dirname(envPath)} && node bulk-slack-analyzer.js`);
  console.log("");
  console.log("3. 또는 환경변수 직접 설정:");
  console.log("   SLACK_BOT_TOKEN=your_token node bulk-slack-analyzer.js");
} else {
  console.log("❌ .env 파일 생성이 필요합니다.");
  console.log("🔧 해결방법:");
  console.log("1. 현재 디렉토리에 .env 파일 생성");
  console.log("2. 필요한 환경변수들 설정");
}
