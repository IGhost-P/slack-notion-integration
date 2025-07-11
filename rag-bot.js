// rag-bot.js
// RAG 기능이 포함된 슬랙 봇 실행

require("dotenv").config();
const SlackNotionBot = require("./src/slack-bot");

async function startRAGBot() {
  console.log("🚀 RAG 슬랙봇 시작!");
  console.log("=".repeat(50));

  // 환경변수 확인
  const requiredEnvs = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "NOTION_TOKEN", "OPENAI_API_KEY"];

  const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);
  if (missingEnvs.length > 0) {
    console.error("❌ 필수 환경변수가 없습니다:");
    missingEnvs.forEach((env) => console.error(`   - ${env}`));
    process.exit(1);
  }

  console.log("✅ 환경변수 확인 완료");

  // 선택적 환경변수 안내
  if (!process.env.RAG_DATABASE_ID) {
    console.log("💡 RAG_DATABASE_ID가 설정되지 않았습니다.");
    console.log("   bulk-slack-analyzer.js 실행 후 생성된 데이터베이스 ID를 설정하면");
    console.log("   더 빠른 검색이 가능합니다.");
    console.log("");
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
    console.log("   • /solve SF 적재 지연 문제");
    console.log("   • /rag API 오류 해결 방법");
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
