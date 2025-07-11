// bulk-slack-analyzer.js
// 대량 Slack 메시지 분석 및 Notion 데이터베이스 구축 시스템

require("dotenv").config();
require("dotenv").config({ path: "/Users/swyang/Documents/Poc/slack-notion-integration/.env" });
const { WebClient } = require("@slack/web-api");
const SnowflakeAIService = require("./src/services/snowflake-ai");
const NotionService = require("./src/services/notion-service");
const fs = require("fs");
const path = require("path");

class BulkSlackAnalyzer {
  constructor() {
    this.slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    this.snowflakeAI = new SnowflakeAIService();
    this.notionService = new NotionService();

    // 대량 처리 설정
    this.config = {
      batchSize: 5, // AI 분석 배치 크기
      delayBetweenBatches: 2000, // 배치간 대기시간 (ms)
      delayBetweenRequests: 1000, // 요청간 대기시간 (ms)
      slackApiDelay: 1500, // Slack API 호출간 딜레이 (ms) - Rate Limit 회피
      threadApiDelay: 2000, // 스레드 API 호출간 딜레이 (ms) - 더 보수적
      maxRetries: 3, // 실패시 재시도 횟수
      saveInterval: 10, // N개마다 중간 저장
      resumeFromFile: true, // 중단된 작업 이어서 하기
      turboMode: false // 터보 모드 (Rate Limit 무시하고 빠르게 실행)
    };

    // 진행상황 추적
    this.progress = {
      totalMessages: 0,
      processedMessages: 0,
      analyzedMessages: 0,
      savedToNotion: 0,
      errors: 0,
      startTime: null,
      currentBatch: 0
    };

    // 중간 결과 저장
    this.results = {
      messages: [],
      analyses: [],
      errors: [],
      statistics: {}
    };

    this.databaseId = null;
    this.summaryPageId = null;

    // Rate Limit 대응
    this.rateLimitHitCount = 0;
    this.adaptiveDelay = false;

    // 사용자 정보 캐시 (API 호출 최소화)
    this.userCache = new Map();
  }

  // 1. 대량 메시지 수집 (페이지네이션 지원 + 스레드 포함)
  async collectAllMessages(channelName, daysBack = 30) {
    console.log("📱 대량 Slack 메시지 수집 시작 (스레드 포함)");
    console.log("=".repeat(60));
    console.log(`📢 채널: #${channelName}`);
    console.log(`📅 수집 기간: 최근 ${daysBack}일`);

    try {
      // 채널 찾기
      const channelsList = await this.slack.conversations.list({
        types: "public_channel,private_channel",
        limit: 1000
      });

      const channel = channelsList.channels.find((ch) => ch.name === channelName || ch.name.includes(channelName));

      if (!channel) {
        throw new Error(`채널을 찾을 수 없습니다: ${channelName}`);
      }

      console.log(`✅ 채널 발견: #${channel.name} (ID: ${channel.id})`);

      // 채널 ID 저장 (스레드 링크 생성용)
      this.currentChannelId = channel.id;

      // 날짜 범위 설정
      const oldest = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
      console.log(`📅 수집 시작일: ${new Date(oldest * 1000).toLocaleDateString("ko-KR")}`);

      // 전체 메시지 수집 (페이지네이션)
      let allMessages = [];
      let cursor = null;
      let pageCount = 0;

      console.log("\n🔄 메시지 수집 중...");

      do {
        pageCount++;
        console.log(`📄 페이지 ${pageCount} 수집 중...`);

        const response = await this.slack.conversations.history({
          channel: channel.id,
          oldest: oldest,
          limit: 200,
          cursor: cursor
        });

        allMessages.push(...response.messages);
        cursor = response.response_metadata?.next_cursor;

        console.log(`   📝 현재까지 수집: ${allMessages.length}개 메시지`);

        // API 제한 방지 (Rate Limit 회피)
        await this.delay(this.config.slackApiDelay);
      } while (cursor);

      // 메시지 필터링
      const filteredMessages = allMessages
        .filter(
          (msg) =>
            msg.text &&
            !msg.bot_id &&
            msg.subtype !== "bot_message" &&
            msg.text.length > 15 &&
            !msg.text.startsWith("<@") && // 단순 멘션 제외
            !msg.text.startsWith("👍") && // 이모지만 있는 메시지 제외
            !msg.text.match(/^(ㅋ|ㅎ|ㅠ|ㅜ)+$/) // 자음만 있는 메시지 제외
        )
        .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts)); // 시간순 정렬

      console.log("\n🧵 스레드 내용 수집 중...");
      console.log(`⚙️ Rate Limit 회피 설정: 스레드 API 딜레이 ${this.config.threadApiDelay}ms`);

      // 스레드 포함 메시지 수집
      const messagesWithThreads = [];
      let threadStats = { threadsCount: 0, totalReplies: 0 };

