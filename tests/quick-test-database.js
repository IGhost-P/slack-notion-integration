// quick-test-database.js
// 데이터베이스 분석기 빠른 테스트 (실제 Slack 스크래핑 없이)

require("dotenv").config();
const SnowflakeAIService = require("../src/services/snowflake-ai");
const NotionService = require("../src/services/notion-service");

class QuickDatabaseTest {
  constructor() {
    this.snowflakeAI = new SnowflakeAIService();
    this.notionService = new NotionService();
  }

  // 1. 데이터베이스 생성 테스트
  async testCreateDatabase() {
    console.log("📊 1단계: Notion 데이터베이스 생성 테스트");
    console.log("=".repeat(50));

    // 환경변수 체크
    if (!process.env.NOTION_PARENT_PAGE_ID) {
      throw new Error("NOTION_PARENT_PAGE_ID 환경변수가 설정되지 않았습니다. .env 파일을 확인해주세요.");
    }

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
              { name: "✅ 완료", color: "green" }
            ]
          }
        },
        작성자: { rich_text: {} },
        "예상 소요시간": { number: { format: "number" } },
        발생일시: { date: {} },
        키워드: { multi_select: { options: [] } },
        "원본 메시지": { rich_text: {} },
        "AI 요약": { rich_text: {} }
      };

      console.log("🔄 테스트용 운영 이슈 데이터베이스 생성 중...");

      const database = await this.notionService.notion.databases.create({
        parent: {
          page_id: process.env.NOTION_PARENT_PAGE_ID.replace(/-/g, "")
        },
        title: [
          {
            type: "text",
            text: {
              content: "🧪 테스트용 운영 이슈 데이터베이스"
            }
          }
        ],
        properties: databaseProperties,
        description: [
          {
            type: "text",
            text: {
              content: "Slack 운영 이슈 관리 시스템 테스트용 데이터베이스입니다."
            }
          }
        ]
      });

      console.log("✅ 데이터베이스 생성 성공!");
      console.log(`🔗 데이터베이스 URL: ${database.url}`);
      console.log(`🆔 데이터베이스 ID: ${database.id}`);

      return database;
    } catch (error) {
      console.error("❌ 데이터베이스 생성 실패:", error.message);
      throw error;
    }
  }

  // 2. 가짜 Slack 메시지로 AI 분석 테스트
  async testAIAnalysis() {
    console.log("\n🤖 2단계: AI 분석 테스트");
    console.log("=".repeat(50));

    await this.snowflakeAI.connect();

    const testMessages = [
      "서버 다운됐습니다! 긴급 확인 필요해요",
      "정기 배포 예정입니다. 오후 3시에 진행할게요",
      "모니터링 알림이 계속 와요. 임계값 조정이 필요할 것 같습니다",
      "사용자가 로그인 문제 신고했어요. 확인 부탁드립니다",
      "성능 이슈로 응답시간이 느려지고 있어요"
    ];

    const analysisResults = [];

    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`\n📝 메시지 ${i + 1}: "${message}"`);

      try {
        const analysis = await this.analyzeMessage(message);

        console.log(`   🏷️ 카테고리: ${this.getCategoryDisplayName(analysis.category)}`);
        console.log(`   ⚡ 우선순위: ${analysis.urgency}`);
        console.log(`   ⏰ 예상시간: ${analysis.resource_estimate}분`);
        console.log(`   🔑 키워드: ${analysis.keywords.join(", ")}`);
        console.log(`   📝 요약: ${analysis.summary}`);

        analysisResults.push({ message, analysis });
      } catch (error) {
        console.log(`   ❌ 분석 실패: ${error.message}`);
      }
    }

    await this.snowflakeAI.disconnect();
    return analysisResults;
  }

  // 3. 테스트 이슈들을 데이터베이스에 저장
  async testSaveIssues(database, analysisResults) {
    console.log("\n📝 3단계: 데이터베이스 저장 테스트");
    console.log("=".repeat(50));

    const savedPages = [];

    for (let i = 0; i < analysisResults.length; i++) {
      const { message, analysis } = analysisResults[i];

      console.log(`🔄 이슈 ${i + 1} 저장 중: ${analysis.summary}`);

      try {
        const page = await this.notionService.notion.pages.create({
          parent: {
            database_id: database.id
          },
          properties: {
            "이슈 제목": {
              title: [
                {
                  type: "text",
                  text: { content: analysis.summary }
                }
              ]
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
              rich_text: [{ type: "text", text: { content: "테스트 사용자" } }]
            },
            "예상 소요시간": {
              number: parseInt(analysis.resource_estimate) || 0
            },
            발생일시: {
              date: { start: new Date().toISOString() }
            },
            "원본 메시지": {
              rich_text: [{ type: "text", text: { content: message } }]
            },
            "AI 요약": {
              rich_text: [{ type: "text", text: { content: analysis.summary } }]
            }
          }
        });

        console.log(`   ✅ 저장 성공: ${page.url}`);
        savedPages.push(page);
      } catch (error) {
        console.log(`   ❌ 저장 실패: ${error.message}`);
      }

      // API 제한 방지
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return savedPages;
  }

  // AI 분석 로직
  async analyzeMessage(message) {
    const prompt = `다음 메시지를 운영 관점에서 분석해주세요:

메시지: "${message}"

JSON 형태로 응답:
{
  "category": "incident_response|maintenance|monitoring|deployment|user_support|performance|etc",
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

  // 전체 테스트 실행
  async runQuickTest() {
    console.log("🚀 운영 이슈 데이터베이스 빠른 테스트 시작!");
    console.log("=".repeat(60));
    console.log("📋 테스트 내용: DB 생성 → AI 분석 → 이슈 저장");
    console.log("⏱️ 예상 소요 시간: 2-3분\n");

    try {
      // 1. 데이터베이스 생성
      const database = await this.testCreateDatabase();

      // 2. AI 분석 테스트
      const analysisResults = await this.testAIAnalysis();

      // 3. 데이터베이스 저장 테스트
      const savedPages = await this.testSaveIssues(database, analysisResults);

      // 결과 요약
      console.log("\n🎉 테스트 완료!");
      console.log("=".repeat(50));
      console.log(`✅ 데이터베이스 생성: 성공`);
      console.log(`✅ AI 분석: ${analysisResults.length}개 메시지 처리`);
      console.log(`✅ 이슈 저장: ${savedPages.length}개 저장됨`);
      console.log(`🔗 데이터베이스 URL: ${database.url}`);

      console.log("\n📊 다음 단계:");
      console.log("1. Notion에서 생성된 데이터베이스 확인");
      console.log("2. 필터/정렬 기능 테스트");
      console.log("3. 실제 Slack 채널 스크래핑 시도");

      return {
        success: true,
        databaseUrl: database.url,
        databaseId: database.id,
        analysisCount: analysisResults.length,
        savedCount: savedPages.length
      };
    } catch (error) {
      console.error("\n💥 테스트 실패:", error.message);

      console.log("\n🔧 문제 해결:");
      console.log("1. .env 파일의 모든 설정이 올바른지 확인");
      console.log("2. Snowflake, Notion 연결 상태 개별 확인");
      console.log("3. API 권한 및 크레딧 잔량 확인");

      throw error;
    }
  }
}

// 테스트 실행
console.log("⚡ 운영 이슈 데이터베이스 빠른 테스트 시작...\n");

const tester = new QuickDatabaseTest();
tester
  .runQuickTest()
  .then((result) => {
    console.log("\n✨ 빠른 테스트 성공!");
    console.log("🎯 이제 실제 Slack 스크래핑을 시도해볼 수 있습니다!");
  })
  .catch((error) => {
    console.error("\n💥 빠른 테스트 실패:", error.message);
    process.exit(1);
  });
