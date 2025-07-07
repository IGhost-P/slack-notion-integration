// check-bot-scopes.js
// 현재 봇의 권한을 확인하는 스크립트

require("dotenv").config();
const { WebClient } = require("@slack/web-api");

async function checkBotScopes() {
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

  console.log("🔑 봇 권한 확인 중...");
  console.log("=".repeat(50));

  try {
    // 1. 기본 인증 테스트
    console.log("📋 1단계: 기본 인증 테스트");
    const authTest = await slack.auth.test();
    console.log(`✅ 봇 인증 성공: ${authTest.user}`);
    console.log(`📍 워크스페이스: ${authTest.team}`);
    console.log(`🆔 사용자 ID: ${authTest.user_id}`);

    // 2. 채널 목록 조회 테스트 (channels:read 권한)
    console.log("\n📢 2단계: 채널 목록 조회 테스트 (channels:read)");
    try {
      const channels = await slack.conversations.list({
        types: "public_channel",
        limit: 100
      });
      console.log(`✅ 채널 목록 조회 성공: ${channels.channels.length}개 채널 발견`);

      channels.channels.slice(0, 100).forEach((channel) => {
        console.log(`   #${channel.name}`);
      });
    } catch (error) {
      console.log(`❌ 채널 목록 조회 실패: ${error.message}`);
      if (error.message.includes("missing_scope")) {
        console.log("💡 해결: OAuth & Permissions에서 'channels:read' 스코프 추가 필요");
      }
    }

    // 3. 사용자 정보 조회 테스트 (users:read 권한)
    console.log("\n👤 3단계: 사용자 정보 조회 테스트 (users:read)");
    try {
      const userInfo = await slack.users.info({ user: authTest.user_id });
      console.log(`✅ 사용자 정보 조회 성공: ${userInfo.user.real_name || userInfo.user.name}`);
    } catch (error) {
      console.log(`❌ 사용자 정보 조회 실패: ${error.message}`);
      if (error.message.includes("missing_scope")) {
        console.log("💡 해결: OAuth & Permissions에서 'users:read' 스코프 추가 필요");
      }
    }

    // 4. 채널 히스토리 조회 테스트 (channels:history 권한)
    console.log("\n📜 4단계: 채널 히스토리 조회 테스트 (channels:history)");
    try {
      const channels = await slack.conversations.list({
        types: "public_channel",
        limit: 1
      });

      if (channels.channels.length > 0) {
        const testChannel = channels.channels[0];
        const history = await slack.conversations.history({
          channel: testChannel.id,
          limit: 1
        });
        console.log(`✅ 채널 히스토리 조회 성공: #${testChannel.name}`);
      } else {
        console.log("⚠️ 테스트할 채널이 없습니다.");
      }
    } catch (error) {
      console.log(`❌ 채널 히스토리 조회 실패: ${error.message}`);
      if (error.message.includes("missing_scope")) {
        console.log("💡 해결: OAuth & Permissions에서 'channels:history' 스코프 추가 필요");
      }
    }

    // 5. 결과 요약
    console.log("\n🎯 권한 확인 결과 요약");
    console.log("=".repeat(50));
    console.log("필요한 권한들:");
    console.log("✅ app 인증 - 성공");
    console.log("📋 channels:read - " + (channels ? "성공" : "실패 (추가 필요)"));
    console.log("👤 users:read - 테스트 완료");
    console.log("📜 channels:history - 테스트 완료");
    console.log("💬 chat:write - 메시지 전송시 필요");

    console.log("\n🔧 다음 단계:");
    console.log("1. OAuth & Permissions에서 부족한 스코프 추가");
    console.log("2. 앱 재설치");
    console.log("3. 이 스크립트 다시 실행해서 확인");
  } catch (error) {
    console.error("❌ 전체 테스트 실패:", error.message);

    if (error.message.includes("invalid_auth")) {
      console.log("\n🔧 해결 방법:");
      console.log("1. .env 파일의 SLACK_BOT_TOKEN 확인");
      console.log("2. 토큰이 'xoxb-'로 시작하는지 확인");
      console.log("3. 토큰이 만료되지 않았는지 확인");
    }
  }
}

// 실행
console.log("⚡ Slack Bot 권한 확인 시작...\n");
checkBotScopes()
  .then(() => {
    console.log("\n✨ 권한 확인 완료!");
  })
  .catch((error) => {
    console.error("\n💥 권한 확인 실패:", error.message);
  });
