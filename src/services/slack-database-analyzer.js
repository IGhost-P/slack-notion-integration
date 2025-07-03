// slack-database-analyzer.js
// LBD/SIREN 운영 이슈를 Notion 데이터베이스로 체계적 관리

require("dotenv").config();
const { WebClient } = require("@slack/web-api");
const SnowflakeAIService = require("./src/services/snowflake-ai");
const NotionService = require("./src/services/notion-service");

class SlackOperationDatabaseManager {
  constructor() {
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.snowflakeAI = new SnowflakeAIService();
    this.notionService = new NotionService();

    // 데이터베이스 관리
    this.operationDatabaseId = null;
    this.summaryPageId = null;

    // 처리 결과 추적
    this.processResults = {
      totalMessages: 0,
      processedIssues: 0,
      categoriesCreated: {},
      failedMessages: 0
    };
  }

  // 1. Notion 운영 이슈 데이터베이스 생성
  async createOperationDatabase(channelName) {
    console.log("📊 Notion 운영 이슈 데이터베이스 생성 중...");

    try {
      // 데이터베이스 속성 정의
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
              { name: "✨ 기능 요청", color: "default" },
              { name: "🐛 버그 리포트", color: "red" },
              { name: "📋 기타", color: "gray" }
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
              { name: "⏸️ 대기", color: "orange" },
              { name: "✅ 완료", color: "green" },
              { name: "❌ 취소", color: "red" }
            ]
          }
        },
        작성자: { rich_text: {} },
        "예상 소요시간": { number: { format: "number" } },
        "실제 소요시간": { number: { format: "number" } },
        발생일시: { date: {} },
        완료일시: { date: {} },
        담당자: { rich_text: {} },
        키워드: { multi_select: { options: [] } },
        "Slack 링크": { url: {} },
        "원본 메시지": { rich_text: {} },
        "AI 요약": { rich_text: {} },
        "후속 조치": { rich_text: {} },
        "관련 이슈": { relation: { database_id: "self" } }
      };

      // 부모 페이지에 데이터베이스 생성
      const database = await this.notionService.notion.databases.create({
        parent: {
          page_id: process.env.NOTION_PARENT_PAGE_ID.replace(/-/g, "")
        },
        title: [
          {
            type: "text",
            text: {
              content: `📊 ${channelName} 운영 이슈 데이터베이스`
            }
          }
        ],
        properties: databaseProperties,
        description: [
          {
            type: "text",
            text: {
              content: `Slack #${channelName} 채널의 운영 이슈들을 체계적으로 관리하는 데이터베이스입니다.`
            }
          }
        ]
      });

      this.operationDatabaseId = database.id;
      console.log("✅ 운영 이슈 데이터베이스 생성 완료!");
      console.log(`🔗 데이터베이스 URL: ${database.url}`);

      return database;
    } catch (error) {
      console.error("❌ 데이터베이스 생성 실패:", error.message);
      throw error;
    }
  }

  // 2. Slack 메시지를 개별 이슈로 데이터베이스에 저장
  async saveMessageAsIssue(message, analysisResult) {
    try {
      // Slack 메시지 링크 생성
      const channelId = message.channel || "unknown";
      const timestamp = message.ts;
      const slackLink = `https://your-workspace.slack.com/archives/${channelId}/p${timestamp.replace(".", "")}`;

      // 사용자 정보 가져오기
      let userName = "Unknown User";
      try {
        const userInfo = await this.slack.users.info({ user: message.user });
        userName = userInfo.user.real_name || userInfo.user.name;
      } catch (error) {
        console.log(`⚠️ 사용자 정보 조회 실패: ${message.user}`);
      }

      // 키워드를 multi_select 옵션으로 변환
      const keywordOptions = analysisResult.keywords.map((keyword) => ({
        name: keyword,
        color: "default"
      }));

      // 기존 키워드 옵션들과 병합
      await this.updateKeywordOptions(keywordOptions);

      // 데이터베이스 페이지 생성
      const databasePage = await this.notionService.notion.pages.create({
        parent: {
          database_id: this.operationDatabaseId
        },
        properties: {
          "이슈 제목": {
            title: [
              {
                type: "text",
                text: {
                  content: analysisResult.summary || "Slack 운영 이슈"
                }
              }
            ]
          },
          카테고리: {
            select: {
              name: this.getCategoryDisplayName(analysisResult.category)
            }
          },
          우선순위: {
            select: {
              name: this.getUrgencyDisplayName(analysisResult.urgency)
            }
          },
          상태: {
            select: {
              name: "🆕 신규"
            }
          },
          작성자: {
            rich_text: [
              {
                type: "text",
                text: { content: userName }
              }
            ]
          },
          "예상 소요시간": {
            number: parseInt(analysisResult.resource_estimate) || 0
          },
          발생일시: {
            date: {
              start: new Date(parseFloat(timestamp) * 1000).toISOString()
            }
          },
          키워드: {
            multi_select: analysisResult.keywords.map((keyword) => ({ name: keyword }))
          },
          "Slack 링크": {
            url: slackLink
          },
          "원본 메시지": {
            rich_text: [
              {
                type: "text",
                text: { content: message.text }
              }
            ]
          },
          "AI 요약": {
            rich_text: [
              {
                type: "text",
                text: { content: analysisResult.summary }
              }
            ]
          }
        },
        children: [
          {
            object: "block",
            type: "heading_2",
            heading_2: {
              rich_text: [
                {
                  type: "text",
                  text: { content: "📋 이슈 상세 정보" }
                }
              ]
            }
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: `**운영 작업 유형**: ${analysisResult.operation_type}` }
                }
              ]
            }
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: `**AI 분석 결과**: ${analysisResult.summary}` }
                }
              ]
            }
          },
          {
            object: "block",
            type: "divider",
            divider: {}
          },
          {
            object: "block",
            type: "heading_3",
            heading_3: {
              rich_text: [
                {
                  type: "text",
                  text: { content: "💬 원본 Slack 메시지" }
                }
              ]
            }
          },
          {
            object: "block",
            type: "quote",
            quote: {
              rich_text: [
                {
                  type: "text",
                  text: { content: message.text }
                }
              ]
            }
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: "🔗 " },
                  annotations: { bold: true }
                },
                {
                  type: "text",
                  text: { content: "Slack에서 확인하기", link: { url: slackLink } },
                  annotations: { color: "blue" }
                }
              ]
            }
          }
        ]
      });

      this.processResults.processedIssues++;
      return databasePage;
    } catch (error) {
      console.error(`❌ 이슈 저장 실패: ${error.message}`);
      this.processResults.failedMessages++;
      return null;
    }
  }

  // 3. 키워드 옵션 업데이트
  async updateKeywordOptions(newKeywords) {
    try {
      const database = await this.notionService.notion.databases.retrieve({
        database_id: this.operationDatabaseId
      });

      const existingKeywords = database.properties["키워드"].multi_select.options;
      const existingKeywordNames = existingKeywords.map((option) => option.name);

      const keywordsToAdd = newKeywords.filter((keyword) => !existingKeywordNames.includes(keyword.name));

      if (keywordsToAdd.length > 0) {
        const updatedOptions = [...existingKeywords, ...keywordsToAdd];

        await this.notionService.notion.databases.update({
          database_id: this.operationDatabaseId,
          properties: {
            키워드: {
              multi_select: {
                options: updatedOptions
              }
            }
          }
        });
      }
    } catch (error) {
      console.log(`⚠️ 키워드 옵션 업데이트 실패: ${error.message}`);
    }
  }

  // 4. 대시보드 요약 페이지 생성
  async createDashboardSummary(channelName, stats) {
    console.log("📊 대시보드 요약 페이지 생성 중...");

    const summaryContent = {
      title: `📈 ${channelName} 운영 대시보드`,
      content: this.generateDashboardMarkdown(channelName, stats),
      tags: ["대시보드", "운영현황", channelName],
      priority: "High",
      category: "운영관리",
      summary: `${channelName} 채널 운영 현황 대시보드`
    };

    summaryContent.metadata = {
      createdBy: "Slack Operation Database Manager",
      createdAt: new Date().toISOString(),
      source: `Slack #${channelName}`,
      databaseId: this.operationDatabaseId
    };

    const summaryPage = await this.notionService.createPage(summaryContent);
    this.summaryPageId = summaryPage.id;

    // 데이터베이스 링크 블록 추가
    await this.notionService.appendToPage(summaryPage.id, [
      {
        object: "block",
        type: "divider",
        divider: {}
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: { content: "🔗 관련 리소스" }
            }
          ]
        }
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: "📊 " },
              annotations: { bold: true }
            },
            {
              type: "text",
              text: {
                content: "운영 이슈 데이터베이스",
                link: { url: `https://notion.so/${this.operationDatabaseId.replace(/-/g, "")}` }
              },
              annotations: { color: "blue" }
            }
          ]
        }
      }
    ]);

    return summaryPage;
  }

  // 5. 대시보드 마크다운 생성
  generateDashboardMarkdown(channelName, stats) {
    return `# 📈 실시간 운영 현황

## 🎯 핵심 지표
- **📊 총 이슈 수**: ${this.processResults.processedIssues}개
- **⏰ 분석 기간**: 최근 30일
- **📅 마지막 업데이트**: ${new Date().toLocaleString("ko-KR")}
- **🔄 처리 성공률**: ${Math.round((this.processResults.processedIssues / this.processResults.totalMessages) * 100)}%

## 📋 카테고리별 현황

${Object.entries(stats.categoryFrequency)
  .sort(([, a], [, b]) => b - a)
  .filter(([, count]) => count > 0)
  .map(([category, count]) => {
    const percentage = Math.round((count / this.processResults.processedIssues) * 100);
    return `### ${this.getCategoryDisplayName(category)}
- **이슈 수**: ${count}개 (${percentage}%)
- **예상 총 시간**: ${this.calculateCategoryTime(category, stats)}시간
- **평균 시간**: ${Math.round((this.calculateCategoryTime(category, stats) / count) * 60)}분/건`;
  })
  .join("\n\n")}

## ⚡ 우선순위 분포
- 🔴 **높음**: ${stats.urgencyDistribution.high}개 (${Math.round((stats.urgencyDistribution.high / this.processResults.processedIssues) * 100)}%)
- 🟡 **보통**: ${stats.urgencyDistribution.medium}개 (${Math.round((stats.urgencyDistribution.medium / this.processResults.processedIssues) * 100)}%)
- 🟢 **낮음**: ${stats.urgencyDistribution.low}개 (${Math.round((stats.urgencyDistribution.low / this.processResults.processedIssues) * 100)}%)

## 💰 리소스 현황
- **📊 총 예상 시간**: ${Math.round(stats.totalResourceTime / 60)}시간 ${stats.totalResourceTime % 60}분
- **📈 일평균 업무량**: ${Math.round(this.processResults.processedIssues / 30)}건/일
- **⏰ 평균 처리시간**: ${stats.averageResourceTime}분/건

## 🔥 TOP 이슈 키워드
${Object.entries(stats.topKeywords)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10)
  .map(([keyword, count], index) => `${index + 1}. **${keyword}**: ${count}회`)
  .join("\n")}

## 📊 활용 가이드

### **🔍 데이터베이스 필터링**
- **카테고리별 보기**: 특정 운영 영역만 필터링
- **우선순위별 정렬**: 긴급한 이슈부터 처리
- **담당자별 현황**: 개인별 업무 분배 현황
- **기간별 트렌드**: 주간/월간 이슈 발생 패턴

### **📈 대시보드 활용**
- **일일 스탠드업**: 신규/진행중 이슈 리뷰
- **주간 회고**: 완료된 이슈 및 소요시간 분석
- **월간 계획**: 트렌드 기반 리소스 계획 수립
- **분기별 개선**: 반복 이슈 자동화 검토

### **🎯 액션 아이템**
- [ ] 고빈도 이슈 프로세스 표준화
- [ ] 평균 처리시간 단축 방안 검토
- [ ] 우선순위 높은 이슈 대응 체계 강화
- [ ] 반복 패턴 자동화 도구 도입

---
*🤖 Slack Operation Database Manager가 자동 생성한 리포트입니다.*`;
  }

  // 6. 전체 프로세스 실행
  async processSlackToDatabase(channelName, daysBack = 30) {
    console.log("🚀 Slack → Notion 데이터베이스 구축 시작!");
    console.log("=".repeat(60));

    try {
      // AI 서비스 연결
      await this.snowflakeAI.connect();

      // 1. 운영 데이터베이스 생성
      await this.createOperationDatabase(channelName);

      // 2. Slack 메시지 수집
      console.log(`📱 Slack #${channelName} 메시지 수집 중...`);
      const messages = await this.scrapeChannelHistory(channelName, daysBack);
      this.processResults.totalMessages = messages.length;

      if (messages.length === 0) {
        throw new Error("수집된 메시지가 없습니다.");
      }

      // 3. 메시지별 AI 분석 및 데이터베이스 저장
      console.log("🤖 AI 분석 및 데이터베이스 저장 중...");
      const stats = {
        categoryFrequency: {},
        urgencyDistribution: { high: 0, medium: 0, low: 0 },
        totalResourceTime: 0,
        averageResourceTime: 0,
        topKeywords: {}
      };

      const batchSize = 5; // API 제한 고려
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);

        console.log(`📊 진행률: ${Math.round((i / messages.length) * 100)}% (${i}/${messages.length})`);

        for (const message of batch) {
          try {
            // AI 분석
            const analysis = await this.analyzeMessage(message);

            // 통계 업데이트
            stats.categoryFrequency[analysis.category] = (stats.categoryFrequency[analysis.category] || 0) + 1;
            stats.urgencyDistribution[analysis.urgency]++;
            stats.totalResourceTime += parseInt(analysis.resource_estimate) || 0;

            analysis.keywords.forEach((keyword) => {
              stats.topKeywords[keyword] = (stats.topKeywords[keyword] || 0) + 1;
            });

            // 데이터베이스에 저장
            await this.saveMessageAsIssue(message, analysis);
          } catch (error) {
            console.log(`⚠️ 메시지 처리 실패: ${error.message}`);
            this.processResults.failedMessages++;
          }
        }

        // API 제한 방지
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // 4. 통계 계산
      stats.averageResourceTime =
        this.processResults.processedIssues > 0 ? Math.round(stats.totalResourceTime / this.processResults.processedIssues) : 0;

      // 5. 대시보드 요약 생성
      const dashboard = await this.createDashboardSummary(channelName, stats);

      console.log("\n🎉 데이터베이스 구축 완료!");
      console.log("=".repeat(50));
      console.log(`📊 처리된 이슈: ${this.processResults.processedIssues}개`);
      console.log(`❌ 실패한 메시지: ${this.processResults.failedMessages}개`);
      console.log(`📈 성공률: ${Math.round((this.processResults.processedIssues / this.processResults.totalMessages) * 100)}%`);
      console.log(`🔗 데이터베이스: https://notion.so/${this.operationDatabaseId.replace(/-/g, "")}`);
      console.log(`📊 대시보드: ${dashboard.url}`);

      return {
        success: true,
        databaseId: this.operationDatabaseId,
        databaseUrl: `https://notion.so/${this.operationDatabaseId.replace(/-/g, "")}`,
        dashboardUrl: dashboard.url,
        stats: {
          totalMessages: this.processResults.totalMessages,
          processedIssues: this.processResults.processedIssues,
          failedMessages: this.processResults.failedMessages,
          categories: Object.keys(stats.categoryFrequency).filter((cat) => stats.categoryFrequency[cat] > 0),
          insights: stats
        }
      };
    } catch (error) {
      console.error("❌ 프로세스 실패:", error.message);
      throw error;
    } finally {
      await this.snowflakeAI.disconnect();
    }
  }

  // 헬퍼 메서드들
  async scrapeChannelHistory(channelName, daysBack) {
    // 기존 스크래핑 로직과 동일
    const channelsList = await this.slack.conversations.list();
    const channel = channelsList.channels.find((ch) => ch.name === channelName);

    if (!channel) throw new Error(`채널을 찾을 수 없습니다: ${channelName}`);

    const oldest = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
    let messages = [];
    let cursor = null;

    do {
      const response = await this.slack.conversations.history({
        channel: channel.id,
        oldest: oldest,
        limit: 200,
        cursor: cursor
      });
      messages.push(...response.messages);
      cursor = response.response_metadata?.next_cursor;
    } while (cursor);

    return messages.filter((msg) => msg.text && !msg.bot_id && msg.subtype !== "bot_message" && msg.text.length > 10);
  }

  async analyzeMessage(message) {
    // 기존 AI 분석 로직과 동일
    const prompt = `다음 Slack 메시지를 LBD/SIREN 시스템 운영 관점에서 분석하고 분류해주세요:

메시지: "${message.text}"

다음 JSON 형태로 응답해주세요:
{
  "category": "incident_response|maintenance|monitoring|deployment|user_support|performance|security|documentation|meeting_discussion|feature_request|bug_report|etc",
  "operation_type": "구체적인 운영 작업 유형",
  "urgency": "high|medium|low",
  "resource_estimate": "예상 소요 시간 (분 단위)",
  "keywords": ["핵심", "키워드들"],
  "summary": "한 줄 요약"
}`;

    const response = await this.snowflakeAI.callOpenAI(prompt);

    try {
      return JSON.parse(response);
    } catch (error) {
      return {
        category: "etc",
        operation_type: "분류 실패",
        urgency: "low",
        resource_estimate: "0",
        keywords: [],
        summary: "AI 분석 실패"
      };
    }
  }

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
      feature_request: "✨ 기능 요청",
      bug_report: "🐛 버그 리포트",
      etc: "📋 기타"
    };
    return names[category] || category;
  }

  getUrgencyDisplayName(urgency) {
    const names = {
      high: "🔴 높음",
      medium: "🟡 보통",
      low: "🟢 낮음"
    };
    return names[urgency] || urgency;
  }

  calculateCategoryTime(category, stats) {
    // 카테고리별 총 시간 계산 로직
    return Math.round(((stats.categoryFrequency[category] || 0) * stats.averageResourceTime) / 60);
  }
}

// 사용 예시
async function setupOperationDatabase() {
  const manager = new SlackOperationDatabaseManager();

  try {
    const result = await manager.processSlackToDatabase("탐지솔루션실-솔루션", 30);

    console.log("\n✅ 운영 데이터베이스 구축 완료!");
    console.log(`📊 데이터베이스: ${result.databaseUrl}`);
    console.log(`📈 대시보드: ${result.dashboardUrl}`);
    console.log(`📋 처리된 이슈: ${result.stats.processedIssues}개`);
  } catch (error) {
    console.error("💥 구축 실패:", error.message);
  }
}

module.exports = SlackOperationDatabaseManager;

// 즉시 실행
if (require.main === module) {
  setupOperationDatabase();
}
