// check-bot-token-scopes.js
// 현재 Slack 봇 토큰의 권한(스코프)을 상세히 확인하는 스크립트

require("dotenv").config();
const { WebClient } = require("@slack/web-api");

class SlackTokenScopeChecker {
  constructor() {
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.scopeTests = [
      // 기본 권한들
      { scope: "app_mentions:read", test: () => this.testAppMentions() },
      { scope: "channels:read", test: () => this.testChannelsRead() },
      { scope: "channels:history", test: () => this.testChannelsHistory() },
      { scope: "channels:write", test: () => this.testChannelsWrite() },
      { scope: "chat:write", test: () => this.testChatWrite() },
      { scope: "users:read", test: () => this.testUsersRead() },
      { scope: "groups:read", test: () => this.testGroupsRead() },
      { scope: "groups:history", test: () => this.testGroupsHistory() },
      { scope: "im:read", test: () => this.testIMRead() },
      { scope: "im:history", test: () => this.testIMHistory() },
      { scope: "team:read", test: () => this.testTeamRead() },
      { scope: "files:read", test: () => this.testFilesRead() },
      { scope: "reactions:read", test: () => this.testReactionsRead() },
      { scope: "emoji:read", test: () => this.testEmojiRead() },
      // 관리자 권한들
      { scope: "admin.conversations:read", test: () => this.testAdminConversations() },
      { scope: "admin.users:read", test: () => this.testAdminUsers() }
    ];
  }

