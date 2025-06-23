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
