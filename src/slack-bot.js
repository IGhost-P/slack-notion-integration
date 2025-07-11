// src/slack-bot.js
// 완전한 Slack-Notion 통합 봇

require("dotenv").config();
const { App } = require("@slack/bolt");
const SnowflakeAIService = require("./services/snowflake-ai");
const NotionService = require("./services/notion-service");
const RAGSearchService = require("./services/rag-search-service");

class SlackNotionBot {
  constructor() {
    // Slack App 초기화 (Socket Mode)
    this.app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      appToken: process.env.SLACK_APP_TOKEN,
      socketMode: true, // WebSocket 연결 사용
      logLevel: "info"
    });

    // 서비스 초기화
    this.snowflakeAI = new SnowflakeAIService();
    this.notionService = new NotionService();
    this.ragService = new RAGSearchService();

    // 연결 상태 추적
    this.isSnowflakeConnected = false;
    this.botStartTime = new Date();

    this.setupEventHandlers();
  }

  // 이벤트 핸들러 설정
  setupEventHandlers() {
    // 앱 멘션 이벤트 처리
    this.app.event("app_mention", async ({ event, client, say }) => {
      await this.handleMention(event, client, say);
    });

    // 다이렉트 메시지 처리
    this.app.message(async ({ message, client, say }) => {
      // 봇 자신의 메시지는 무시
      if (message.bot_id || message.subtype === "bot_message") return;

      // DM 채널에서만 처리
      if (message.channel_type === "im") {
        await this.handleDirectMessage(message, client, say);
      }
    });

    // 생성 관련 슬래시 명령어는 제거
    // 이제 검색/질문 전용 봇입니다

    // 버튼 인터랙션은 더 이상 사용하지 않음 (생성 기능 제거)

    // 앱 시작/정지 이벤트
    this.app.error((error) => {
      console.error("🔥 Slack Bot 오류:", error);
    });

    // 질문 검색 전용 슬래시 명령어
    this.app.command("/ask", async ({ command, ack, respond, client }) => {
      await this.handleAskCommand(command, ack, respond, client);
    });

    // 요약 전용 슬래시 명령어
    this.app.command("/summary", async ({ command, ack, respond, client }) => {
      await this.handleSummaryCommand(command, ack, respond, client);
    });

    // RAG 검색 전용 슬래시 명령어
    this.app.command("/solve", async ({ command, ack, respond, client }) => {
      await this.handleSolveCommand(command, ack, respond, client);
    });

    // RAG 검색 대안 명령어
    this.app.command("/rag", async ({ command, ack, respond, client }) => {
      await this.handleSolveCommand(command, ack, respond, client);
    });
  }

  // 멘션 처리
  async handleMention(event, client, say) {
    console.log("📢 앱 멘션 받음:", event.text);

    try {
      // 로딩 메시지 표시
      const loadingMessage = await say({
        text: "🤔 AI가 분석 중입니다...",
        thread_ts: event.ts
      });

      // 멘션에서 봇 이름 제거
      const userMessage = event.text.replace(/<@\w+>/g, "").trim();

      if (!userMessage) {
        await this.updateMessage(client, event.channel, loadingMessage.ts, {
          text: "❓ 어떤 내용을 Notion에 저장할까요? 메시지를 입력해주세요!"
        });
        return;
      }

      // 도움말 명령어 처리
      if (userMessage.toLowerCase().includes("help") || userMessage.includes("도움")) {
        await this.showHelp(client, event.channel, loadingMessage.ts);
        return;
      }

      // 상태 확인 명령어
      if (userMessage.toLowerCase().includes("status") || userMessage.includes("상태")) {
        await this.showStatus(client, event.channel, loadingMessage.ts);
        return;
      }

      // 질문 처리 (검색/RAG 전용)
      await this.processQuestionMessage(userMessage, client, event.channel, loadingMessage.ts, event.user, false);
    } catch (error) {
      console.error("❌ 멘션 처리 오류:", error);
      await say({
        text: `🔥 오류가 발생했습니다: ${error.message}`,
        thread_ts: event.ts
      });
    }
  }

  // 다이렉트 메시지 처리
  async handleDirectMessage(message, client, say) {
    console.log("💬 DM 받음:", message.text);

    try {
      // 로딩 메시지
      const loadingMessage = await say("🔍 질문을 분석하고 검색 중입니다...");

      // 질문 처리 (검색/RAG 전용)
      await this.processQuestionMessage(message.text, client, message.channel, loadingMessage.ts, message.user, false);
    } catch (error) {
      console.error("❌ DM 처리 오류:", error);
      await say(`🔥 오류가 발생했습니다: ${error.message}`);
    }
  }

  // 생성 관련 메서드들은 제거됨 (검색/질문 전용 봇)

  // 질문 처리 메서드 (검색/RAG 전용)
  async processQuestionMessage(userMessage, client, channel, messageTs, userId, isSlashCommand = false) {
    try {
      // 연결 확인
      await this.ensureSnowflakeConnection();

      // 사용자 정보
      const userInfo = await this.getUserInfo(client, userId);

      // 1. 문제 해결 질문인지 먼저 확인 (RAG 우선)
      if (this.isTroubleshootingQuestion(userMessage)) {
        console.log("🔧 문제 해결 질문으로 판단 - RAG 검색 실행");
        await this.performRAGSearch(userMessage, client, channel, messageTs, userInfo, isSlashCommand);
        return;
      }

      // 2. AI로 질문 분류
      console.log("🤖 질문 분류 중...");
      const classification = await this.snowflakeAI.classifyQuestion(userMessage);
      console.log(`📋 분류 결과: ${classification.type}`);

      // 3. 분류에 따른 처리 (검색/질문만)
      switch (classification.type) {
        case "search":
          await this.handleSearchRequest(userMessage, classification.keywords, client, channel, messageTs, userInfo, isSlashCommand);
          break;

        case "summary":
          await this.handleSummaryRequest(userMessage, client, channel, messageTs, userInfo, isSlashCommand);
          break;

        case "create":
          // 생성 요청은 더 이상 지원하지 않음
          await this.sendCreateNotSupportedResponse(client, channel, messageTs, userInfo, isSlashCommand);
          break;

        case "general":
        default:
          await this.handleGeneralRequest(userMessage, client, channel, messageTs, userInfo, isSlashCommand);
          break;
      }
    } catch (error) {
      console.error("❌ 질문 처리 실패:", error);

      const errorMessage = {
        text: `🔥 처리 중 오류: ${error.message}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🔥 *처리 중 오류가 발생했습니다*\n\`\`\`${error.message}\`\`\``
            }
          }
        ]
      };

      if (messageTs) {
        await this.updateMessage(client, channel, messageTs, errorMessage);
      } else if (isSlashCommand) {
        await client.chat.postMessage({ channel: userId, ...errorMessage });
      } else {
        await client.chat.postMessage({ channel, ...errorMessage });
      }
    }
  }

  // 문제 해결 질문인지 판단
  isTroubleshootingQuestion(message) {
    const troubleshootingKeywords = [
      // 문제 표현
      "문제",
      "이슈",
      "오류",
      "에러",
      "장애",
      "실패",
      "안됨",
      "안돼",
      "막힘",
      "버그",
      // 해결 요청
      "해결",
      "고치",
      "수정",
      "도움",
      "어떻게",
      "방법",
      "해야",
      "하나요",
      "하죠",
      // 기술 키워드 + 문제
      "SF.*지연",
      "SF.*문제",
      "SF.*오류",
      "SF.*실패",
      "KMDF.*문제",
      "KMDF.*오류",
      "KMDF.*지연",
      "API.*문제",
      "API.*오류",
      "API.*응답.*지연",
      "DB.*문제",
      "Database.*문제",
      "Redis.*문제",
      "Kafka.*문제",
      "AWS.*문제",
      // 상태 확인
      "지연",
      "느림",
      "타임아웃",
      "연결.*안됨",
      "접속.*안됨",
      "로그인.*안됨",
      "권한.*없",
      "배포.*실패",
      "업데이트.*실패"
    ];

    const lowerMessage = message.toLowerCase();

    return troubleshootingKeywords.some((keyword) => {
      if (keyword.includes(".*")) {
        // 정규표현식 패턴
        const regex = new RegExp(keyword, "i");
        return regex.test(message);
      } else {
        // 단순 포함 검사
        return lowerMessage.includes(keyword);
      }
    });
  }

  // 검색 요청 처리 (기존 클래스에 추가)
  async handleSearchRequest(question, keywords, client, channel, messageTs, userInfo, isSlashCommand = false) {
    try {
      console.log("🔍 검색 요청 처리 중...");

      // 1. Notion에서 관련 페이지 검색
      const searchQuery = keywords?.join(" ") || question;
      const relevantPages = await this.notionService.searchPagesByKeywords(searchQuery, 5);

      if (relevantPages.length === 0) {
        await this.sendNoResultsResponse(question, client, channel, messageTs, userInfo, isSlashCommand);
        return;
      }

      // 2. RAG 컨텍스트 생성
      const ragContext = this.notionService.createRAGContext(relevantPages, 3000);
      console.log(`📚 컨텍스트 생성: ${ragContext.totalLength}자`);

      // 3. AI 답변 생성
      const aiAnswer = await this.snowflakeAI.generateRAGAnswer(question, ragContext.context);

      // 4. 응답 전송
      await this.sendSearchResponse(question, aiAnswer, relevantPages, client, channel, messageTs, userInfo, isSlashCommand);
    } catch (error) {
      console.error("❌ 검색 처리 실패:", error);
      throw error;
    }
  }

  // 생성 요청은 더 이상 지원하지 않음
  async sendCreateNotSupportedResponse(client, channel, messageTs, userInfo, isSlashCommand = false) {
    const notSupportedMessage = {
      text: "📝 페이지 생성 기능은 지원하지 않습니다",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "📝 *페이지 생성 기능은 더 이상 지원하지 않습니다*"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "이 봇은 이제 **검색과 질문 전용**입니다! 🔍\n\n• 과거 해결 사례 검색\n• 기존 문서 검색\n• 일반 질문 답변"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*💡 대신 이렇게 사용해보세요:*\n• `/solve 문제 설명` - 과거 해결 사례 검색\n• `/ask 질문 내용` - 기존 문서 검색\n• `/summary` - 전체 요약"
          }
        }
      ]
    };

    if (messageTs) {
      await this.updateMessage(client, channel, messageTs, notSupportedMessage);
    } else if (isSlashCommand) {
      await client.chat.postMessage({ channel: userInfo.id, ...notSupportedMessage });
    } else {
      await client.chat.postMessage({ channel, ...notSupportedMessage });
    }
  }

  // 요약 요청 처리 (기존 클래스에 추가)
  async handleSummaryRequest(request, client, channel, messageTs, userInfo, isSlashCommand = false) {
    try {
      console.log("📊 요약 요청 처리 중...");

      // 최근 페이지들 검색
      const recentPages = await this.notionService.searchPages("", 10);

      if (recentPages.length === 0) {
        const noDataMessage = {
          text: "📊 요약할 데이터가 없습니다.",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "📊 현재 접근 가능한 Notion 페이지가 없습니다. 페이지를 생성한 후 다시 시도해주세요."
              }
            }
          ]
        };

        if (messageTs) {
          await this.updateMessage(client, channel, messageTs, noDataMessage);
        } else if (isSlashCommand) {
          await client.chat.postMessage({ channel: userInfo.id, ...noDataMessage });
        } else {
          await client.chat.postMessage({ channel, ...noDataMessage });
        }
        return;
      }

      // 요약 프롬프트 생성
      const summaryPrompt = `다음은 Notion 데이터베이스의 최근 페이지들입니다. 전체적으로 요약해주세요:

페이지 목록:
${recentPages.map((page) => `- ${page.title} (${page.lastEdited})`).join("\n")}

사용자 요청: "${request}"

한국어로 친근하고 구조적으로 요약해주세요.`;

      const summaryResponse = await this.snowflakeAI.callOpenAI(summaryPrompt);

      const summaryMessage = {
        text: summaryResponse,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `📊 *데이터베이스 요약*`
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: summaryResponse
            }
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*📄 총 페이지:*\n${recentPages.length}개`
              },
              {
                type: "mrkdwn",
                text: `*📅 최근 업데이트:*\n${recentPages[0]?.lastEdited || "N/A"}`
              }
            ]
          }
        ]
      };

      if (messageTs) {
        await this.updateMessage(client, channel, messageTs, summaryMessage);
      } else if (isSlashCommand) {
        await client.chat.postMessage({ channel: userInfo.id, ...summaryMessage });
      } else {
        await client.chat.postMessage({ channel, ...summaryMessage });
      }
    } catch (error) {
      console.error("❌ 요약 처리 실패:", error);
      throw error;
    }
  }

  // 일반 요청 처리 (기존 클래스에 추가)
  async handleGeneralRequest(message, client, channel, messageTs, userInfo, isSlashCommand = false) {
    try {
      console.log("💬 일반 대화 처리 중...");

      const response = await this.snowflakeAI.callOpenAI(message);

      const generalMessage = {
        text: response,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: response
            }
          }
        ]
      };

      if (messageTs) {
        await this.updateMessage(client, channel, messageTs, generalMessage);
      } else if (isSlashCommand) {
        await client.chat.postMessage({ channel: userInfo.id, ...generalMessage });
      } else {
        await client.chat.postMessage({ channel, ...generalMessage });
      }
    } catch (error) {
      console.error("❌ 일반 대화 처리 실패:", error);
      throw error;
    }
  }

  // /ask 명령어 처리 (기존 클래스에 추가)
  async handleAskCommand(command, ack, respond, client) {
    await ack();
    console.log("🔍 질문 명령어:", command.text);

    try {
      if (!command.text.trim()) {
        await respond({
          text: "❓ 사용법: `/ask 질문내용`\n예: `/ask 프로젝트 현황이 어떻게 되나요?`",
          response_type: "ephemeral"
        });
        return;
      }

      await respond({
        text: "🔍 Notion에서 검색 중입니다...",
        response_type: "ephemeral"
      });

      await this.ensureSnowflakeConnection();

      // 강제로 검색으로 처리
      const userInfo = await this.getUserInfo(client, command.user_id);
      await this.handleSearchRequest(command.text, [], client, command.channel_id, null, userInfo);
    } catch (error) {
      console.error("❌ 질문 명령어 오류:", error);
      await respond({
        text: `🔥 검색 중 오류: ${error.message}`,
        response_type: "ephemeral"
      });
    }
  }

  // /summary 명령어 처리 (기존 클래스에 추가)
  async handleSummaryCommand(command, ack, respond, client) {
    await ack();
    console.log("📊 요약 명령어:", command.text);

    try {
      await respond({
        text: "📊 데이터베이스 요약 생성 중입니다...",
        response_type: "ephemeral"
      });

      await this.ensureSnowflakeConnection();

      const userInfo = await this.getUserInfo(client, command.user_id);
      const query = command.text.trim() || "전체 요약해주세요";
      await this.handleSummaryRequest(query, client, command.channel_id, null, userInfo, true);
    } catch (error) {
      console.error("❌ 요약 명령어 오류:", error);
      await respond({
        text: `🔥 요약 중 오류: ${error.message}`,
        response_type: "ephemeral"
      });
    }
  }

  // RAG 검색 명령어 처리
  async handleSolveCommand(command, ack, respond, client) {
    await ack();

    console.log("🔍 RAG 검색 명령어:", command.text);

    try {
      if (!command.text.trim()) {
        await respond({
          text: "🔍 사용법: `/solve 해결하고 싶은 문제를 입력하세요`\n예: `/solve SF 적재가 지연되는데 어떻게 해결하나요?`",
          response_type: "ephemeral"
        });
        return;
      }

      // 임시 응답
      await respond({
        text: "🔍 과거 해결 사례를 검색 중입니다...",
        response_type: "ephemeral"
      });

      // 사용자 정보 가져오기
      const userInfo = await this.getUserInfo(client, command.user_id);

      // RAG 검색 실행
      await this.performRAGSearch(command.text, client, command.channel_id, null, userInfo, true);
    } catch (error) {
      console.error("❌ RAG 검색 명령어 오류:", error);
      await respond({
        text: `🔥 오류가 발생했습니다: ${error.message}`,
        response_type: "ephemeral"
      });
    }
  }

  // RAG 검색 수행
  async performRAGSearch(query, client, channel, messageTs, userInfo, isSlashCommand = false) {
    try {
      console.log(`🔍 RAG 검색 실행: "${query}"`);

      // RAG 서비스로 검색
      const searchResult = await this.ragService.searchSimilarIssues(query);

      // Slack 응답 포맷팅
      const response = this.ragService.formatSlackResponse(searchResult);

      // 응답 전송
      if (isSlashCommand) {
        await client.chat.postMessage({
          channel: channel,
          ...response
        });
      } else if (messageTs) {
        await this.updateMessage(client, channel, messageTs, response);
      } else {
        await client.chat.postMessage({
          channel: channel,
          ...response
        });
      }

      console.log(`✅ RAG 검색 완료: ${searchResult.found ? searchResult.total : 0}개 결과`);
    } catch (error) {
      console.error("❌ RAG 검색 오류:", error);

      const errorResponse = {
        text: "🔥 검색 중 오류가 발생했습니다",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `😅 *검색 중 오류가 발생했습니다*\n\n${error.message}\n\n💡 RAG 데이터베이스가 준비되지 않았을 수 있습니다. \`bulk-slack-analyzer.js\`를 먼저 실행해주세요.`
            }
          }
        ]
      };

      if (isSlashCommand) {
        await client.chat.postMessage({
          channel: channel,
          ...errorResponse
        });
      } else if (messageTs) {
        await this.updateMessage(client, channel, messageTs, errorResponse);
      } else {
        await client.chat.postMessage({
          channel: channel,
          ...errorResponse
        });
      }
    }
  }

  // 검색 결과 응답 전송 (기존 클래스에 추가)
  async sendSearchResponse(question, answer, sources, client, channel, messageTs, userInfo, isSlashCommand = false) {
    const searchMessage = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔍 *"${question}" 검색 결과*`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: answer
          }
        }
      ]
    };

    // 출처 정보 추가
    if (sources && sources.length > 0) {
      searchMessage.blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*📚 참고 자료:*"
        }
      });

      sources.slice(0, 3).forEach((source, index) => {
        searchMessage.blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${index + 1}. <${source.url}|${source.title}>`
          }
        });
      });
    }

    // 컨텍스트 정보
    searchMessage.blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `🤖 AI 검색 완료 | 📄 ${sources.length}개 페이지 참조 | 👤 ${userInfo.real_name || userInfo.name}`
        }
      ]
    });

    if (messageTs) {
      await this.updateMessage(client, channel, messageTs, searchMessage);
    } else if (isSlashCommand) {
      await client.chat.postMessage({ channel: userInfo.id, ...searchMessage });
    } else {
      await client.chat.postMessage({ channel, ...searchMessage });
    }
  }

  // 검색 결과 없음 응답 (기존 클래스에 추가)
  async sendNoResultsResponse(question, client, channel, messageTs, userInfo, isSlashCommand = false) {
    const noResultsMessage = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔍 *"${question}"에 대한 검색 결과*`
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "죄송합니다. 관련된 정보를 Notion에서 찾을 수 없습니다."
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*💡 도움말:*\n• 다른 키워드로 검색해보세요\n• `/solve 문제설명`으로 해결 사례를 찾아보세요\n• `/summary`로 전체 데이터베이스를 확인해보세요"
          }
        }
      ]
    };

    if (messageTs) {
      await this.updateMessage(client, channel, messageTs, noResultsMessage);
    } else if (isSlashCommand) {
      await client.chat.postMessage({ channel: userInfo.id, ...noResultsMessage });
    } else {
      await client.chat.postMessage({ channel, ...noResultsMessage });
    }
  }

  // Notion 생성 기능은 제거됨 (검색/질문 전용 봇)

  // Snowflake 연결 확인
  async ensureSnowflakeConnection() {
    if (!this.isSnowflakeConnected) {
      console.log("🔄 Snowflake 연결 중...");
      await this.snowflakeAI.connect();
      this.isSnowflakeConnected = true;
      console.log("✅ Snowflake 연결 완료");
    }
  }

  // 사용자 정보 가져오기
  async getUserInfo(client, userId) {
    try {
      const result = await client.users.info({ user: userId });
      return result.user;
    } catch (error) {
      console.error("⚠️ 사용자 정보 조회 실패:", error);
      return { name: "Unknown User", real_name: "Unknown" };
    }
  }

  // 메시지 업데이트
  async updateMessage(client, channel, ts, message) {
    try {
      await client.chat.update({
        channel: channel,
        ts: ts,
        ...message
      });
    } catch (error) {
      console.error("⚠️ 메시지 업데이트 실패:", error);
      // 업데이트 실패 시 새 메시지 전송
      await client.chat.postMessage({
        channel: channel,
        ...message
      });
    }
  }

  // 도움말 표시
  async showHelp(client, channel, messageTs) {
    const helpMessage = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*🤖 Slack-Notion Bot 사용법*"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*🔍 질문하고 검색하는 방법:*\n• `@bot 질문 내용` - 멘션으로 질문\n• DM으로 직접 질문\n• 문제 해결 질문은 자동으로 RAG 검색"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*⚡ 슬래시 명령어:*\n• `/solve 문제 설명` - 과거 해결 사례 검색\n• `/ask 질문 내용` - 기존 문서 검색\n• `/rag 검색어` - RAG 검색\n• `/summary` - 전체 요약"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*🔧 기타 명령어:*\n• `@bot 상태` - 봇 상태 확인\n• `@bot 도움말` - 이 도움말 보기"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*🔍 문제 해결 기능:*\n• `/solve SF 적재 지연 문제` - 과거 해결 사례 검색\n• `/rag API 오류 해결 방법` - RAG 기반 문제 해결\n• 멘션으로 문제 질문하면 자동으로 해결 사례 검색"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*⚡ 기능:*\n• 🔍 RAG 기반 과거 해결 사례 검색\n• 📚 기존 Notion 문서 검색\n• 🤖 AI 기반 질문 답변\n• 🎯 문제 해결 전문가 추천"
          }
        }
      ]
    };

    await this.updateMessage(client, channel, messageTs, helpMessage);
  }

  // 상태 표시
  async showStatus(client, channel, messageTs) {
    const uptime = Math.floor((new Date() - this.botStartTime) / 1000);
    const uptimeText = this.formatUptime(uptime);

    const statusMessage = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*🤖 Bot 상태 정보*"
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*🔗 Snowflake:*\n${this.isSnowflakeConnected ? "✅ 연결됨" : "❌ 연결 안됨"}`
            },
            {
              type: "mrkdwn",
              text: `*📝 Notion:*\n✅ 연결됨`
            },
            {
              type: "mrkdwn",
              text: `*⏰ 실행 시간:*\n${uptimeText}`
            },
            {
              type: "mrkdwn",
              text: `*📅 시작 시간:*\n${this.botStartTime.toLocaleString("ko-KR")}`
            }
          ]
        }
      ]
    };

    await this.updateMessage(client, channel, messageTs, statusMessage);
  }

  // 업타임 포맷
  formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}시간 ${minutes}분 ${secs}초`;
  }

  // 봇 시작
  async start() {
    try {
      console.log("🚀 Slack-Notion Bot 시작 중...");

      // Snowflake 연결 초기화
      await this.ensureSnowflakeConnection();

      // Slack 앱 시작
      await this.app.start();

      console.log("✅ Slack-Notion Bot 시작 완료!");
      console.log("🔗 Socket Mode로 연결됨");
      console.log("📝 메시지를 기다리는 중...");
    } catch (error) {
      console.error("🔥 Bot 시작 실패:", error);
      throw error;
    }
  }

  // 봇 종료
  async stop() {
    try {
      console.log("🛑 Bot 종료 중...");

      if (this.snowflakeAI) {
        await this.snowflakeAI.disconnect();
      }

      await this.app.stop();

      console.log("✅ Bot 종료 완료");
    } catch (error) {
      console.error("⚠️ Bot 종료 중 오류:", error);
    }
  }
}

module.exports = SlackNotionBot;
