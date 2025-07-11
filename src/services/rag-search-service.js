// src/services/rag-search-service.js
// RAG 기반 이슈 검색 및 해결 사례 제공 서비스

const NotionService = require("./notion-service");

class RAGSearchService {
  constructor() {
    this.notionService = new NotionService();
  }

  // 유사한 이슈 검색 (키워드 기반)
  async searchSimilarIssues(query, limit = 5) {
    try {
      console.log(`🔍 RAG 검색 시작: "${query}"`);

      // 검색 키워드 추출
      const keywords = this.extractKeywords(query);
      console.log(`📝 추출된 키워드: ${keywords.join(", ")}`);

      // Notion 데이터베이스 검색
      const results = await this.searchNotionDatabase(keywords, limit);

      if (results.length === 0) {
        return { found: false, message: "유사한 이슈를 찾을 수 없습니다." };
      }

      // 결과 포맷팅
      const formattedResults = await this.formatSearchResults(results, query);

      return {
        found: true,
        query: query,
        results: formattedResults,
        total: results.length
      };
    } catch (error) {
      console.error("❌ RAG 검색 오류:", error);
      throw error;
    }
  }

  // 검색 키워드 추출
  extractKeywords(query) {
    // 기술 관련 키워드 패턴
    const techKeywords = [
      "SF",
      "Snowflake",
      "KMDF",
      "API",
      "Database",
      "DB",
      "Redis",
      "Kafka",
      "AWS",
      "S3",
      "Lambda",
      "EC2",
      "RDS",
      "Docker",
      "Kubernetes",
      "K8s",
      "Jenkins",
      "Git",
      "GitHub",
      "Airflow",
      "Spark",
      "Elasticsearch",
      "Grafana",
      "Prometheus",
      "DataDog",
      "Nginx",
      "Apache",
      "MongoDB"
    ];

    // 문제 유형 키워드
    const issueKeywords = [
      "지연",
      "오류",
      "에러",
      "장애",
      "실패",
      "중단",
      "느림",
      "타임아웃",
      "연결",
      "접속",
      "로그인",
      "권한",
      "배포",
      "업데이트",
      "설치"
    ];

    const words = query.toLowerCase().split(/\s+/);
    const foundKeywords = [];

    // 기술 키워드 찾기
    words.forEach((word) => {
      techKeywords.forEach((tech) => {
        if (word.includes(tech.toLowerCase()) || tech.toLowerCase().includes(word)) {
          foundKeywords.push(tech);
        }
      });
    });

    // 문제 유형 키워드 찾기
    words.forEach((word) => {
      issueKeywords.forEach((issue) => {
        if (word.includes(issue) || issue.includes(word)) {
          foundKeywords.push(issue);
        }
      });
    });

    // 일반 키워드도 포함 (3글자 이상)
    words.forEach((word) => {
      if (word.length >= 3 && !foundKeywords.includes(word)) {
        foundKeywords.push(word);
      }
    });

    return [...new Set(foundKeywords)]; // 중복 제거
  }

  // Notion 데이터베이스 검색
  async searchNotionDatabase(keywords, limit) {
    try {
      // 환경변수에서 데이터베이스 ID 가져오기 (또는 최근 생성된 것 사용)
      const databaseId = process.env.RAG_DATABASE_ID || (await this.findLatestDatabase());

      if (!databaseId) {
        throw new Error("RAG 데이터베이스를 찾을 수 없습니다. 먼저 bulk-slack-analyzer.js를 실행해주세요.");
      }

      // 검색 쿼리 구성 (여러 필드에서 검색)
      const searchQueries = keywords.map((keyword) => ({
        or: [
          {
            property: "제목",
            title: {
              contains: keyword
            }
          },
          {
            property: "이슈 타입",
            rich_text: {
              contains: keyword
            }
          },
          {
            property: "원인",
            rich_text: {
              contains: keyword
            }
          },
          {
            property: "해결 방법",
            rich_text: {
              contains: keyword
            }
          },
          {
            property: "원본 메시지",
            rich_text: {
              contains: keyword
            }
          },
          {
            property: "스레드 내용",
            rich_text: {
              contains: keyword
            }
          }
        ]
      }));

      const response = await this.notionService.notion.databases.query({
        database_id: databaseId,
        filter: {
          and: [
            {
              property: "이슈 여부",
              select: {
                equals: "🚨 이슈"
              }
            },
            ...searchQueries
          ]
        },
        sorts: [
          {
            property: "발생일시",
            direction: "descending"
          }
        ],
        page_size: limit
      });

      console.log(`✅ 검색 완료: ${response.results.length}개 결과 발견`);
      return response.results;
    } catch (error) {
      console.error("❌ Notion 검색 오류:", error);
      throw error;
    }
  }

  // 최신 RAG 데이터베이스 찾기
  async findLatestDatabase() {
    try {
      const response = await this.notionService.notion.search({
        query: "RAG 데이터베이스",
        filter: {
          value: "database",
          property: "object"
        },
        sort: {
          direction: "descending",
          timestamp: "last_edited_time"
        },
        page_size: 1
      });

      if (response.results.length > 0) {
        console.log(`🎯 RAG 데이터베이스 발견: ${response.results[0].id}`);
        return response.results[0].id;
      }

      return null;
    } catch (error) {
      console.error("❌ 데이터베이스 찾기 오류:", error);
      return null;
    }
  }

