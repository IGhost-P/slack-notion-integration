// src/services/snowflake-ai.js
// Snowflake SDK 방식 JWT 인증을 사용하는 AI 서비스

const snowflake = require("snowflake-sdk");
const { createJWTConfig } = require("../../config/database");

class SnowflakeAIService {
  constructor() {
    this.connection = null;
    this.isConnected = false;
    this.jwtConfig = createJWTConfig();
  }

  // JWT 인증으로 연결 (SDK 방식)
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        // 설정 검증
        this.jwtConfig.validateConfig();

        // SDK 방식 연결 설정 생성
        const connectionConfig = this.jwtConfig.getConnectionConfig();

        console.log("🔑 Snowflake SDK 방식 JWT 인증 연결 시도 중...");
        console.log(`   계정: ${connectionConfig.account}`);
        console.log(`   사용자: ${connectionConfig.username}`);
        console.log(`   인증: ${connectionConfig.authenticator}`);
        console.log(`   개인키: ${connectionConfig.privateKey ? "로드됨" : "없음"}`);

        this.connection = snowflake.createConnection(connectionConfig);

        this.connection.connect((err, conn) => {
          if (err) {
            this.isConnected = false;
            console.error("❌ Snowflake SDK JWT 인증 실패:", err.message);
            reject(new Error(`Snowflake SDK JWT 연결 실패: ${err.message}`));
          } else {
            this.isConnected = true;
            console.log("✅ Snowflake SDK JWT 인증 성공!");
            resolve(conn);
          }
        });
      } catch (error) {
        reject(new Error(`JWT 설정 오류: ${error.message}`));
      }
    });
  }

  // 연결 상태 확인 및 재연결
  async ensureConnection() {
    if (!this.isConnected) {
      console.log("🔄 연결이 끊어짐. 재연결 시도 중...");
      await this.connect();
    }
  }

  // 쿼리 실행 (자동 재연결 포함)
  async executeQuery(sqlText, binds = []) {
    await this.ensureConnection();

    return new Promise((resolve, reject) => {
      this.connection.execute({
        sqlText: sqlText,
        binds: binds,
        complete: (err, stmt, rows) => {
          if (err) {
            // 연결 오류 시 재연결 시도
            if (err.message.includes("timeout") || err.message.includes("connection")) {
              this.isConnected = false;
              reject(new Error(`연결 오류 (재연결 필요): ${err.message}`));
            } else {
              reject(new Error(`쿼리 실행 실패: ${err.message}`));
            }
          } else {
            resolve(rows);
          }
        }
      });
    });
  }

  // OpenAI 모델 호출 (재시도 로직 포함)
  async callOpenAI(prompt, model = "openai-gpt-4.1", maxRetries = 2) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const query = `SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ?) as ai_response`;
        const result = await this.executeQuery(query, [model, prompt]);
        return result[0]?.AI_RESPONSE || "";
      } catch (error) {
        lastError = error;
        console.log(`⚠️  시도 ${attempt}/${maxRetries} 실패: ${error.message}`);

        if (attempt < maxRetries && error.message.includes("재연결 필요")) {
          console.log("🔄 재연결 후 재시도...");
          this.isConnected = false;
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1초 대기
        }
      }
    }

    throw lastError;
  }

  // 노션용 JSON 구조화 (재시도 로직 포함)
  async generateNotionContent(userMessage) {
    const prompt = `사용자 메시지를 노션 페이지로 변환해주세요:

사용자 입력: "${userMessage}"

다음 JSON 형태로 응답해주세요:
{
  "title": "적절한 페이지 제목",
  "content": "마크다운 형태의 구조화된 내용",
  "tags": ["관련", "태그들"],
  "priority": "High|Medium|Low",
  "category": "적절한 카테고리",
  "summary": "한 줄 요약"
}

반드시 유효한 JSON 형태로만 응답해주세요.`;

    try {
      const response = await this.callOpenAI(prompt);
      return JSON.parse(response);
    } catch (parseError) {
      console.log("⚠️  JSON 파싱 실패, 기본 구조 반환");
      return {
        title: "AI 생성 노트",
        content: response || userMessage,
        tags: ["AI", "자동생성"],
        priority: "Medium",
        category: "일반",
        summary: "AI가 생성한 내용입니다."
      };
    }
  }

  // 연결 종료
  async disconnect() {
    return new Promise((resolve) => {
      if (this.connection) {
        this.connection.destroy((err, conn) => {
          this.isConnected = false;
          if (err) {
            console.log("⚠️  연결 종료 중 경고:", err.message);
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // 연결 상태 확인
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      account: this.jwtConfig.config.account,
      username: this.jwtConfig.config.username,
      database: this.jwtConfig.config.database,
      warehouse: this.jwtConfig.config.warehouse
    };
  }
}

module.exports = SnowflakeAIService;
