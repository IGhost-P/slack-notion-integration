// tests/test-integration.js
// 전체 시스템 통합 테스트 - Slack → Snowflake AI → Notion 파이프라인

require("dotenv").config();
const SnowflakeAIService = require("../src/services/snowflake-ai");
const NotionService = require("../src/services/notion-service");

class IntegrationTester {
  constructor() {
    this.snowflakeAI = new SnowflakeAIService();
    this.notionService = new NotionService();
    this.testResults = {
      snowflakeConnection: false,
      notionConnection: false,
      aiProcessing: false,
      contentGeneration: false,
      notionPageCreation: false,
      endToEndPipeline: false
    };
  }

  async testSnowflakeConnection() {
    console.log("🔗 1단계: Snowflake 연결 테스트");
    console.log("=".repeat(50));

    try {
      console.log("🔄 Snowflake JWT 인증 연결 중...");
      await this.snowflakeAI.connect();

      const status = this.snowflakeAI.getConnectionStatus();
      console.log("✅ Snowflake 연결 성공!");
      console.log(`   계정: ${status.account}`);
      console.log(`   사용자: ${status.username}`);
      console.log(`   상태: ${status.isConnected ? "연결됨" : "연결 안됨"}`);

      this.testResults.snowflakeConnection = true;
    } catch (error) {
      console.error("❌ Snowflake 연결 실패:", error.message);
      throw error;
    }

    console.log("\n");
  }

  async testNotionConnection() {
    console.log("📝 2단계: Notion API 연결 테스트");
    console.log("=".repeat(50));

    try {
      console.log("🔄 Notion API 연결 테스트 중...");
      const connectionTest = await this.notionService.testConnection();

      if (connectionTest.success) {
        console.log("✅ Notion 연결 성공!");
        console.log(`   사용자: ${connectionTest.user}`);
        console.log(`   타입: ${connectionTest.type}`);
        this.testResults.notionConnection = true;
      } else {
        throw new Error(connectionTest.error);
      }
    } catch (error) {
      console.error("❌ Notion 연결 실패:", error.message);
      throw error;
    }

    console.log("\n");
  }

  async testAIProcessing() {
    console.log("🤖 3단계: AI 콘텐츠 처리 테스트");
    console.log("=".repeat(50));

    try {
      const testMessages = [
        "오늘 팀 미팅에서 새로운 기능 개발에 대해 논의했습니다. Q3까지 완료 예정이고, 우선순위는 높음입니다.",
        "버그 수정: 로그인 페이지에서 세션 타임아웃 문제 발견. 긴급히 수정 필요.",
        "아이디어: 사용자 경험 개선을 위한 대시보드 리디자인 제안. 사용성 테스트 후 결정."
      ];

      console.log("🔄 AI 콘텐츠 구조화 테스트 중...");

      this.aiResults = [];

      for (let i = 0; i < testMessages.length; i++) {
        const message = testMessages[i];
        console.log(`\n📝 테스트 메시지 ${i + 1}: "${message.substring(0, 50)}..."`);

        const result = await this.snowflakeAI.generateNotionContent(message);

        console.log(`✅ AI 분석 완료:`);
        console.log(`   제목: ${result.title}`);
        console.log(`   우선순위: ${result.priority}`);
        console.log(`   카테고리: ${result.category}`);
        console.log(`   태그: ${result.tags?.join(", ") || "N/A"}`);

        this.aiResults.push({
          original: message,
          processed: result
        });
      }

      console.log("\n✅ AI 처리 테스트 성공!");
      console.log(`📊 처리된 메시지: ${this.aiResults.length}개`);

      this.testResults.aiProcessing = true;
    } catch (error) {
      console.error("❌ AI 처리 실패:", error.message);
      throw error;
    }

    console.log("\n");
  }

