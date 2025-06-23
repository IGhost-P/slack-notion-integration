// src/services/notion-service.js
// Notion API 래퍼 서비스

require("dotenv").config();
const { Client } = require("@notionhq/client");

class NotionService {
  constructor() {
    this.notion = new Client({
      auth: process.env.NOTION_TOKEN
    });
    this.parentPageId = process.env.NOTION_PARENT_PAGE_ID;
  }

  // 페이지 생성 (Slack Bot용 최적화)
  async createPage(content) {
    try {
      console.log("📝 Notion 페이지 생성 시작...");

      // 부모 페이지 ID 정리 (하이픈 제거)
      const cleanParentId = this.parentPageId?.replace(/-/g, "");

      if (!cleanParentId) {
        throw new Error("NOTION_PARENT_PAGE_ID가 설정되지 않았습니다.");
      }

      // 페이지 데이터 구성
      const pageData = {
        parent: {
          page_id: cleanParentId
        },
        properties: {
          title: {
            title: [
              {
                text: {
                  content: content.title || "Slack Bot 생성 노트"
                }
              }
            ]
          }
        },
        children: this.buildPageBlocks(content)
      };

      // 페이지 생성
      const createdPage = await this.notion.pages.create(pageData);

      console.log("✅ Notion 페이지 생성 성공:", createdPage.url);

      return {
        id: createdPage.id,
        url: createdPage.url,
        title: content.title
      };
    } catch (error) {
      console.error("❌ Notion 페이지 생성 실패:", error);
      throw new Error(`Notion 페이지 생성 실패: ${error.message}`);
    }
  }

