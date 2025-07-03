// real-slack-test.js
// 실제 Slack 채널에서 소량(10개) 메시지만 테스트

require("dotenv").config();
const { WebClient } = require("@slack/web-api");
const SnowflakeAIService = require("../src/services/snowflake-ai");
const NotionService = require("../src/services/notion-service");

class RealSlackTest {
  constructor() {
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.snowflakeAI = new SnowflakeAIService();
    this.notionService = new NotionService();
  }

  async testSmallSlackScraping(channelName = "보안개발실-안티치트인사이트팀", messageLimit = 10) {
    console.log("📱 실제 Slack 채널 소량 테스트");
    console.log("=".repeat(50));
    console.log(`📢 채널: #${channelName}`);
    console.log(`📊 메시지 수: 최대 ${messageLimit}개`);
    console.log("⚠️  실제 데이터베이스에 저장되니 주의하세요!\n");

    try {
      // 1. Slack 채널 찾기
      console.log("🔍 Slack 채널 검색 중...");
      const channelsList = await this.slack.conversations.list();
      const channel = channelsList.channels.find((ch) => ch.name === channelName);

      if (!channel) {
        throw new Error(`채널을 찾을 수 없습니다: ${channelName}`);
      }

      console.log(`✅ 채널 발견: #${channel.name} (ID: ${channel.id})`);

      // 2. 최근 메시지 소량 수집
      console.log(`📝 최근 ${messageLimit}개 메시지 수집 중...`);

      const response = await this.slack.conversations.history({
        channel: channel.id,
        limit: messageLimit * 2 // 필터링을 고려해서 여유분
      });

      // 봇 메시지 등 제외
      const filteredMessages = response.messages
        .filter(
          (msg) => msg.text && !msg.bot_id && msg.subtype !== "bot_message" && msg.text.length > 10 && !msg.text.startsWith("<@") // 멘션만 있는 메시지 제외
        )
        .slice(0, messageLimit);

      console.log(`✅ 유효한 메시지 ${filteredMessages.length}개 수집됨`);

      if (filteredMessages.length === 0) {
        throw new Error("분석할 수 있는 메시지가 없습니다.");
      }

      // 3. AI 연결 및 분석
      console.log("\n🤖 AI 분석 시작...");
      await this.snowflakeAI.connect();

      const analysisResults = [];
      for (let i = 0; i < filteredMessages.length; i++) {
        const message = filteredMessages[i];
        console.log(`🔄 분석 중 (${i + 1}/${filteredMessages.length}): "${message.text.substring(0, 50)}..."`);

        try {
          const analysis = await this.analyzeMessage(message.text);
          analysisResults.push({ message, analysis });

          console.log(`   ✅ ${this.getCategoryDisplayName(analysis.category)} | ${analysis.urgency} | ${analysis.resource_estimate}분`);
        } catch (error) {
          console.log(`   ❌ 분석 실패: ${error.message}`);
        }

        // API 과부하 방지
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // 4. 테스트용 데이터베이스 생성 (실제 시스템에서는 한 번만)
      console.log("\n📊 테스트용 데이터베이스 생성 중...");
      const database = await this.createTestDatabase(channelName);

      // 5. 분석 결과 저장
      console.log("\n💾 분석 결과 데이터베이스 저장 중...");
      const savedPages = [];

      for (let i = 0; i < analysisResults.length; i++) {
        const { message, analysis } = analysisResults[i];

        try {
          const page = await this.saveIssueToDatabase(database.id, message, analysis);
          savedPages.push(page);
          console.log(`✅ 저장 성공 (${i + 1}/${analysisResults.length}): ${analysis.summary}`);
        } catch (error) {
          console.log(`❌ 저장 실패: ${error.message}`);
        }

        // API 제한 방지
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 6. 결과 요약
      console.log("\n🎉 실제 Slack 테스트 완료!");
      console.log("=".repeat(50));
      console.log(`📊 수집된 메시지: ${filteredMessages.length}개`);
      console.log(`🤖 AI 분석 성공: ${analysisResults.length}개`);
      console.log(`💾 데이터베이스 저장: ${savedPages.length}개`);
      console.log(`🔗 데이터베이스 URL: ${database.url}`);

      // 카테고리별 통계
      const categoryStats = {};
      analysisResults.forEach(({ analysis }) => {
        categoryStats[analysis.category] = (categoryStats[analysis.category] || 0) + 1;
      });

      console.log("\n📈 카테고리별 분포:");
      Object.entries(categoryStats).forEach(([category, count]) => {
        console.log(`   ${this.getCategoryDisplayName(category)}: ${count}개`);
      });

      console.log("\n🎯 다음 단계:");
      console.log("1. Notion에서 생성된 데이터베이스 확인");
      console.log("2. 필터/정렬 기능 활용해보기");
      console.log("3. 더 많은 메시지로 대량 처리 테스트");
      console.log("4. 실제 운영 프로세스에 통합");

      return {
        success: true,
        databaseUrl: database.url,
        stats: {
          collected: filteredMessages.length,
          analyzed: analysisResults.length,
          saved: savedPages.length,
          categories: categoryStats
        }
      };
    } catch (error) {
      console.error("\n💥 실제 Slack 테스트 실패:", error.message);
      throw error;
    } finally {
      await this.snowflakeAI.disconnect();
    }
  }

  // 테스트용 데이터베이스 생성
  async createTestDatabase(channelName) {
    const databaseProperties = {
      "이슈 제목": { title: {} },
      카테고리: {
        select: {
          options: [
            { name: "🚨 인시던트 대응", color: "red" },
            { name: "🔧 시스템 유지보수", color: "orange" },
            { name: "👀 모니터링/알림", color: "yellow" },
            { name: "🚀 배포/릴리즈", color: "green" },
            { name: "🤝 사용자 지원", color: "blue" },
            { name: "⚡ 성능 최적화", color: "purple" },
            { name: "🔒 보안 관련", color: "pink" },
            { name: "📚 문서화", color: "brown" },
            { name: "💬 회의/논의", color: "gray" },
            { name: "📋 기타", color: "default" }
          ]
        }
      },
      우선순위: {
        select: {
          options: [
            { name: "🔴 높음", color: "red" },
            { name: "🟡 보통", color: "yellow" },
            { name: "🟢 낮음", color: "green" }
          ]
        }
      },
      상태: {
        select: {
          options: [
            { name: "🆕 신규", color: "blue" },
            { name: "🔄 진행중", color: "yellow" },
            { name: "✅ 완료", color: "green" }
          ]
        }
      },
      작성자: { rich_text: {} },
      "예상 소요시간": { number: { format: "number" } },
      발생일시: { date: {} },
      키워드: { multi_select: { options: [] } },
      "Slack 메시지": { rich_text: {} },
      "AI 요약": { rich_text: {} }
    };

    return await this.notionService.notion.databases.create({
      parent: {
        page_id: process.env.NOTION_PARENT_PAGE_ID.replace(/-/g, "")
      },
      title: [
        {
          type: "text",
          text: {
            content: `📊 ${channelName} 실제 테스트 (${new Date().toLocaleDateString()})`
          }
        }
      ],
      properties: databaseProperties
    });
  }

  // 이슈를 데이터베이스에 저장
  async saveIssueToDatabase(databaseId, message, analysis) {
    return await this.notionService.notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        "이슈 제목": {
          title: [{ type: "text", text: { content: analysis.summary } }]
        },
        카테고리: {
          select: { name: this.getCategoryDisplayName(analysis.category) }
        },
        우선순위: {
          select: { name: this.getUrgencyDisplayName(analysis.urgency) }
        },
        상태: {
          select: { name: "🆕 신규" }
        },
        작성자: {
          rich_text: [{ type: "text", text: { content: "Slack 사용자" } }]
        },
        "예상 소요시간": {
          number: parseInt(analysis.resource_estimate) || 0
        },
        발생일시: {
          date: { start: new Date(parseFloat(message.ts) * 1000).toISOString() }
        },
        "Slack 메시지": {
          rich_text: [{ type: "text", text: { content: message.text } }]
        },
        "AI 요약": {
          rich_text: [{ type: "text", text: { content: analysis.summary } }]
        }
      }
    });
  }

  // AI 분석 (기존과 동일)
  async analyzeMessage(messageText) {
    const prompt = `다음 Slack 메시지를 운영 관점에서 분석해주세요:

메시지: "${messageText}"

JSON 형태로 응답:
{
  "category": "incident_response|maintenance|monitoring|deployment|user_support|performance|security|documentation|meeting_discussion|etc",
  "urgency": "high|medium|low",
  "resource_estimate": "예상 소요 시간 (분)",
  "keywords": ["키워드1", "키워드2"],
  "summary": "한 줄 요약"
}`;

    const response = await this.snowflakeAI.callOpenAI(prompt);

    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        category: "etc",
        urgency: "medium",
        resource_estimate: "30",
        keywords: ["분석실패"],
        summary: "AI 분석 실패"
      };
    }
  }

  // 헬퍼 메서드들
  getCategoryDisplayName(category) {
    const names = {
      incident_response: "🚨 인시던트 대응",
      maintenance: "🔧 시스템 유지보수",
      monitoring: "👀 모니터링/알림",
      deployment: "🚀 배포/릴리즈",
      user_support: "🤝 사용자 지원",
      performance: "⚡ 성능 최적화",
      security: "🔒 보안 관련",
      documentation: "📚 문서화",
      meeting_discussion: "💬 회의/논의",
      etc: "📋 기타"
    };
    return names[category] || "📋 기타";
  }

  getUrgencyDisplayName(urgency) {
    const names = {
      high: "🔴 높음",
      medium: "🟡 보통",
      low: "🟢 낮음"
    };
    return names[urgency] || "🟡 보통";
  }
}

// 사용법
async function runRealTest() {
  const tester = new RealSlackTest();

  try {
    // 명령줄 인자에서 채널명 가져오기
    const channelName = process.argv[2] || "보안개발실-안티치트인사이트팀";
    const messageLimit = parseInt(process.argv[3]) || 10;

    console.log(`📢 대상 채널: ${channelName}`);
    console.log(`📊 메시지 수: ${messageLimit}개`);

    // 채널명과 메시지 수 조정 가능
    const result = await tester.testSmallSlackScraping(channelName, messageLimit);

    console.log("\n✅ 실제 Slack 테스트 성공!");
    console.log(`🔗 결과 확인: ${result.databaseUrl}`);
  } catch (error) {
    console.error("💥 실제 테스트 실패:", error.message);
  }
}

// 즉시 실행
if (require.main === module) {
  runRealTest();
}

module.exports = RealSlackTest;