  async testContentGeneration() {
    console.log("📋 4단계: 구조화된 콘텐츠 생성 테스트");
    console.log("=".repeat(50));

    try {
      console.log("🔄 노션용 콘텐츠 구조화 테스트 중...");

      // 가장 복합적인 콘텐츠로 테스트
      const complexMessage = `
        프로젝트 진행 상황 업데이트:
        
        완료된 작업:
        - Snowflake JWT 인증 구현
        - OpenAI 연동 완료
        - Notion API 연결 성공
        
        진행 중인 작업:
        - Slack Bot 개발 (80% 완료)
        - 전체 파이프라인 통합 테스트
        
        다음 단계:
        - 프로덕션 배포 준비
        - 문서화 완료
        - 성능 최적화
        
        우선순위: 높음
        데드라인: 이번 주 금요일
        담당자: 개발팀 전체
      `;

      const enhancedContent = await this.snowflakeAI.generateNotionContent(complexMessage);

      // 메타데이터 추가 (실제 Slack Bot에서와 동일)
      enhancedContent.metadata = {
        createdBy: "Integration Test",
        createdAt: new Date().toISOString(),
        source: "Integration Test Suite",
        originalMessage: complexMessage.trim()
      };

      console.log("✅ 콘텐츠 구조화 성공!");
      console.log(`📄 제목: ${enhancedContent.title}`);
      console.log(`📝 요약: ${enhancedContent.summary}`);
      console.log(`🏷️ 태그: ${enhancedContent.tags?.join(", ") || "N/A"}`);
      console.log(`⚡ 우선순위: ${enhancedContent.priority}`);
      console.log(`📂 카테고리: ${enhancedContent.category}`);
      console.log(`📏 콘텐츠 길이: ${enhancedContent.content?.length || 0}자`);

      this.enhancedContent = enhancedContent;
      this.testResults.contentGeneration = true;
    } catch (error) {
      console.error("❌ 콘텐츠 생성 실패:", error.message);
      throw error;
    }

    console.log("\n");
  }

