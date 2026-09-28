import { projectsApi } from "../../api/projects";
import { NAILONG_BACKROOMS_DEMO } from "../production/nailongBackroomsDemoDefinition";

export async function openNailongBackroomsDemo(): Promise<number> {
  const result = await projectsApi.list({ page: 1, page_size: 200 });
  const demo = result.items.find((item) => item.metadata?.demo === true);
  if (!demo)
    throw new Error(
      "尚未初始化《奶龙后室》示例，请先运行 Demo 初始化脚本",
    );

  const project = await projectsApi.get(demo.id);
  const assetCount =
    NAILONG_BACKROOMS_DEMO.characters.length +
    NAILONG_BACKROOMS_DEMO.scenes.length +
    NAILONG_BACKROOMS_DEMO.props.length;
  const complete =
    project.metadata.demo_contract === NAILONG_BACKROOMS_DEMO.contract &&
    project.project_assets?.length === assetCount &&
    project.episodes?.[0]?.panels?.length === NAILONG_BACKROOMS_DEMO.panels.length;
  if (!complete)
    throw new Error(
      "《奶龙后室》示例尚未完整初始化，请重新运行 Demo 初始化脚本",
    );
  return project.id;
}

/** @deprecated 旧名 */
export const openRainyNightDemo = openNailongBackroomsDemo;