      for (let i = 0; i < filteredMessages.length; i++) {
        const message = filteredMessages[i];
        const messageData = {
          original_message: message,
          thread_replies: [],
          combined_text: message.text // 분석용 결합 텍스트
        };

        // 스레드가 있는 메시지인지 확인
        if (message.thread_ts && message.reply_count > 0) {
          console.log(`   🧵 스레드 발견: ${message.reply_count}개 답글 수집 중... (${i + 1}/${filteredMessages.length})`);

          try {
            const threadReplies = await this.slack.conversations.replies({
              channel: channel.id,
              ts: message.thread_ts
            });

            // 원본 메시지를 제외한 답글만 저장 (사용자 정보 포함)
            const replies = threadReplies.messages
              .slice(1) // 첫 번째는 원본 메시지
              .filter((reply) => reply.text && !reply.bot_id && reply.text.length > 5);

            // 각 답글에 사용자 이름 추가 (더 안전하게 처리)
            const repliesWithUsers = [];
            for (const reply of replies) {
              const userDisplay = await this.getUserDisplayName(reply.user);

              repliesWithUsers.push({
                text: reply.text || "",
                user: reply.user || "unknown",
                user_name: userDisplay,
                ts: reply.ts
              });
            }

            messageData.thread_replies = repliesWithUsers;
            threadStats.threadsCount++;
            threadStats.totalReplies += replies.length;

            // 분석용 결합 텍스트 생성 (원본 + 스레드, 사용자 정보 포함)
            if (repliesWithUsers.length > 0) {
              const threadTexts = repliesWithUsers.map((reply) => `[${reply.user_name}] ${reply.text}`).join("\n");
              messageData.combined_text = `${message.text}\n\n[스레드 답글]\n${threadTexts}`;
            }

            console.log(`     ✅ ${replies.length}개 답글 수집됨`);

            // Rate Limit 회복 시 딜레이 감소
            if (this.adaptiveDelay && this.rateLimitHitCount > 0) {
              this.rateLimitHitCount = Math.max(0, this.rateLimitHitCount - 1);
              if (this.rateLimitHitCount === 0) {
                this.adaptiveDelay = false;
                console.log(`     🔄 Rate Limit 회복됨 - 정상 속도로 복구`);
              }
            }
          } catch (error) {
            if (error.message.includes("rate limit") || error.message.includes("rate_limited")) {
              this.rateLimitHitCount++;
              this.adaptiveDelay = true;
              const adaptiveDelayTime = this.config.threadApiDelay * (1 + this.rateLimitHitCount * 0.5);
              console.log(`     ⚠️ Rate Limit 감지 (#${this.rateLimitHitCount}) - 딜레이 증가: ${adaptiveDelayTime}ms`);
              await this.delay(adaptiveDelayTime);

              // 재시도 로직
              try {
                console.log(`     🔄 스레드 재시도 중...`);
                const threadReplies = await this.slack.conversations.replies({
                  channel: channel.id,
                  ts: message.thread_ts
                });

                const replies = threadReplies.messages.slice(1).filter((reply) => reply.text && !reply.bot_id && reply.text.length > 5);

                // 재시도 시에도 사용자 정보 포함
                const repliesWithUsers = [];
                for (const reply of replies) {
                  const userDisplay = await this.getUserDisplayName(reply.user);

                  repliesWithUsers.push({
                    text: reply.text,
                    user: reply.user,
                    user_name: userDisplay,
                    ts: reply.ts
                  });
                }

                messageData.thread_replies = repliesWithUsers;
                threadStats.threadsCount++;
                threadStats.totalReplies += replies.length;

                if (repliesWithUsers.length > 0) {
                  const threadTexts = repliesWithUsers.map((reply) => `[${reply.user_name}] ${reply.text}`).join("\n");
                  messageData.combined_text = `${message.text}\n\n[스레드 답글]\n${threadTexts}`;
                }

                console.log(`     ✅ 재시도 성공: ${replies.length}개 답글 수집됨`);
              } catch (retryError) {
                console.log(`     ❌ 재시도 실패: ${retryError.message}`);
              }
            } else {
              console.log(`     ❌ 스레드 수집 실패: ${error.message}`);
            }
          }

          // 스레드 수집 시 적응형 딜레이 (Rate Limit 회피)
          const currentDelay = this.adaptiveDelay ? this.config.threadApiDelay * (1 + this.rateLimitHitCount * 0.3) : this.config.threadApiDelay;
          await this.delay(currentDelay);
        }

        messagesWithThreads.push(messageData);
      }

      this.progress.totalMessages = messagesWithThreads.length;

      console.log("\n📊 수집 결과:");
      console.log(`   📄 총 페이지: ${pageCount}개`);
      console.log(`   📝 원본 메시지: ${allMessages.length}개`);
      console.log(`   ✅ 유효 메시지: ${filteredMessages.length}개`);
      console.log(`   🧵 스레드 포함 메시지: ${messagesWithThreads.length}개`);
      console.log(`   📊 스레드 통계: ${threadStats.threadsCount}개 스레드, ${threadStats.totalReplies}개 답글`);
      console.log(
        `   📅 기간: ${new Date(parseFloat(filteredMessages[0]?.ts) * 1000).toLocaleDateString("ko-KR")} ~ ${new Date(
          parseFloat(filteredMessages[filteredMessages.length - 1]?.ts) * 1000
        ).toLocaleDateString("ko-KR")}`
      );

