# Slack-Notion RAG 검색 봇

## 🎯 검색/질문 전용 봇

이제 **검색과 질문에 특화된 RAG 봇**입니다! 더 이상 Notion 페이지를 생성하지 않습니다.

### ✨ 주요 기능

- 🔍 **과거 이슈 검색**: Slack에서 질문하면 유사한 과거 사례를 자동 검색
- 👤 **해결자 식별**: 누가 문제를 해결했는지 정확히 알려줌
- 🔗 **원본 스레드 링크**: 바로 원본 대화로 이동 가능
- 🤖 **스마트 인식**: 문제 해결 질문을 자동으로 감지
- 📚 **기존 문서 검색**: Notion 데이터베이스 내 문서 검색

## 🎯 사용법

### 1. 데이터 수집 (필수 선행 작업)

```bash
# 먼저 Slack 데이터를 분석하여 RAG 데이터베이스 구축
node bulk-slack-analyzer.js
```

### 2. 검색/질문 봇 실행

```bash
# 검색/질문 전용 봇 실행 (생성 기능 제거)
node src/slack-bot.js
```

### 3. Slack에서 사용

```
# 슬래시 명령어 (추천)
/solve SF 적재 지연 문제가 발생했는데 어떻게 해결하나요?
/ask API 문서 어디서 찾을 수 있나요?
/rag Redis 연결 오류 해결 방법
/summary 전체 데이터베이스 요약

# 멘션으로 질문 (자동으로 RAG 검색)
@bot SF 적재가 안 되는데 도움 주세요
@bot Redis 연결 오류 해결 방법 있나요?

# DM으로 질문
KMDF 재처리 문제가 발생했습니다
```

## 🔧 환경변수 설정

```bash
# Slack 설정
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token  # Socket Mode용 (필요시)
SLACK_WORKSPACE_URL=https://your-workspace.slack.com  # 스레드 링크 생성용

# Notion 설정
NOTION_TOKEN=secret_your-notion-token
NOTION_DATABASE_ID=your-database-id

# OpenAI 설정 (RAG 검색용)
OPENAI_API_KEY=your-openai-api-key

# RAG 설정 (선택사항 - 더 빠른 검색)
RAG_DATABASE_ID=your-rag-database-id

# Snowflake 설정 (선택사항 - AI 답변용)
SNOWFLAKE_ACCOUNT=your-account
SNOWFLAKE_USERNAME=your-username
SNOWFLAKE_PASSWORD=your-password
SNOWFLAKE_WAREHOUSE=your-warehouse
SNOWFLAKE_DATABASE=your-database
SNOWFLAKE_SCHEMA=your-schema
```

## 📋 RAG 활용 시나리오

```
👤 사용자: "SF 적재 지연 문제가 또 발생했는데 어떻게 하죠?"

🤖 AI: "🎯 과거 해결 사례를 찾았습니다! (총 3건)

📋 SF 적재 중단 및 복구
🔧 이슈 타입: SF 적재 지연
🖥️ 시스템: Snowflake, KMDF
❗ 원인: KMDF 재처리 작업 증가로 인한 큐 적체
✅ 해결 방법: 시스템 재시작 후 수동 재처리
👤 해결자: 홍길동
📅 발생일: 2024-01-15

🔗 관련 스레드: 원본 대화 보기

💡 권장 액션:
• 홍길동님께 문의
• 동일한 해결 방법 시도
• 원본 스레드에서 상세 내용 확인"
```
