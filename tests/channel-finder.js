// channel-finder.js
// 모든 채널 검색해서 특정 채널 찾기

require("dotenv").config();
const { WebClient } = require("@slack/web-api");

async function findAllChannels() {
  console.log("🔍 모든 채널 검색 중...");
  console.log("=".repeat(40));

  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

  try {
    // 모든 채널 타입 조회
    const channelTypes = ["public_channel", "private_channel"];
    const allChannels = [];

    for (const type of channelTypes) {
      console.log(`\n📋 ${type} 채널 조회 중...`);

      try {
        const response = await slack.conversations.list({
          types: type,
          limit: 100, // 더 많은 채널 조회
          exclude_archived: false
        });

        console.log(`   찾은 채널: ${response.channels.length}개`);

        response.channels.forEach((channel) => {
          allChannels.push({
            name: channel.name,
            id: channel.id,
            type: type,
            is_archived: channel.is_archived,
            is_private: channel.is_private,
            is_member: channel.is_member
          });
        });
      } catch (error) {
        console.log(`   ❌ ${type} 조회 실패: ${error.message}`);
      }
    }

    console.log(`\n📊 총 ${allChannels.length}개 채널 발견`);

    // 보안개발실 관련 채널 찾기
    const securityChannels = allChannels.filter((ch) => ch.name.includes("보안개발실") || ch.name.includes("security") || ch.name.includes("fe"));

    console.log(`\n🎯 보안개발실/fe 관련 채널 (${securityChannels.length}개):`);
    securityChannels.forEach((channel) => {
      console.log(`   - #${channel.name} (ID: ${channel.id})`);
      console.log(`     타입: ${channel.type}, 멤버: ${channel.is_member}, 아카이브: ${channel.is_archived}`);
    });

    // 전체 채널 목록 (이름순 정렬)
    console.log(`\n📋 전체 채널 목록:`);
    allChannels
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((channel, index) => {
        const memberIcon = channel.is_member ? "✅" : "❌";
        const archiveIcon = channel.is_archived ? "🗄️" : "";
        console.log(`   ${index + 1}. ${memberIcon} #${channel.name} ${archiveIcon}`);
      });

    // 특정 채널 검색
    const targetChannel = allChannels.find((ch) => ch.name === "보안개발실-fe");
    if (targetChannel) {
      console.log(`\n🎉 보안개발실-fe 채널을 찾았습니다!`);
      console.log(`   ID: ${targetChannel.id}`);
      console.log(`   멤버 여부: ${targetChannel.is_member ? "✅ 참여 중" : "❌ 미참여"}`);
      console.log(`   아카이브: ${targetChannel.is_archived ? "🗄️ 아카이브됨" : "🟢 활성"}`);
    } else {
      console.log(`\n❌ 보안개발실-fe 채널을 찾을 수 없습니다.`);

      // 유사한 이름 검색
      const similarChannels = allChannels.filter((ch) => ch.name.includes("보안") || ch.name.includes("개발") || ch.name.includes("fe"));

      if (similarChannels.length > 0) {
        console.log(`\n🔍 유사한 채널들:`);
        similarChannels.forEach((channel) => {
          console.log(`   - #${channel.name}`);
        });
      }
    }
  } catch (error) {
    console.error("❌ 채널 검색 실패:", error.message);
  }
}

// 실행
findAllChannels().catch(console.error);
