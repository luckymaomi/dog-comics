/**
 * 将「故事1」五镜写入项目 1 / 话 1（PUT syncPanels）。
 * 原则：本镜画面里出现谁／哪层场景，就挂谁的资产卡标准图。
 * 用法：npx tsx scripts/seedStory1Panels.ts
 */
const base = process.env.API_BASE ?? "http://localhost:5679/api/v1";
const projectId = 1;
const episodeId = 1;

const ASSETS = {
  buddha: 1,
  hope: 3,
  fear: 4,
  nailong: 5,
  hellFar: 6,
  hellNear: 7,
  dharma: 8,
} as const;

const panels = [
  {
    title: "镜1·说法",
    action: [
      "产出横版 3×3 九宫格（格间细白边），同一水墨体系，疏、静。",
      "上排：法会月夜远景；佛陀奶龙正面静立；圆光／莲台特写。",
      "中排：说法举手；慈悲半身；远处众生潮虚影。",
      "下排：侧面说法；合十／安定；夜空新月收束。",
      "出场资产（须挂卡）：角色「佛陀奶龙」；场景「法会」。普通奶龙与双魔本镜不出。",
      "旁白（整镜长念）：人类心中两个最大的罪恶制造者：一个是期盼，一个是畏惧。畏惧与不满、埋怨都联系在一起的；期盼是畏惧、埋怨、责怪的一个理由。畏惧与期盼的配合造了无量无边恶业。但是大部分人都生活在畏惧与期盼中。所以大量有情在无量无边的恶业造作中去运用、迷失自己的生命，消耗自己的福慧因缘。现在很多人期盼功夫成片、期盼一心不乱、期盼着念佛三昧，期盼着往生。这实际是罪恶心理。这个缘起的种子是一个焦芽败种，就是迷失。他做的念佛、作为、忏悔等等，结果都回归到迷失的初发心上来、这个种子、这个因上来，有其因必有其果。许多人求凡求圣或者要在世间求一个纯正的正法——纯正的、了不起的、别人都没有我要有的一个东西——这种期盼，结果这种不圆满的、不平等的、不慈悲的、骄慢的、自以为是的暗示，我的、我尊贵、法尊贵的暗示造成外道心智的实践，修来修去就是自赞谤他，必堕三恶道。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.dharma],
    reference_panel_id: null,
    image_recipe_prompt: "",
  },
  {
    title: "镜2·期盼着魔",
    action: [
      "产出横版 3×3 九宫格，由甜入魔。",
      "上排：小院日常奶龙望天；期待今天顺一点；期待明天好一点。",
      "中排：期待有个结果／懂我；修行名相跪拜幻光；期盼魔初现递手。",
      "下排：魔牵绳奶龙跟；脚下发暗狱气；脚离地被向下拖入地狱暗渊。",
      "出场资产（须挂卡）：角色「普通奶龙」「期盼魔」。小院／名相无独立场景卡，由本镜画面生成。",
      "旁白：你看，期盼这东西，简单得很。期待今天顺一点，期待明天好一点，期待这件事终于有个结果，期待那个人终于懂我，期待修行有个验证，期待念佛有个感应，期待病痛过去，期待钱够用，期待别人承认，期待自己不那么糟——一件一件，都不算大。可它一件一件来牵你，你就一件一件跟。跟到后来，期盼已经反过来拽你了。拽你的，就是这尊魔。它不跟你讲道理。它只让你「再要一点」。再要一点功夫，再要一点清净，再要一点把握，再要一点别人没有的东西。你还觉得自己在向前走，脚却已经离地了。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hope],
    reference_panel_id: null,
    image_recipe_prompt: "",
  },
  {
    title: "镜3·畏惧着魔",
    action: [
      "产出横版 3×3 九宫格，由冷入狱。",
      "上排：畏惧魔冷墨现身；畏惧失去／落空；畏惧不够／丢脸。",
      "中排：奶龙蜷缩抓紧；不满／埋怨脸；「我是为了法」硬理由。",
      "下排：畏惧逼、期盼仍扯前端；脚下缝开狱气上涌；身体被拖入狱门（用地狱远景）。",
      "出场资产（须挂卡）：角色「普通奶龙」「畏惧魔」「期盼魔」；场景「地狱远景」（下排入狱门／狱气）。",
      "旁白：畏惧也简单。畏惧失去，畏惧落空，畏惧不够，畏惧丢脸，畏惧堕下去，畏惧别人走在前面，畏惧自己始终到不了，畏惧一松手就什么都没有——一样一样，也都不算大。可它一样一样来逼你，你就一样一样缩。缩到后来，不满来了，埋怨来了，责怪也有了理由。理由往往还很硬：我是为了法，我是为了好，我是为了不退转。逼你的，就是那尊魔。它也不跟你吵。它只让你「再抓紧一点」。你越抓紧，越委屈；越委屈，越有期盼；越有期盼，越有畏惧。两魔一配合，人就在无量无边恶业里打转，还以为自己很用功。用功用到自赞谤他，用功用到三恶道，也不稀奇。稀奇的是：人到了这一步，还在期盼一个更正确的自己，还在畏惧一个不够好的自己。种子还是那个种子。果，怎么会跑呢？",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.fear, ASSETS.hope, ASSETS.hellFar],
    reference_panel_id: null,
    image_recipe_prompt: "",
  },
  {
    title: "镜4·地狱尽头",
    action: [
      "产出横版 3×3 九宫格，极繁、最暗、最满。",
      "上排：用地狱远景——烟云押魂；奶龙坠入烟中；狱卒剪影纵深。",
      "中排：用地狱近景——火窟；锁链／滑轮空间；奶龙在火光中。",
      "下排：极繁纹样堆叠；最底层压迫全景；几乎被繁复吞没的一点奶龙。",
      "出场资产（须挂卡）：角色「普通奶龙」；场景「地狱远景」「地狱近景」。双魔融进狱纹即可，本镜可不挂魔卡。",
      "旁白（宜短）：果，怎么会跑呢？——无量无边恶业里，人被拖到地狱尽头。",
    ].join("\n"),
    project_asset_ids: [ASSETS.nailong, ASSETS.hellFar, ASSETS.hellNear],
    reference_panel_id: null,
    image_recipe_prompt: "",
  },
  {
    title: "镜5·忽然回归",
    action: [
      "产出横版 3×3 九宫格，骤疏、亮、亲。",
      "上排：狱气将散一道清光；佛陀奶龙近景出现；光吞暗。",
      "中排：奶龙合十／放手；一发心静帧；佛与奶龙相对。",
      "下排：回到法会月夜；二人并立众生不高不低；新月／留白收束。",
      "出场资产（须挂卡）：角色「佛陀奶龙」「普通奶龙」；场景「法会」。",
      "旁白：忽然——菩萨一发心已成等正觉。何以故？缘起清净真实故。发心一转，等正觉。缘自己的期盼与畏惧，念念是业；缘佛，缘法平等、法无我，念念是增上。就这么近。当头一棒，正打在那个一直在要、一直在怕的心上。",
    ].join("\n"),
    project_asset_ids: [ASSETS.buddha, ASSETS.nailong, ASSETS.dharma],
    reference_panel_id: null,
    image_recipe_prompt: "",
  },
];

async function main() {
  const res = await fetch(`${base}/dramas/${projectId}/panels`, {
    method: "PUT",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ episode_id: episodeId, panels }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      items?: Array<{
        id: number;
        panel_number: number;
        title: string | null;
        project_asset_ids?: number[];
        use_previous_panel_image?: boolean;
        reference_panel_id?: number | null;
      }>;
    };
    error?: { message?: string };
  };
  if (!res.ok || json.success === false) {
    console.error(JSON.stringify(json, null, 2));
    process.exitCode = 1;
    return;
  }
  const items = json.data?.items ?? [];
  console.log(
    JSON.stringify(
      {
        ok: true,
        count: items.length,
        panels: items.map((p) => ({
          id: p.id,
          n: p.panel_number,
          title: p.title,
          assets: p.project_asset_ids,
          reference_panel_id: p.reference_panel_id ?? null,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