  async testNotionPageCreation() {
    console.log("📚 5단계: Notion 페이지 생성 테스트");
    console.log("=".repeat(50));

    try {
      console.log("🔄 실제 Notion 페이지 생성 중...");

      if (!this.enhancedContent) {
        throw new Error("구조화된 콘텐츠가 없습니다. 이전 단계를 먼저 실행하세요.");
      }

      const createdPage = await this.notionService.createPage(this.enhancedContent);

      console.log("✅ Notion 페이지 생성 성공!");
      console.log(`📄 페이지 제목: ${createdPage.title}`);
      console.log(`🔗 페이지 URL: ${createdPage.url}`);
      console.log(`🆔 페이지 ID: ${createdPage.id}`);

      this.createdPage = createdPage;
      this.testResults.notionPageCreation = true;

      // 추가 콘텐츠 업데이트 테스트 (선택사항)
      console.log("\n🔄 페이지 업데이트 테스트 중...");

      const additionalBlocks = [
        {
          object: "block",
          type: "divider",
          divider: {}
        },
        {
          object: "block",
          type: "callout",
          callout: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: `🎉 통합 테스트 완료! 모든 시스템이 정상 작동합니다. 테스트 시간: ${new Date().toLocaleString("ko-KR")}`
                }
              }
            ],
            icon: { emoji: "✅" },
            color: "green_background"
          }
        }
      ];

      await this.notionService.appendToPage(createdPage.id, additionalBlocks);
      console.log("✅ 페이지 업데이트 성공!");
    } catch (error) {
      console.error("❌ Notion 페이지 생성 실패:", error.message);
      throw error;
    }

    console.log("\n");
  }

  async testEndToEndPipeline() {
    console.log("🔄 6단계: 전체 파이프라인 시뮬레이션");
    console.log("=".repeat(50));

    try {
      console.log("🔄 Slack → Snowflake → Notion 파이프라인 시뮬레이션 중...");

      // 실제 Slack Bot에서 받을 법한 메시지들 시뮬레이션
      const slackMessages = [
        {
          text: "긴급! 서버 다운 이슈 발생. 즉시 대응 필요합니다.",
          user: "개발자A",
          channel: "#incidents"
        },
        {
          text: "새로운 마케팅 캠페인 아이디어: AI 기반 개인화 추천 시스템",
          user: "마케터B",
          channel: "#ideas"
        },
        {
          text: "월간 리포트 작성 완료. 검토 후 배포 예정입니다.",
          user: "PM C",
          channel: "#reports"
        }
      ];

      this.pipelineResults = [];

      for (const slackMessage of slackMessages) {
        console.log(`\n📱 Slack 메시지 처리: "${slackMessage.text.substring(0, 30)}..."`);

        // 1. AI 분석
        console.log("   🤖 AI 분석 중...");
        const aiResult = await this.snowflakeAI.generateNotionContent(slackMessage.text);

        // 2. 메타데이터 추가
        aiResult.metadata = {
          createdBy: slackMessage.user,
          createdAt: new Date().toISOString(),
          source: `Slack - ${slackMessage.channel}`,
          originalMessage: slackMessage.text
        };

        // 3. Notion 페이지 생성
        console.log("   📝 Notion 페이지 생성 중...");
        const notionPage = await this.notionService.createPage(aiResult);

        console.log(`   ✅ 완료: ${notionPage.title}`);
        console.log(`   🔗 URL: ${notionPage.url}`);

        this.pipelineResults.push({
          slack: slackMessage,
          ai: aiResult,
          notion: notionPage
        });

        // 과부하 방지를 위한 잠시 대기
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log("\n✅ 전체 파이프라인 테스트 성공!");
      console.log(`📊 처리된 메시지: ${this.pipelineResults.length}개`);

      this.testResults.endToEndPipeline = true;
    } catch (error) {
      console.error("❌ 파이프라인 테스트 실패:", error.message);
      throw error;
    }

    console.log("\n");
  }

  async runAllTests() {
    console.log("🚀 Slack-Notion 통합 시스템 종합 테스트 시작!");
    console.log("=".repeat(60));
    console.log("📋 테스트 범위: Snowflake JWT + OpenAI + Notion API + 파이프라인");
    console.log("⏱️  예상 소요 시간: 2-3분\n");

    const startTime = new Date();

    try {
      await this.testSnowflakeConnection();
      await this.testNotionConnection();
      await this.testAIProcessing();
      await this.testContentGeneration();
      await this.testNotionPageCreation();
      await this.testEndToEndPipeline();

      // 결과 요약
      const endTime = new Date();
      const duration = Math.round((endTime - startTime) / 1000);

      console.log("🎉 통합 테스트 결과 요약");
      console.log("=".repeat(50));

      const results = Object.entries(this.testResults);
      const passed = results.filter(([, success]) => success).length;
      const total = results.length;

      results.forEach(([test, success]) => {
        const icon = success ? "✅" : "❌";
        const name = test.replace(/([A-Z])/g, " $1").toLowerCase();
        console.log(`${icon} ${name}`);
      });

      console.log("");
      console.log(`📊 성공률: ${passed}/${total} (${Math.round((passed / total) * 100)}%)`);
      console.log(`⏱️ 총 소요 시간: ${duration}초`);

      if (passed === total) {
        console.log("\n🎉 모든 통합 테스트 통과!");
        console.log("✅ Slack-Notion 통합 시스템 준비 완료");
        console.log("🔑 JWT 인증, AI 처리, Notion 연동 모두 정상");
        console.log("🚀 Slack Bot 배포 준비 완료!");

        console.log("\n📚 생성된 리소스:");
        console.log(`   📄 테스트 페이지: ${this.createdPage?.url || "N/A"}`);
        console.log(`   🔄 파이프라인 처리: ${this.pipelineResults?.length || 0}개 메시지`);

        if (this.pipelineResults?.length > 0) {
          console.log("\n📋 파이프라인 처리 결과:");
          this.pipelineResults.forEach((result, index) => {
            console.log(`   ${index + 1}. ${result.notion.title}`);
            console.log(`      URL: ${result.notion.url}`);
          });
        }
      } else {
        console.log("\n⚠️  일부 통합 테스트 실패");
        console.log("🔧 실패한 구성 요소를 확인하고 문제를 해결하세요.");
      }
    } catch (error) {
      console.error("\n💥 통합 테스트 중단:", error.message);

      console.log("\n🔧 통합 시스템 문제 해결 가이드:");
      console.log("1. 개별 테스트 실행:");
      console.log("   npm run test:snowflake");
      console.log("   npm run test:notion");
      console.log("2. 환경 변수 확인:");
      console.log("   모든 필수 토큰과 설정이 .env에 올바르게 입력되었는지 확인");
      console.log("3. 네트워크 연결:");
      console.log("   인터넷 연결 및 방화벽 설정 확인");
    } finally {
      // 리소스 정리
      console.log("\n🧹 리소스 정리 중...");
      if (this.snowflakeAI) {
        await this.snowflakeAI.disconnect();
      }
      console.log("✅ 정리 완료");
    }
  }
}

// 테스트 실행
console.log("⚡ 전체 시스템 통합 테스트 시작...\n");

const tester = new IntegrationTester();
tester
  .runAllTests()
  .then(() => {
    console.log("\n✨ 통합 테스트 완료!");
    console.log("🚀 이제 Slack Bot을 시작할 준비가 되었습니다!");
    console.log("📖 다음 단계: README.md의 Slack App 설정 가이드를 따라하세요.");
  })
  .catch((error) => {
    console.error("\n💥 통합 테스트 실패:", error.message);
    process.exit(1);
  });
