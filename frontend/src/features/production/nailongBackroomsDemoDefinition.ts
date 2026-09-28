export const NAILONG_BACKROOMS_DEMO = {
  templateId: "nailong-backrooms-demo",
  contract: "asset-output-pipeline-v13-nailong-backrooms",
  project: {
    title: "《奶龙后室》制作示例",
    description: "恶搞向：黄色卡通奶龙掉进经典后室 Level 0，对上笑影实体的一格资产与分镜示例。",
    story_hook: "奶龙误入无尽黄墙后室，捧腹狂笑，走廊尽头浮出笑影实体。",
    worldview: "经典后室 Level 0：霉黄墙纸、潮湿地毯、嗡嗡荧光灯、空无一物的迷宫走廊。",
    storyline: "奶龙在后室狂笑；笑影实体在远处变形逼近。",
    tone: "魔性恶搞、liminal 不安、卡通撞恐怖",
    reference_setting:
      "角色保持 3D 卡通奶龙身份（亮黄、奶油肚、灰褐手脚、夸张狂笑）；场景严格经典后室 Level 0 黄墙地毯荧光灯美学；禁止写成真人写实；画面禁止出字。",
    genre: "恶搞 liminal",
    style: "meme-cartoon-backrooms",
  },
  media: {
    aspectRatio: "4:3",
    panelAspectRatio: "1:1",
    duration: 6,
  },
  story:
    "奶龙一脚踏进经典后室。霉黄色墙纸与潮湿棕毯无限延伸，荧光灯嗡嗡作响。它捧着大肚子狂笑不止，走廊尽头一团扭曲的黄影也跟着咧嘴——那是笑影实体。",
  episodePlan: {
    episode_goal: "完成奶龙、后室、笑影实体的标准图与一格分镜底板。",
    conflict: "卡通奶龙必须锁住身份；后室必须是经典 Level 0，不是现代办公室。",
    turning_point: "奶龙狂笑，笑影实体在尽头回应。",
    ending_hook: "一镜恶搞定格完成，可继续扩写层级。",
    scene_notes: "一格：奶龙在后室狂笑。",
  },
  script: `第一场：奶龙掉进后室
经典后室 Level 0。亮黄色卡通奶龙站在潮湿棕毯上捧腹狂笑，双眼眯成缝、嘴大开露牙。霉黄墙纸与双排荧光灯向远处延伸，尽头隐约浮现扭曲黄影笑脸的笑影实体。`,
  characters: [
    {
      name: "奶龙",
      output_prompt:
        "3D cartoon character Nailong, bright saturated yellow pear-shaped body, large cream oval belly patch, short stubby limbs with dark greyish-brown hands and feet, oversized laughing face with eyes squeezed shut into curved slits and mouth wide open showing teeth, clutching belly, meme style, clean soft lighting, white background, no text, no watermark.",
      text_profile: {
        brief:
          "国产梗图卡通龙「奶龙」；亮饱和黄梨形胖身，胸腹大块奶油色椭圆肚皮；短粗四肢，手脚末端灰褐；头圆无角无鳞；身份锚点需同时覆盖正视图、侧视图，以及平淡表情与恶搞狂笑（眯眼大张嘴捧腹）两种表情；3D 光滑卡通材质，禁止写成真人；表情包魔性、头小身大夸张可接受",
      },
    },
  ],
  scenes: [
    {
      location: "后室",
      output_prompt:
        "classic Backrooms Level 0 liminal space panorama, endless empty yellow-beige wallpapered rooms, damp tan carpet, buzzing rectangular fluorescent ceiling lights, no windows no furniture no people, eerie monotonous office maze, found-footage soft blur, no text.",
      text_profile: {
        brief:
          "经典后室 Level 0；霉黄/米黄墙纸带细密竖纹，无限空房间与走廊；潮湿棕褐短毛地毯；白色吊顶嵌长条荧光灯，平光嗡嗡感；无窗无家具无人；低清监视器/早期数码颗粒可接受；liminal 空旷不安",
      },
    },
  ],
  props: [
    {
      name: "笑影实体",
      output_prompt:
        "Backrooms entity prop sheet, distorted yellow-shadow smiling silhouette with stretched grin and uneven limbs, semi-transparent damp carpet haze, uncanny meme horror, multi-angle still, no text.",
      text_profile: {
        brief:
          "自创后室实体「笑影」；由霉黄灯光与潮湿地毯雾气凝成的半透明畸变人形剪影；五官拉长成夸张咧嘴笑，眼窝深陷或错位；四肢比例不对、边缘像融进地毯；体色偏脏黄与荧光冷白；静物多角度可辨识，恐怖恶搞而非写实血肉",
      },
    },
  ],
  panels: [
    {
      title: "分镜1｜奶龙后室狂笑",
      description:
        "经典后室 Level 0 黄墙地毯走廊中，亮黄卡通奶龙居中捧腹狂笑（眯眼大张嘴露牙），双排荧光灯向远处延伸；走廊尽头隐约可见扭曲黄影笑脸的笑影实体；魔性恶搞撞 liminal 不安，3D 卡通角色 + 后室场景，无文字无水印。",
      characters: ["奶龙"],
      scenes: ["后室"],
      props: ["笑影实体"],
    },
  ].map((panel) => ({
    ...panel,
    action: panel.description,
    image_prompt: `${panel.description}，meme cartoon Nailong in classic Backrooms Level 0, no photoreal human, no text, no watermark.`,
  })),
} as const;

/** @deprecated 旧名别名，便于过渡期引用 */
export const RAINY_NIGHT_DEMO = NAILONG_BACKROOMS_DEMO;

export type NailongBackroomsDemoDefinition = typeof NAILONG_BACKROOMS_DEMO;
