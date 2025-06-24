// index.js
// Slack-Notion Integration Bot 메인 실행 파일

const SlackNotionBot = require("./slack-bot");

// 환경 변수 확인
function validateEnvironment() {
  const required = [
    "SLACK_BOT_TOKEN",
    "SLACK_APP_TOKEN",
    "NOTION_TOKEN",
    "NOTION_PARENT_PAGE_ID",
    "SNOWFLAKE_ACCOUNT",
    "SNOWFLAKE_USERNAME",
    "SNOWFLAKE_PRIVATE_KEY_PATH"
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("🔥 필수 환경 변수가 누락되었습니다:");
    missing.forEach((key) => {
      console.error(`   ❌ ${key}`);
    });
    console.error("\n📋 .env 파일을 확인하고 필요한 토큰들을 설정하세요.");
    console.error("📖 설정 가이드: README.md 참조");
    process.exit(1);
  }

  console.log("✅ 환경 변수 확인 완료");
}

// 메인 실행 함수
async function main() {
  try {
    console.log("🚀 Slack-Notion Integration Bot 시작...");
    console.log("=".repeat(50));

    // 환경 변수 검증
    validateEnvironment();

    // 봇 인스턴스 생성
    const bot = new SlackNotionBot();

    // 봇 시작
    await bot.start();

    // 성공 메시지
    console.log("\n🎉 봇이 성공적으로 시작되었습니다!");
    console.log("📱 Slack에서 봇을 멘션하거나 DM을 보내보세요.");
    console.log("⚡ 사용법:");
    console.log("   • @bot 메시지 내용");
    console.log("   • DM으로 메시지 전송");
    console.log("   • /notion 메시지 내용");
    console.log("\n🛑 종료하려면 Ctrl+C를 누르세요.");

    // 종료 시그널 처리
    process.on("SIGINT", async () => {
      console.log("\n🛑 종료 신호를 받았습니다...");
      await bot.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n🛑 종료 신호를 받았습니다...");
      await bot.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("💥 봇 시작 실패:", error.message);
    console.error("\n🔧 문제 해결:");
    console.error("1. .env 파일의 모든 토큰이 올바른지 확인");
    console.error("2. Slack App이 올바르게 설정되었는지 확인");
    console.error("3. Snowflake 연결이 정상인지 확인");
    console.error("4. Notion API 토큰이 유효한지 확인");
    process.exit(1);
  }
}

// 프로그램 실행
if (require.main === module) {
  main();
}

module.exports = { main };
