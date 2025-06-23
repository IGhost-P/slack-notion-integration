// tests/test-snowflake.js
// JWT 인증 Snowflake OpenAI 테스트

require("dotenv").config();
const SnowflakeAIService = require("../src/services/snowflake-ai");
const { createJWTConfig } = require("../config/database");

class SnowflakeJWTTester {
  constructor() {
    this.aiService = new SnowflakeAIService();
    this.jwtConfig = createJWTConfig();
    this.testResults = {
      jwtSetup: false,
      connection: false,
      basicAI: false,
      jsonStructuring: false,
      notionContent: false
    };
  }

  async testJWTSetup() {
    console.log("🔑 1단계: JWT 인증 설정 테스트");
    console.log("=".repeat(50));

    try {
      // JWT 설정 검증
      this.jwtConfig.validateConfig();
      console.log("✅ JWT 설정 검증 완료");

      // 설정 정보 출력
      this.jwtConfig.printConfig();
      console.log("");

      // 개인키 읽기 테스트
      console.log("🔄 개인키 읽기 테스트...");
      const privateKey = this.jwtConfig.getPrivateKey();
      console.log("✅ 개인키 읽기 성공!");
      console.log(`   개인키 길이: ${privateKey.length} 문자`);
      console.log(`   개인키 시작: ${privateKey.substring(0, 50)}...`);

      this.testResults.jwtSetup = true;
    } catch (error) {
      console.error("❌ JWT 설정 실패:", error.message);
      console.log("\n🔧 해결 방법:");
      console.log("1. RSA 키 파일이 올바른 위치에 있는지 확인");
      console.log("2. 개인키 암호가 정확한지 확인");
      console.log("3. Snowflake에 공개키가 등록되었는지 확인");
      throw error;
    }

    console.log("\n");
  }

  async testConnection() {
    console.log("🔗 2단계: JWT 인증 연결 테스트");
    console.log("=".repeat(50));

    try {
      console.log("🔄 JWT 인증으로 Snowflake 연결 시도...");
      await this.aiService.connect();

      const status = this.aiService.getConnectionStatus();
      console.log("✅ JWT 인증 연결 성공!");
      console.log(`   연결 상태: ${status.isConnected ? "연결됨" : "연결 안됨"}`);
      console.log(`   계정: ${status.account}`);
      console.log(`   사용자: ${status.username}`);

      this.testResults.connection = true;
    } catch (error) {
      console.error("❌ JWT 연결 실패:", error.message);
      console.log("\n🔧 해결 방법:");
      console.log("1. Snowflake에서 공개키 등록 확인:");
      console.log("   ALTER USER your_username SET RSA_PUBLIC_KEY='<공개키내용>';");
      console.log("2. 사용자명과 계정명이 정확한지 확인");
      console.log("3. 웨어하우스가 활성화되어 있는지 확인");
      throw error;
    }

    console.log("\n");
  }

  async testBasicAI() {
    console.log("🤖 3단계: OpenAI 기본 테스트");
    console.log("=".repeat(50));

    try {
      const testMessage = "JWT 인증을 통한 Snowflake OpenAI 연동 테스트입니다.";
      console.log(`📝 테스트 메시지: "${testMessage}"`);

      const response = await this.aiService.callOpenAI(testMessage);

      console.log("✅ OpenAI 응답 성공!");
      console.log(`🤖 AI 응답: ${response.substring(0, 100)}...`);

      this.testResults.basicAI = true;
    } catch (error) {
      console.error("❌ OpenAI 테스트 실패:", error.message);
      console.log("\n🔧 해결 방법:");
      console.log("1. CORTEX.COMPLETE 권한 확인");
      console.log("2. openai-gpt-4.1 모델 접근 권한 확인");
      console.log("3. 웨어하우스 크레딧 잔량 확인");
      throw error;
    }

    console.log("\n");
  }

