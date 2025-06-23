// config/database.js
// Snowflake SDK 방식의 JWT 인증 설정

require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");

class SnowflakeJWTConfig {
  constructor() {
    this.config = {
      account: process.env.SNOWFLAKE_ACCOUNT,
      username: process.env.SNOWFLAKE_USERNAME,
      database: process.env.SNOWFLAKE_DATABASE,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE,
      schema: process.env.SNOWFLAKE_SCHEMA || "PUBLIC",
      role: process.env.SNOWFLAKE_ROLE,

      // JWT 인증 설정 - snowflake-sdk 방식
      authenticator: "SNOWFLAKE_JWT",
      privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH,
      privateKeyPassphrase: process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE
    };
  }

  // 개인키 읽기 및 복호화
  getPrivateKey() {
    try {
      if (!fs.existsSync(this.config.privateKeyPath)) {
        throw new Error(`개인키 파일을 찾을 수 없습니다: ${this.config.privateKeyPath}`);
      }

      const encryptedPrivateKey = fs.readFileSync(this.config.privateKeyPath, "utf8");

      // 암호화된 개인키인지 확인
      if (encryptedPrivateKey.includes("-----BEGIN ENCRYPTED PRIVATE KEY-----")) {
        console.log("🔓 암호화된 개인키 복호화 중...");

        // 암호화된 개인키를 복호화
        const decryptedPrivateKey = crypto
          .createPrivateKey({
            key: encryptedPrivateKey,
            passphrase: this.config.privateKeyPassphrase,
            format: "pem"
          })
          .export({
            type: "pkcs8",
            format: "pem"
          });

        console.log("✅ 개인키 복호화 성공");
        return decryptedPrivateKey;
      } else {
        // 이미 복호화된 개인키
        console.log("✅ 개인키 파일 읽기 성공 (이미 복호화됨)");
        return encryptedPrivateKey;
      }
    } catch (error) {
      throw new Error(`개인키 읽기/복호화 실패: ${error.message}`);
    }
  }

  // Snowflake SDK용 연결 설정 생성
  getConnectionConfig() {
    // 개인키 유효성 검증
    const privateKey = this.getPrivateKey();

    return {
      account: this.config.account,
      username: this.config.username,
      database: this.config.database,
      warehouse: this.config.warehouse,
      schema: this.config.schema,
      role: this.config.role,

      // JWT 인증 설정 - snowflake-sdk 방식
      authenticator: "SNOWFLAKE_JWT",
      privateKey: privateKey,
      privateKeyPassphrase: this.config.privateKeyPassphrase
    };
  }

  // 설정 검증
  validateConfig() {
    const required = ["account", "username", "database", "warehouse"];
    const missing = required.filter((key) => !this.config[key]);

    if (missing.length > 0) {
      throw new Error(`필수 Snowflake 설정이 누락됨: ${missing.join(", ")}`);
    }

    if (!this.config.privateKeyPath || !this.config.privateKeyPassphrase) {
      throw new Error("JWT 인증을 위한 개인키 경로와 암호가 필요합니다");
    }

    // 개인키 파일 존재 확인
    if (!fs.existsSync(this.config.privateKeyPath)) {
      throw new Error(`개인키 파일을 찾을 수 없습니다: ${this.config.privateKeyPath}`);
    }

    return true;
  }

  // 설정 정보 출력 (보안 정보 마스킹)
  printConfig() {
    console.log("🔑 Snowflake JWT 인증 설정:");
    console.log(`   계정: ${this.config.account}`);
    console.log(`   사용자: ${this.config.username}`);
    console.log(`   데이터베이스: ${this.config.database}`);
    console.log(`   웨어하우스: ${this.config.warehouse}`);
    console.log(`   스키마: ${this.config.schema}`);
    console.log(`   역할: ${this.config.role || "기본값"}`);
    console.log(`   개인키 경로: ${this.config.privateKeyPath}`);
    console.log(`   인증 방식: JWT (SDK 방식)`);
  }
}

module.exports = {
  SnowflakeJWTConfig,
  createJWTConfig: () => new SnowflakeJWTConfig()
};
