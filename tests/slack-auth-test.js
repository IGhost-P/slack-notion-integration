// slack-auth-test.js
// Slack 토큰 인증 상태 간단 테스트

require("dotenv").config();
const { WebClient } = require("@slack/web-api");

async function testSlackAuth() {
  console.log("🔐 Slack 토큰 인증 테스트");
  console.log("=".repeat(40));

  // 토큰 존재 여부 확인
  if (!process.env.SLACK_BOT_TOKEN) {
    console.log("❌ SLACK_BOT_TOKEN 환경변수가 설정되지 않았습니다.");
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  console.log(`🔑 토큰 형식: ${token.substring(0, 10)}...`);

  // 토큰 형식 확인
  if (!token.startsWith("xoxb-")) {
    console.log("⚠️  토큰이 Bot Token 형식이 아닙니다. 'xoxb-'로 시작해야 합니다.");
  }

  const slack = new WebClient(token);

  try {
    // 1. 기본 인증 테스트
    console.log("\n1️⃣ 기본 인증 테스트...");
    const authTest = await slack.auth.test();
    console.log("✅ 인증 성공!");
    console.log(`   👤 사용자: ${authTest.user}`);
    console.log(`   🏢 팀: ${authTest.team}`);
    console.log(`   🔗 URL: ${authTest.url}`);

    // 2. 채널 목록 조회 테스트
    console.log("\n2️⃣ 채널 목록 조회 테스트...");
    const channels = await slack.conversations.list({
      types: "public_channel",
      limit: 5
    });
    console.log(`✅ 채널 목록 조회 성공! (${channels.channels.length}개 채널)`);

    channels.channels.forEach((channel, index) => {
      console.log(`   ${index + 1}. #${channel.name} (ID: ${channel.id})`);
    });

    // 3. 특정 채널 히스토리 테스트
    if (channels.channels.length > 0) {
      console.log("\n3️⃣ 채널 히스토리 조회 테스트...");
      const testChannel = channels.channels[0];

      try {
        const history = await slack.conversations.history({
          channel: testChannel.id,
          limit: 3
        });
        console.log(`✅ 채널 히스토리 조회 성공! (${history.messages.length}개 메시지)`);
      } catch (historyError) {
        console.log(`❌ 채널 히스토리 조회 실패: ${historyError.message}`);
        console.log("   💡 봇이 해당 채널에 초대되지 않았을 수 있습니다.");
      }
    }

    console.log("\n🎉 모든 테스트 완료!");
  } catch (error) {
    console.error("❌ 인증 실패:", error.message);

    console.log("\n🔧 해결 방법:");
    console.log("1. Slack 앱 설정에서 Bot Token 확인");
    console.log("2. 필요한 권한 확인:");
    console.log("   - channels:history (채널 히스토리 읽기)");
    console.log("   - channels:read (채널 목록 읽기)");
    console.log("3. 워크스페이스에 앱이 설치되어 있는지 확인");
    console.log("4. 봇을 사용하려는 채널에 초대했는지 확인");
  }
}

// 테스트 실행
testSlackAuth().catch(console.error);
