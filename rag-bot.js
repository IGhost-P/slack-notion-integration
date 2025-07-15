// rag-bot.js
// RAG 기능이 포함된 슬랙 봇 실행

require("dotenv").config();
const SlackNotionBot = require("./src/slack-bot");

async function startRAGBot() {
  console.log("🚀 RAG 슬랙봇 시작!");
  console.log("=".repeat(50));

  // 환경변수 확인
  const requiredEnvs = [
    "SLACK_BOT_TOKEN",
    "SLACK_APP_TOKEN",
    "NOTION_TOKEN",
    "NOTION_PARENT_PAGE_ID",
    "SNOWFLAKE_ACCOUNT",
    "SNOWFLAKE_USERNAME",
    "SNOWFLAKE_DATABASE",
    "SNOWFLAKE_WAREHOUSE",
    "SNOWFLAKE_ROLE",
    "SNOWFLAKE_PRIVATE_KEY_PATH"
  ];

  const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);
  if (missingEnvs.length > 0) {
    console.error("❌ 필수 환경변수가 없습니다:");
    missingEnvs.forEach((env) => console.error(`   - ${env}`));
    console.error("\n📝 각 환경변수 용도:");
    console.error("   🔷 Slack: SLACK_BOT_TOKEN, SLACK_APP_TOKEN");
    console.error("   🔷 Notion: NOTION_TOKEN, NOTION_PARENT_PAGE_ID");
    console.error("   🔷 Snowflake: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, SNOWFLAKE_DATABASE,");
    console.error("                SNOWFLAKE_WAREHOUSE, SNOWFLAKE_ROLE, SNOWFLAKE_PRIVATE_KEY_PATH");
    console.error("\n💡 .env 파일을 확인하고 모든 값을 설정해주세요!");
    process.exit(1);
  }

  console.log("✅ 환경변수 확인 완료");

  // 선택적 환경변수 안내
  console.log("\n📋 선택적 환경변수 상태:");
  console.log(`   SNOWFLAKE_SCHEMA: ${process.env.SNOWFLAKE_SCHEMA || "PUBLIC (기본값)"}`);
  console.log(`   SNOWFLAKE_PRIVATE_KEY_PASSPHRASE: ${process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE ? "✅ 설정됨" : "❌ 없음 (비밀번호 없는 키)"}`);

  if (!process.env.RAG_DATABASE_ID) {
    // 👇 여기에 아까 생성된 데이터베이스 ID를 직접 입력하세요
    // 예: process.env.RAG_DATABASE_ID = "22d34bb1cbfd81c28a9aefecdf4cf1a3";

    console.log("   RAG_DATABASE_ID: ❌ 없음 (자동 감지 시도)");
    console.log("");
    console.log("💡 RAG_DATABASE_ID를 설정하면 더 빠른 검색이 가능합니다.");
    console.log("🔧 설정 방법:");
    console.log("   1. 위 코드에서 주석을 해제하고 실제 ID 입력");
    console.log('   2. 또는 터미널에서: export RAG_DATABASE_ID="데이터베이스_ID"');
    console.log("");
  } else {
    console.log(`   RAG_DATABASE_ID: ✅ ${process.env.RAG_DATABASE_ID}`);
  }

  try {
    const bot = new SlackNotionBot();

    // Graceful shutdown 처리
    process.on("SIGINT", async () => {
      console.log("\n🛑 봇 종료 신호 받음...");
      await bot.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n🛑 봇 종료 신호 받음...");
      await bot.stop();
      process.exit(0);
    });

    // 봇 시작
    await bot.start();

    console.log("");
    console.log("🎯 RAG 봇이 실행 중입니다!");
    console.log("");
    console.log("💡 사용법:");
    console.log("   • /nx-solve SF 적재 지연 문제");
    console.log("   • /tech-help API 오류 해결 방법");
    console.log("   • @bot SF 문제가 발생했는데 어떻게 해결하나요?");
    console.log("");
    console.log("⚠️  RAG 데이터베이스가 필요합니다!");
    console.log("   먼저 bulk-slack-analyzer.js를 실행해서 데이터를 수집하세요.");
    console.log("");
    console.log("🔧 종료하려면 Ctrl+C를 누르세요.");
  } catch (error) {
    console.error("💥 RAG 봇 시작 실패:", error);
    process.exit(1);
  }
}

// 스크립트 직접 실행시
if (require.main === module) {
  startRAGBot();
}

module.exports = startRAGBot;
