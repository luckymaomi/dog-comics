export const NAILONG_BACKROOMS_DEMO = {
  templateId: "nailong-backrooms-demo",
  contract: "asset-output-pipeline-v20-nailong-nine-grid",
  project: {
    title: "奶龙",
    description: "",
    story_hook: "",
    worldview: "",
    storyline: "",
    tone: "",
    reference_setting: "",
    genre: "",
    style: "",
  },
  media: {
    aspectRatio: "4:3",
    panelAspectRatio: "1:1",
    duration: 6,
  },
  story: "",
  episodePlan: {
    episode_goal: "",
    conflict: "",
    turning_point: "",
    ending_hook: "",
    scene_notes: "",
  },
  script: "",
  characters: [
    {
      name: "角色卡-奶龙-06",
      output_type: "character-layout-f" as const,
      output_prompt: "",
      text_profile: {},
    },
  ],
  scenes: [] as const,
  props: [] as const,
  panels: [] as const,
} as const;

/** @deprecated 旧名别名，便于过渡期引用 */
export const RAINY_NIGHT_DEMO = NAILONG_BACKROOMS_DEMO;

export type NailongBackroomsDemoDefinition = typeof NAILONG_BACKROOMS_DEMO;
