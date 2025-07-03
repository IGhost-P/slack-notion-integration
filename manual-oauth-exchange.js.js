// manual-oauth-exchange.js
// OAuth 콜백 코드로 수동으로 토큰 교환

require("dotenv").config();
const https = require("https");
const querystring = require("querystring");

async function exchangeCodeForToken() {
  // OAuth 콜백에서 받은 코드
  const authCode = "9093153593142.9143817843828.69299fcea89be93d8dba20c69ef686af4d251d7ce2d15f1a01a13e8e68fc7e03";
  // https://example.com/callback?code=9093153593142.9143817843828.69299fcea89be93d8dba20c69ef686af4d251d7ce2d15f1a01a13e8e68fc7e03&state=
  // Slack 앱 정보 (Basic Information에서 확인)
  const clientId = "5550355901602.9087998066884";
  const clientSecret = process.env.SLACK_CLIENT_SECRET; // .env에 추가 필요

  if (!clientSecret) {
    console.error("❌ SLACK_CLIENT_SECRET이 .env 파일에 설정되지 않았습니다.");
    console.log("💡 Slack 앱 설정 → Basic Information → Client Secret 복사해서 .env에 추가하세요:");
    console.log("   SLACK_CLIENT_SECRET=your-client-secret");
    return;
  }

  // 토큰 교환 데이터
  const postData = querystring.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    code: authCode,
    redirect_uri: "https://example.com/callback"
  });

  const options = {
    hostname: "slack.com",
    port: 443,
    path: "/api/oauth.v2.access",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData)
    }
  };

  console.log("🔄 OAuth 토큰 교환 중...");
  console.log(`📊 코드: ${authCode.substring(0, 20)}...`);

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);

          if (response.ok) {
            console.log("✅ 토큰 교환 성공!");
            console.log(`🎯 워크스페이스: ${response.team.name}`);
            console.log(`🤖 봇 토큰: ${response.access_token.substring(0, 20)}...`);
            console.log(`🆔 봇 사용자 ID: ${response.bot_user_id}`);

            console.log("\n📝 .env 파일에 다음 토큰들을 업데이트하세요:");
            console.log(`SLACK_BOT_TOKEN=${response.access_token}`);
            if (response.authed_user && response.authed_user.access_token) {
              console.log(`SLACK_USER_TOKEN=${response.authed_user.access_token}`);
            }

            resolve(response);
          } else {
            console.error("❌ 토큰 교환 실패:", response.error);
            console.log("💡 가능한 원인:");
            console.log("  - 코드가 만료됨 (10분 제한)");
            console.log("  - Client Secret이 틀림");
            console.log("  - Redirect URI가 일치하지 않음");
            reject(new Error(response.error));
          }
        } catch (error) {
          console.error("❌ 응답 파싱 실패:", error.message);
          console.log("📄 원시 응답:", data);
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      console.error("❌ 요청 실패:", error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// 실행
console.log("⚡ OAuth 수동 토큰 교환 시작...\n");

exchangeCodeForToken()
  .then((response) => {
    console.log("\n🎉 토큰 교환 완료!");
    console.log("🔄 이제 새로운 토큰으로 Slack 봇을 테스트할 수 있습니다.");
    console.log("\n📋 다음 단계:");
    console.log("1. .env 파일의 SLACK_BOT_TOKEN 업데이트");
    console.log("2. node check-bot-scopes.js 실행해서 권한 확인");
    console.log("3. node real-slack-test.js 실행해서 실제 테스트");
  })
  .catch((error) => {
    console.error("\n💥 토큰 교환 실패:", error.message);
    console.log("\n🔧 대안 방법:");
    console.log("1. OAuth & Permissions에서 Redirect URL을 example.com으로 변경");
    console.log("2. 앱을 다시 설치해서 새로운 콜백 코드 받기");
    console.log("3. 또는 Install App 메뉴에서 직접 토큰 복사");
  });