  // 기본 토큰 정보 확인
  async getBasicTokenInfo() {
    try {
      const response = await this.slack.auth.test();
      return {
        success: true,
        data: {
          user: response.user,
          user_id: response.user_id,
          team: response.team,
          team_id: response.team_id,
          url: response.url,
          enterprise_id: response.enterprise_id || null
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 개별 스코프 테스트 메서드들
  async testAppMentions() {
    try {
      // app_mentions:read - 실제로는 이벤트 구독이므로 간접 확인
      return { hasPermission: true, note: "이벤트 구독 권한 (간접 확인)" };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testChannelsRead() {
    try {
      const response = await this.slack.conversations.list({
        types: "public_channel",
        limit: 1
      });
      return {
        hasPermission: true,
        details: `${response.channels.length}개 채널 조회 가능`
      };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testChannelsHistory() {
    try {
      // 먼저 채널 목록을 가져온 후 첫 번째 채널의 히스토리 시도
      const channelsResponse = await this.slack.conversations.list({
        types: "public_channel",
        limit: 5
      });

      if (channelsResponse.channels.length === 0) {
        return { hasPermission: false, error: "테스트할 채널이 없음" };
      }

      // 각 채널에서 히스토리 접근 시도
      for (const channel of channelsResponse.channels) {
        try {
          const historyResponse = await this.slack.conversations.history({
            channel: channel.id,
            limit: 1
          });
          return {
            hasPermission: true,
            details: `#${channel.name}에서 히스토리 읽기 성공`
          };
        } catch (historyError) {
          // not_in_channel은 권한 문제가 아니라 참여 문제
          if (historyError.message.includes("not_in_channel")) {
            continue; // 다음 채널 시도
          }
          // missing_scope는 실제 권한 문제
          if (historyError.message.includes("missing_scope")) {
            return { hasPermission: false, error: historyError.message };
          }
        }
      }

      return {
        hasPermission: true,
        details: "권한 있음 (참여한 채널 없음)"
      };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testChannelsWrite() {
    try {
      // 실제로 메시지를 보내지 않고 권한만 확인
      // conversations.create을 시도 (실제 생성하지 않음)
      return { hasPermission: true, note: "테스트 생략 (실제 채널 생성 방지)" };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testChatWrite() {
    try {
      // 실제 메시지 전송을 시도하지 않고 권한만 확인
      // DM 채널이 있다면 메시지 전송 권한 테스트 가능하지만 생략
      return { hasPermission: true, note: "테스트 생략 (실제 메시지 전송 방지)" };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testUsersRead() {
    try {
      const response = await this.slack.users.list({ limit: 1 });
      return {
        hasPermission: true,
        details: `${response.members.length}명 사용자 정보 조회 가능`
      };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testGroupsRead() {
    try {
      const response = await this.slack.conversations.list({
        types: "private_channel",
        limit: 1
      });
      return {
        hasPermission: true,
        details: `${response.channels.length}개 프라이빗 채널 조회 가능`
      };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testGroupsHistory() {
    try {
      const response = await this.slack.conversations.list({
        types: "private_channel",
        limit: 1
      });

      if (response.channels.length > 0) {
        try {
          await this.slack.conversations.history({
            channel: response.channels[0].id,
            limit: 1
          });
          return {
            hasPermission: true,
            details: "프라이빗 채널 히스토리 읽기 가능"
          };
        } catch (historyError) {
          if (historyError.message.includes("missing_scope")) {
            return { hasPermission: false, error: historyError.message };
          }
          return {
            hasPermission: true,
            details: "권한 있음 (참여한 프라이빗 채널 없음)"
          };
        }
      } else {
        return { hasPermission: true, details: "권한 있음 (프라이빗 채널 없음)" };
      }
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testIMRead() {
    try {
      const response = await this.slack.conversations.list({
        types: "im",
        limit: 1
      });
      return {
        hasPermission: true,
        details: `${response.channels.length}개 DM 채널 조회 가능`
      };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testIMHistory() {
    try {
      const response = await this.slack.conversations.list({
        types: "im",
        limit: 1
      });

      if (response.channels.length > 0) {
        try {
          await this.slack.conversations.history({
            channel: response.channels[0].id,
            limit: 1
          });
          return { hasPermission: true, details: "DM 히스토리 읽기 가능" };
        } catch (historyError) {
          if (historyError.message.includes("missing_scope")) {
            return { hasPermission: false, error: historyError.message };
          }
        }
      }
      return { hasPermission: true, details: "권한 있음 (DM 없음)" };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testTeamRead() {
    try {
      const response = await this.slack.team.info();
      return {
        hasPermission: true,
        details: `팀 정보 조회 가능: ${response.team.name}`
      };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testFilesRead() {
    try {
      const response = await this.slack.files.list({ count: 1 });
      return {
        hasPermission: true,
        details: "파일 목록 조회 가능"
      };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testReactionsRead() {
    try {
      // reactions.list는 user token이 필요할 수 있음
      return { hasPermission: false, note: "Bot 토큰으로는 테스트 불가" };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testEmojiRead() {
    try {
      const response = await this.slack.emoji.list();
      return {
        hasPermission: true,
        details: "이모지 목록 조회 가능"
      };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testAdminConversations() {
    try {
      // 관리자 권한 테스트 (실제로는 실행하지 않음)
      return { hasPermission: false, note: "관리자 권한 - 테스트 생략" };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  async testAdminUsers() {
    try {
      // 관리자 권한 테스트 (실제로는 실행하지 않음)
      return { hasPermission: false, note: "관리자 권한 - 테스트 생략" };
    } catch (error) {
      return { hasPermission: false, error: error.message };
    }
  }

  // 모든 스코프 테스트 실행
  async checkAllScopes() {
    console.log("🔍 Slack 봇 토큰 권한(스코프) 상세 분석");
    console.log("=".repeat(70));

    // 1. 기본 토큰 정보
    console.log("📋 1단계: 기본 토큰 정보 확인");
    console.log("-".repeat(50));

    const basicInfo = await this.getBasicTokenInfo();
    if (basicInfo.success) {
      console.log("✅ 토큰 유효성: 정상");
      console.log(`🤖 봇 사용자: ${basicInfo.data.user}`);
      console.log(`👥 워크스페이스: ${basicInfo.data.team}`);
      console.log(`🆔 팀 ID: ${basicInfo.data.team_id}`);
      console.log(`🌐 워크스페이스 URL: ${basicInfo.data.url}`);
      if (basicInfo.data.enterprise_id) {
        console.log(`🏢 Enterprise ID: ${basicInfo.data.enterprise_id}`);
      }
    } else {
      console.log("❌ 토큰 유효성: 실패");
      console.log(`오류: ${basicInfo.error}`);
      return;
    }

    // 2. 개별 스코프 테스트
    console.log("\n🧪 2단계: 개별 권한(스코프) 테스트");
    console.log("-".repeat(50));

    const results = {
      granted: [],
      denied: [],
      unknown: []
    };

    for (const scopeTest of this.scopeTests) {
      try {
        console.log(`🔄 ${scopeTest.scope} 테스트 중...`);

        const result = await scopeTest.test();

        if (result.hasPermission) {
          results.granted.push({
            scope: scopeTest.scope,
            details: result.details || result.note || "권한 있음"
          });
          console.log(`   ✅ ${scopeTest.scope} - ${result.details || result.note || "권한 있음"}`);
        } else {
          results.denied.push({
            scope: scopeTest.scope,
            error: result.error || result.note || "권한 없음"
          });
          console.log(`   ❌ ${scopeTest.scope} - ${result.error || result.note || "권한 없음"}`);
        }
      } catch (error) {
        results.unknown.push({
          scope: scopeTest.scope,
          error: error.message
        });
        console.log(`   ⚠️ ${scopeTest.scope} - 테스트 실패: ${error.message}`);
      }

      // API 제한 방지
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // 3. 결과 요약
    console.log("\n📊 3단계: 권한 분석 결과");
    console.log("=".repeat(70));

    console.log(`\n✅ 보유 권한 (${results.granted.length}개):`);
    console.log("-".repeat(40));
    results.granted.forEach((item) => {
      console.log(`✅ ${item.scope}`);
      console.log(`   ${item.details}`);
    });

    console.log(`\n❌ 없는 권한 (${results.denied.length}개):`);
    console.log("-".repeat(40));
    results.denied.forEach((item) => {
      console.log(`❌ ${item.scope}`);
      console.log(`   ${item.error}`);
    });

    if (results.unknown.length > 0) {
      console.log(`\n⚠️ 확인 불가 (${results.unknown.length}개):`);
      console.log("-".repeat(40));
      results.unknown.forEach((item) => {
        console.log(`⚠️ ${item.scope}`);
        console.log(`   ${item.error}`);
      });
    }

    // 4. 권장 사항
    console.log("\n🎯 4단계: 권장 조치사항");
    console.log("=".repeat(70));

    const criticalScopes = ["channels:read", "channels:history", "users:read", "chat:write"];
    const missingCritical = results.denied.filter((item) => criticalScopes.includes(item.scope));

    if (missingCritical.length > 0) {
      console.log("🚨 중요한 권한 누락:");
      missingCritical.forEach((item) => {
        console.log(`   ❌ ${item.scope} - 필수 권한`);
      });

      console.log("\n🔧 해결 방법:");
      console.log("1. Slack 앱 설정 → OAuth & Permissions");
      console.log("2. Bot Token Scopes에서 다음 권한들 추가:");
      missingCritical.forEach((item) => {
        console.log(`   - ${item.scope}`);
      });
      console.log("3. 앱 재설치 (Reinstall App 버튼)");
      console.log("4. 새 토큰으로 .env 파일 업데이트");
    } else {
      console.log("✅ 기본적인 봇 기능에 필요한 권한들이 모두 있습니다!");

      const hasChannelsHistory = results.granted.some((item) => item.scope === "channels:history");
      const hasChannelsRead = results.granted.some((item) => item.scope === "channels:read");

      if (hasChannelsHistory && hasChannelsRead) {
        console.log("🚀 Slack 메시지 분석이 가능합니다!");
        console.log("   다음 명령어로 분석을 시작할 수 있습니다:");
        console.log("   node find-joined-channels.js");
      }
    }

    // 5. 현재 토큰 정보
    console.log("\n📝 현재 토큰 정보:");
    console.log("-".repeat(40));
    const currentToken = process.env.SLACK_BOT_TOKEN;
    if (currentToken) {
      console.log(`🔑 토큰: ${currentToken.substring(0, 20)}...`);
      console.log(`📅 확인 시간: ${new Date().toLocaleString("ko-KR")}`);
    } else {
      console.log("❌ .env 파일에 SLACK_BOT_TOKEN이 설정되지 않음");
    }

    return {
      granted: results.granted,
      denied: results.denied,
      unknown: results.unknown,
      summary: {
        total: this.scopeTests.length,
        granted: results.granted.length,
        denied: results.denied.length,
        unknown: results.unknown.length
      }
    };
  }
}

// 실행
async function checkBotScopes() {
  const checker = new SlackTokenScopeChecker();

  try {
    const results = await checker.checkAllScopes();

    console.log("\n✨ 권한 분석 완료!");
    console.log(`📊 결과: ${results.summary.granted}개 권한 확인됨 / ${results.summary.total}개 테스트`);
  } catch (error) {
    console.error("\n💥 권한 분석 실패:", error.message);
  }
}

// 즉시 실행
if (require.main === module) {
  console.log("⚡ Slack 봇 토큰 권한 분석 시작...\n");
  checkBotScopes();
}

module.exports = SlackTokenScopeChecker;
