// thread-analysis-test.js
// 스레드 내용까지 포함한 고급 Slack 분석

require("dotenv").config();
const { WebClient } = require("@slack/web-api");
const SnowflakeAIService = require("../src/services/snowflake-ai");
const NotionService = require("../src/services/notion-service");

class ThreadAnalysisTest {
  constructor() {
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.snowflakeAI = new SnowflakeAIService();
    this.notionService = new NotionService();
  }

  async testThreadAnalysis(channelName = "보안개발실-fe", messageLimit = 10) {
    console.log("🧵 스레드 분석 포함 Slack 테스트");
    console.log("=".repeat(50));
    console.log(`📢 채널: #${channelName}`);
    console.log(`📊 메시지 수: 최대 ${messageLimit}개`);
    console.log(`🔍 스레드 포함 분석: 활성화\n`);

    try {
      // 1. 채널 찾기
      console.log("🔍 Slack 채널 검색 중...");
      const channelsList = await this.slack.conversations.list();
      const channel = channelsList.channels.find((ch) => ch.name === channelName);

      if (!channel) {
        throw new Error(`채널을 찾을 수 없습니다: ${channelName}`);
      }

      console.log(`✅ 채널 발견: #${channel.name} (ID: ${channel.id})`);

      // 2. 메시지 수집 (스레드 포함)
      console.log(`\n📝 메시지 및 스레드 수집 중...`);
      const messagesWithThreads = await this.collectMessagesWithThreads(channel.id, messageLimit);

      console.log(`✅ 총 ${messagesWithThreads.length}개 메시지 수집`);

      // 스레드 통계
      const threadStats = messagesWithThreads.reduce(
        (acc, msg) => {
          if (msg.thread_replies && msg.thread_replies.length > 0) {
            acc.threadsCount++;
            acc.totalReplies += msg.thread_replies.length;
          }
          return acc;
        },
        { threadsCount: 0, totalReplies: 0 }
      );

      console.log(`   📊 스레드 통계: ${threadStats.threadsCount}개 스레드, ${threadStats.totalReplies}개 답글`);

      // 3. AI 분석 (스레드 포함)
      console.log("\n🤖 AI 분석 시작 (스레드 포함)...");
      await this.snowflakeAI.connect();

      const analysisResults = [];
      for (let i = 0; i < messagesWithThreads.length; i++) {
        const messageData = messagesWithThreads[i];
        console.log(`\n🔄 분석 중 (${i + 1}/${messagesWithThreads.length})`);
        console.log(`   📝 원본: "${messageData.original_message.text.substring(0, 50)}..."`);

        if (messageData.thread_replies && messageData.thread_replies.length > 0) {
          console.log(`   🧵 스레드: ${messageData.thread_replies.length}개 답글`);
        }

        try {
          const analysis = await this.analyzeMessageWithThread(messageData);
          analysisResults.push({ messageData, analysis });

          console.log(`   ✅ ${this.getCategoryDisplayName(analysis.category)} | ${analysis.urgency} | ${analysis.resource_estimate}분`);
          console.log(`   📝 요약: ${analysis.summary}`);
        } catch (error) {
          console.log(`   ❌ 분석 실패: ${error.message}`);
        }

        // API 과부하 방지
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // 4. 데이터베이스 생성 및 저장
      console.log("\n📊 스레드 분석 데이터베이스 생성 중...");
      const database = await this.createThreadAnalysisDatabase(channelName);

      console.log("\n💾 분석 결과 저장 중...");
      const savedPages = [];

      for (let i = 0; i < analysisResults.length; i++) {
        const { messageData, analysis } = analysisResults[i];

        try {
          const page = await this.saveThreadAnalysisToDatabase(database.id, messageData, analysis);
          savedPages.push(page);
          console.log(`✅ 저장 성공 (${i + 1}/${analysisResults.length}): ${analysis.summary}`);
        } catch (error) {
          console.log(`❌ 저장 실패: ${error.message}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 5. 결과 요약
      console.log("\n🎉 스레드 분석 완료!");
      console.log("=".repeat(50));
      console.log(`📊 수집된 메시지: ${messagesWithThreads.length}개`);
      console.log(`🧵 스레드 수: ${threadStats.threadsCount}개`);
      console.log(`💬 총 답글: ${threadStats.totalReplies}개`);
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

      return {
        success: true,
        databaseUrl: database.url,
        stats: {
          messages: messagesWithThreads.length,
          threads: threadStats.threadsCount,
          replies: threadStats.totalReplies,
          analyzed: analysisResults.length,
          saved: savedPages.length,
          categories: categoryStats
        }
      };
    } catch (error) {
      console.error("\n💥 스레드 분석 테스트 실패:", error.message);
      throw error;
    } finally {
      await this.snowflakeAI.disconnect();
    }
  }

  // 스레드 포함 메시지 수집
  async collectMessagesWithThreads(channelId, messageLimit) {
    const response = await this.slack.conversations.history({
      channel: channelId,
      limit: messageLimit * 2 // 필터링 고려해서 여유분
    });

    const filteredMessages = response.messages
      .filter((msg) => msg.text && !msg.bot_id && msg.subtype !== "bot_message" && msg.text.length > 10)
      .slice(0, messageLimit);

    const messagesWithThreads = [];

    for (const message of filteredMessages) {
      const messageData = {
        original_message: message,
        thread_replies: []
      };

      // 스레드가 있는 메시지인지 확인
      if (message.thread_ts && message.reply_count > 0) {
        console.log(`   🧵 스레드 답글 수집 중: ${message.reply_count}개`);

        try {
          const threadReplies = await this.slack.conversations.replies({
            channel: channelId,
            ts: message.thread_ts
          });

          // 원본 메시지를 제외한 답글만 저장
          messageData.thread_replies = threadReplies.messages
            .slice(1) // 첫 번째는 원본 메시지
            .filter((reply) => reply.text && !reply.bot_id);

          console.log(`   ✅ ${messageData.thread_replies.length}개 답글 수집됨`);
        } catch (error) {
          console.log(`   ❌ 스레드 수집 실패: ${error.message}`);
        }
      }

      messagesWithThreads.push(messageData);
    }

    return messagesWithThreads;
  }

  // 스레드 포함 AI 분석
  async analyzeMessageWithThread(messageData) {
    const { original_message, thread_replies } = messageData;

    // 분석할 텍스트 구성
    let analysisText = `원본 메시지: "${original_message.text}"`;

    if (thread_replies && thread_replies.length > 0) {
      analysisText += `\n\n스레드 답글들:\n`;
      thread_replies.forEach((reply, index) => {
        analysisText += `${index + 1}. ${reply.text}\n`;
      });
    }

    const prompt = `다음 Slack 메시지와 스레드를 운영 관점에서 분석해주세요:

${analysisText}

JSON 형태로 응답:
{
  "category": "incident_response|maintenance|monitoring|deployment|user_support|performance|security|documentation|meeting_discussion|etc",
  "urgency": "high|medium|low",
  "resource_estimate": "예상 소요 시간 (분)",
  "keywords": ["키워드1", "키워드2"],
  "summary": "메시지와 스레드 전체 내용을 한 줄로 요약",
  "thread_summary": "스레드에서 논의된 주요 내용 (스레드가 있는 경우)"
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
        summary: "AI 분석 실패",
        thread_summary: ""
      };
    }
  }

  // 스레드 분석용 데이터베이스 생성
  async createThreadAnalysisDatabase(channelName) {
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
      "스레드 여부": {
        select: {
          options: [
            { name: "🧵 스레드 있음", color: "blue" },
            { name: "📝 단일 메시지", color: "gray" }
          ]
        }
      },
      "답글 수": { number: { format: "number" } },
      작성자: { rich_text: {} },
      "예상 소요시간": { number: { format: "number" } },
      발생일시: { date: {} },
      키워드: { multi_select: { options: [] } },
      "원본 메시지": { rich_text: {} },
      "스레드 요약": { rich_text: {} },
      "AI 종합 분석": { rich_text: {} }
    };

    return await this.notionService.notion.databases.create({
      parent: {
        page_id: process.env.NOTION_PARENT_PAGE_ID.replace(/-/g, "")
      },
      title: [
        {
          type: "text",
          text: {
            content: `🧵 ${channelName} 스레드 분석 (${new Date().toLocaleDateString()})`
          }
        }
      ],
      properties: databaseProperties
    });
  }

  // 스레드 분석 결과 저장
  async saveThreadAnalysisToDatabase(databaseId, messageData, analysis) {
    const { original_message, thread_replies } = messageData;

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
        "스레드 여부": {
          select: {
            name: thread_replies.length > 0 ? "🧵 스레드 있음" : "📝 단일 메시지"
          }
        },
        "답글 수": {
          number: thread_replies.length
        },
        작성자: {
          rich_text: [{ type: "text", text: { content: "Slack 사용자" } }]
        },
        "예상 소요시간": {
          number: parseInt(analysis.resource_estimate) || 0
        },
        발생일시: {
          date: { start: new Date(parseFloat(original_message.ts) * 1000).toISOString() }
        },
        "원본 메시지": {
          rich_text: [{ type: "text", text: { content: original_message.text } }]
        },
        "스레드 요약": {
          rich_text: [
            {
              type: "text",
              text: { content: analysis.thread_summary || "스레드 없음" }
            }
          ]
        },
        "AI 종합 분석": {
          rich_text: [{ type: "text", text: { content: analysis.summary } }]
        }
      }
    });
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
async function runThreadAnalysisTest() {
  const tester = new ThreadAnalysisTest();

  try {
    const channelName = process.argv[2] || "보안개발실-fe";
    const messageLimit = parseInt(process.argv[3]) || 10;

    console.log(`📢 대상 채널: ${channelName}`);
    console.log(`📊 메시지 수: ${messageLimit}개`);

    const result = await tester.testThreadAnalysis(channelName, messageLimit);

    console.log("\n✅ 스레드 분석 테스트 성공!");
    console.log(`🔗 결과 확인: ${result.databaseUrl}`);
    console.log(`📊 통계: ${result.stats.messages}개 메시지, ${result.stats.threads}개 스레드, ${result.stats.replies}개 답글`);
  } catch (error) {
    console.error("💥 스레드 분석 테스트 실패:", error.message);
  }
}

// 즉시 실행
if (require.main === module) {
  runThreadAnalysisTest();
}

module.exports = ThreadAnalysisTest;