      return { channel, messages: messagesWithThreads };
    } catch (error) {
      console.error("❌ 메시지 수집 실패:", error.message);
      throw error;
    }
  }

  // 2. 배치별 AI 분석 (진행상황 표시)
  async analyzeBulkMessages(messages) {
    console.log("\n🤖 대량 AI 분석 시작");
    console.log("=".repeat(60));
    console.log(`📊 총 메시지: ${messages.length}개`);
    console.log(`⚙️ 배치 크기: ${this.config.batchSize}개`);
    console.log(`⏱️ 예상 소요시간: ${Math.ceil(((messages.length / this.config.batchSize) * this.config.delayBetweenBatches) / 1000 / 60)}분`);

    await this.snowflakeAI.connect();

    const totalBatches = Math.ceil(messages.length / this.config.batchSize);
    const analyses = [];

    // 중단된 작업 복구
    const resumeFile = "temp_analyses.json";
    let startIndex = 0;

    if (this.config.resumeFromFile && fs.existsSync(resumeFile)) {
      console.log("🔄 중단된 작업 발견! 이어서 진행합니다...");
      const savedAnalyses = JSON.parse(fs.readFileSync(resumeFile, "utf8"));
      analyses.push(...savedAnalyses);
      startIndex = savedAnalyses.length;
      console.log(`   📊 ${startIndex}개 메시지는 이미 분석 완료`);
    }

    this.progress.startTime = new Date();

    for (let i = startIndex; i < messages.length; i += this.config.batchSize) {
      const batch = messages.slice(i, i + this.config.batchSize);
      const batchNum = Math.floor(i / this.config.batchSize) + 1;

      console.log(
        `\n🔄 배치 ${batchNum}/${totalBatches} 처리 중 (${i + 1}-${Math.min(i + this.config.batchSize, messages.length)}/${messages.length})`
      );

      // 진행률 표시
      const progressPercent = Math.round((i / messages.length) * 100);
      const progressBar = "█".repeat(Math.floor(progressPercent / 5)) + "░".repeat(20 - Math.floor(progressPercent / 5));
      console.log(`   📊 진행률: [${progressBar}] ${progressPercent}%`);

      // 배치 내 메시지 처리
      for (const messageData of batch) {
        try {
          const displayText = messageData.original_message.text.substring(0, 50);
          const threadInfo = messageData.thread_replies.length > 0 ? ` (+ ${messageData.thread_replies.length}개 답글)` : "";
          console.log(`      🔍 분석 중: "${displayText}..."${threadInfo}`);

          // 스레드 포함 분석
          const analysis = await this.analyzeMessageWithRetry(messageData.combined_text, messageData);

          analyses.push({
            message: messageData.original_message,
            messageData: messageData, // 스레드 정보 포함
            analysis: analysis,
            timestamp: messageData.original_message.ts,
            processed_at: new Date().toISOString()
          });

          this.progress.analyzedMessages++;

          console.log(`      ✅ ${analysis.category} | ${analysis.issue_type} | ${analysis.is_resolved ? "해결됨" : "미해결"}`);
        } catch (error) {
          console.log(`      ❌ 분석 실패: ${error.message}`);
          this.progress.errors++;

          // 에러도 저장 (나중에 재처리용)
          this.results.errors.push({
            message: messageData.original_message.text,
            error: error.message,
            timestamp: messageData.original_message.ts
          });
        }

        // 요청간 딜레이
        await this.delay(this.config.delayBetweenRequests);
      }

      // 중간 저장 (N개 배치마다)
      if (batchNum % this.config.saveInterval === 0) {
        console.log(`   💾 중간 저장: ${analyses.length}개 분석 결과`);
        fs.writeFileSync(resumeFile, JSON.stringify(analyses, null, 2));
      }

      // 배치간 딜레이
      await this.delay(this.config.delayBetweenBatches);

      // 진행 통계 출력
      const elapsed = (new Date() - this.progress.startTime) / 1000;
      const avgTimePerMessage = elapsed / this.progress.analyzedMessages;
      const remaining = (messages.length - this.progress.analyzedMessages) * avgTimePerMessage;

      console.log(`   ⏱️ 경과시간: ${Math.floor(elapsed / 60)}분 ${Math.floor(elapsed % 60)}초`);
      console.log(`   🎯 남은시간: ${Math.floor(remaining / 60)}분 ${Math.floor(remaining % 60)}초`);
      console.log(`   📈 처리속도: ${((this.progress.analyzedMessages / elapsed) * 60).toFixed(1)}개/분`);
    }

    // 최종 저장
    fs.writeFileSync(resumeFile, JSON.stringify(analyses, null, 2));

    console.log("\n✅ AI 분석 완료!");
    console.log(`   📊 성공: ${analyses.length}개`);
    console.log(`   ❌ 실패: ${this.progress.errors}개`);
    console.log(`   📈 성공률: ${Math.round((analyses.length / (analyses.length + this.progress.errors)) * 100)}%`);

    await this.snowflakeAI.disconnect();
    return analyses;
  }

  // 3. 대량 Notion 저장 (배치 처리)
  async saveBulkToNotion(channelName, analyses) {
    console.log("\n📚 대량 Notion 저장 시작");
    console.log("=".repeat(60));
    console.log(`📊 저장할 분석 결과: ${analyses.length}개`);

    try {
      // 1. RAG 데이터베이스 생성
      console.log("🔄 RAG 데이터베이스 생성 중...");
      const database = await this.createOperationDatabase(channelName, analyses.length);
      this.databaseId = database.id;

      // 2. 배치별 저장
      const batchSize = 3; // Notion API 제한 고려
      let savedCount = 0;

      for (let i = 0; i < analyses.length; i += batchSize) {
        const batch = analyses.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(analyses.length / batchSize);

        console.log(`\n📝 배치 ${batchNum}/${totalBatches} Notion 저장 중 (${i + 1}-${Math.min(i + batchSize, analyses.length)}/${analyses.length})`);

        for (const item of batch) {
          try {
            await this.saveIssueToDatabase(this.databaseId, item.message, item.analysis, item.messageData, this.currentChannelId);
            savedCount++;

            const threadInfo =
              item.messageData && item.messageData.thread_replies.length > 0 ? ` (+ ${item.messageData.thread_replies.length}개 답글)` : "";
            console.log(`   ✅ 저장 성공 (${savedCount}/${analyses.length}): ${item.analysis.summary}${threadInfo}`);
          } catch (error) {
            console.log(`   ❌ 저장 실패: ${error.message}`);
            this.progress.errors++;
          }

          // API 제한 방지
          await this.delay(500);
        }

        // 진행률 표시
        const progressPercent = Math.round((savedCount / analyses.length) * 100);
        console.log(`   📊 저장 진행률: ${savedCount}/${analyses.length} (${progressPercent}%)`);

        // 배치간 딜레이
        await this.delay(1000);
      }

      this.progress.savedToNotion = savedCount;

      // 3. 통계 생성 (대시보드 생성 제외)
      console.log("\n📊 통계 분석 중...");
      const statistics = this.generateStatistics(analyses);

      console.log("\n🎉 대량 저장 완료!");
      console.log(`   📊 저장 성공: ${savedCount}개`);
      console.log(`   📈 저장 성공률: ${Math.round((savedCount / analyses.length) * 100)}%`);
      console.log(`   🔗 데이터베이스: ${database.url}`);

      // 간단한 통계 출력
      console.log("\n📈 분석 결과 요약:");
      console.log(
        `   📁 주요 카테고리: ${
          Object.entries(statistics.categoryFrequency || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([category, count]) => `${this.getCategoryDisplayName(category)}(${count}건)`)
            .join(", ") || "없음"
        }`
      );
      console.log(
        `   🔍 주요 이슈 타입: ${
          Object.entries(statistics.issuePatterns.topIssueTypes || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([type, count]) => `${type}(${count}건)`)
            .join(", ") || "없음"
        }`
      );
      console.log(
        `   🖥️ 주요 시스템: ${
          Object.entries(statistics.issuePatterns.systemComponents || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([component, count]) => `${component}(${count}건)`)
            .join(", ") || "없음"
        }`
      );
      console.log(`   🧵 스레드 활동: ${statistics.threadStatistics.threadPercentage}%`);

      return {
        database: database,
        statistics: statistics,
        savedCount: savedCount
      };
    } catch (error) {
      console.error("❌ Notion 저장 실패:", error.message);
      throw error;
    }
  }

  // AI 분석 (재시도 포함 - 스레드 지원)
  async analyzeMessageWithRetry(messageText, messageData = null, retries = 0) {
    try {
      let analysisText = messageText;
      let threadInfo = "";

      // 스레드 정보가 있는 경우 추가 컨텍스트 제공 (안전하게 처리)
      if (messageData && messageData.thread_replies && messageData.thread_replies.length > 0) {
        const validReplies = messageData.thread_replies.filter((reply) => reply.text && reply.user_name);
        if (validReplies.length > 0) {
          threadInfo = `\n\n[스레드 답글 ${validReplies.length}개]`;
          threadInfo += `\n${validReplies.map((reply, index) => `${index + 1}. [${reply.user_name}] ${reply.text}`).join("\n")}`;
        }
      }

      // 스레드 정보 포함한 상세 프롬프트 (순수 JSON 응답 강제)
      const prompt = `다음 Slack 메시지와 스레드를 분석하여 RAG용 데이터를 생성해주세요:

원본 메시지: "${messageData ? messageData.original_message.text : messageText}"${threadInfo}

**중요: 코드블록 없이 순수 JSON 객체만 응답해주세요. 추가 설명이나 텍스트 없이 JSON만 출력하세요.**

{
  "category": "bug_report",
  "issue_type": "구체적인 이슈 타입 (예: SF 적재 지연, API 응답 지연, KMDF 재처리 문제 등)",
  "system_components": ["실제 언급된 시스템/서비스명들"],
  "problem_cause": "이슈의 원인 (없으면 '미확인')",
  "solution_method": "해결 방법 (없으면 '해결방법 없음')",
  "issue_reporter": "이슈 제기자 이름",
  "issue_resolver": "이슈 해결자 이름 (없으면 '미확인')",
  "summary": "한 줄 요약"
}

분석 기준:
1. **카테고리**: 다음 중 하나로 분류
   - bug_report: 버그, 오류, 장애 관련
   - feature_inquiry: 기능 사용법, 문의
   - maintenance: 시스템 유지보수, 업데이트
   - notification: 공지사항, 안내
   - discussion: 일반 토론, 의견 교환
   - other: 기타
2. **시스템 컴포넌트**: SF, Snowflake, KMDF, API, Database, Redis, Kafka, S3, AWS, Airflow, Jenkins 등 기술 용어 추출
3. **사람 이름**: 스레드의 [사용자명] 형태에서 추출하여 제기자와 해결자 식별
4. **원인과 해결방법**: 스레드에서 원인 분석 및 해결 과정 추출`;

      console.log(`      🤖 AI 분석 요청 중...`);
      const response = await this.snowflakeAI.callOpenAI(prompt);

      // JSON 파싱 안전하게 처리 (코드블록 제거)
      let result;
      try {
        // AI가 ```json ``` 코드블록으로 감쌀 수 있으므로 제거
        let cleanResponse = response.trim();

        // 코드블록 제거
        if (cleanResponse.startsWith("```json")) {
          cleanResponse = cleanResponse.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (cleanResponse.startsWith("```")) {
          cleanResponse = cleanResponse.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        // 추가 설명 텍스트 제거 (JSON 객체만 추출)
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanResponse = jsonMatch[0];
        }

        result = JSON.parse(cleanResponse);
      } catch (parseError) {
        console.log(`      ❌ JSON 파싱 실패: ${parseError.message}`);
        console.log(`      📝 AI 원본 응답: ${response.substring(0, 400)}...`);
        throw new Error(`AI 응답 파싱 실패: ${parseError.message}`);
      }

      // 성공 로그
      console.log(
        `      ✅ AI 분석 성공: ${result.issue_type || "타입없음"} | 시스템: ${result.system_components?.join(",") || "없음"} | 해결자: ${
          result.issue_resolver || "미확인"
        }`
      );

      return result;
    } catch (error) {
      if (retries < this.config.maxRetries) {
        console.log(`      🔄 재시도 ${retries + 1}/${this.config.maxRetries}: ${error.message}`);
        await this.delay(1000 * (retries + 1)); // 점진적 딜레이
        return this.analyzeMessageWithRetry(messageText, messageData, retries + 1);
      }

      // 최종 실패시 기본값 반환 (원본 메시지 기반)
      console.log(`❌ AI 분석 최종 실패: ${error.message}`);
      const fallbackSummary = messageText.substring(0, 100).replace(/\n/g, " ") + (messageText.length > 100 ? "..." : "");

      return {
        category: "other",
        issue_type: "분석 실패",
        system_components: [],
        problem_cause: `AI 분석 실패: ${error.message}`,
        solution_method: "분석 재시도 필요",
        issue_reporter: "미확인",
        issue_resolver: "미확인",
        summary: fallbackSummary
      };
    }
  }

  // 운영 데이터베이스 생성
  async createOperationDatabase(channelName, messageCount) {
    const databaseProperties = {
      제목: { title: {} },
      카테고리: {
        select: {
          options: [
            { name: "🐛 버그 제보", color: "red" },
            { name: "❓ 기능 문의", color: "blue" },
            { name: "🔧 시스템 유지보수", color: "orange" },
            { name: "📢 공지사항", color: "green" },
            { name: "💬 토론", color: "yellow" },
            { name: "📋 기타", color: "gray" }
          ]
        }
      },
      "이슈 타입": { rich_text: {} },
      "시스템 컴포넌트": { multi_select: { options: [] } },
      원인: { rich_text: {} },
      "해결 방법": { rich_text: {} },
      "이슈 제기자": { rich_text: {} },
      "이슈 해결자": { rich_text: {} },
      발생일시: { date: {} },
      "스레드 링크": { url: {} },
      "원본 메시지": { rich_text: {} },
      "스레드 내용": { rich_text: {} }
    };

    return await this.notionService.notion.databases.create({
      parent: {
        page_id: process.env.NOTION_PARENT_PAGE_ID.replace(/-/g, "")
      },
      title: [
        {
          type: "text",
          text: {
            content: `🤖 ${channelName} RAG 데이터베이스 (${messageCount}개 분석)`
          }
        }
      ],
      properties: databaseProperties,
      description: [
        {
          type: "text",
          text: {
            content: `Slack #${channelName} 채널의 ${messageCount}개 메시지를 AI가 참조할 수 있는 RAG 데이터베이스입니다. 생성일: ${new Date().toLocaleDateString(
              "ko-KR"
            )}`
          }
        }
      ]
    });
  }

  // 이슈를 데이터베이스에 저장 (안전한 데이터 처리)
  async saveIssueToDatabase(databaseId, message, analysis, messageData = null, channelId = null) {
    // 사용자 정보 조회 (안전하게)
    const userName = await this.getUserDisplayName(message.user);

    // 스레드 정보 확인
    const hasThread = messageData && messageData.thread_replies && messageData.thread_replies.length > 0;

    // 스레드 링크 생성
    const threadLink = hasThread && channelId ? this.generateSlackThreadLink(channelId, message.ts) : null;

    // 스레드 내용 결합 (안전하게 처리)
    let threadContent = "스레드 없음";
    if (hasThread) {
      const validReplies = messageData.thread_replies.filter((reply) => reply.text && reply.user_name);
      if (validReplies.length > 0) {
        threadContent = validReplies.map((reply) => `[${reply.user_name}] ${reply.text}`).join("\n\n");
      }
    }

    // 카테고리 매핑
    const categoryMap = {
      bug_report: "🐛 버그 제보",
      feature_inquiry: "❓ 기능 문의",
      maintenance: "🔧 시스템 유지보수",
      notification: "📢 공지사항",
      discussion: "💬 토론",
      other: "📋 기타"
    };

    // 안전한 값 처리 (AI 분석 결과 정규화)
    const safeAnalysis = {
      summary: analysis.summary || "제목 없음",
      category: analysis.category || "other", // AI가 분석한 카테고리 사용
      issue_type: analysis.issue_type || "미분류",
      system_components: Array.isArray(analysis.system_components) ? analysis.system_components.filter((comp) => comp && comp.trim()) : [],
      problem_cause: analysis.problem_cause || "미확인",
      solution_method: analysis.solution_method || "해결방법 없음",
      issue_reporter: analysis.issue_reporter || userName,
      issue_resolver: analysis.issue_resolver || "미확인"
    };

    return await this.notionService.notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        제목: {
          title: [{ type: "text", text: { content: safeAnalysis.summary } }]
        },
        카테고리: {
          select: { name: categoryMap[safeAnalysis.category] || "📋 기타" }
        },
        "이슈 타입": {
          rich_text: [{ type: "text", text: { content: safeAnalysis.issue_type } }]
        },
        "시스템 컴포넌트": {
          multi_select: safeAnalysis.system_components.map((comp) => ({ name: comp }))
        },
        원인: {
          rich_text: [{ type: "text", text: { content: safeAnalysis.problem_cause } }]
        },
        "해결 방법": {
          rich_text: [{ type: "text", text: { content: safeAnalysis.solution_method } }]
        },
        "이슈 제기자": {
          rich_text: [{ type: "text", text: { content: safeAnalysis.issue_reporter } }]
        },
        "이슈 해결자": {
          rich_text: [{ type: "text", text: { content: safeAnalysis.issue_resolver } }]
        },
        발생일시: {
          date: { start: new Date(parseFloat(message.ts) * 1000).toISOString() }
        },
        // 스레드 링크
        ...(threadLink && {
          "스레드 링크": {
            url: threadLink
          }
        }),
        "원본 메시지": {
          rich_text: [{ type: "text", text: { content: message.text || "메시지 없음" } }]
        },
        "스레드 내용": {
          rich_text: [{ type: "text", text: { content: threadContent } }]
        }
      }
    });
  }

  // RAG용 간단한 통계 생성
  generateStatistics(analyses) {
    const stats = {
      categoryFrequency: {},
      issuePatterns: {
        topIssueTypes: {},
        systemComponents: {},
        topResolvers: {}
      },
      threadStatistics: {
        totalThreads: 0,
        totalReplies: 0,
        messagesWithThreads: 0,
        threadPercentage: 0
      },
      timeRange: {
        start: null,
        end: null
      }
    };

    analyses.forEach((item) => {
      const { analysis, message, messageData } = item;

      // 카테고리별 분포
      stats.categoryFrequency[analysis.category] = (stats.categoryFrequency[analysis.category] || 0) + 1;

      // 이슈 타입 빈도
      if (analysis.issue_type) {
        stats.issuePatterns.topIssueTypes[analysis.issue_type] = (stats.issuePatterns.topIssueTypes[analysis.issue_type] || 0) + 1;
      }

      // 시스템 컴포넌트 빈도
      if (analysis.system_components) {
        analysis.system_components.forEach((component) => {
          stats.issuePatterns.systemComponents[component] = (stats.issuePatterns.systemComponents[component] || 0) + 1;
        });
      }

      // 해결 담당자 빈도 (참고용)
      if (analysis.issue_resolver && analysis.issue_resolver !== "미확인") {
        stats.issuePatterns.topResolvers[analysis.issue_resolver] = (stats.issuePatterns.topResolvers[analysis.issue_resolver] || 0) + 1;
      }

      // 스레드 통계
      if (messageData && messageData.thread_replies && messageData.thread_replies.length > 0) {
        stats.threadStatistics.totalThreads++;
        stats.threadStatistics.totalReplies += messageData.thread_replies.length;
        stats.threadStatistics.messagesWithThreads++;
      }
    });

    // 스레드 비율 계산
    stats.threadStatistics.threadPercentage =
      analyses.length > 0 ? Math.round((stats.threadStatistics.messagesWithThreads / analyses.length) * 100) : 0;

    // 시간 범위
    if (analyses.length > 0) {
      const timestamps = analyses.map((item) => parseFloat(item.message.ts));
      stats.timeRange.start = new Date(Math.min(...timestamps) * 1000);
      stats.timeRange.end = new Date(Math.max(...timestamps) * 1000);
    }

    return stats;
  }

  // 대시보드 요약 생성
  async createDashboardSummary(channelName, stats, database) {
    const sortedCategories = Object.entries(stats.categoryFrequency)
      .sort(([, a], [, b]) => b - a)
      .filter(([, count]) => count > 0);

    const content = `# 📊 ${channelName} 운영 현황 대시보드

## 🎯 분석 개요
- **채널**: #${channelName}
- **분석 기간**: ${stats.timeRange.start?.toLocaleDateString("ko-KR")} ~ ${stats.timeRange.end?.toLocaleDateString("ko-KR")}
- **총 이슈**: ${this.progress.savedToNotion}개
- **분석 완료**: ${new Date().toLocaleDateString("ko-KR")}

## 📈 카테고리별 분포
${sortedCategories
  .map(
    ([category, count]) =>
      `**${this.getCategoryDisplayName(category)}**: ${count}개 (${Math.round(
        (count / this.progress.savedToNotion) * 100
      )}%) - 예상 ${this.calculateCategoryResource(category, stats)}시간`
  )
  .join("\n")}

## ⚡ 긴급도 분석
🔴 **높음**: ${stats.urgencyDistribution.high}개 (${Math.round(
      (stats.urgencyDistribution.high / this.progress.savedToNotion) * 100
    )}%) | 🟡 **보통**: ${stats.urgencyDistribution.medium}개 (${Math.round(
      (stats.urgencyDistribution.medium / this.progress.savedToNotion) * 100
    )}%) | 🟢 **낮음**: ${stats.urgencyDistribution.low}개 (${Math.round((stats.urgencyDistribution.low / this.progress.savedToNotion) * 100)}%)

## 💰 리소스 & 스레드 분석
**총 예상 소요시간**: ${Math.round(stats.totalResourceTime / 60)}시간 ${stats.totalResourceTime % 60}분 | **평균 작업시간**: ${
      stats.averageResourceTime
    }분/건 | **스레드 보유 메시지**: ${stats.threadStatistics.messagesWithThreads}개 (${stats.threadStatistics.threadPercentage}%)

## 🔍 이슈 패턴 분석
**주요 이슈 타입 TOP 5**: ${
      Object.entries(stats.issuePatterns.topIssueTypes || {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([type, count]) => `${type}(${count}건)`)
        .join(", ") || "데이터 없음"
    }

**시스템 컴포넌트 TOP 5**: ${
      Object.entries(stats.issuePatterns.systemComponents || {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([component, count]) => `${component}(${count}건)`)
        .join(", ") || "데이터 없음"
    }

## ✅ 해결 현황 분석
- **해결률**: ${stats.resolutionStatistics.resolutionRate}% (해결 ${stats.resolutionStatistics.resolvedCount}건 / 미해결 ${
      stats.resolutionStatistics.unresolvedCount
    }건)
- **주요 해결 담당자**: ${Object.entries(stats.resolutionStatistics.topResolvers)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([resolver, count]) => `${resolver}(${count}건)`)
      .join(", ")}

## 🔑 주요 키워드 TOP 10
${Object.entries(stats.topKeywords)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10)
  .map(([keyword, count]) => `${keyword}(${count}회)`)
  .join(", ")}

## 📊 처리 통계
**수집 성공률**: ${Math.round(
      (this.progress.totalMessages / (this.progress.totalMessages + this.progress.errors)) * 100
    )}% | **AI 분석 성공률**: ${Math.round(
      (this.progress.analyzedMessages / (this.progress.analyzedMessages + this.progress.errors)) * 100
    )}% | **Notion 저장 성공률**: ${Math.round((this.progress.savedToNotion / this.progress.analyzedMessages) * 100)}%

## 🎯 핵심 인사이트
**주요 업무**: ${sortedCategories[0] ? this.getCategoryDisplayName(sortedCategories[0][0]) : "N/A"} | **해결률**: ${
      stats.resolutionStatistics.resolutionRate
    }% | **스레드 활동**: ${stats.threadStatistics.threadPercentage}% | **주요 이슈**: ${
      Object.entries(stats.issuePatterns.topIssueTypes).sort(([, a], [, b]) => b - a)[0]
        ? Object.entries(stats.issuePatterns.topIssueTypes).sort(([, a], [, b]) => b - a)[0][0]
        : "N/A"
    }

## 📋 핵심 액션 아이템
1. **프로세스 표준화**: 상위 3개 카테고리 프로세스 표준화
2. **자동화 도구**: 반복 작업 자동화 도구 도입 검토
3. **이슈 패턴 활용**: 유사 이슈 검색 시스템 구축
4. **해결 담당자 최적화**: 역량 분석 및 업무 배분 최적화
5. **미해결 이슈 관리**: 우선순위 재검토 및 후속 조치

---
*🤖 Bulk Slack Analyzer가 ${new Date().toLocaleString("ko-KR")}에 자동 생성*`;

    const summaryContent = {
      title: `📈 ${channelName} 운영 대시보드 (${this.progress.savedToNotion}개 이슈)`,
      content: content,
      tags: ["대시보드", "운영분석", "LBD", "SIREN", channelName],
      priority: "High",
      category: "운영관리",
      summary: `${channelName} 채널 ${this.progress.savedToNotion}개 이슈 분석 완료`
    };

    summaryContent.metadata = {
      createdBy: "Bulk Slack Analyzer",
      createdAt: new Date().toISOString(),
      source: `Slack #${channelName}`,
      databaseId: database.id,
      messageCount: this.progress.savedToNotion
    };

    return await this.notionService.createPage(summaryContent);
  }

  // 터보 모드 설정 (Rate Limit 감수하고 빠르게 실행)
  enableTurboMode() {
    this.config.turboMode = true;
    this.config.slackApiDelay = 500; // 1.5초 → 0.5초
    this.config.threadApiDelay = 800; // 2초 → 0.8초
    console.log("🚀 터보 모드 활성화! (Rate Limit 위험 감수)");
    console.log(`   📡 Slack API 딜레이: ${this.config.slackApiDelay}ms`);
    console.log(`   🧵 스레드 API 딜레이: ${this.config.threadApiDelay}ms`);
  }

  // 안전 모드 설정 (Rate Limit 회피 우선)
  enableSafeMode() {
    this.config.turboMode = false;
    this.config.slackApiDelay = 2000; // 2초
    this.config.threadApiDelay = 3000; // 3초
    console.log("🛡️ 안전 모드 활성화! (Rate Limit 완전 회피)");
    console.log(`   📡 Slack API 딜레이: ${this.config.slackApiDelay}ms`);
    console.log(`   🧵 스레드 API 딜레이: ${this.config.threadApiDelay}ms`);
  }

  // 안전한 사용자 이름 가져오기 (캐시 포함)
  async getUserDisplayName(userId) {
    if (!userId || userId === "undefined" || userId.trim() === "") {
      return "Unknown User";
    }

    // 캐시 확인
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId);
    }

    try {
      const userInfo = await this.slack.users.info({ user: userId });

      if (!userInfo.user) {
        const result = `${userId} (정보 없음)`;
        this.userCache.set(userId, result);
        return result;
      }

      const user = userInfo.user;
      let displayName;

      // 사용자 상태 확인
      if (user.deleted) {
        displayName = `${user.name || userId} (삭제됨)`;
      } else if (user.is_bot) {
        displayName = `${user.name || userId} (봇)`;
      } else if (user.is_restricted || user.is_ultra_restricted) {
        displayName = `${user.real_name || user.name || userId} (제한됨)`;
      } else {
        // 정상 사용자
        displayName = user.real_name || user.name || userId;
      }

      // 캐시에 저장
      this.userCache.set(userId, displayName);
      return displayName;
    } catch (error) {
      let result;
      if (error.message.includes("user_not_found")) {
        result = `${userId} (찾을 수 없음)`;
      } else if (error.message.includes("account_inactive")) {
        result = `${userId} (비활성 계정)`;
      } else {
        console.log(`     ⚠️ 사용자 조회 실패: ${userId} - ${error.message}`);
        result = `${userId} (조회 실패)`;
      }

      // 실패한 경우도 캐시에 저장 (반복 조회 방지)
      this.userCache.set(userId, result);
      return result;
    }
  }

  // Slack 스레드 링크 생성
  generateSlackThreadLink(channelId, threadTs, workspaceUrl = null) {
    // Workspace URL이 없으면 환경변수에서 가져오기
    const baseUrl = workspaceUrl || process.env.SLACK_WORKSPACE_URL || "https://nx-gsc.slack.com";

    // 타임스탬프에서 마침표 제거 (Slack 링크 형식)
    const cleanTs = threadTs.replace(".", "");

    // 스레드 링크 형식: https://workspace.slack.com/archives/CHANNEL_ID/p{TIMESTAMP}
    return `${baseUrl}/archives/${channelId}/p${cleanTs}`;
  }

  // 유틸리티 메서드들
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getCategoryDisplayName(category) {
    const names = {
      bug_report: "🐛 버그 제보",
      feature_inquiry: "❓ 기능 문의",
      maintenance: "🔧 시스템 유지보수",
      notification: "📢 공지사항",
      discussion: "💬 토론",
      other: "📋 기타"
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

  calculateCategoryResource(category, stats) {
    const count = stats.categoryFrequency[category] || 0;
    return Math.round((count * stats.averageResourceTime) / 60);
  }

  getMaxResourceCategory(stats) {
    let maxCategory = "";
    let maxResource = 0;

    Object.entries(stats.categoryFrequency).forEach(([category, count]) => {
      const resource = count * stats.averageResourceTime;
      if (resource > maxResource) {
        maxResource = resource;
        maxCategory = category;
      }
    });

    return this.getCategoryDisplayName(maxCategory);
  }

  // 메인 실행 함수
  async runBulkAnalysis(channelName = "안티치트인사이트팀-help", daysBack = 30) {
    console.log("🚀 RAG용 Slack 데이터 분석 시작!");
    console.log("=".repeat(80));
    console.log(`📢 대상 채널: #${channelName}`);
    console.log(`📅 분석 기간: 최근 ${daysBack}일`);
    console.log(`⚙️ 배치 크기: ${this.config.batchSize}개`);
    console.log(`⏱️ 시작 시간: ${new Date().toLocaleString("ko-KR")}`);
    console.log("");

    // Rate Limit 회피 설정 표시
    console.log("🔧 Rate Limit 회피 설정:");
    console.log(`   📡 Slack API 딜레이: ${this.config.slackApiDelay}ms`);
    console.log(`   🧵 스레드 API 딜레이: ${this.config.threadApiDelay}ms`);
    console.log(`   🔄 적응형 딜레이: ${this.adaptiveDelay ? "활성화" : "비활성화"}`);
    console.log(`   🎯 실행 모드: ${this.config.turboMode ? "🚀 터보 모드" : "⚖️ 기본 모드"}`);
    console.log("");

    const startTime = new Date();

    try {
      // 0. 임시 파일 정리 (새로 시작)
      const tempAnalysisFile = "temp_analyses.json";
      if (fs.existsSync(tempAnalysisFile)) {
        fs.unlinkSync(tempAnalysisFile);
        console.log("🧹 이전 임시 파일 정리 완료");
      }

      // 1. 대량 메시지 수집
      const { channel, messages } = await this.collectAllMessages(channelName, daysBack);

      if (messages.length === 0) {
        throw new Error("분석할 메시지가 없습니다.");
      }

      // 2. AI 분석
      const analyses = await this.analyzeBulkMessages(messages);

      if (analyses.length === 0) {
        throw new Error("분석된 메시지가 없습니다.");
      }

      // 3. Notion 저장
      const result = await this.saveBulkToNotion(channelName, analyses);

      // 4. 최종 결과 요약
      const endTime = new Date();
      const totalTime = Math.round((endTime - startTime) / 1000);

      console.log("\n🎉 대량 분석 완료!");
      console.log("=".repeat(80));
      console.log(`⏱️ 총 소요시간: ${Math.floor(totalTime / 60)}분 ${totalTime % 60}초`);
      console.log(`📊 처리 결과:`);
      console.log(`   📝 수집된 메시지: ${messages.length}개`);
      console.log(`   🤖 AI 분석 성공: ${analyses.length}개`);
      console.log(`   📚 Notion 저장 성공: ${result.savedCount}개`);
      console.log(`   ❌ 전체 오류: ${this.progress.errors}개`);
      console.log(`   📈 전체 성공률: ${Math.round((result.savedCount / messages.length) * 100)}%`);
      console.log("");
      console.log(`🔗 결과 확인:`);
      console.log(`   📊 데이터베이스: ${result.database.url}`);
      console.log("");
      console.log(`📋 주요 인사이트:`);

      const topCategories = Object.entries(result.statistics.categoryFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      if (topCategories.length > 0) {
        topCategories.forEach(([category, count], index) => {
          console.log(`   ${index + 1}. ${category}: ${count}개 (${Math.round((count / result.savedCount) * 100)}%)`);
        });
      } else {
        console.log(`   분석된 카테고리가 없습니다.`);
      }

      // 임시 파일 정리
      const tempFile = "temp_analyses.json";
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
        console.log("🧹 임시 파일 정리 완료");
      }

      return result;
    } catch (error) {
      console.error("\n💥 대량 분석 실패:", error.message);

      console.log("\n🔧 복구 방법:");
      console.log("1. temp_analyses.json 파일이 있으면 중단된 지점부터 재시작 가능");
      console.log("2. 배치 크기를 줄여서 재시도: this.config.batchSize = 3");
      console.log("3. 분석 기간을 줄여서 재시도: daysBack = 14");

      throw error;
    }
  }
}

// 사용 예시
async function startBulkAnalysis() {
  const analyzer = new BulkSlackAnalyzer();

  try {
    // 실행 모드 선택
    console.log("🎯 실행 모드 선택:");
    console.log("1. 기본 모드: 균형잡힌 속도 (추천)");
    console.log("2. 터보 모드: 빠른 속도 (Rate Limit 위험)");
    console.log("3. 안전 모드: 느린 속도 (Rate Limit 완전 회피)");

    // 기본 모드로 실행 (원하는 모드로 변경 가능)
    // analyzer.enableTurboMode(); // 터보 모드 활성화
    // analyzer.enableSafeMode();  // 안전 모드 활성화

    // 최근 7일간 안티치트인사이트팀-help 채널 전체 분석
    const result = await analyzer.runBulkAnalysis("안티치트인사이트팀-help", 4);

    console.log("\n✅ RAG 데이터베이스 구축 완료!");
    console.log("🎯 RAG 데이터베이스 구축 완료! AI 질의응답 시스템 준비 완료!");
  } catch (error) {
    console.error("💥 대량 분석 실패:", error.message);
  }
}

module.exports = BulkSlackAnalyzer;

// 즉시 실행
if (require.main === module) {
  startBulkAnalysis();
}
