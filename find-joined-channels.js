// find-joined-channels.js
// 봇이 실제로 참여한 채널들을 찾아서 즉시 분석 가능한 채널 확인

require("dotenv").config();
const { WebClient } = require("@slack/web-api");

async function findJoinedChannels() {
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

  console.log("🔍 봇이 실제 참여한 채널 찾기");
  console.log("=".repeat(60));

  try {
    // 1. 전체 채널 목록 조회
    const allChannels = await slack.conversations.list({
      types: "public_channel,private_channel",
      limit: 200,
      exclude_archived: true
    });

    console.log(`📊 총 ${allChannels.channels.length}개 채널 발견\n`);

    // 2. 각 채널에 대해 히스토리 접근 테스트
    const joinedChannels = [];
    const notJoinedChannels = [];

    console.log("🧪 채널별 참여 상태 확인 중...");
    console.log("-".repeat(60));

    for (const channel of allChannels.channels) {
      try {
        // 최근 1개 메시지만 조회해서 접근 가능 여부 확인
        const history = await slack.conversations.history({
          channel: channel.id,
          limit: 1
        });

        joinedChannels.push({
          name: channel.name,
          id: channel.id,
          isPrivate: channel.is_private,
          memberCount: channel.num_members || 0,
          messageCount: history.messages.length,
          latestMessage: history.messages[0] ? new Date(parseFloat(history.messages[0].ts) * 1000) : null
        });

        console.log(`✅ #${channel.name} - 참여됨 (${history.messages.length}개 메시지)`);
      } catch (error) {
        notJoinedChannels.push({
          name: channel.name,
          id: channel.id,
          error: error.message
        });

        if (error.message.includes("not_in_channel")) {
          console.log(`❌ #${channel.name} - 참여 안됨`);
        } else {
          console.log(`⚠️ #${channel.name} - 기타 오류: ${error.message}`);
        }
      }

      // API 제한 방지
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 분석 결과 요약");
    console.log("=".repeat(60));

    console.log(`\n✅ 참여된 채널 (${joinedChannels.length}개):`);
    console.log("-".repeat(40));

    if (joinedChannels.length > 0) {
      // 메시지가 많은 순으로 정렬
      joinedChannels.sort((a, b) => b.memberCount - a.memberCount);

      joinedChannels.forEach((channel, index) => {
        const lastActivity = channel.latestMessage ? channel.latestMessage.toLocaleDateString("ko-KR") : "활동없음";

        console.log(`${index + 1}. #${channel.name}`);
        console.log(`   📊 멤버: ${channel.memberCount}명`);
        console.log(`   📅 최근활동: ${lastActivity}`);
        console.log(`   🔒 유형: ${channel.isPrivate ? "Private" : "Public"}`);
        console.log(
          `   🚀 분석명령: node -e "const BulkSlackAnalyzer = require('./bulk-slack-analyzer.js'); new BulkSlackAnalyzer().runBulkAnalysis('${channel.name}', 7);"`
        );
        console.log("");
      });

      // 추천 채널 선정
      console.log("🎯 분석 추천 채널:");

      const recommendedChannels = joinedChannels
        .filter((ch) => ch.memberCount > 5 && ch.latestMessage) // 활성 채널
        .slice(0, 3); // 상위 3개

      recommendedChannels.forEach((channel, index) => {
        console.log(`${index + 1}. #${channel.name} (멤버 ${channel.memberCount}명, 활성)`);
      });
    } else {
      console.log("❌ 참여된 채널이 없습니다!");
      console.log("💡 해결방법: 원하는 채널에 봇을 초대해주세요.");
    }

    console.log(`\n❌ 참여 안된 채널 (${notJoinedChannels.length}개):`);
    console.log("-".repeat(40));

    // 주요 타겟 채널들만 표시
    const targetChannels = notJoinedChannels.filter(
      (ch) => ch.name.includes("안티치트") || ch.name.includes("탐지솔루션") || ch.name.includes("help") || ch.name.includes("siren")
    );

    targetChannels.slice(0, 10).forEach((channel) => {
      console.log(`❌ #${channel.name} - ${channel.error}`);
    });

    if (targetChannels.length > 10) {
      console.log(`   ... 그 외 ${targetChannels.length - 10}개 채널`);
    }

    // 즉시 실행 가능한 명령어 제시
    if (joinedChannels.length > 0) {
      console.log("\n🚀 즉시 실행 가능한 분석 명령어:");
      console.log("=".repeat(60));

      const topChannel = joinedChannels[0];
      console.log(`# 가장 활성화된 채널 (${topChannel.name}) 분석:`);
      console.log(
        `node -e "const BulkSlackAnalyzer = require('./bulk-slack-analyzer.js'); new BulkSlackAnalyzer().runBulkAnalysis('${topChannel.name}', 7);"`
      );
      console.log("");

      if (joinedChannels.length > 1) {
        const secondChannel = joinedChannels[1];
        console.log(`# 두 번째 추천 채널 (${secondChannel.name}) 분석:`);
        console.log(
          `node -e "const BulkSlackAnalyzer = require('./bulk-slack-analyzer.js'); new BulkSlackAnalyzer().runBulkAnalysis('${secondChannel.name}', 7);"`
        );
      }
    }

    // #안티치트인사이트팀-help 특별 확인
    const helpChannel = notJoinedChannels.find((ch) => ch.name === "안티치트인사이트팀-help");
    if (helpChannel) {
      console.log("\n🎯 #안티치트인사이트팀-help 채널 상태:");
      console.log("❌ 봇이 참여하지 않음");
      console.log("💡 해결방법: 해당 채널에서 '@AC Docs Bot' 멘션하거나 '/invite @AC Docs Bot' 실행");
      console.log("📱 또는 채널 설정 → 통합 → 앱 추가에서 AC Docs Bot 추가");
    }
  } catch (error) {
    console.error("❌ 채널 분석 실패:", error.message);
  }
}

// 실행
console.log("⚡ 참여된 채널 분석 시작...\n");
findJoinedChannels()
  .then(() => {
    console.log("\n✨ 채널 분석 완료!");
    console.log("🎯 참여된 채널에서 즉시 분석을 시작할 수 있습니다!");
  })
  .catch((error) => {
    console.error("\n💥 분석 실패:", error.message);
  });