  // 페이지 블록 구성 (AI가 생성한 구조화된 콘텐츠용)
  buildPageBlocks(content) {
    const blocks = [];

    // 헤더 섹션
    blocks.push({
      object: "block",
      type: "heading_1",
      heading_1: {
        rich_text: [
          {
            type: "text",
            text: { content: "📋 AI 분석 결과" }
          }
        ]
      }
    });

    // 메타데이터 정보
    if (content.metadata) {
      blocks.push({
        object: "block",
        type: "callout",
        callout: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `🤖 ${content.metadata.createdBy}님이 Slack에서 생성 | ${new Date(content.metadata.createdAt).toLocaleString("ko-KR")}`
              }
            }
          ],
          icon: { emoji: "💬" },
          color: "blue_background"
        }
      });
    }

    // 요약 섹션
    if (content.summary) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: { content: "📝 요약" }
            }
          ]
        }
      });

      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: content.summary }
            }
          ]
        }
      });
    }

    // 메인 콘텐츠
    if (content.content) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: { content: "📄 상세 내용" }
            }
          ]
        }
      });

      // 마크다운 콘텐츠를 블록으로 변환
      const contentBlocks = this.parseMarkdownToBlocks(content.content);
      blocks.push(...contentBlocks);
    }

    // 분류 정보
    blocks.push({
      object: "block",
      type: "divider",
      divider: {}
    });

    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: { content: "🏷️ 분류 정보" }
          }
        ]
      }
    });

    // 태그, 우선순위, 카테고리 정보
    const classificationItems = [];

    if (content.tags && content.tags.length > 0) {
      classificationItems.push(`**태그**: ${content.tags.join(", ")}`);
    }

    if (content.priority) {
      const priorityEmoji = this.getPriorityEmoji(content.priority);
      classificationItems.push(`**우선순위**: ${priorityEmoji} ${content.priority}`);
    }

    if (content.category) {
      classificationItems.push(`**카테고리**: ${content.category}`);
    }

    classificationItems.forEach((item) => {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: this.parseFormattedText(item)
        }
      });
    });

    // 원본 메시지 (참고용)
    if (content.metadata?.originalMessage) {
      blocks.push({
        object: "block",
        type: "divider",
        divider: {}
      });

      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [
            {
              type: "text",
              text: { content: "💬 원본 메시지" }
            }
          ]
        }
      });

      blocks.push({
        object: "block",
        type: "quote",
        quote: {
          rich_text: [
            {
              type: "text",
              text: { content: content.metadata.originalMessage }
            }
          ]
        }
      });
    }

    // 푸터
    blocks.push({
      object: "block",
      type: "divider",
      divider: {}
    });

    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: "🤖 Slack-Notion Integration Bot으로 자동 생성됨" },
            annotations: { italic: true, color: "gray" }
          }
        ]
      }
    });

    return blocks;
  }

  // 마크다운을 Notion 블록으로 변환
  parseMarkdownToBlocks(content) {
    const blocks = [];
    const lines = content.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      if (line.startsWith("# ")) {
        blocks.push({
          object: "block",
          type: "heading_1",
          heading_1: {
            rich_text: [{ type: "text", text: { content: line.substring(2) } }]
          }
        });
      } else if (line.startsWith("## ")) {
        blocks.push({
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: line.substring(3) } }]
          }
        });
      } else if (line.startsWith("### ")) {
        blocks.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [{ type: "text", text: { content: line.substring(4) } }]
          }
        });
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        blocks.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ type: "text", text: { content: line.substring(2) } }]
          }
        });
      } else if (line.match(/^\d+\. /)) {
        blocks.push({
          object: "block",
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: [{ type: "text", text: { content: line.replace(/^\d+\. /, "") } }]
          }
        });
      } else if (line.startsWith("> ")) {
        blocks.push({
          object: "block",
          type: "quote",
          quote: {
            rich_text: [{ type: "text", text: { content: line.substring(2) } }]
          }
        });
      } else if (line.startsWith("---") || line.startsWith("***")) {
        blocks.push({
          object: "block",
          type: "divider",
          divider: {}
        });
      } else {
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: this.parseFormattedText(line)
          }
        });
      }
    }

    return blocks;
  }

  // 포맷된 텍스트 파싱 (볼드, 이탤릭 등)
  parseFormattedText(text) {
    const richText = [];
    let currentText = text;

    // 간단한 볼드 처리 (**text**)
    const boldRegex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      // 볼드 이전 텍스트
      if (match.index > lastIndex) {
        richText.push({
          type: "text",
          text: { content: text.substring(lastIndex, match.index) }
        });
      }

      // 볼드 텍스트
      richText.push({
        type: "text",
        text: { content: match[1] },
        annotations: { bold: true }
      });

      lastIndex = boldRegex.lastIndex;
    }

    // 나머지 텍스트
    if (lastIndex < text.length) {
      richText.push({
        type: "text",
        text: { content: text.substring(lastIndex) }
      });
    }

    return richText.length > 0 ? richText : [{ type: "text", text: { content: text } }];
  }

  // 우선순위 이모지 반환
  getPriorityEmoji(priority) {
    switch (priority?.toLowerCase()) {
      case "high":
      case "높음":
        return "🔴";
      case "medium":
      case "보통":
        return "🟡";
      case "low":
      case "낮음":
        return "🟢";
      default:
        return "⚪";
    }
  }

  // 페이지 업데이트 (추가 블록)
  async appendToPage(pageId, additionalBlocks) {
    try {
      await this.notion.blocks.children.append({
        block_id: pageId,
        children: additionalBlocks
      });

      console.log("✅ 페이지 콘텐츠 추가 성공");
      return true;
    } catch (error) {
      console.error("❌ 페이지 업데이트 실패:", error);
      throw new Error(`페이지 업데이트 실패: ${error.message}`);
    }
  }

  // 페이지 검색
  async searchPages(query) {
    try {
      const response = await this.notion.search({
        query: query,
        filter: {
          property: "object",
          value: "page"
        },
        page_size: 10
      });

      return response.results.map((page) => ({
        id: page.id,
        title: this.extractPageTitle(page),
        url: page.url,
        lastEdited: page.last_edited_time
      }));
    } catch (error) {
      console.error("❌ 페이지 검색 실패:", error);
      throw new Error(`페이지 검색 실패: ${error.message}`);
    }
  }

  // 페이지 제목 추출
  extractPageTitle(page) {
    if (page.properties?.title?.title?.[0]?.text?.content) {
      return page.properties.title.title[0].text.content;
    }
    if (page.properties?.Name?.title?.[0]?.text?.content) {
      return page.properties.Name.title[0].text.content;
    }
    return "Untitled";
  }

  // 키워드로 페이지 검색 (기존 클래스에 추가)
  async searchPagesByKeywords(keywords, maxResults = 5) {
    try {
      console.log(`🔍 키워드 검색: "${keywords}"`);

      const searchResponse = await this.notion.search({
        query: keywords,
        filter: {
          property: "object",
          value: "page"
        },
        page_size: maxResults
      });

      const relevantPages = [];

      for (const page of searchResponse.results) {
        try {
          const pageContent = await this.getPageFullContent(page.id);

          relevantPages.push({
            id: page.id,
            title: this.extractPageTitle(page),
            url: page.url,
            content: pageContent,
            lastEdited: page.last_edited_time,
            relevanceScore: this.calculateRelevance(keywords, pageContent)
          });
        } catch (error) {
          console.log(`⚠️  페이지 ${page.id} 읽기 실패: ${error.message}`);
        }
      }

      // 관련도 순으로 정렬
      relevantPages.sort((a, b) => b.relevanceScore - a.relevanceScore);

      console.log(`✅ 검색 완료: ${relevantPages.length}개 페이지 발견`);
      return relevantPages;
    } catch (error) {
      console.error("❌ 페이지 검색 실패:", error.message);
      throw new Error(`페이지 검색 실패: ${error.message}`);
    }
  }

  // 페이지 전체 내용 가져오기 (기존 클래스에 추가)
  async getPageFullContent(pageId) {
    try {
      // 페이지 기본 정보
      const page = await this.notion.pages.retrieve({ page_id: pageId });

      // 페이지 블록들 가져오기
      const blocks = await this.getAllPageBlocks(pageId);

      // 텍스트 내용 추출
      const textContent = this.extractTextFromBlocks(blocks);

      return {
        title: this.extractPageTitle(page),
        content: textContent,
        url: page.url,
        lastEdited: page.last_edited_time
      };
    } catch (error) {
      throw new Error(`페이지 내용 읽기 실패: ${error.message}`);
    }
  }

  // 모든 블록 재귀적으로 가져오기 (기존 클래스에 추가)
  async getAllPageBlocks(blockId) {
    const allBlocks = [];
    let hasMore = true;
    let nextCursor = undefined;

    while (hasMore) {
      const response = await this.notion.blocks.children.list({
        block_id: blockId,
        start_cursor: nextCursor,
        page_size: 100
      });

      for (const block of response.results) {
        allBlocks.push(block);

        // 자식 블록이 있는 경우 재귀적으로 가져오기
        if (block.has_children) {
          const childBlocks = await this.getAllPageBlocks(block.id);
          allBlocks.push(...childBlocks);
        }
      }

      hasMore = response.has_more;
      nextCursor = response.next_cursor;
    }

    return allBlocks;
  }

  // 블록에서 텍스트 추출 (기존 클래스에 추가)
  extractTextFromBlocks(blocks) {
    let content = "";

    for (const block of blocks) {
      switch (block.type) {
        case "paragraph":
          content += this.extractRichTextContent(block.paragraph.rich_text) + "\n";
          break;
        case "heading_1":
          content += "# " + this.extractRichTextContent(block.heading_1.rich_text) + "\n";
          break;
        case "heading_2":
          content += "## " + this.extractRichTextContent(block.heading_2.rich_text) + "\n";
          break;
        case "heading_3":
          content += "### " + this.extractRichTextContent(block.heading_3.rich_text) + "\n";
          break;
        case "bulleted_list_item":
          content += "- " + this.extractRichTextContent(block.bulleted_list_item.rich_text) + "\n";
          break;
        case "numbered_list_item":
          content += "1. " + this.extractRichTextContent(block.numbered_list_item.rich_text) + "\n";
          break;
        case "quote":
          content += "> " + this.extractRichTextContent(block.quote.rich_text) + "\n";
          break;
        case "callout":
          content += "📌 " + this.extractRichTextContent(block.callout.rich_text) + "\n";
          break;
        case "toggle":
          content += "📁 " + this.extractRichTextContent(block.toggle.rich_text) + "\n";
          break;
        case "code":
          content += "```\n" + this.extractRichTextContent(block.code.rich_text) + "\n```\n";
          break;
        case "divider":
          content += "---\n";
          break;
      }
    }

    return content.trim();
  }

  // Rich Text에서 플레인 텍스트 추출 (기존 클래스에 추가)
  extractRichTextContent(richTextArray) {
    if (!richTextArray || !Array.isArray(richTextArray)) return "";

    return richTextArray
      .map((text) => text.text?.content || "")
      .join("")
      .trim();
  }

  // 관련도 점수 계산 (기존 클래스에 추가)
  calculateRelevance(query, pageContent) {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentText = (pageContent.title + " " + pageContent.content).toLowerCase();

    let score = 0;

    for (const word of queryWords) {
      if (word.length > 2) {
        // 2글자 이상만 검사
        const matches = (contentText.match(new RegExp(word, "g")) || []).length;
        score += matches * word.length; // 단어 길이에 비례해서 가중치
      }
    }

    return score;
  }

  // RAG용 컨텍스트 생성 (기존 클래스에 추가)
  createRAGContext(relevantPages, maxContextLength = 3000) {
    let context = "";
    let usedLength = 0;

    for (const page of relevantPages) {
      // 🔧 안전한 컨텐츠 추출 (다양한 데이터 구조 대응)
      let pageContent = "";

      if (page.content) {
        if (typeof page.content === "string") {
          // content가 문자열인 경우
          pageContent = page.content;
        } else if (page.content.content) {
          // content가 객체이고 content 속성이 있는 경우
          pageContent = page.content.content;
        } else if (page.content.title) {
          // content가 객체이고 title만 있는 경우
          pageContent = page.content.title;
        } else {
          // content 객체를 JSON으로 변환
          pageContent = JSON.stringify(page.content);
        }
      } else {
        // content가 없는 경우 기본 정보 사용
        pageContent = `페이지 정보: ${page.title || "Unknown"}`;
      }

      const pageText = `# ${page.title || "Untitled"}\n${pageContent}\n\n`;

      if (usedLength + pageText.length <= maxContextLength) {
        context += pageText;
        usedLength += pageText.length;
      } else {
        // 남은 공간에 맞게 자르기
        const remainingSpace = maxContextLength - usedLength;
        if (remainingSpace > 100) {
          context += pageText.substring(0, remainingSpace - 10) + "...\n\n";
        }
        break;
      }
    }

    return {
      context: context.trim(),
      usedPages: relevantPages.slice(0, Math.ceil(usedLength / 1000)),
      totalLength: usedLength
    };
  }

  debugPageStructure(page) {
    console.log("📊 페이지 구조 디버깅:");
    console.log(`   제목: ${page.title}`);
    console.log(`   content 타입: ${typeof page.content}`);
    console.log(`   content 존재: ${page.content ? "O" : "X"}`);

    if (page.content) {
      console.log(`   content 구조:`, Object.keys(page.content));
      if (page.content.content) {
        console.log(`   content.content 타입: ${typeof page.content.content}`);
        console.log(`   content.content 길이: ${page.content.content?.length || 0}`);
      }
    }
  }

  // 연결 테스트
  async testConnection() {
    try {
      const response = await this.notion.users.me();
      return {
        success: true,
        user: response.name || "N/A",
        type: response.type
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = NotionService;