  // 검색 결과 포맷팅
  async formatSearchResults(results, originalQuery) {
    const formattedResults = [];

    for (const result of results) {
      try {
        const properties = result.properties;

        // 속성 값 추출
        const title = this.extractPropertyValue(properties, "제목", "title");
        const issueType = this.extractPropertyValue(properties, "이슈 타입", "rich_text");
        const systemComponents = this.extractPropertyValue(properties, "시스템 컴포넌트", "multi_select");
        const cause = this.extractPropertyValue(properties, "원인", "rich_text");
        const solution = this.extractPropertyValue(properties, "해결 방법", "rich_text");
        const resolver = this.extractPropertyValue(properties, "이슈 해결자", "rich_text");
        const reporter = this.extractPropertyValue(properties, "이슈 제기자", "rich_text");
        const resolved = this.extractPropertyValue(properties, "해결 상태", "select");
        const threadLink = this.extractPropertyValue(properties, "스레드 링크", "url");
        const createdTime = this.extractPropertyValue(properties, "발생일시", "date");

        // 유사도 점수 계산 (간단한 키워드 매칭)
        const similarity = this.calculateSimilarity(originalQuery, title + " " + issueType + " " + solution);

        formattedResults.push({
          id: result.id,
          title,
          issueType,
          systemComponents,
          cause,
          solution,
          resolver,
          reporter,
          resolved,
          threadLink,
          createdTime,
          similarity,
          notionUrl: result.url
        });
      } catch (error) {
        console.error("❌ 결과 포맷팅 오류:", error);
      }
    }

    // 유사도 순으로 정렬
    return formattedResults.sort((a, b) => b.similarity - a.similarity);
  }

  // 속성 값 추출 헬퍼
  extractPropertyValue(properties, propertyName, type) {
    try {
      const property = properties[propertyName];
      if (!property) return "";

      switch (type) {
        case "title":
          return property.title?.[0]?.plain_text || "";
        case "rich_text":
          return property.rich_text?.[0]?.plain_text || "";
        case "select":
          return property.select?.name || "";
        case "multi_select":
          return property.multi_select?.map((item) => item.name).join(", ") || "";
        case "url":
          return property.url || "";
        case "date":
          return property.date?.start || "";
        default:
          return "";
      }
    } catch (error) {
      return "";
    }
  }

  // 간단한 유사도 계산
  calculateSimilarity(query, text) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);

    let matches = 0;
    queryWords.forEach((word) => {
      if (textWords.some((textWord) => textWord.includes(word) || word.includes(textWord))) {
        matches++;
      }
    });

    return matches / queryWords.length;
  }

  // Slack 메시지 포맷팅
  formatSlackResponse(searchResult) {
    const { query, results, total } = searchResult;

    if (!searchResult.found) {
      return {
        text: `🔍 "${query}"에 대한 검색 결과`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `😅 *"${query}"*와 관련된 과거 해결 사례를 찾을 수 없습니다.\n\n💡 다른 키워드로 검색해보시거나, 팀원에게 직접 문의해보세요.`
            }
          }
        ]
      };
    }

    const topResult = results[0];
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🎯 *"${query}"*와 관련된 과거 해결 사례를 찾았습니다! (총 ${total}건)`
        }
      },
      {
        type: "divider"
      }
    ];

    // 최상위 결과 상세 정보
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*📋 ${topResult.title}*\n\n` +
          `*🔧 이슈 타입:* ${topResult.issueType}\n` +
          `*🖥️ 시스템:* ${topResult.systemComponents}\n` +
          `*❗ 원인:* ${topResult.cause}\n` +
          `*✅ 해결 방법:* ${topResult.solution}\n` +
          `*👤 해결자:* ${topResult.resolver}\n` +
          `*📅 발생일:* ${topResult.createdTime ? new Date(topResult.createdTime).toLocaleDateString("ko-KR") : "미확인"}`
      }
    });

    // 스레드 링크가 있으면 추가
    if (topResult.threadLink) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🔗 *관련 스레드:* <${topResult.threadLink}|원본 대화 보기>`
        }
      });
    }

    // 추가 결과들
    if (results.length > 1) {
      blocks.push({
        type: "divider"
      });

      const otherResults = results.slice(1, 3); // 최대 2개 더
      let otherText = "*📚 기타 관련 사례들:*\n";

      otherResults.forEach((result, index) => {
        otherText += `${index + 2}. *${result.title}* - ${result.resolver} (${
          result.createdTime ? new Date(result.createdTime).toLocaleDateString("ko-KR") : "미확인"
        })\n`;
      });

      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: otherText
        }
      });
    }

    // 권장 액션
    blocks.push({
      type: "divider"
    });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `💡 *권장 액션:*\n` + `• ${topResult.resolver}님께 문의\n` + `• 동일한 해결 방법 시도\n` + `• 원본 스레드에서 상세 내용 확인`
      }
    });

    return {
      text: `🔍 "${query}"에 대한 검색 결과`,
      blocks: blocks
    };
  }
}

module.exports = RAGSearchService;