  async testJSONStructuring() {
    console.log("📋 4단계: JSON 구조화 테스트");
    console.log("=".repeat(50));

    try {
      const testInput = "JWT 인증 성공, 개발팀 스프린트 완료, 다음 단계는 Slack 봇 구현";
      console.log(`📝 입력: "${testInput}"`);

      const prompt = `다음을 JSON으로 구조화해주세요: "${testInput}"
      
출력 형식:
{
  "auth_method": "JWT",
  "status": "성공", 
  "completed_tasks": ["JWT 인증", "스프린트"],
  "next_steps": ["Slack 봇 구현"],
  "summary": "요약"
}

반드시 유효한 JSON만 응답해주세요.`;

      const response = await this.aiService.callOpenAI(prompt);
      console.log("🤖 JSON 응답:", response);

      // JSON 파싱 테스트
      const parsed = JSON.parse(response);
      console.log("✅ JSON 파싱 성공!");
      console.log(`   인증 방식: ${parsed.auth_method || "N/A"}`);
      console.log(`   상태: ${parsed.status || "N/A"}`);

      this.testResults.jsonStructuring = true;
    } catch (error) {
      console.error("❌ JSON 구조화 실패:", error.message);
      console.log("⚠️  JSON 파싱은 실패했지만 응답은 받았습니다.");
    }

    console.log("\n");
  }

  async testNotionContentGeneration() {
    console.log("📚 5단계: 노션 콘텐츠 생성 테스트");
    console.log("=".repeat(50));

    try {
      const userMessage = "JWT 인증으로 Snowflake OpenAI 연동 성공! 다음 단계는 Slack 봇 구현 예정";
      console.log(`📝 사용자 메시지: "${userMessage}"`);

      const notionContent = await this.aiService.generateNotionContent(userMessage);

      console.log("✅ 노션 콘텐츠 생성 성공!");
      console.log(`📄 제목: ${notionContent.title}`);
      console.log(`🏷️  태그: ${notionContent.tags?.join(", ") || "N/A"}`);
      console.log(`⚡ 우선순위: ${notionContent.priority}`);
      console.log(`📝 요약: ${notionContent.summary}`);

      this.testResults.notionContent = true;
    } catch (error) {
      console.error("❌ 노션 콘텐츠 생성 실패:", error.message);
      throw error;
    }

    console.log("\n");
  }

  async runAllTests() {
    console.log("🚀 Snowflake JWT 인증 종합 테스트 시작!");
    console.log("=".repeat(60));
    console.log("");

    try {
      await this.testJWTSetup();
      await this.testConnection();
      await this.testBasicAI();
      await this.testJSONStructuring();
      await this.testNotionContentGeneration();

      // 결과 요약
      console.log("🎉 JWT 인증 테스트 결과 요약");
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

      if (passed === total) {
        console.log("🎉 모든 JWT 인증 테스트 통과!");
        console.log("✅ Snowflake JWT 연동 준비 완료");
        console.log("🔑 RSA 키 기반 인증 작동 확인");
        console.log("🚀 다음 단계: Slack Bot 구현 시작 가능!");
      } else {
        console.log("⚠️  일부 테스트 실패. JWT 설정을 확인하세요.");
      }
    } catch (error) {
      console.error("💥 JWT 테스트 중단:", error.message);

      console.log("\n🔧 JWT 인증 문제 해결 가이드:");
      console.log("1. RSA 키 생성이 필요한 경우:");
      console.log("   openssl genrsa -out rsa_key.pem 2048");
      console.log("   openssl pkcs8 -topk8 -inform PEM -in rsa_key.pem -out rsa_key.p8");
      console.log("   openssl rsa -in rsa_key.pem -pubout -out rsa_key.pub");
      console.log("");
      console.log("2. Snowflake에 공개키 등록:");
      console.log("   ALTER USER your_username SET RSA_PUBLIC_KEY='<공개키내용>';");
      console.log("");
      console.log("3. .env 파일에 올바른 키 경로와 암호 설정");
    } finally {
      await this.aiService.disconnect();
      console.log("🔌 Snowflake 연결 종료");
    }
  }
}

// 테스트 실행
console.log("⚡ JWT 인증 Snowflake OpenAI 테스트 시작...\n");

const tester = new SnowflakeJWTTester();
tester
  .runAllTests()
  .then(() => {
    console.log("\n✨ JWT 테스트 완료!");
  })
  .catch((error) => {
    console.error("\n💥 JWT 테스트 실패:", error.message);
    process.exit(1);
  });
